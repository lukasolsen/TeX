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
    let components = entry_path(name)?;
    let (entry_name, parent_components) = components.split_last().ok_or_else(invalid)?;
    let parent = create_parent_directories(root, parent, parent_components)?;
    let target = parent.join(entry_name);

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

fn create_parent_directories(
    root: &Path,
    parent: &Path,
    components: &[&str],
) -> Result<PathBuf, ProjectFileError> {
    let mut current = verified_directory(root, parent)?;

    for component in components {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(invalid());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|_| unavailable())?;
            }
            Err(_) => return Err(unavailable()),
        }
        current = verified_directory(root, &current)?;
    }

    Ok(current)
}

fn verified_directory(root: &Path, directory: &Path) -> Result<PathBuf, ProjectFileError> {
    let verified = directory.canonicalize().map_err(|_| unavailable())?;
    if verified != directory || !verified.is_dir() || !verified.starts_with(root) {
        return Err(invalid());
    }
    Ok(verified)
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
pub async fn delete_project_entry(
    app: AppHandle,
    project_path: String,
    relative_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<(), ProjectFileError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let target = resolve_entry(&root, &relative_path)?;
    let metadata = fs::metadata(&target).map_err(|_| unavailable())?;
    let entry_kind = if metadata.is_dir() { "folder" } else { "file" };
    let (approval_sender, mut approval_receiver) = tauri::async_runtime::channel(1);
    app
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
        .show(move |approved| {
            let _ = approval_sender.blocking_send(approved);
        });
    let approved = approval_receiver
        .recv()
        .await
        .is_some_and(|approved| approved);
    if !approved {
        return Err(ProjectFileError {
            code: "project-delete-cancelled",
            message: "The project entry was not deleted.",
        });
    }
    tauri::async_runtime::spawn_blocking(move || delete_entry(target))
        .await
        .map_err(|_| unavailable())?
}

fn delete_entry(target: PathBuf) -> Result<(), ProjectFileError> {
    if target.is_dir() {
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

fn entry_path(name: &str) -> Result<Vec<&str>, ProjectFileError> {
    if name.is_empty() || name.contains('\\') {
        return Err(invalid());
    }

    let components = name.split('/').collect::<Vec<_>>();
    if components.iter().any(|component| {
        component.is_empty()
            || *component == "."
            || *component == ".."
            || !matches!(
                Path::new(component).components().next(),
                Some(std::path::Component::Normal(_))
            )
            || Path::new(component).components().nth(1).is_some()
    }) {
        Err(invalid())
    } else {
        Ok(components)
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

    use super::{create_entry, delete_entry, entry_name, rename_entry, resolve_entry};

    fn temporary_directory() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-project-files-{unique}"));
        fs::create_dir(&directory)?;
        Ok(directory)
    }

    #[test]
    fn rejects_path_like_rename_names() {
        assert!(entry_name("../outside.tex").is_err());
        assert!(entry_name("chapter/main.tex").is_err());
        assert!(entry_name("main.tex").is_ok());
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
    fn creates_nested_file_and_missing_parent_directories() -> Result<(), Box<dyn std::error::Error>>
    {
        let directory = temporary_directory()?;

        assert!(create_entry(
            &directory,
            &directory,
            "testing/large_tasks/hello.txt",
            false
        )
        .is_ok());
        assert!(directory.join("testing/large_tasks/hello.txt").is_file());
        assert!(create_entry(&directory, &directory, "testing/a_major_file", false).is_ok());
        assert!(directory.join("testing/a_major_file").is_file());
        assert!(create_entry(&directory, &directory, "other/new_folder", true).is_ok());
        assert!(directory.join("other/new_folder").is_dir());

        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn rejects_creation_paths_that_escape_or_are_ambiguous(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let directory = temporary_directory()?;

        assert!(create_entry(&directory, &directory, "../outside.tex", false).is_err());
        assert!(create_entry(&directory, &directory, "chapter//main.tex", false).is_err());
        assert!(create_entry(&directory, &directory, "chapter\\main.tex", false).is_err());

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

    #[test]
    fn deletes_a_directory_tree_without_leaving_entries() -> Result<(), Box<dyn std::error::Error>>
    {
        let directory = temporary_directory()?;
        let generated = directory.join("tmp");
        fs::create_dir_all(generated.join("support/templates"))?;
        fs::write(generated.join("support/templates/main.tex"), "generated")?;
        fs::write(generated.join("output.pdf"), "generated")?;

        assert!(delete_entry(generated).is_ok());

        assert!(!directory.join("tmp").exists());
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
