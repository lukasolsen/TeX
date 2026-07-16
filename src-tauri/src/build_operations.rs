use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use serde::Serialize;
use tauri::AppHandle;

use crate::project_config::{
    canonical_child, load_configuration_for_project, validate_configuration,
};

const MAX_CLEAN_FILES: usize = 4_096;
const MAX_SCAN_DEPTH: usize = 12;
const AUXILIARY_EXTENSIONS: [&str; 22] = [
    "aux",
    "bbl",
    "bcf",
    "blg",
    "fdb_latexmk",
    "fls",
    "glg",
    "glo",
    "gls",
    "idx",
    "ilg",
    "ind",
    "lof",
    "log",
    "lot",
    "nav",
    "out",
    "run.xml",
    "snm",
    "synctex",
    "toc",
    "vrb",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanPreview {
    files: Vec<String>,
    total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildOperationError {
    code: &'static str,
    message: &'static str,
}

#[tauri::command]
pub fn preview_clean_auxiliary_files(
    project_path: String,
) -> Result<CleanPreview, BuildOperationError> {
    let root = canonical_root(Path::new(&project_path))?;
    preview_clean(&root)
}

#[tauri::command]
pub fn clean_auxiliary_files(
    project_path: String,
    files: Vec<String>,
) -> Result<usize, BuildOperationError> {
    let root = canonical_root(Path::new(&project_path))?;
    if files.len() > MAX_CLEAN_FILES {
        return Err(invalid_clean());
    }
    let mut validated = Vec::with_capacity(files.len());
    for relative in files {
        let path = canonical_child(&root, &relative, false).map_err(|_| invalid_clean())?;
        if !is_auxiliary(&path) {
            return Err(invalid_clean());
        }
        validated.push(path);
    }
    for path in &validated {
        fs::remove_file(path).map_err(|_| BuildOperationError {
            code: "clean-failed",
            message: "TeX could not remove every previewed auxiliary file. Source and PDF files were not targeted.",
        })?;
    }
    Ok(validated.len())
}

#[tauri::command]
pub fn reveal_project_output(
    app: AppHandle,
    project_path: String,
    root_file: String,
) -> Result<(), BuildOperationError> {
    let root = canonical_root(Path::new(&project_path))?;
    let configuration = load_configuration_for_project(&app, &root).map_err(|_| unavailable())?;
    validate_configuration(&root, &configuration).map_err(|_| unavailable())?;
    let configured_root = configuration.root_file.as_deref().unwrap_or(&root_file);
    let source = canonical_child(&root, configured_root, false).map_err(|_| unavailable())?;
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(unavailable)?;
    let output_directory = configuration.output_directory.as_deref().unwrap_or(".");
    let output = root
        .join(output_directory)
        .join(format!("{stem}.pdf"))
        .canonicalize()
        .map_err(|_| BuildOperationError {
            code: "output-unavailable",
            message: "No built PDF is available to reveal yet.",
        })?;
    if !output.starts_with(&root)
        || output.extension().and_then(|value| value.to_str()) != Some("pdf")
        || !output.is_file()
    {
        return Err(unavailable());
    }
    reveal_path(&output)
}

fn preview_clean(root: &Path) -> Result<CleanPreview, BuildOperationError> {
    let mut paths = Vec::new();
    collect_auxiliary(root, root, 0, &mut paths)?;
    paths.sort();
    let total_bytes = paths.iter().try_fold(0_u64, |total, path| {
        path.metadata()
            .map(|metadata| total.saturating_add(metadata.len()))
            .map_err(|_| unavailable())
    })?;
    Ok(CleanPreview {
        files: paths
            .into_iter()
            .filter_map(|path| {
                path.strip_prefix(root)
                    .ok()
                    .map(|relative| relative.to_string_lossy().into_owned())
            })
            .collect(),
        total_bytes,
    })
}

fn collect_auxiliary(
    root: &Path,
    directory: &Path,
    depth: usize,
    paths: &mut Vec<PathBuf>,
) -> Result<(), BuildOperationError> {
    if depth > MAX_SCAN_DEPTH || paths.len() >= MAX_CLEAN_FILES {
        return Ok(());
    }
    let entries = fs::read_dir(directory).map_err(|_| unavailable())?;
    for entry in entries {
        let entry = entry.map_err(|_| unavailable())?;
        let file_type = entry.file_type().map_err(|_| unavailable())?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            if path.file_name().and_then(|value| value.to_str()) != Some(".git") {
                collect_auxiliary(root, &path, depth + 1, paths)?;
            }
        } else if file_type.is_file() && is_auxiliary(&path) {
            let canonical = path.canonicalize().map_err(|_| unavailable())?;
            if canonical.starts_with(root) {
                paths.push(canonical);
            }
        }
        if paths.len() >= MAX_CLEAN_FILES {
            break;
        }
    }
    Ok(())
}

fn is_auxiliary(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    name.ends_with(".synctex.gz")
        || AUXILIARY_EXTENSIONS
            .iter()
            .any(|extension| name.ends_with(&format!(".{extension}")))
}

#[cfg(target_os = "windows")]
fn reveal_path(path: &Path) -> Result<(), BuildOperationError> {
    Command::new("explorer.exe")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| reveal_failed())
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), BuildOperationError> {
    Command::new("/usr/bin/open")
        .args(["-R"])
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| reveal_failed())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_path(path: &Path) -> Result<(), BuildOperationError> {
    let parent = path.parent().ok_or_else(reveal_failed)?;
    Command::new("/usr/bin/xdg-open")
        .arg(parent)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| reveal_failed())
}

fn canonical_root(path: &Path) -> Result<PathBuf, BuildOperationError> {
    let root = path.canonicalize().map_err(|_| unavailable())?;
    if root.is_dir() {
        Ok(root)
    } else {
        Err(unavailable())
    }
}

fn invalid_clean() -> BuildOperationError {
    BuildOperationError {
        code: "invalid-clean-selection",
        message: "The clean selection changed or contains a non-auxiliary file. Preview it again before cleaning.",
    }
}

fn reveal_failed() -> BuildOperationError {
    BuildOperationError {
        code: "reveal-failed",
        message: "The system file browser could not reveal the built PDF.",
    }
}

fn unavailable() -> BuildOperationError {
    BuildOperationError {
        code: "build-operation-unavailable",
        message: "TeX could not validate this build operation. Project files were not changed.",
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::{is_auxiliary, preview_clean};

    #[test]
    fn clean_preview_never_includes_source_or_pdf() -> Result<(), Box<dyn std::error::Error>> {
        let root = std::env::temp_dir().join(format!("tex-clean-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root)?;
        fs::write(root.join("main.tex"), "source")?;
        fs::write(root.join("main.pdf"), "pdf")?;
        fs::write(root.join("main.aux"), "aux")?;
        let preview = preview_clean(&root).map_err(|_| "preview failed")?;
        assert_eq!(preview.files, ["main.aux"]);
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn auxiliary_matching_is_conservative() {
        assert!(is_auxiliary(Path::new("main.synctex.gz")));
        assert!(is_auxiliary(Path::new("main.fdb_latexmk")));
        assert!(!is_auxiliary(Path::new("main.tex")));
        assert!(!is_auxiliary(Path::new("main.pdf")));
    }
}
