use std::{
    collections::HashSet,
    fs, io,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::{bounded_io, project_access::ProjectAccess, source_edit::atomic_write};

const CONFIG_VERSION: u8 = 2;
/// Version 1 stored `bibliographyTool`, which named a tool it could not select.
/// Configurations written by that version still load; `BibliographyMode` maps
/// their values onto the setting that replaced it.
const MIN_CONFIG_VERSION: u8 = 1;
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

/// Whether the bibliography runs — not which tool runs it.
///
/// `latexmk` chooses biber or bibtex from the presence of a `.bcf`, and that
/// choice is correct. A setting that claimed to select the tool could not
/// honour the claim, so this one controls what it can actually control and the
/// run reports which tool ran.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BibliographyMode {
    #[default]
    Automatic,
    Always,
    Never,
}

impl BibliographyMode {
    /// Total: every stored value resolves, including the version 1 tool names.
    /// An unrecognised value is not a configuration error — it means TeX cannot
    /// honour a preference, and refusing to load the whole project's build
    /// settings over that would be a worse answer than falling back.
    fn from_stored(value: &str) -> Self {
        match value {
            "always" | "biber" | "bibtex" => Self::Always,
            "never" | "none" => Self::Never,
            _ => Self::Automatic,
        }
    }
}

impl<'de> Deserialize<'de> for BibliographyMode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Ok(Self::from_stored(&String::deserialize(deserializer)?))
    }
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
    #[serde(alias = "bibliographyTool", default)]
    pub bibliography: BibliographyMode,
    pub generated_directories: Vec<String>,
    pub environment: Vec<EnvironmentSetting>,
    pub custom_command: Option<CustomCommand>,
    #[serde(default)]
    pub custom_command_consent: bool,
    #[serde(default)]
    pub shell_escape_consent: bool,
    /// Shell escape on the standard engine invocation. Reaching it through a
    /// custom command instead costs SyncTeX, `-file-line-error`, the output
    /// directory, and the argument-injection guard — every safety rail the
    /// product has — so packages like `minted` get a first-class switch.
    #[serde(default)]
    pub shell_escape: bool,
}

impl Default for ProjectBuildConfiguration {
    fn default() -> Self {
        Self {
            schema_version: CONFIG_VERSION,
            root_file: None,
            output_directory: None,
            bibliography: BibliographyMode::Automatic,
            generated_directories: Vec::new(),
            environment: Vec::new(),
            custom_command: None,
            custom_command_consent: false,
            shell_escape_consent: false,
            shell_escape: false,
        }
    }
}

/// The message is owned so it can name the field that failed. One shared
/// sentence for the root file, the output directory, the generated directories,
/// and the environment values leaves the reader guessing which control to fix.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigError {
    pub code: &'static str,
    pub message: String,
}

impl ProjectConfigError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
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
    if candidate.shell_escape && !(current.shell_escape && current.shell_escape_consent) {
        let approved = app
            .dialog()
            .message(
                "Allow shell escape for this project?\n\nLaTeX source may run additional programs with your user permissions. Packages such as minted need this; most documents do not.",
            )
            .title("Allow LaTeX shell escape")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Allow shell escape".to_owned(),
                "Cancel".to_owned(),
            ))
            .blocking_show();
        if !approved {
            return Err(ProjectConfigError::new(
                "shell-escape-consent-required",
                "Shell escape was not enabled because permission was not granted.",
            ));
        }
    }
    let Some(command) = candidate.custom_command.as_ref() else {
        candidate.custom_command_consent = false;
        candidate.shell_escape_consent = candidate.shell_escape;
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
            return Err(ProjectConfigError::new(
                "custom-command-consent-required",
                "The custom command was not saved because permission was not granted.",
            ));
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
                return Err(ProjectConfigError::new(
                    "shell-escape-consent-required",
                    "Shell escape was not saved because separate permission was not granted.",
                ));
            }
        }
        candidate.shell_escape_consent = true;
    } else {
        candidate.shell_escape_consent = candidate.shell_escape;
    }
    Ok(())
}

pub(crate) fn validate_configuration(
    root: &Path,
    configuration: &ProjectBuildConfiguration,
) -> Result<(), ProjectConfigError> {
    validate_configuration_structure(root, configuration)?;
    if configuration.shell_escape && !configuration.shell_escape_consent {
        return Err(ProjectConfigError::new(
            "shell-escape-consent-required",
            "Shell escape can run project-supplied programs. Grant separate consent before enabling it.",
        ));
    }
    if let Some(command) = &configuration.custom_command {
        if !configuration.custom_command_consent {
            return Err(ProjectConfigError::new(
                "custom-command-consent-required",
                "Review and consent to the exact custom command before saving it.",
            ));
        }
        if uses_shell_escape(&command.arguments) && !configuration.shell_escape_consent {
            return Err(ProjectConfigError::new(
                "shell-escape-consent-required",
                "Shell escape can run project-supplied programs. Grant separate consent before enabling it.",
            ));
        }
    }
    Ok(())
}

