use std::{
    fs, io,
    path::{Component, Path},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::{bounded_io, project_access::ProjectAccess};

pub(crate) const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;
/// The files TeX treats as LaTeX source: what project search walks, what LaTeX
/// analysis runs on, and what may be selected as a build root.
pub(crate) const READABLE_EXTENSIONS: &[&str] = &["tex", "bib", "sty", "cls", "txt", "md"];

/// The other text files a LaTeX project carries — engine logs and auxiliary
/// output, class and package internals, tool configuration, small data sources.
/// Opening these is all that is granted here; they are still not LaTeX source.
/// Mirrored by `src/domain/file-kind.ts`, which decides what the UI offers.
const TEXT_EXTENSIONS: &[&str] = &[
    "aux", "bat", "bbl", "bbx", "blg", "bst", "cbx", "cfg", "clo", "csv", "def", "dtx", "fd",
    "fls", "glg", "glo", "gls", "gnuplot", "idx", "ilg", "ind", "ini", "ins", "json", "lbx", "ldf",
    "lof", "log", "lot", "ltx", "mk", "nav", "out", "pgf", "plt", "py", "rnw", "sh", "snm", "tikz",
    "toc", "toml", "tsv", "vrb", "xml", "yaml", "yml",
];

/// Whole names, for the extensionless files a LaTeX project usually carries.
const TEXT_FILE_NAMES: &[&str] = &[
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".latexmkrc",
    "latexmkrc",
    "license",
    "makefile",
    "readme",
];

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceRevision {
    pub byte_length: u64,
    pub content_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocument {
    pub path: String,
    pub content: String,
    pub byte_length: u64,
    pub revision: SourceRevision,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceReadError {
    pub code: &'static str,
    pub message: &'static str,
}

/// Reads a bounded UTF-8 source file after proving it remains inside the approved project.
#[tauri::command]
pub fn read_project_source(
    project_path: String,
    relative_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<SourceDocument, SourceReadError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    read_source(&root, Path::new(&relative_path))
}

pub(crate) fn read_source(
    project_path: &Path,
    relative_path: &Path,
) -> Result<SourceDocument, SourceReadError> {
    if relative_path.is_absolute() || !is_openable_text(relative_path) {
        return Err(unsupported());
    }

    let project_root = project_path.canonicalize().map_err(map_io_error)?;
    if !project_root.is_dir() {
        return Err(unavailable());
    }
    let source_path = resolve_source_path(&project_root, relative_path)?;

    let bytes = bounded_io::read(&source_path, MAX_SOURCE_BYTES).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            source_too_large()
        } else {
            map_io_error(error)
        }
    })?;
    let content = String::from_utf8(bytes).map_err(|_| unsupported())?;
    let byte_length = content.len() as u64;

    let revision = revision_for_content(content.as_bytes());
    Ok(SourceDocument {
        path: relative_path.to_string_lossy().into_owned(),
        content,
        byte_length,
        revision,
    })
}

/// Resolves a path that must be LaTeX source, not merely readable text. Callers
/// that hand the result to an engine — build roots, SyncTeX — use this so a log
/// or a configuration file can never be presented to LaTeX as a document.
pub(crate) fn resolve_latex_source_path(
    project_root: &Path,
    relative_path: &Path,
) -> Result<std::path::PathBuf, SourceReadError> {
    if !is_readable_source(relative_path) {
        return Err(unsupported());
    }
    resolve_source_path(project_root, relative_path)
}

pub(crate) fn resolve_source_path(
    project_root: &Path,
    relative_path: &Path,
) -> Result<std::path::PathBuf, SourceReadError> {
    if !valid_relative_path(relative_path) || !is_openable_text(relative_path) {
        return Err(unsupported());
    }
    reject_symlink_components(project_root, relative_path)?;
    let source_path = project_root
        .join(relative_path)
        .canonicalize()
        .map_err(map_io_error)?;
    if !source_path.starts_with(project_root) || !source_path.is_file() {
        return Err(SourceReadError {
            code: "outside-project",
            message: "That file is not available inside this project.",
        });
    }
    Ok(source_path)
}

pub(crate) fn valid_relative_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && path.components().all(|component| match component {
            // Reject any component whose name begins with `-` so a validated path
            // can never be reinterpreted as a command-line option token when it is
            // later handed to an external tool (e.g. a LaTeX engine's positional).
            Component::Normal(name) => name.as_encoded_bytes().first() != Some(&b'-'),
            _ => false,
        })
}

fn reject_symlink_components(root: &Path, relative: &Path) -> Result<(), SourceReadError> {
    let mut candidate = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(component) = component else {
            return Err(unsupported());
        };
        candidate.push(component);
        if fs::symlink_metadata(&candidate)
            .map_err(map_io_error)?
            .file_type()
            .is_symlink()
        {
            return Err(SourceReadError {
                code: "symlink-source",
                message: "TeX does not open source files through symbolic links.",
            });
        }
    }
    Ok(())
}

