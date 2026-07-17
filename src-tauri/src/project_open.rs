use std::{
    error::Error,
    fmt, fs, io,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::persistence;
use crate::project_access::ProjectAccess;
use crate::project_config::load_configuration_for_project;
use crate::root_detection::{self, RootEvidence};

const MAX_TREE_DEPTH: usize = 12;
const MAX_TREE_ENTRIES: usize = 2_048;

/// A safe, bounded project representation sent to the presentation layer.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub name: String,
    pub path: String,
    pub tree: ProjectEntry,
    pub root_candidates: Vec<RootCandidate>,
    pub root_detection_note: Option<String>,
    pub persistence_note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub kind: ProjectEntryKind,
    pub children: Vec<ProjectEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectEntryKind {
    Directory,
    File,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootCandidate {
    pub path: String,
    pub evidence: Vec<RootEvidenceKind>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RootEvidenceKind {
    DocumentClass,
    MagicComment,
    Configured,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOpenError {
    pub code: ProjectOpenErrorCode,
    pub message: &'static str,
}

impl fmt::Display for ProjectOpenError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl Error for ProjectOpenError {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectOpenErrorCode {
    NotFound,
    PermissionDenied,
    NotDirectory,
    TreeTooLarge,
    Unavailable,
}

/// Validates a user-selected directory and returns only bounded metadata.
#[tauri::command]
pub async fn choose_project_folder(
    app: AppHandle,
    access: State<'_, ProjectAccess>,
) -> Result<Option<String>, ProjectOpenError> {
    let selected = app
        .dialog()
        .file()
        .set_title("Open LaTeX project")
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|_| unavailable())?;
    let root = access.approve(&path).map_err(map_io_error)?;
    Ok(Some(root.to_string_lossy().into_owned()))
}

/// Opens metadata only for a project root already approved by Rust.
#[tauri::command]
pub fn open_project(
    path: String,
    app: AppHandle,
    access: State<'_, ProjectAccess>,
) -> Result<ProjectSummary, ProjectOpenError> {
    let approved = access.resolve(&path).map_err(map_io_error)?;
    let mut project = open_project_path(&approved)?;
    let project_path = Path::new(&project.path);
    if let Ok(configuration) = load_configuration_for_project(&app, project_path) {
        if let Some(configured_root) = configuration.root_file {
            if let Some(candidate) = project
                .root_candidates
                .iter_mut()
                .find(|candidate| candidate.path == configured_root)
            {
                candidate.evidence.push(RootEvidenceKind::Configured);
            } else {
                project.root_candidates.push(RootCandidate {
                    path: configured_root,
                    evidence: vec![RootEvidenceKind::Configured],
                });
            }
        }
    }
    if persistence::record_project_opened(&app, &project.name, project_path).is_err() {
        project.persistence_note = Some(
            "The project opened, but TeX could not remember this workspace. Your source files were not changed."
                .to_owned(),
        );
    }
    Ok(project)
}

fn open_project_path(path: &Path) -> Result<ProjectSummary, ProjectOpenError> {
    let project_root = path.canonicalize().map_err(map_io_error)?;
    let metadata = fs::metadata(&project_root).map_err(map_io_error)?;
    if !metadata.is_dir() {
        return Err(ProjectOpenError {
            code: ProjectOpenErrorCode::NotDirectory,
            message: "Choose a folder containing a LaTeX project.",
        });
    }

    let name = project_root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map_or_else(|| "Project".to_owned(), ToOwned::to_owned);
    let mut visited_entries = 0;
    let tree = collect_tree(&project_root, 0, &mut visited_entries)?;

    let (root_candidates, root_detection_note) =
        match root_detection::detect_root_candidates(&project_root) {
            Ok(candidates) => (
                candidates
                    .into_iter()
                    .filter_map(|candidate| {
                        relative_candidate(&project_root, candidate.path, candidate.evidence)
                    })
                    .collect(),
                None,
            ),
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => (
                Vec::new(),
                Some("Some files could not be read while looking for root files.".to_owned()),
            ),
            Err(_) => (
                Vec::new(),
                Some("Root-file detection could not finish for this project.".to_owned()),
            ),
        };

    Ok(ProjectSummary {
        name,
        path: project_root.to_string_lossy().into_owned(),
        tree,
        root_candidates,
        root_detection_note,
        persistence_note: None,
    })
}

fn collect_tree(
    directory: &Path,
    depth: usize,
    visited_entries: &mut usize,
) -> Result<ProjectEntry, ProjectOpenError> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(directory).map_err(map_io_error)? {
        let entry = entry.map_err(map_io_error)?;
        let file_type = entry.file_type().map_err(map_io_error)?;
        if file_type.is_symlink()
            || ignored_name(entry.file_name().as_os_str())
            || (file_type.is_file() && ignored_generated_file(&entry.path()))
        {
            continue;
        }
        *visited_entries += 1;
        if *visited_entries > MAX_TREE_ENTRIES {
            return Err(ProjectOpenError {
                code: ProjectOpenErrorCode::TreeTooLarge,
                message: "This folder is too large to open safely. Choose the project folder itself instead.",
            });
        }
        entries.push((entry, file_type));
    }
    entries.sort_by_key(|(entry, _)| entry.file_name());

    let mut directories = Vec::new();
    let mut files = Vec::new();
    for (entry, file_type) in entries {
        let path = entry.path();
        if file_type.is_dir() {
            if depth < MAX_TREE_DEPTH {
                directories.push(collect_tree(&path, depth + 1, visited_entries)?);
            } else {
                directories.push(ProjectEntry {
                    name: display_name(&path),
                    kind: ProjectEntryKind::Directory,
                    children: Vec::new(),
                });
            }
        } else if file_type.is_file() {
            files.push(ProjectEntry {
                name: display_name(&path),
                kind: ProjectEntryKind::File,
                children: Vec::new(),
            });
        }
    }

    directories.extend(files);
    Ok(ProjectEntry {
        name: display_name(directory),
        kind: ProjectEntryKind::Directory,
        children: directories,
    })
}

fn relative_candidate(
    project_root: &Path,
    candidate: PathBuf,
    evidence: Vec<RootEvidence>,
) -> Option<RootCandidate> {
    let path = candidate
        .strip_prefix(project_root)
        .ok()?
        .to_string_lossy()
        .into_owned();
    let evidence = evidence
        .into_iter()
        .map(|item| match item {
            RootEvidence::DocumentClass => RootEvidenceKind::DocumentClass,
            RootEvidence::MagicComment => RootEvidenceKind::MagicComment,
        })
        .collect();

    Some(RootCandidate { path, evidence })
}

fn ignored_name(name: &std::ffi::OsStr) -> bool {
    matches!(
        name.to_str(),
        Some(
            ".git"
                | ".cache"
                | ".texpadtmp"
                | "node_modules"
                | "target"
                | "build"
                | "dist"
                | "out"
                | "_build"
        )
    )
}

fn ignored_generated_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some(
            "aux"
                | "bbl"
                | "bcf"
                | "blg"
                | "fdb_latexmk"
                | "fls"
                | "log"
                | "out"
                | "synctex"
                | "toc"
        )
    ) || path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with(".synctex.gz") || name.ends_with(".run.xml"))
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map_or_else(|| "Project".to_owned(), ToOwned::to_owned)
}

