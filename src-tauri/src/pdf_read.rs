use std::{
    fs, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::ipc::Response;

const MAX_PDF_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfReadError {
    pub code: &'static str,
    pub message: &'static str,
}

/// Returns a project-local PDF as a binary IPC response after validating its path and size.
#[tauri::command]
pub fn read_project_pdf(
    project_path: String,
    relative_path: String,
) -> Result<Response, PdfReadError> {
    let bytes = read_pdf(Path::new(&project_path), Path::new(&relative_path))?;
    Ok(Response::new(bytes))
}

/// Returns a stable, content-independent revision hint for detecting external PDF replacements.
#[tauri::command]
pub fn project_pdf_revision(
    project_path: String,
    relative_path: String,
) -> Result<String, PdfReadError> {
    let path = resolve_pdf(Path::new(&project_path), Path::new(&relative_path))?;
    let metadata = fs::metadata(path).map_err(map_io_error)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |value| value.as_nanos());
    Ok(format!("{}:{modified}", metadata.len()))
}

fn read_pdf(project_path: &Path, relative_path: &Path) -> Result<Vec<u8>, PdfReadError> {
    let path = resolve_pdf(project_path, relative_path)?;
    fs::read(path).map_err(map_io_error)
}

fn resolve_pdf(project_path: &Path, relative_path: &Path) -> Result<PathBuf, PdfReadError> {
    if relative_path.is_absolute()
        || !relative_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err(unsupported());
    }
    let root = project_path.canonicalize().map_err(map_io_error)?;
    if !root.is_dir() {
        return Err(unavailable());
    }
    let path = root
        .join(relative_path)
        .canonicalize()
        .map_err(map_io_error)?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(PdfReadError {
            code: "outside-project",
            message: "That PDF is not available inside this project.",
        });
    }
    if fs::metadata(&path).map_err(map_io_error)?.len() > MAX_PDF_BYTES {
        return Err(PdfReadError {
            code: "pdf-too-large",
            message: "This PDF is too large to display safely.",
        });
    }
    Ok(path)
}

fn map_io_error(error: io::Error) -> PdfReadError {
    match error.kind() {
        io::ErrorKind::NotFound => PdfReadError {
            code: "pdf-missing",
            message: "That PDF is no longer available. The previous PDF remains unchanged.",
        },
        io::ErrorKind::PermissionDenied => PdfReadError {
            code: "pdf-permission-denied",
            message: "TeX does not have permission to read that PDF.",
        },
        _ => unavailable(),
    }
}

fn unsupported() -> PdfReadError {
    PdfReadError {
        code: "unsupported-pdf",
        message: "Choose a PDF file inside this project.",
    }
}

fn unavailable() -> PdfReadError {
    PdfReadError {
        code: "pdf-unavailable",
        message: "TeX could not read that PDF. The previous PDF remains unchanged.",
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::read_pdf;

    fn fixture() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/latex-projects/nasa-technical-report")
    }

    #[test]
    fn reads_a_project_pdf() -> Result<(), Box<dyn std::error::Error>> {
        let bytes = read_pdf(&fixture(), Path::new("main.pdf")).map_err(|_| "read failed")?;
        assert!(bytes.starts_with(b"%PDF-"));
        Ok(())
    }

    #[test]
    fn rejects_non_pdf_and_escaping_paths() {
        assert!(read_pdf(&fixture(), Path::new("main.tex")).is_err());
        assert!(read_pdf(&fixture(), Path::new("../main.pdf")).is_err());
    }
}
