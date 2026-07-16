use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::{bounded_io, project_access::ProjectAccess, source_edit::atomic_write};

const CONFIG_VERSION: u8 = 1;
const MAX_ARGUMENTS: usize = 128;
const MAX_ARGUMENT_LENGTH: usize = 4096;
const MAX_GENERATED_DIRECTORIES: usize = 32;
const MAX_CONFIGURATION_BYTES: u64 = 1024 * 1024;
const ALLOWED_ENVIRONMENT_KEYS: [&str; 5] = [
    "BIBINPUTS",
    "BSTINPUTS",
    "TEXINPUTS",
    "TEXMFHOME",
    "TEXMFOUTPUT",
];

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BibliographyTool {
    Automatic,
    Biber,
    Bibtex,
    None,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvironmentSetting {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomCommand {
    pub executable: String,
    pub arguments: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectBuildConfiguration {
    pub schema_version: u8,
    pub root_file: Option<String>,
    pub output_directory: Option<String>,
    pub bibliography_tool: BibliographyTool,
    pub generated_directories: Vec<String>,
    pub environment: Vec<EnvironmentSetting>,
    pub custom_command: Option<CustomCommand>,
    #[serde(default)]
    pub custom_command_consent: bool,
    #[serde(default)]
    pub shell_escape_consent: bool,
}

impl Default for ProjectBuildConfiguration {
    fn default() -> Self {
        Self {
            schema_version: CONFIG_VERSION,
            root_file: None,
            output_directory: None,
            bibliography_tool: BibliographyTool::Automatic,
            generated_directories: Vec::new(),
            environment: Vec::new(),
            custom_command: None,
            custom_command_consent: false,
            shell_escape_consent: false,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigError {
    pub code: &'static str,
    pub message: &'static str,
}

#[tauri::command]
pub fn load_project_build_configuration(
    app: AppHandle,
    project_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<ProjectBuildConfiguration, ProjectConfigError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    load_configuration_for_project(&app, &root).and_then(|configuration| {
        validate_configuration(&root, &configuration)?;
        Ok(configuration)
    })
}

pub(crate) fn load_configuration_for_project(
    app: &AppHandle,
    root: &Path,
) -> Result<ProjectBuildConfiguration, ProjectConfigError> {
    read_configuration(&configuration_path(app, root)?)
}

#[tauri::command]
pub async fn save_project_build_configuration(
    app: AppHandle,
    project_path: String,
    mut configuration: ProjectBuildConfiguration,
    access: State<'_, ProjectAccess>,
) -> Result<ProjectBuildConfiguration, ProjectConfigError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    validate_configuration_structure(&root, &configuration)?;
    let current = load_configuration_for_project(&app, &root)?;
    establish_native_consent(&app, &current, &mut configuration)?;
    validate_configuration(&root, &configuration)?;
    let path = configuration_path(&app, &root)?;
    let encoded = serde_json::to_vec_pretty(&configuration).map_err(|_| unavailable())?;
    atomic_write(&path, &encoded).map_err(|_| unavailable())?;
    Ok(configuration)
}

/// Establishes process consent in a native dialog that webview code cannot forge.
fn establish_native_consent(
    app: &AppHandle,
    current: &ProjectBuildConfiguration,
    candidate: &mut ProjectBuildConfiguration,
) -> Result<(), ProjectConfigError> {
    let Some(command) = candidate.custom_command.as_ref() else {
        candidate.custom_command_consent = false;
        candidate.shell_escape_consent = false;
        return Ok(());
    };

    let command_unchanged =
        current.custom_command.as_ref() == Some(command) && current.custom_command_consent;
    if !command_unchanged {
        let arguments = if command.arguments.is_empty() {
            "(none)".to_owned()
        } else {
            command.arguments.join("\n")
        };
        let approved = app
            .dialog()
            .message(format!(
                "Allow TeX to run this custom command for the current project?\n\nExecutable: {}\nArguments:\n{}\n\nThe command will run with your user permissions.",
                command.executable, arguments
            ))
            .title("Allow custom build command")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Allow command".to_owned(),
                "Cancel".to_owned(),
            ))
            .blocking_show();
        if !approved {
            return Err(ProjectConfigError {
                code: "custom-command-consent-required",
                message: "The custom command was not saved because permission was not granted.",
            });
        }
    }
    candidate.custom_command_consent = true;

    if uses_shell_escape(&command.arguments) {
        let shell_escape_unchanged = command_unchanged && current.shell_escape_consent;
        if !shell_escape_unchanged {
            let approved = app
                .dialog()
                .message(
                    "Allow shell escape for this project's custom build command?\n\nLaTeX source may execute additional programs with your user permissions.",
                )
                .title("Allow LaTeX shell escape")
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "Allow shell escape".to_owned(),
                    "Cancel".to_owned(),
                ))
                .blocking_show();
            if !approved {
                return Err(ProjectConfigError {
                    code: "shell-escape-consent-required",
                    message:
                        "Shell escape was not saved because separate permission was not granted.",
                });
            }
        }
        candidate.shell_escape_consent = true;
    } else {
        candidate.shell_escape_consent = false;
    }
    Ok(())
}

pub(crate) fn validate_configuration(
    root: &Path,
    configuration: &ProjectBuildConfiguration,
) -> Result<(), ProjectConfigError> {
    validate_configuration_structure(root, configuration)?;
    if let Some(command) = &configuration.custom_command {
        if !configuration.custom_command_consent {
            return Err(ProjectConfigError {
                code: "custom-command-consent-required",
                message: "Review and consent to the exact custom command before saving it.",
            });
        }
        if uses_shell_escape(&command.arguments) && !configuration.shell_escape_consent {
            return Err(ProjectConfigError {
                code: "shell-escape-consent-required",
                message: "Shell escape can run project-supplied programs. Grant separate consent before enabling it.",
            });
        }
    }
    Ok(())
}

fn validate_configuration_structure(
    root: &Path,
    configuration: &ProjectBuildConfiguration,
) -> Result<(), ProjectConfigError> {
    if configuration.schema_version != CONFIG_VERSION
        || configuration.generated_directories.len() > MAX_GENERATED_DIRECTORIES
        || configuration.environment.len() > ALLOWED_ENVIRONMENT_KEYS.len()
    {
        return Err(invalid_configuration());
    }
    if let Some(root_file) = configuration.root_file.as_deref() {
        let path = canonical_child(root, root_file, false)?;
        if path.extension().and_then(|value| value.to_str()) != Some("tex") {
            return Err(invalid_configuration());
        }
    }
    if let Some(output) = configuration.output_directory.as_deref() {
        canonical_child(root, output, true)?;
    }
    for directory in &configuration.generated_directories {
        canonical_child(root, directory, true)?;
    }
    for setting in &configuration.environment {
        if !ALLOWED_ENVIRONMENT_KEYS.contains(&setting.name.as_str())
            || setting.value.chars().any(char::is_control)
            || setting.value.len() > MAX_ARGUMENT_LENGTH
        {
            return Err(invalid_configuration());
        }
    }
    if let Some(command) = &configuration.custom_command {
        let executable = Path::new(&command.executable);
        if !executable.is_absolute()
            || command.executable.chars().any(char::is_control)
            || executable.canonicalize().is_err()
            || !executable.is_file()
            || command.arguments.len() > MAX_ARGUMENTS
            || command.arguments.iter().any(|argument| {
                argument.chars().any(char::is_control) || argument.len() > MAX_ARGUMENT_LENGTH
            })
        {
            return Err(invalid_custom_command());
        }
    }
    Ok(())
}

pub(crate) fn canonical_child(
    root: &Path,
    relative: &str,
    directory: bool,
) -> Result<PathBuf, ProjectConfigError> {
    let relative = Path::new(relative);
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || !relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(invalid_configuration());
    }
    let mut candidate = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(component) = component else {
            return Err(invalid_configuration());
        };
        candidate.push(component);
        if fs::symlink_metadata(&candidate)
            .map_err(|_| invalid_configuration())?
            .file_type()
            .is_symlink()
        {
            return Err(invalid_configuration());
        }
    }
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|_| invalid_configuration())?;
    if !path.starts_with(root) || (directory && !path.is_dir()) || (!directory && !path.is_file()) {
        return Err(invalid_configuration());
    }
    Ok(path)
}

