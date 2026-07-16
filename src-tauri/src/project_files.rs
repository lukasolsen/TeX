use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileError {
    pub code: &'static str,
    pub message: &'static str,
}

/// Creates a project-local file or directory after validating every path component.
#[tauri::command]
pub fn create_project_entry(
    project_path: String,
    parent_path: Option<String>,
    name: String,
    directory: bool,
) -> Result<(), ProjectFileError> {
    let root = project_root(&project_path)?;
    let parent = resolve_directory(&root, parent_path.as_deref())?;
    create_entry(&root, &parent, &name, directory)
}

fn create_entry(
    root: &Path,
    parent: &Path,
    name: &str,
    directory: bool,
) -> Result<(), ProjectFileError> {
    let relative = entry_path(name)?;
    let target = parent.join(relative);
    let target_parent = target.parent().ok_or_else(invalid)?;
    fs::create_dir_all(target_parent).map_err(|_| unavailable())?;
    let verified_parent = target_parent.canonicalize().map_err(|_| unavailable())?;
    if !verified_parent.is_dir() || !verified_parent.starts_with(root) {
        return Err(invalid());
    }

    if directory {
        fs::create_dir(&target)
    } else {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map(|_| ())
    }
    .map_err(|_| unavailable())
}

/// Renames an existing project entry without allowing it to leave the project root.
#[tauri::command]
pub fn rename_project_entry(
    project_path: String,
    relative_path: String,
    name: String,
) -> Result<(), ProjectFileError> {
    let root = project_root(&project_path)?;
    let source = resolve_entry(&root, &relative_path)?;
    let parent = source.parent().ok_or_else(unavailable)?.to_path_buf();
    let target = parent.join(entry_name(&name)?);
    if target.exists() {
        return Err(unavailable());
    }
    fs::rename(source, target).map_err(|_| unavailable())
}

/// Deletes an explicitly selected project file or directory.
#[tauri::command]
pub fn delete_project_entry(
    project_path: String,
    relative_path: String,
) -> Result<(), ProjectFileError> {
    let root = project_root(&project_path)?;
    let target = resolve_entry(&root, &relative_path)?;
    let metadata = fs::metadata(&target).map_err(|_| unavailable())?;
    if metadata.is_dir() {
        fs::remove_dir_all(target)
    } else {
        fs::remove_file(target)
    }
    .map_err(|_| unavailable())
}

fn project_root(project_path: &str) -> Result<PathBuf, ProjectFileError> {
    let root = Path::new(project_path)
        .canonicalize()
        .map_err(|_| unavailable())?;
    if root.is_dir() {
        Ok(root)
    } else {
        Err(unavailable())
    }
}

fn resolve_entry(root: &Path, relative: &str) -> Result<PathBuf, ProjectFileError> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative.as_os_str().is_empty()
        || relative.components().any(|component| {
            matches!(
                component,
                std::path::Component::CurDir | std::path::Component::ParentDir
            )
        })
    {
        return Err(invalid());
    }
    let path = root.join(relative).canonicalize().map_err(|_| invalid())?;
    if path.starts_with(root) {
        Ok(path)
    } else {
        Err(invalid())
    }
}

fn resolve_directory(root: &Path, relative: Option<&str>) -> Result<PathBuf, ProjectFileError> {
    let path = match relative {
        Some(path) => resolve_entry(root, path)?,
        None => root.to_path_buf(),
    };
    if path.is_dir() {
        Ok(path)
    } else {
        Err(invalid())
    }
}

fn entry_name(name: &str) -> Result<&str, ProjectFileError> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        Err(invalid())
    } else {
        Ok(name)
    }
}

fn entry_path(name: &str) -> Result<&Path, ProjectFileError> {
    let path = Path::new(name);
    if name.contains('\\')
        || path.as_os_str().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        Err(invalid())
    } else {
        Ok(path)
    }
}

fn invalid() -> ProjectFileError {
    ProjectFileError {
        code: "invalid-project-entry",
        message: "That project entry is no longer available.",
    }
}
fn unavailable() -> ProjectFileError {
    ProjectFileError {
        code: "project-update-unavailable",
        message: "TeX could not update the project. Your remaining files are safe.",
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{create_entry, entry_name, entry_path, rename_project_entry, resolve_entry};

    fn temporary_directory() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-project-files-{unique}"));
        fs::create_dir(&directory)?;
        Ok(directory)
    }

    #[test]
    fn rejects_path_like_entry_names() {
        assert!(entry_name("../outside.tex").is_err());
        assert!(entry_name("chapter/main.tex").is_err());
        assert!(entry_name("main.tex").is_ok());
    }

    #[test]
    fn accepts_nested_entry_paths_without_traversal() {
        assert!(entry_path("chapters/intro.tex").is_ok());
        assert!(entry_path("../outside.tex").is_err());
        assert!(entry_path("chapters/../outside.tex").is_err());
        assert!(entry_path("/outside.tex").is_err());
    }

    #[test]
    fn creates_missing_directories_for_nested_file() -> Result<(), Box<dyn std::error::Error>> {
        let directory = temporary_directory()?;
        assert!(create_entry(&directory, &directory, "chapters/intro.tex", false).is_ok());
        assert!(directory.join("chapters/intro.tex").is_file());
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn rejects_the_project_root_as_an_entry() -> Result<(), Box<dyn std::error::Error>> {
        let directory = temporary_directory()?;
        assert!(resolve_entry(&directory, ".").is_err());
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn rename_does_not_replace_an_existing_entry() -> Result<(), Box<dyn std::error::Error>> {
        let directory = temporary_directory()?;
        fs::write(directory.join("first.tex"), "first")?;
        fs::write(directory.join("second.tex"), "second")?;

        let result = rename_project_entry(
            directory.to_string_lossy().into_owned(),
            "first.tex".to_owned(),
            "second.tex".to_owned(),
        );

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(directory.join("second.tex"))?, "second");
        fs::remove_dir_all(directory)?;
        Ok(())
    }
}
