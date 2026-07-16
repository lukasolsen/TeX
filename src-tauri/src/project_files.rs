use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::project_access::ProjectAccess;

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
    access: State<'_, ProjectAccess>,
) -> Result<(), ProjectFileError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let parent = resolve_directory(&root, parent_path.as_deref())?;
    create_entry(&root, &parent, &name, directory)
}

fn create_entry(
    root: &Path,
    parent: &Path,
    name: &str,
    directory: bool,
) -> Result<(), ProjectFileError> {
    let target = parent.join(entry_name(name)?);
    let verified_parent = parent.canonicalize().map_err(|_| unavailable())?;
    if verified_parent != parent || !verified_parent.is_dir() || !verified_parent.starts_with(root)
    {
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
    access: State<'_, ProjectAccess>,
) -> Result<(), ProjectFileError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    rename_entry(&root, &relative_path, &name)
}

fn rename_entry(root: &Path, relative_path: &str, name: &str) -> Result<(), ProjectFileError> {
    let source = resolve_entry(root, relative_path)?;
    let parent = source.parent().ok_or_else(unavailable)?.to_path_buf();
    let target = parent.join(entry_name(name)?);
    renamore::rename_exclusive(source, target).map_err(|_| unavailable())
}

/// Deletes an explicitly selected project file or directory.
#[tauri::command]
pub fn delete_project_entry(
    app: AppHandle,
    project_path: String,
    relative_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<(), ProjectFileError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let target = resolve_entry(&root, &relative_path)?;
    let metadata = fs::metadata(&target).map_err(|_| unavailable())?;
    let entry_kind = if metadata.is_dir() { "folder" } else { "file" };
    let approved = app
        .dialog()
        .message(format!(
            "Permanently delete this {entry_kind} from the project?\n\n{relative_path}\n\nThis operation cannot be undone."
        ))
        .title(format!("Delete project {entry_kind}"))
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            format!("Delete {entry_kind}"),
            "Cancel".to_owned(),
        ))
        .blocking_show();
    if !approved {
        return Err(ProjectFileError {
            code: "project-delete-cancelled",
            message: "The project entry was not deleted.",
        });
    }
    if metadata.is_dir() {
        fs::remove_dir_all(target)
    } else {
        fs::remove_file(target)
    }
    .map_err(|_| unavailable())
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
    reject_symlink_components(root, relative)?;
    let path = root.join(relative).canonicalize().map_err(|_| invalid())?;
    if path.starts_with(root) {
        Ok(path)
    } else {
        Err(invalid())
    }
}

fn reject_symlink_components(root: &Path, relative: &Path) -> Result<(), ProjectFileError> {
    let mut candidate = root.to_path_buf();
    for component in relative.components() {
        let std::path::Component::Normal(component) = component else {
            return Err(invalid());
        };
        candidate.push(component);
        if fs::symlink_metadata(&candidate)
            .map_err(|_| invalid())?
            .file_type()
            .is_symlink()
        {
            return Err(invalid());
        }
    }
    Ok(())
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

    use super::{create_entry, entry_name, rename_entry, resolve_entry};

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
    fn rejects_nested_entry_names() {
        assert!(entry_name("chapters/intro.tex").is_err());
        assert!(entry_name("../outside.tex").is_err());
        assert!(entry_name("/outside.tex").is_err());
    }

    #[test]
    fn creates_a_direct_child() -> Result<(), Box<dyn std::error::Error>> {
        let directory = temporary_directory()?;
        assert!(create_entry(&directory, &directory, "intro.tex", false).is_ok());
        assert!(directory.join("intro.tex").is_file());
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

        let result = rename_entry(&directory, "first.tex", "second.tex");

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(directory.join("second.tex"))?, "second");
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_entry_instead_of_deleting_its_target(
    ) -> Result<(), Box<dyn std::error::Error>> {
        use std::os::unix::fs::symlink;

        let directory = temporary_directory()?;
        fs::create_dir(directory.join("target"))?;
        fs::write(directory.join("target/keep.tex"), "keep")?;
        symlink(directory.join("target"), directory.join("linked"))?;

        assert!(resolve_entry(&directory, "linked").is_err());
        assert_eq!(
            fs::read_to_string(directory.join("target/keep.tex"))?,
            "keep"
        );
        fs::remove_dir_all(directory)?;
        Ok(())
    }
}