fn map_io_error(error: io::Error) -> ProjectOpenError {
    let (code, message) = match error.kind() {
        io::ErrorKind::NotFound => (
            ProjectOpenErrorCode::NotFound,
            "That folder is no longer available. Choose another folder.",
        ),
        io::ErrorKind::PermissionDenied => (
            ProjectOpenErrorCode::PermissionDenied,
            "TeX does not have permission to read that folder. Update its permissions and try again.",
        ),
        _ => (
            ProjectOpenErrorCode::Unavailable,
            "TeX could not open that folder. Choose another folder or try again.",
        ),
    };

    ProjectOpenError { code, message }
}

fn unavailable() -> ProjectOpenError {
    ProjectOpenError {
        code: ProjectOpenErrorCode::Unavailable,
        message: "TeX could not open that folder. Choose it again and retry.",
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs, io,
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{map_io_error, open_project_path, ProjectEntryKind, ProjectOpenErrorCode};

    #[test]
    fn maps_permission_errors_without_exposing_a_path() {
        let error = map_io_error(io::Error::from(io::ErrorKind::PermissionDenied));

        assert!(matches!(error.code, ProjectOpenErrorCode::PermissionDenied));
        assert!(!error.message.contains('/'));
    }

    #[test]
    fn rejects_a_file_instead_of_a_project_folder() -> Result<(), Box<dyn std::error::Error>> {
        let file =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/root-detection/main.tex");
        let result = open_project_path(&file);
        let Err(error) = result else {
            return Err("a source file must not open as a project".into());
        };

        assert!(matches!(error.code, ProjectOpenErrorCode::NotDirectory));
        Ok(())
    }

    #[test]
    fn opens_a_fixture_and_excludes_git_metadata() -> Result<(), Box<dyn std::error::Error>> {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let fixture = std::env::temp_dir().join(format!("tex-project-open-{timestamp}"));
        fs::create_dir_all(fixture.join(".git"))?;
        fs::create_dir_all(fixture.join("chapters"))?;
        fs::write(fixture.join("main.tex"), r"\documentclass{article}")?;
        fs::write(fixture.join("main.pdf"), "PDF fixture")?;
        fs::write(fixture.join("main.aux"), "generated")?;
        fs::write(
            fixture.join("chapters/introduction.tex"),
            "% !TeX root = ../main.tex",
        )?;

        let project = open_project_path(&fixture)?;
        assert_eq!(project.name, format!("tex-project-open-{timestamp}"));
        assert!(project
            .root_candidates
            .iter()
            .any(|candidate| candidate.path == "main.tex"));
        assert!(!project
            .tree
            .children
            .iter()
            .any(|entry| entry.name == ".git"));
        assert!(!project
            .tree
            .children
            .iter()
            .any(|entry| entry.name == "main.aux"));
        let pdf = project
            .tree
            .children
            .iter()
            .find(|entry| entry.name == "main.pdf")
            .ok_or("PDF missing from project tree")?;
        assert!(matches!(pdf.kind, ProjectEntryKind::File));
        assert!(pdf.children.is_empty());

        fs::remove_dir_all(&fixture)?;
        Ok(())
    }

    #[test]
    fn opens_a_multi_root_fixture_without_selecting_a_root(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/latex-projects/multiple-roots");

        let project = open_project_path(&fixture)?;
        let candidate_paths: Vec<&str> = project
            .root_candidates
            .iter()
            .map(|candidate| candidate.path.as_str())
            .collect();

        assert_eq!(
            candidate_paths,
            vec!["paper/main.tex", "presentation/slides.tex"]
        );
        assert!(project.root_detection_note.is_none());
        Ok(())
    }
}
