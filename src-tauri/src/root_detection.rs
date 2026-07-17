use std::{
    collections::BTreeMap,
    fs, io,
    path::{Component, Path, PathBuf},
};

use crate::{bounded_io, source_read::MAX_SOURCE_BYTES};

const MAX_TEX_FILES: usize = 1_024;
const MAX_SCAN_DEPTH: usize = 32;
const MAX_SCAN_ENTRIES: usize = 4_096;

const IGNORED_DIRECTORIES: &[&str] = &[
    ".git",
    ".cache",
    ".texpadtmp",
    "node_modules",
    "target",
    "build",
    "dist",
    "out",
    "_build",
];

/// States why a file was identified as a possible project entry point.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RootEvidence {
    DocumentClass,
    MagicComment,
}

/// Identifies a potential root without selecting one on the user's behalf.
#[derive(Debug, Eq, PartialEq)]
pub struct RootCandidate {
    pub path: PathBuf,
    pub evidence: Vec<RootEvidence>,
}

/// Finds conservative root candidates in a project directory.
///
/// Symlinks are excluded and discovery is bounded so the result can inform a
/// future explicit root-selection flow without traversing outside the project.
pub fn detect_root_candidates(project_root: &Path) -> io::Result<Vec<RootCandidate>> {
    let mut tex_files = Vec::new();
    let mut visited_entries = 0_usize;
    collect_tex_files(project_root, 0, &mut visited_entries, &mut tex_files)?;

    // Canonicalize the project root once rather than once per magic-comment file.
    let canonical_project_root = project_root.canonicalize().ok();
    let mut candidates = BTreeMap::<PathBuf, Vec<RootEvidence>>::new();
    for path in tex_files {
        let source = bounded_io::read_utf8(&path, MAX_SOURCE_BYTES)?;
        let canonical_path = path.canonicalize()?;

        if has_document_class(&source) {
            insert_evidence(
                &mut candidates,
                canonical_path.clone(),
                RootEvidence::DocumentClass,
            );
        }

        if let Some(project_root) = canonical_project_root.as_deref() {
            if let Some(root) = magic_comment_root(&source, &path, project_root) {
                insert_evidence(&mut candidates, root, RootEvidence::MagicComment);
            }
        }
    }

    Ok(candidates
        .into_iter()
        .map(|(path, mut evidence)| {
            evidence.sort_by_key(|item| match item {
                RootEvidence::DocumentClass => 0,
                RootEvidence::MagicComment => 1,
            });
            RootCandidate { path, evidence }
        })
        .collect())
}

fn insert_evidence(
    candidates: &mut BTreeMap<PathBuf, Vec<RootEvidence>>,
    path: PathBuf,
    evidence: RootEvidence,
) {
    let evidence_for_path = candidates.entry(path).or_default();
    if !evidence_for_path.contains(&evidence) {
        evidence_for_path.push(evidence);
    }
}

fn has_document_class(source: &str) -> bool {
    source.lines().any(|line| {
        let code = latex_code_before_comment(line);
        code.contains(r"\documentclass")
    })
}

fn latex_code_before_comment(line: &str) -> &str {
    let mut preceding_backslashes = 0_usize;
    for (index, character) in line.char_indices() {
        if character == '%' && preceding_backslashes.is_multiple_of(2) {
            return &line[..index];
        }
        if character == '\\' {
            preceding_backslashes += 1;
        } else {
            preceding_backslashes = 0;
        }
    }
    line
}

