//! What TeX can find on this computer, and how to get what is missing.
//!
//! A missing tool has to explain itself. `synctex` is a hard dependency of
//! two-way navigation that was never reported, so a distribution without it
//! failed with a generic "unavailable" and no way to learn why. Everything the
//! build path depends on is listed here, with the consequence of its absence.

use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::{
    build_system::resolve_executable,
    process_support::{run_bounded, BoundedOutput},
};

/// Version probes answer immediately; a package search reaches the network.
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);
const SEARCH_TIMEOUT: Duration = Duration::from_secs(60);
const INSTALL_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_TOOL_OUTPUT: usize = 256 * 1024;

/// One tool the build path can use, and what stops working without it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolReport {
    name: &'static str,
    purpose: &'static str,
    /// What TeX cannot do while this is missing. Never shown when available.
    absence: &'static str,
    available: bool,
    /// Where it was found, so a machine with several distributions is legible.
    path: Option<String>,
}

/// Which TeX distribution answered, so a machine with more than one installed
/// is legible — to the user, and to whoever reads their bug report.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionReport {
    label: String,
    directory: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildToolReport {
    tools: Vec<ToolReport>,
    distribution: Option<DistributionReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolError {
    code: &'static str,
    message: String,
}

impl ToolError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// The package that provides a file the build could not find, and the exact
/// command that would install it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageCandidate {
    file: String,
    package: String,
    command: String,
}

const TOOLS: [(&str, &str, &str); 10] = [
    (
        "latexmk",
        "Runs the engine and the bibliography tools until references resolve.",
        "Only the single-pass profile can build, and it resolves no references.",
    ),
    (
        "pdflatex",
        "The default TeX engine.",
        "No profile can build this project.",
    ),
    (
        "biber",
        "Processes biblatex bibliographies.",
        "Citations in a biblatex document cannot resolve.",
    ),
    (
        "bibtex",
        "Processes traditional BibTeX bibliographies.",
        "Citations in a BibTeX document cannot resolve.",
    ),
    (
        "makeindex",
        "Builds the index.",
        "A document with \\makeindex produces no index.",
    ),
    (
        "makeglossaries",
        "Builds the glossary.",
        "A document with a glossary produces none.",
    ),
    (
        "synctex",
        "Matches a place in the PDF to the source that produced it.",
        "Two-way navigation between the editor and the PDF is unavailable.",
    ),
    (
        "kpsewhich",
        "Locates the files a document asks for.",
        "TeX cannot say which package provides a file it could not find.",
    ),
    (
        "tlmgr",
        "Installs packages from the distribution.",
        "A missing package has to be installed outside TeX.",
    ),
    (
        "texcount",
        "Counts words in the source.",
        "Word count is unavailable.",
    ),
];

/// Reports what is installed without running a build or touching the project.
#[tauri::command]
pub fn get_build_tools() -> BuildToolReport {
    let tools = TOOLS
        .iter()
        .map(|(name, purpose, absence)| {
            let path = resolve_executable(name);
            ToolReport {
                name,
                purpose,
                absence,
                available: path.is_some(),
                path: path.map(|value| value.to_string_lossy().into_owned()),
            }
        })
        .collect();
    BuildToolReport {
        tools,
        distribution: detect_distribution(),
    }
}

/// Reads the distribution's own name out of the engine it ships.
///
/// `pdftex --version` opens with a line like
/// `pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026)`. The parenthesized part is
/// what a person recognises, and the directory disambiguates two installs of
/// the same year.
fn detect_distribution() -> Option<DistributionReport> {
    let executable = resolve_executable("pdftex")?;
    let mut command = Command::new(&executable);
    command.arg("--version");
    let output = run_bounded(&mut command, VERSION_TIMEOUT, MAX_TOOL_OUTPUT).ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let label = distribution_label(&text)?;
    Some(DistributionReport {
        label,
        directory: executable
            .parent()
            .map_or_else(String::new, |parent| parent.to_string_lossy().into_owned()),
    })
}

/// The parenthesized distribution name on an engine's first version line.
pub fn distribution_label(version_output: &str) -> Option<String> {
    let first = version_output.lines().next()?;
    let open = first.rfind('(')?;
    let close = first[open..].find(')')? + open;
    let label = first.get(open + 1..close)?.trim();
    (!label.is_empty()).then(|| label.to_owned())
}

