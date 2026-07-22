use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;
use tauri::{ipc::Response, State};

use crate::{bounded_io, project_access::ProjectAccess};

/// Generous enough for scanned figures and photographic plates, small enough
/// that a mis-selected file cannot exhaust the WebView's memory.
const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;

/// Only formats a WebView renders in an `img` element. Mirrored by
/// `src/domain/file-kind.ts`, which decides what the UI offers to open.
const IMAGE_EXTENSIONS: &[&str] = &[
    "avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageReadError {
    pub code: &'static str,
    pub message: &'static str,
}

/// Returns a project-local image as a binary IPC response after validating its
/// path, format, and size. The bytes are never interpreted here: decoding is
/// the WebView's job, and the media type is derived from the extension.
#[tauri::command]
pub fn read_project_image(
    project_path: String,
    relative_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<Response, ImageReadError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    Ok(Response::new(read_image(&root, Path::new(&relative_path))?))
}

fn read_image(project_path: &Path, relative_path: &Path) -> Result<Vec<u8>, ImageReadError> {
    let path = resolve_image(project_path, relative_path)?;
    bounded_io::read(&path, MAX_IMAGE_BYTES).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            too_large()
        } else {
            map_io_error(error)
        }
    })
}

fn resolve_image(project_path: &Path, relative_path: &Path) -> Result<PathBuf, ImageReadError> {
    if relative_path.as_os_str().is_empty()
        || relative_path.is_absolute()
        || !relative_path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
        || !relative_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| IMAGE_EXTENSIONS.contains(&value.to_ascii_lowercase().as_str()))
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
        return Err(ImageReadError {
            code: "outside-project",
            message: "That image is not available inside this project.",
        });
    }
    if fs::metadata(&path).map_err(map_io_error)?.len() > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    Ok(path)
}

fn map_io_error(error: io::Error) -> ImageReadError {
    match error.kind() {
        io::ErrorKind::NotFound => ImageReadError {
            code: "image-missing",
            message: "That image is no longer available. Choose another file from the project.",
        },
        io::ErrorKind::PermissionDenied => ImageReadError {
            code: "image-permission-denied",
            message: "TeX does not have permission to read that image.",
        },
        _ => unavailable(),
    }
}

fn unsupported() -> ImageReadError {
    ImageReadError {
        code: "unsupported-image",
        message: "TeX cannot display this image format.",
    }
}

fn too_large() -> ImageReadError {
    ImageReadError {
        code: "image-too-large",
        message: "This image is too large to display safely.",
    }
}

fn unavailable() -> ImageReadError {
    ImageReadError {
        code: "image-unavailable",
        message: "TeX could not read that image. Your project files were not changed.",
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::read_image;

    fn project(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("tex-image-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        root
    }

    #[test]
    fn reads_a_project_image() -> Result<(), Box<dyn std::error::Error>> {
        let root = project("read");
        fs::create_dir_all(root.join("figures"))?;
        fs::write(root.join("figures/plot.png"), b"\x89PNG\r\n\x1a\n")?;

        let bytes =
            read_image(&root, Path::new("figures/plot.png")).map_err(|_| "image read failed")?;

        assert!(bytes.starts_with(b"\x89PNG"));
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn rejects_unsupported_formats_and_escaping_paths() -> Result<(), Box<dyn std::error::Error>> {
        let root = project("reject");
        fs::create_dir_all(&root)?;
        fs::write(root.join("main.tex"), "\\documentclass{article}")?;
        fs::write(root.join("scan.tiff"), b"II*\0")?;

        assert!(read_image(&root, Path::new("main.tex")).is_err());
        assert!(read_image(&root, Path::new("scan.tiff")).is_err());
        assert!(read_image(&root, Path::new("../plot.png")).is_err());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn rejects_project_local_symlink_images() -> Result<(), Box<dyn std::error::Error>> {
        use std::os::unix::fs::symlink;

        let root = project("symlink");
        fs::create_dir_all(&root)?;
        fs::write(root.join("target.png"), b"\x89PNG")?;
        symlink(root.join("target.png"), root.join("alias.png"))?;

        assert!(read_image(&root, Path::new("alias.png")).is_err());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn rejects_oversized_images_before_reading_bytes() -> Result<(), Box<dyn std::error::Error>> {
        let root = project("oversized");
        fs::create_dir_all(&root)?;
        let file = fs::File::create(root.join("large.png"))?;
        file.set_len(super::MAX_IMAGE_BYTES + 1)?;

        assert!(read_image(&root, Path::new("large.png")).is_err());
        fs::remove_dir_all(root)?;
        Ok(())
    }
}
