use std::{
    fs, io,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::{ipc::Response, State};

use crate::{bounded_io, project_access::ProjectAccess};

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
    access: State<'_, ProjectAccess>,
) -> Result<Response, PdfReadError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let bytes = read_pdf(&root, Path::new(&relative_path))?;
    Ok(Response::new(bytes))
}

/// Returns a stable, content-independent revision hint for detecting external PDF replacements.
#[tauri::command]
pub fn project_pdf_revision(
    project_path: String,
    relative_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<String, PdfReadError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let path = resolve_pdf(&root, Path::new(&relative_path))?;
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
    bounded_io::read(&path, MAX_PDF_BYTES).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            too_large()
        } else {
            map_io_error(error)
        }
    })
}

pub(crate) fn resolve_pdf(
    project_path: &Path,
    relative_path: &Path,
) -> Result<PathBuf, PdfReadError> {
    if relative_path.as_os_str().is_empty()
        || relative_path.is_absolute()
        || !relative_path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
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
    let mut candidate = root.clone();
    for component in relative_path.components() {
        let Component::Normal(component) = component else {
            return Err(unsupported());
        };
        candidate.push(component);
        if fs::symlink_metadata(&candidate)
            .map_err(map_io_error)?
            .file_type()
            .is_symlink()
        {
            return Err(unsupported());
        }
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
        return Err(too_large());
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

fn too_large() -> PdfReadError {
    PdfReadError {
        code: "pdf-too-large",
        message: "This PDF is too large to display safely.",
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
    use std::{
        fs,
        path::{Path, PathBuf},
    };

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

    #[test]
    fn retains_last_good_bytes_across_repeated_read_failures(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let root = fixture();
        assert!(root.join("main.synctex.gz").is_file());
        assert!(root.join("sections/introduction.tex").is_file());
        let mut last_good = Vec::new();
        for _ in 0..100 {
            let candidate = read_pdf(&root, Path::new("main.pdf")).map_err(|_| "read failed")?;
            last_good = candidate;
            assert!(last_good.starts_with(b"%PDF-"));
        }
        let expected = last_good.clone();
        for _ in 0..100 {
            if let Ok(candidate) = read_pdf(&root, Path::new("removed.pdf")) {
                last_good = candidate;
            }
            assert_eq!(last_good, expected);
        }
        Ok(())
    }

    #[test]
    fn rejects_oversized_pdf_before_reading_bytes() -> Result<(), Box<dyn std::error::Error>> {
        let root = std::env::temp_dir().join(format!("tex-oversized-pdf-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root)?;
        let path = root.join("large.pdf");
        let file = fs::File::create(&path)?;
        file.set_len(super::MAX_PDF_BYTES + 1)?;
        assert!(read_pdf(&root, Path::new("large.pdf")).is_err());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn rejects_project_local_symlink_pdfs() -> Result<(), Box<dyn std::error::Error>> {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!("tex-pdf-link-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir(&root)?;
        fs::write(root.join("target.pdf"), b"%PDF-target")?;
        symlink(root.join("target.pdf"), root.join("alias.pdf"))?;

        assert!(read_pdf(&root, Path::new("alias.pdf")).is_err());
        fs::remove_dir_all(root)?;
        Ok(())
    }
}