/// Asks the distribution which package provides a file a build could not find.
///
/// This reaches the package repository, so it is slow and deliberately not run
/// as part of a build: it happens only when someone asks about one diagnostic.
#[tauri::command]
pub fn resolve_missing_package(file: String) -> Result<Option<PackageCandidate>, ToolError> {
    if !is_plain_file_name(&file) {
        return Err(ToolError::new(
            "invalid-package-file",
            "That file name cannot be looked up.",
        ));
    }
    let Some(tlmgr) = resolve_executable("tlmgr") else {
        return Err(ToolError::new(
            "package-manager-unavailable",
            "tlmgr is not installed, so TeX cannot say which package provides this file.",
        ));
    };
    let mut command = Command::new(&tlmgr);
    // The leading `/` anchors the match to a whole file name, so `array.sty`
    // does not also match `subarray.sty`.
    command
        .args(["search", "--global", "--file"])
        .arg(format!("/{file}"))
        .stdin(Stdio::null());
    let output = run_bounded(&mut command, SEARCH_TIMEOUT, MAX_TOOL_OUTPUT).map_err(|_| {
        ToolError::new(
            "package-search-failed",
            "TeX could not reach the package repository to look this up.",
        )
    })?;
    Ok(
        package_from_search(&String::from_utf8_lossy(&output.stdout), &file).map(|package| {
            PackageCandidate {
                command: format!("tlmgr install {package}"),
                package,
                file,
            }
        }),
    )
}

/// Reads the package name out of `tlmgr search --global --file` output.
///
/// A match is a line at column zero ending in `:`, followed by indented paths.
/// The first whose indented path actually ends in the file wins, so a package
/// that merely mentions the name in prose is not offered.
pub fn package_from_search(output: &str, file: &str) -> Option<String> {
    let suffix = format!("/{file}");
    let mut current: Option<&str> = None;
    for line in output.lines() {
        if line.starts_with(char::is_whitespace) {
            if line.trim_end().ends_with(&suffix) {
                if let Some(package) = current {
                    return Some(package.to_owned());
                }
            }
            continue;
        }
        current = line
            .strip_suffix(':')
            .filter(|name| !name.is_empty() && !name.contains(char::is_whitespace));
    }
    None
}

/// Rejects anything that is not a bare file name, so nothing reaches `tlmgr`
/// that could be read as a path or an option.
fn is_plain_file_name(file: &str) -> bool {
    !file.is_empty()
        && file.len() <= 128
        && !file.starts_with('-')
        && file
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-+".contains(character))
}

/// Installs one package, after the user approves the exact command in a native
/// dialog the webview cannot forge.
#[tauri::command]
pub fn install_latex_package(app: AppHandle, package: String) -> Result<Vec<String>, ToolError> {
    if !is_plain_file_name(&package) {
        return Err(ToolError::new(
            "invalid-package-name",
            "That package name cannot be installed.",
        ));
    }
    let tlmgr = resolve_executable("tlmgr").ok_or_else(|| {
        ToolError::new(
            "package-manager-unavailable",
            "tlmgr is not installed, so TeX cannot add packages.",
        )
    })?;
    let approved = app
        .dialog()
        .message(format!(
            "Install the LaTeX package {package}?\n\nTeX will run:\ntlmgr install {package}\n\nThis downloads from your distribution's package repository and needs your administrator password."
        ))
        .title("Install LaTeX package")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            format!("Install {package}"),
            "Cancel".to_owned(),
        ))
        .blocking_show();
    if !approved {
        return Err(ToolError::new(
            "package-install-declined",
            format!("{package} was not installed."),
        ));
    }
    run_package_install(&app, &tlmgr, &package)
}

/// Runs the install under `sudo -A`, using a helper whose only action is to
/// show the operating system's own password prompt. Returns the tool's output
/// so a failure can be read rather than guessed at.
fn run_package_install(
    app: &AppHandle,
    tlmgr: &Path,
    package: &str,
) -> Result<Vec<String>, ToolError> {
    let Some(sudo) = resolve_executable("sudo") else {
        return Err(manual_install(package));
    };
    let Some(askpass) = package_askpass_helper(app) else {
        return Err(manual_install(package));
    };
    let mut command = Command::new(sudo);
    command
        .arg("-A")
        .arg(tlmgr)
        .args(["install", package])
        .env("SUDO_ASKPASS", &askpass)
        .stdin(Stdio::null());
    let output = run_bounded(&mut command, INSTALL_TIMEOUT, MAX_TOOL_OUTPUT)
        .map_err(|_| manual_install(package))?;
    finish_install(&output, package)
}

