use std::{
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::source_edit::atomic_write;

const CONFIG_VERSION: u8 = 1;
const MAX_ARGUMENTS: usize = 128;
const MAX_ARGUMENT_LENGTH: usize = 4096;
const MAX_GENERATED_DIRECTORIES: usize = 32;
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
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSetting {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomCommand {
    pub executable: String,
    pub arguments: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBuildConfiguration {
    pub schema_version: u8,
    pub root_file: Option<String>,
    pub output_directory: Option<String>,
    pub bibliography_tool: BibliographyTool,
    pub generated_directories: Vec<String>,
    pub environment: Vec<EnvironmentSetting>,
    pub custom_command: Option<CustomCommand>,
    pub custom_command_consent: bool,
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
) -> Result<ProjectBuildConfiguration, ProjectConfigError> {
    let root = canonical_project_root(Path::new(&project_path))?;
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
pub fn save_project_build_configuration(
    app: AppHandle,
    project_path: String,
    configuration: ProjectBuildConfiguration,
) -> Result<ProjectBuildConfiguration, ProjectConfigError> {
    let root = canonical_project_root(Path::new(&project_path))?;
    validate_configuration(&root, &configuration)?;
    let path = configuration_path(&app, &root)?;
    let encoded = serde_json::to_vec_pretty(&configuration).map_err(|_| unavailable())?;
    atomic_write(&path, &encoded).map_err(|_| unavailable())?;
    Ok(configuration)
}

pub(crate) fn validate_configuration(
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
            || setting.value.contains('\0')
            || setting.value.len() > MAX_ARGUMENT_LENGTH
        {
            return Err(invalid_configuration());
        }
    }
    if let Some(command) = &configuration.custom_command {
        let executable = Path::new(&command.executable);
        if !executable.is_absolute()
            || executable.canonicalize().is_err()
            || !executable.is_file()
            || command.arguments.len() > MAX_ARGUMENTS
            || command
                .arguments
                .iter()
                .any(|argument| argument.contains('\0') || argument.len() > MAX_ARGUMENT_LENGTH)
        {
            return Err(invalid_custom_command());
        }
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

pub(crate) fn canonical_child(
    root: &Path,
    relative: &str,
    directory: bool,
) -> Result<PathBuf, ProjectConfigError> {
    let relative = Path::new(relative);
    if relative.is_absolute() {
        return Err(invalid_configuration());
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
    match fs::read(path) {
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

fn canonical_project_root(path: &Path) -> Result<PathBuf, ProjectConfigError> {
    let root = path.canonicalize().map_err(|_| unavailable())?;
    if root.is_dir() {
        Ok(root)
    } else {
        Err(unavailable())
    }
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