pub(crate) fn is_readable_source(path: &Path) -> bool {
    has_extension(path, READABLE_EXTENSIONS)
}

/// True for every text file TeX will read into the editor, LaTeX source or not.
pub(crate) fn is_openable_text(path: &Path) -> bool {
    if has_extension(path, READABLE_EXTENSIONS) || has_extension(path, TEXT_EXTENSIONS) {
        return true;
    }
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| TEXT_FILE_NAMES.contains(&name.to_ascii_lowercase().as_str()))
}

fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extensions.contains(&extension.to_ascii_lowercase().as_str()))
}

pub(crate) fn revision_for_content(content: &[u8]) -> SourceRevision {
    SourceRevision {
        byte_length: content.len() as u64,
        content_hash: format!("{:x}", Sha256::digest(content)),
    }
}

fn map_io_error(error: io::Error) -> SourceReadError {
    match error.kind() {
        io::ErrorKind::NotFound => SourceReadError {
            code: "source-missing",
            message: "That file is no longer available. Choose another file from the project.",
        },
        io::ErrorKind::PermissionDenied => SourceReadError {
            code: "source-permission-denied",
            message: "TeX does not have permission to read that file.",
        },
        _ => unavailable(),
    }
}

fn unsupported() -> SourceReadError {
    SourceReadError {
        code: "unsupported-source",
        message: "TeX can display text-based LaTeX project files in this phase.",
    }
}

fn source_too_large() -> SourceReadError {
    SourceReadError {
        code: "source-too-large",
        message: "This source file is too large to display safely.",
    }
}

fn unavailable() -> SourceReadError {
    SourceReadError {
        code: "source-unavailable",
        message: "TeX could not read that source file. Your project files were not changed.",
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
    };

    use super::read_source;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/latex-projects")
            .join(name)
    }

    #[test]
    fn reads_fixture_source_with_a_project_relative_path() -> Result<(), Box<dyn std::error::Error>>
    {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/root-detection");
        let source = read_source(&root, Path::new("main.tex")).map_err(|_| "source read failed")?;

        assert_eq!(source.path, "main.tex");
        assert!(source.content.contains("\\documentclass"));
        Ok(())
    }

    #[test]
    fn rejects_paths_that_escape_the_project() -> Result<(), Box<dyn std::error::Error>> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/root-detection");
        let outside = root
            .parent()
            .ok_or("fixture has no parent")?
            .join("outside.tex");
        fs::write(&outside, "outside")?;
        let result = read_source(&root, Path::new("../outside.tex"));
        fs::remove_file(outside)?;

        assert!(result.is_err());
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn rejects_project_local_symlink_sources() -> Result<(), Box<dyn std::error::Error>> {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!("tex-source-link-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir(&root)?;
        fs::write(root.join("target.tex"), "target")?;
        symlink(root.join("target.tex"), root.join("alias.tex"))?;

        assert!(read_source(&root, Path::new("alias.tex")).is_err());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn reads_utf8_source_from_a_non_ascii_project_path() -> Result<(), Box<dyn std::error::Error>> {
        let root = fixture("unicode-project");
        let source = read_source(&root, Path::new("Måneanalyse/hoveddokument.tex"))
            .map_err(|_| "Unicode source read failed")?;

        assert!(source.content.contains("Sigrid Ødegård"));
        assert_eq!(source.path, "Måneanalyse/hoveddokument.tex");
        Ok(())
    }

    #[test]
    fn opens_project_text_files_that_are_not_latex_source() -> Result<(), Box<dyn std::error::Error>>
    {
        use super::{is_openable_text, is_readable_source};

        let root = std::env::temp_dir().join(format!("tex-text-open-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir(&root)?;
        fs::write(root.join("main.log"), "This is pdfTeX, Version 3.14")?;
        fs::write(root.join("Makefile"), "all:\n\tlatexmk\n")?;

        let log = read_source(&root, Path::new("main.log")).map_err(|_| "log read failed")?;
        assert!(log.content.starts_with("This is pdfTeX"));
        assert!(read_source(&root, Path::new("Makefile")).is_ok());
        // Readable does not mean it is LaTeX source: analysis, project search,
        // and build roots stay on the narrow set.
        assert!(is_openable_text(Path::new("main.log")));
        assert!(!is_readable_source(Path::new("main.log")));
        assert!(!is_openable_text(Path::new("figures/plot.png")));

        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn reads_project_local_style_files() -> Result<(), Box<dyn std::error::Error>> {
        let root = fixture("nasa-technical-report");
        let source = read_source(&root, Path::new("styles/nasa-report.sty"))
            .map_err(|_| "style source read failed")?;

        assert!(source.content.contains("\\ProvidesPackage{nasa-report}"));
        Ok(())
    }
}
