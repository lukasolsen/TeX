use std::{
    collections::BTreeMap,
    fs, io,
    path::{Component, Path, PathBuf},
};

const MAX_TEX_FILES: usize = 1_024;

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
    collect_tex_files(project_root, &mut tex_files)?;

    let mut candidates = BTreeMap::<PathBuf, Vec<RootEvidence>>::new();
    for path in tex_files {
        let source = fs::read_to_string(&path)?;
        let canonical_path = path.canonicalize()?;

        if source.contains(r"\documentclass") {
            candidates
                .entry(canonical_path.clone())
                .or_default()
                .push(RootEvidence::DocumentClass);
        }

        if let Some(root) = magic_comment_root(&source, &path, project_root) {
            candidates
                .entry(root)
                .or_default()
                .push(RootEvidence::MagicComment);
        }
    }

    Ok(candidates
        .into_iter()
        .map(|(path, evidence)| RootCandidate { path, evidence })
        .collect())
}

fn collect_tex_files(directory: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let file_type = entry.file_type()?;

        if file_type.is_symlink() {
            continue;
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
            collect_tex_files(&path, files)?;
        } else if path.extension().is_some_and(|extension| extension == "tex") {
            if files.len() == MAX_TEX_FILES {
                return Err(io::Error::other("project exceeds the root scan file limit"));
            }
            files.push(path);
        }
    }

    Ok(())
}

fn magic_comment_root(source: &str, source_path: &Path, project_root: &Path) -> Option<PathBuf> {
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
    let canonical_project_root = project_root.canonicalize().ok()?;
    candidate.strip_prefix(canonical_project_root).ok()?;
    candidate.is_file().then_some(candidate)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{detect_root_candidates, RootEvidence};

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
}
