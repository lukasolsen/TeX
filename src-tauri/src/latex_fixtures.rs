use serde::Deserialize;
use std::{
    collections::HashSet,
    fs, io,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureManifest {
    schema_version: u32,
    fixtures: Vec<Fixture>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    id: String,
    kind: FixtureKind,
    path: PathBuf,
    roots: Vec<PathBuf>,
    expected_build: BuildExpectation,
    profile: Option<BuildProfile>,
    #[serde(default)]
    direct_engines: Vec<DirectEngine>,
    #[serde(default)]
    requires: Vec<String>,
    output_directory: Option<PathBuf>,
    search_query: Option<String>,
    artifact: Option<PathBuf>,
    event_script: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum FixtureKind {
    LatexProject,
    InvalidPdf,
    WatchStorm,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum BuildExpectation {
    Success,
    Failure,
    NotBuildable,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum BuildProfile {
    LatexmkPdf,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum DirectEngine {
    #[serde(rename = "pdfLaTex")]
    Pdf,
    #[serde(rename = "xeLaTex")]
    Xe,
    #[serde(rename = "luaLaTex")]
    Lua,
}

impl DirectEngine {
    const fn command(self) -> &'static str {
        match self {
            Self::Pdf => "pdflatex",
            Self::Xe => "xelatex",
            Self::Lua => "lualatex",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WatchStormScript {
    schema_version: u32,
    debounce_window_ms: u64,
    events: Vec<WatchEvent>,
    expected_build_requests: Vec<u64>,
    ignored_path_prefixes: Vec<PathBuf>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WatchEvent {
    at_ms: u64,
    kind: WatchEventKind,
    path: PathBuf,
    to: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum WatchEventKind {
    Create,
    Modify,
    Remove,
    Rename,
}

fn fixtures_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures")
}

fn read_manifest() -> Result<FixtureManifest, Box<dyn std::error::Error>> {
    let manifest = fs::read_to_string(fixtures_root().join("manifest.json"))?;
    Ok(serde_json::from_str(&manifest)?)
}

fn temporary_output_directory() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let directory = std::env::temp_dir().join(format!("tex-latex-fixtures-{unique}"));
    fs::create_dir(&directory)?;
    Ok(directory)
}

fn command_is_available(command: &str) -> Result<bool, io::Error> {
    match Command::new(command)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
    {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn is_safe_relative_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn validate_optional_path(
    fixture_root: &Path,
    path: Option<&Path>,
    field: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(path) = path {
        if !is_safe_relative_path(path) {
            return Err(format!("{field} must be a non-empty safe relative path").into());
        }
        if !fixture_root.join(path).exists() {
            return Err(format!("{field} does not exist: {}", path.display()).into());
        }
    }
    Ok(())
}

fn validate_watch_storm_script(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let script: WatchStormScript = serde_json::from_str(&fs::read_to_string(path)?)?;
    if script.schema_version != 1
        || script.debounce_window_ms == 0
        || script.events.is_empty()
        || script.expected_build_requests.is_empty()
        || script.ignored_path_prefixes.is_empty()
    {
        return Err("watch-storm script has an incomplete contract".into());
    }

    let mut previous_time = None;
    for event in &script.events {
        if previous_time.is_some_and(|time| event.at_ms < time)
            || !is_safe_relative_path(&event.path)
            || event
                .to
                .as_deref()
                .is_some_and(|path| !is_safe_relative_path(path))
            || (event.kind == WatchEventKind::Rename) != event.to.is_some()
        {
            return Err("watch-storm events are unordered or invalid".into());
        }
        previous_time = Some(event.at_ms);
    }

    if script
        .expected_build_requests
        .windows(2)
        .any(|times| times[0] >= times[1])
        || script
            .ignored_path_prefixes
            .iter()
            .any(|path| !is_safe_relative_path(path))
    {
        return Err("watch-storm expectations are unordered or invalid".into());
    }
    Ok(())
}

#[test]
fn fixture_manifest_has_valid_paths_and_contracts() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = read_manifest()?;
    if manifest.schema_version != 1 {
        return Err("unsupported fixture manifest schema".into());
    }

    let root = fixtures_root();
    let mut ids = HashSet::new();
    for fixture in &manifest.fixtures {
        if fixture.id.trim().is_empty() || !ids.insert(&fixture.id) {
            return Err(format!("fixture id is empty or duplicated: {}", fixture.id).into());
        }
        if !is_safe_relative_path(&fixture.path) {
            return Err(format!("fixture path is unsafe: {}", fixture.path.display()).into());
        }

        let fixture_root = root.join(&fixture.path);
        if !fixture_root.is_dir() {
            return Err(format!("fixture directory is missing: {}", fixture.path.display()).into());
        }

        for root_path in &fixture.roots {
            if !is_safe_relative_path(root_path) || !fixture_root.join(root_path).is_file() {
                return Err(format!(
                    "fixture root is missing or unsafe: {}/{}",
                    fixture.path.display(),
                    root_path.display()
                )
                .into());
            }
        }

        if fixture.expected_build == BuildExpectation::NotBuildable && fixture.profile.is_some() {
            return Err(format!("non-buildable fixture {} declares a profile", fixture.id).into());
        }
        if !fixture.direct_engines.is_empty()
            && (fixture.kind != FixtureKind::LatexProject
                || fixture.expected_build != BuildExpectation::Success
                || fixture.roots.len() != 1)
        {
            return Err(format!(
                "direct-engine fixture {} must have one successful LaTeX root",
                fixture.id
            )
            .into());
        }
        if fixture.expected_build != BuildExpectation::NotBuildable
            && (fixture.kind != FixtureKind::LatexProject
                || fixture.roots.is_empty()
                || fixture.profile.is_none())
        {
            return Err(format!(
                "buildable fixture {} has an incomplete contract",
                fixture.id
            )
            .into());
        }
        if fixture.kind == FixtureKind::InvalidPdf && fixture.artifact.is_none() {
            return Err(format!("invalid PDF fixture {} has no artifact", fixture.id).into());
        }
        if fixture.kind == FixtureKind::WatchStorm && fixture.event_script.is_none() {
            return Err(format!("watch-storm fixture {} has no event script", fixture.id).into());
        }
        if fixture
            .search_query
            .as_ref()
            .is_some_and(|query| query.trim().is_empty())
        {
            return Err(format!("fixture {} has an empty search query", fixture.id).into());
        }
        for command in &fixture.requires {
            if command.trim().is_empty() || command.contains(['/', '\\']) {
                return Err(
                    format!("fixture {} has an invalid command requirement", fixture.id).into(),
                );
            }
        }

        validate_optional_path(
            &fixture_root,
            fixture.output_directory.as_deref(),
            "outputDirectory",
        )?;
        if let Some(event_script) = fixture.event_script.as_deref() {
            validate_watch_storm_script(&fixture_root.join(event_script))?;
        }
        validate_optional_path(&fixture_root, fixture.artifact.as_deref(), "artifact")?;
        validate_optional_path(
            &fixture_root,
            fixture.event_script.as_deref(),
            "eventScript",
        )?;
    }

    Ok(())
}

#[test]
fn direct_engine_profiles_build_the_documented_fixture() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = read_manifest()?;
    let fixtures = fixtures_root();
    let output = temporary_output_directory()?;
    let build_result = (|| -> Result<(), Box<dyn std::error::Error>> {
        for fixture in &manifest.fixtures {
            for engine in &fixture.direct_engines {
                let command = engine.command();
                if !command_is_available(command)? {
                    eprintln!("{command} is unavailable; skipping direct-engine fixture");
                    continue;
                }

                let root_path = fixture
                    .roots
                    .first()
                    .ok_or("direct-engine fixture has no root")?;
                let root = fixtures.join(&fixture.path).join(root_path);
                let working_directory = root.parent().ok_or("fixture root has no parent")?;
                let engine_output = output.join(command);
                fs::create_dir(&engine_output)?;
                let status = Command::new(command)
                    .args(["-halt-on-error", "-interaction=nonstopmode"])
                    .arg(format!("-output-directory={}", engine_output.display()))
                    .arg(root.file_name().ok_or("fixture root has no file name")?)
                    .current_dir(working_directory)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()?;
                if !status.success() {
                    return Err(format!("{command} did not build fixture {}", fixture.id).into());
                }
            }
        }
        Ok(())
    })();

    let cleanup_result = fs::remove_dir_all(output);
    build_result?;
    cleanup_result?;
    Ok(())
}

#[test]
fn fixture_builds_have_the_documented_outcomes() -> Result<(), Box<dyn std::error::Error>> {
    if !command_is_available("latexmk")? {
        eprintln!("latexmk is unavailable; skipping fixture compilation checks");
        return Ok(());
    }

    let manifest = read_manifest()?;
    let fixtures = fixtures_root();
    let output = temporary_output_directory()?;
    let build_result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let mut case_index = 0_u32;
        for fixture in manifest
            .fixtures
            .iter()
            .filter(|fixture| fixture.expected_build != BuildExpectation::NotBuildable)
        {
            let mut missing_requirement = None;
            for requirement in &fixture.requires {
                if !command_is_available(requirement)? {
                    missing_requirement = Some(requirement);
                    break;
                }
            }
            if let Some(requirement) = missing_requirement {
                eprintln!(
                    "{requirement} is unavailable; skipping fixture {}",
                    fixture.id
                );
                continue;
            }

            for root_path in &fixture.roots {
                let root = fixtures.join(&fixture.path).join(root_path);
                let working_directory = root.parent().ok_or("fixture root has no parent")?;
                let case_output = output.join(case_index.to_string());
                case_index += 1;
                fs::create_dir(&case_output)?;

                let status = Command::new("latexmk")
                    .args(["-pdf", "-halt-on-error", "-interaction=nonstopmode"])
                    .arg(format!("-outdir={}", case_output.display()))
                    .arg(root.file_name().ok_or("fixture root has no file name")?)
                    .current_dir(working_directory)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()?;
                let should_succeed = fixture.expected_build == BuildExpectation::Success;
                if status.success() != should_succeed {
                    return Err(format!(
                        "{}/{} had an unexpected latexmk outcome (expected success: {should_succeed})",
                        fixture.path.display(),
                        root_path.display()
                    )
                    .into());
                }
            }
        }
        Ok(())
    })();

    let cleanup_result = fs::remove_dir_all(output);
    build_result?;
    cleanup_result?;
    Ok(())
}
