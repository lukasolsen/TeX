use std::{fs, io, path::Path};

use serde::Serialize;

const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;
const READABLE_EXTENSIONS: &[&str] = &["tex", "bib", "sty", "cls", "txt", "md"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocument {
    pub path: String,
    pub content: String,
    pub byte_length: u64,
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
) -> Result<SourceDocument, SourceReadError> {
    read_source(Path::new(&project_path), Path::new(&relative_path))
}

fn read_source(
    project_path: &Path,
    relative_path: &Path,
) -> Result<SourceDocument, SourceReadError> {
    if relative_path.is_absolute() || !is_readable_source(relative_path) {
        return Err(unsupported());
    }

    let project_root = project_path.canonicalize().map_err(map_io_error)?;
    if !project_root.is_dir() {
        return Err(unavailable());
    }
    let source_path = project_root
        .join(relative_path)
        .canonicalize()
        .map_err(map_io_error)?;
    if !source_path.starts_with(&project_root) || !source_path.is_file() {
        return Err(SourceReadError {
            code: "outside-project",
            message: "That file is not available inside this project.",
        });
    }

    let byte_length = fs::metadata(&source_path).map_err(map_io_error)?.len();
    if byte_length > MAX_SOURCE_BYTES {
        return Err(SourceReadError {
            code: "source-too-large",
            message: "This source file is too large to display safely.",
        });
    }
    let content = fs::read_to_string(&source_path).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            unsupported()
        } else {
            map_io_error(error)
        }
    })?;

    Ok(SourceDocument {
        path: relative_path.to_string_lossy().into_owned(),
        content,
        byte_length,
    })
}

fn is_readable_source(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            READABLE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
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

fn unavailable() -> SourceReadError {
    SourceReadError {
        code: "source-unavailable",
        message: "TeX could not read that source file. Your project files were not changed.",
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::read_source;

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
}