fn validate_configuration_structure(
    root: &Path,
    configuration: &ProjectBuildConfiguration,
) -> Result<(), ProjectConfigError> {
    if !(MIN_CONFIG_VERSION..=CONFIG_VERSION).contains(&configuration.schema_version)
        || configuration.generated_directories.len() > MAX_GENERATED_DIRECTORIES
        || configuration.environment.len() > ALLOWED_ENVIRONMENT_KEYS.len()
    {
        return Err(invalid_configuration());
    }
    if let Some(root_file) = configuration.root_file.as_deref() {
        let path = canonical_child(root, root_file, false)
            .map_err(|_| missing_path("Root file", root_file))?;
        if path.extension().and_then(|value| value.to_str()) != Some("tex") {
            return Err(ProjectConfigError::new(
                "invalid-project-configuration",
                format!("Root file: {root_file} is not a .tex file."),
            ));
        }
    }
    if let Some(output) = configuration.output_directory.as_deref() {
        // Created rather than rejected. Requiring the user to make a folder in
        // their file manager before a text field will validate is not a safety
        // property; the containment check that follows is.
        create_output_directory(root, output)?;
        canonical_child(root, output, true)
            .map_err(|_| missing_path("Output directory", output))?;
    }
    for directory in &configuration.generated_directories {
        canonical_child(root, directory, true)
            .map_err(|_| missing_path("Generated directories", directory))?;
    }
    let mut seen_environment_keys = HashSet::new();
    for setting in &configuration.environment {
        let name = setting.name.as_str();
        if !ALLOWED_ENVIRONMENT_KEYS.contains(&name) {
            return Err(ProjectConfigError::new(
                "invalid-project-configuration",
                format!(
                    "TeX environment overrides: {name} is not one of {}.",
                    ALLOWED_ENVIRONMENT_KEYS.join(", ")
                ),
            ));
        }
        // Reject duplicate keys so the effective value is unambiguous.
        if !seen_environment_keys.insert(name) {
            return Err(ProjectConfigError::new(
                "invalid-project-configuration",
                format!("TeX environment overrides: {name} is set more than once."),
            ));
        }
        if setting.value.chars().any(char::is_control) || setting.value.len() > MAX_ARGUMENT_LENGTH
        {
            return Err(ProjectConfigError::new(
                "invalid-project-configuration",
                format!("TeX environment overrides: the value of {name} is not usable."),
            ));
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

/// Creates a configured output directory inside the project.
///
/// Each segment is checked as it is made, so the walk never follows a symlink
/// out of the project and never creates one. An existing directory is left
/// alone; anything else here is reported by the containment check that follows.
fn create_output_directory(root: &Path, relative: &str) -> Result<(), ProjectConfigError> {
    let relative = Path::new(relative);
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || !relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(missing_path(
            "Output directory",
            &relative.to_string_lossy(),
        ));
    }
    let mut candidate = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(component) = component else {
            return Err(missing_path(
                "Output directory",
                &relative.to_string_lossy(),
            ));
        };
        candidate.push(component);
        match fs::symlink_metadata(&candidate) {
            Ok(metadata) if metadata.is_dir() => {}
            // A symlink or a file where a directory belongs is refused here and
            // reported by the containment check.
            Ok(_) => return Ok(()),
            Err(_) => {
                if fs::create_dir(&candidate).is_err() {
                    return Err(ProjectConfigError::new(
                        "invalid-project-configuration",
                        format!(
                            "Output directory: TeX could not create {} inside this project.",
                            relative.to_string_lossy()
                        ),
                    ));
                }
            }
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
        Ok(bytes) => serde_json::from_slice::<ProjectBuildConfiguration>(&bytes)
            .map(|mut configuration| {
                // An accepted older configuration is reported at the current
                // version, so the frontend never round-trips a stale one back.
                configuration.schema_version = CONFIG_VERSION;
                configuration
            })
            .map_err(|_| {
                ProjectConfigError::new(
                    "invalid-project-configuration",
                    "The saved build configuration is invalid. TeX did not run it.",
                )
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
    ProjectConfigError::new(
        "invalid-project-configuration",
        "Build settings must reference existing paths inside this project.",
    )
}

/// Names the field and the value, so the reader knows which control to fix.
fn missing_path(field: &str, value: &str) -> ProjectConfigError {
    ProjectConfigError::new(
        "invalid-project-configuration",
        format!("{field}: {value} is not an existing path inside this project."),
    )
}

fn invalid_custom_command() -> ProjectConfigError {
    ProjectConfigError::new(
        "invalid-custom-command",
        "Custom commands require an existing absolute executable and separate argument values.",
    )
}

fn unavailable() -> ProjectConfigError {
    ProjectConfigError::new(
        "project-configuration-unavailable",
        "TeX could not access build settings. Project source was not changed.",
    )
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