fn collect_tex_files(
    directory: &Path,
    depth: usize,
    visited_entries: &mut usize,
    files: &mut Vec<PathBuf>,
) -> io::Result<()> {
    if depth > MAX_SCAN_DEPTH {
        return Err(io::Error::other(
            "project exceeds the root scan depth limit",
        ));
    }
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let file_type = entry.file_type()?;

        if file_type.is_symlink() {
            continue;
        }
        *visited_entries += 1;
        if *visited_entries > MAX_SCAN_ENTRIES {
            return Err(io::Error::other(
                "project exceeds the root scan entry limit",
            ));
        }

        let path = entry.path();
        if file_type.is_dir() {
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| IGNORED_DIRECTORIES.contains(&name))
            {
                continue;
            }
            collect_tex_files(&path, depth + 1, visited_entries, files)?;
        } else if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("tex"))
        {
            if files.len() == MAX_TEX_FILES {
                return Err(io::Error::other("project exceeds the root scan file limit"));
            }
            files.push(path);
        }
    }

    Ok(())
}

fn magic_comment_root(
    source: &str,
    source_path: &Path,
    canonical_project_root: &Path,
) -> Option<PathBuf> {
    let root = source
        .lines()
        .find_map(|line| line.trim().strip_prefix("% !TeX root = "))?
        .trim();
    let relative_root = Path::new(root);

    if relative_root
        .extension()
        .is_none_or(|extension| extension != "tex")
        || relative_root.is_absolute()
        || !relative_root.components().all(|component| {
            matches!(
                component,
                Component::Normal(_) | Component::CurDir | Component::ParentDir
            )
        })
    {
        return None;
    }

    let candidate = source_path
        .parent()?
        .join(relative_root)
        .canonicalize()
        .ok()?;
    candidate.strip_prefix(canonical_project_root).ok()?;
    candidate.is_file().then_some(candidate)
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{detect_root_candidates, has_document_class, RootEvidence};

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/latex-projects")
            .join(name)
    }

    #[test]
    fn reports_document_class_and_magic_comment_evidence() -> Result<(), Box<dyn std::error::Error>>
    {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/root-detection");
        let candidates = detect_root_candidates(&fixture)?;

        assert_eq!(candidates.len(), 1);
        assert!(candidates[0].path.ends_with("main.tex"));
        assert_eq!(
            candidates[0].evidence,
            vec![RootEvidence::DocumentClass, RootEvidence::MagicComment]
        );

        Ok(())
    }

    #[test]
    fn reports_each_root_in_a_multi_root_project_without_duplicate_evidence(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let candidates = detect_root_candidates(&fixture("multiple-roots"))?;

        assert_eq!(candidates.len(), 2);
        assert!(candidates[0].path.ends_with("paper/main.tex"));
        assert!(candidates[1].path.ends_with("presentation/slides.tex"));
        for candidate in candidates {
            assert_eq!(
                candidate.evidence,
                vec![RootEvidence::DocumentClass, RootEvidence::MagicComment]
            );
        }
        Ok(())
    }

    #[test]
    fn ignores_invalid_setup_and_commented_document_classes(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let candidates = detect_root_candidates(&fixture("invalid-setup"))?;

        assert!(candidates.is_empty());
        Ok(())
    }

    #[test]
    fn detects_a_root_even_when_the_document_will_not_compile(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let candidates = detect_root_candidates(&fixture("broken-build"))?;

        assert_eq!(candidates.len(), 1);
        assert!(candidates[0].path.ends_with("main.tex"));
        Ok(())
    }

    #[test]
    fn collapses_repeated_magic_comments_in_a_large_multi_file_report(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let candidates = detect_root_candidates(&fixture("nasa-technical-report"))?;

        assert_eq!(candidates.len(), 1);
        assert!(candidates[0].path.ends_with("main.tex"));
        assert_eq!(
            candidates[0].evidence,
            vec![RootEvidence::DocumentClass, RootEvidence::MagicComment]
        );
        Ok(())
    }

    #[test]
    fn distinguishes_escaped_percent_signs_from_latex_comments() {
        assert!(has_document_class(
            r"\newcommand{\percent}{\%} \documentclass{article}"
        ));
        assert!(!has_document_class(
            r"Text before a comment % \documentclass{article}"
        ));
    }
}
