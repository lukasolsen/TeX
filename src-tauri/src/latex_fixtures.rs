use std::{
    fs, io,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

struct BuildCase {
    project: &'static str,
    root: &'static str,
    should_succeed: bool,
}

const BUILD_CASES: &[BuildCase] = &[
    BuildCase {
        project: "simple-article",
        root: "main.tex",
        should_succeed: true,
    },
    BuildCase {
        project: "nasa-technical-report",
        root: "main.tex",
        should_succeed: true,
    },
    BuildCase {
        project: "multiple-roots",
        root: "paper/main.tex",
        should_succeed: true,
    },
    BuildCase {
        project: "multiple-roots",
        root: "presentation/slides.tex",
        should_succeed: true,
    },
    BuildCase {
        project: "unicode-project",
        root: "Måneanalyse/hoveddokument.tex",
        should_succeed: true,
    },
    BuildCase {
        project: "broken-build",
        root: "main.tex",
        should_succeed: false,
    },
];

fn fixtures_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/latex-projects")
}

fn temporary_output_directory() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let directory = std::env::temp_dir().join(format!("tex-latex-fixtures-{unique}"));
    fs::create_dir(&directory)?;
    Ok(directory)
}

fn latexmk_is_available() -> Result<bool, io::Error> {
    match Command::new("latexmk")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
    {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

#[test]
fn fixture_builds_have_the_documented_outcomes() -> Result<(), Box<dyn std::error::Error>> {
    if !latexmk_is_available()? {
        eprintln!("latexmk is unavailable; skipping fixture compilation checks");
        return Ok(());
    }

    let fixtures = fixtures_root();
    let output = temporary_output_directory()?;
    let mut mismatch = None;

    for (index, case) in BUILD_CASES.iter().enumerate() {
        let root = fixtures.join(case.project).join(case.root);
        let working_directory = root.parent().ok_or("fixture root has no parent")?;
        let case_output = output.join(index.to_string());
        fs::create_dir(&case_output)?;
        let status = Command::new("latexmk")
            .args(["-pdf", "-halt-on-error", "-interaction=nonstopmode"])
            .arg(format!("-outdir={}", case_output.display()))
            .arg(root.file_name().ok_or("fixture root has no file name")?)
            .current_dir(working_directory)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;

        if status.success() != case.should_succeed {
            mismatch = Some(format!(
                "{} had an unexpected latexmk outcome (expected success: {})",
                root.display(),
                case.should_succeed
            ));
            break;
        }
    }

    fs::remove_dir_all(output)?;
    if let Some(message) = mismatch {
        return Err(message.into());
    }
    Ok(())
}