pub(crate) fn uses_shell_escape(arguments: &[String]) -> bool {
    arguments.iter().any(|argument| {
        argument == "--shell-escape"
            || argument == "-shell-escape"
            || argument.starts_with("--shell-escape=")
    })
}

fn read_configuration(path: &Path) -> Result<ProjectBuildConfiguration, ProjectConfigError> {
    match bounded_io::read(path, MAX_CONFIGURATION_BYTES) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| ProjectConfigError {
            code: "invalid-project-configuration",
            message: "The saved build configuration is invalid. TeX did not run it.",
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Ok(ProjectBuildConfiguration::default())
        }
        Err(_) => Err(unavailable()),
    }
}

fn configuration_path(app: &AppHandle, root: &Path) -> Result<PathBuf, ProjectConfigError> {
    let mut digest = Sha256::new();
    digest.update(root.as_os_str().as_encoded_bytes());
    let key = format!("{:x}", digest.finalize());
    app.path()
        .app_data_dir()
        .map(|directory| {
            directory
                .join("project-build-configurations")
                .join(format!("{key}.json"))
        })
        .map_err(|_| unavailable())
}

fn invalid_configuration() -> ProjectConfigError {
    ProjectConfigError {
        code: "invalid-project-configuration",
        message: "Build settings must reference existing paths inside this project.",
    }
}

fn invalid_custom_command() -> ProjectConfigError {
    ProjectConfigError {
        code: "invalid-custom-command",
        message:
            "Custom commands require an existing absolute executable and separate argument values.",
    }
}

fn unavailable() -> ProjectConfigError {
    ProjectConfigError {
        code: "project-configuration-unavailable",
        message: "TeX could not access build settings. Project source was not changed.",
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        uses_shell_escape, validate_configuration, CustomCommand, ProjectBuildConfiguration,
    };

    fn fixture_root() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/root-detection")
    }

    #[test]
    fn rejects_paths_outside_the_project() {
        let configuration = ProjectBuildConfiguration {
            output_directory: Some("../".to_owned()),
            ..ProjectBuildConfiguration::default()
        };
        assert!(validate_configuration(&fixture_root(), &configuration).is_err());
    }

    #[test]
    fn requires_separate_shell_escape_consent() {
        let configuration = ProjectBuildConfiguration {
            custom_command: Some(CustomCommand {
                executable: std::env::current_exe().map_or_else(
                    |_| String::new(),
                    |path| path.to_string_lossy().into_owned(),
                ),
                arguments: vec!["--shell-escape".to_owned()],
            }),
            custom_command_consent: true,
            ..ProjectBuildConfiguration::default()
        };
        assert!(validate_configuration(&fixture_root(), &configuration).is_err());
        assert!(uses_shell_escape(&["--shell-escape".to_owned()]));
    }
}