fn finish_install(output: &BoundedOutput, package: &str) -> Result<Vec<String>, ToolError> {
    let lines: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::to_owned)
        .collect();
    if output.status.success() {
        Ok(lines)
    } else {
        Err(ToolError::new(
            "package-install-failed",
            format!(
                "{package} was not installed. Run tlmgr install {package} in a terminal to see why."
            ),
        ))
    }
}

fn manual_install(package: &str) -> ToolError {
    ToolError::new(
        "package-install-unavailable",
        format!("TeX cannot elevate on this system. Run tlmgr install {package} in a terminal."),
    )
}

/// The script body is a compile-time constant; nothing is interpolated into
/// it. A package-specific message would mean interpolating into an AppleScript
/// string, so the wording stays general and the dialog that named the package
/// has already been shown.
#[cfg(target_os = "macos")]
fn package_askpass_helper(app: &AppHandle) -> Option<PathBuf> {
    use std::{
        fs,
        io::Write,
        os::unix::fs::{OpenOptionsExt, PermissionsExt},
    };

    use tauri::Manager;

    const HELPER: &str = concat!(
        "#!/bin/sh\n",
        "exec /usr/bin/osascript",
        " -e 'display dialog \"TeX needs your macOS administrator password to install a LaTeX package.\" with title \"Install LaTeX package\" default answer \"\" with hidden answer with icon caution'",
        " -e 'text returned of result'\n"
    );

    let directory = app.path().app_cache_dir().ok()?;
    fs::create_dir_all(&directory).ok()?;
    let path = directory.join("latex-package-askpass.sh");
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o700)
        .open(&path)
        .ok()?;
    file.write_all(HELPER.as_bytes()).ok()?;
    file.sync_all().ok()?;
    drop(file);
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).ok()?;
    Some(path)
}

#[cfg(not(target_os = "macos"))]
fn package_askpass_helper(_app: &AppHandle) -> Option<PathBuf> {
    None
}

#[cfg(test)]
mod tests {
    use super::{distribution_label, is_plain_file_name, package_from_search};

    /// Verbatim from `pdftex --version` on TeX Live.
    #[test]
    fn reads_the_distribution_out_of_an_engine_version() {
        let output = concat!(
            "pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026)\n",
            "kpathsea version 6.4.2\n"
        );

        assert_eq!(distribution_label(output).as_deref(), Some("TeX Live 2026"));
    }

    #[test]
    fn reports_no_distribution_for_output_without_one() {
        assert!(distribution_label("pdfTeX 3.14\n").is_none());
        assert!(distribution_label("").is_none());
    }

    /// Verbatim from `tlmgr search --global --file "/algorithm2e.sty"`.
    #[test]
    fn reads_the_package_that_provides_a_file() {
        let output = concat!(
            "tlmgr: package repository https://ctan.uib.no/systems/texlive/tlnet\n",
            "algorithm2e:\n",
            "\ttexmf-dist/tex/latex/algorithm2e/algorithm2e.sty\n"
        );

        assert_eq!(
            package_from_search(output, "algorithm2e.sty").as_deref(),
            Some("algorithm2e")
        );
    }

    /// A package whose listed file merely resembles the one asked for is not
    /// offered: installing the wrong package would not fix the build.
    #[test]
    fn refuses_a_near_miss() {
        let output = concat!(
            "subarray:\n",
            "\ttexmf-dist/tex/latex/subarray/subarray.sty\n"
        );

        assert!(package_from_search(output, "array.sty").is_none());
    }

    #[test]
    fn takes_the_first_of_several_providers() {
        let output = concat!(
            "first:\n",
            "\ttexmf-dist/tex/latex/first/shared.sty\n",
            "second:\n",
            "\ttexmf-dist/tex/latex/second/shared.sty\n"
        );

        assert_eq!(
            package_from_search(output, "shared.sty").as_deref(),
            Some("first")
        );
    }

    /// Nothing that could be read as a path or an option reaches `tlmgr`.
    #[test]
    fn accepts_only_bare_file_names() {
        assert!(is_plain_file_name("algorithm2e.sty"));
        assert!(is_plain_file_name("l3backend-pdftex.def"));
        assert!(!is_plain_file_name("../etc/passwd"));
        assert!(!is_plain_file_name("a/b.sty"));
        assert!(!is_plain_file_name("--version"));
        assert!(!is_plain_file_name(""));
        assert!(!is_plain_file_name("name with spaces.sty"));
    }
}
