use std::{path::Path, process::Command, time::Duration};

use serde::Serialize;
use tauri::State;

use crate::{
    build_system::resolve_executable, pdf_read::resolve_pdf, process_support::run_bounded,
    project_access::ProjectAccess, source_read::resolve_latex_source_path,
};

const SYNCTEX_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SYNCTEX_OUTPUT_BYTES: usize = 512 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardSearchResult {
    pub page: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InverseSearchResult {
    pub path: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTexError {
    pub code: &'static str,
    pub message: &'static str,
}

#[tauri::command]
pub fn synctex_forward_search(
    project_path: String,
    pdf_path: String,
    source_path: String,
    line: u32,
    column: u32,
    access: State<'_, ProjectAccess>,
) -> Result<ForwardSearchResult, SyncTexError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let pdf = resolve_pdf(&root, Path::new(&pdf_path)).map_err(|_| stale())?;
    let source = resolve_latex_source_path(&root, Path::new(&source_path)).map_err(|_| stale())?;
    let input = format!("{}:{}:{}", line.max(1), column.max(1), source.display());
    let executable = resolve_executable("synctex").ok_or_else(unavailable)?;
    let output = run_bounded(
        Command::new(executable)
            .current_dir(&root)
            .args(["view", "-i", &input, "-o"])
            .arg(pdf),
        SYNCTEX_TIMEOUT,
        MAX_SYNCTEX_OUTPUT_BYTES,
    )
    .map_err(|_| unavailable())?;
    if !output.status.success() {
        return Err(stale());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let result = ForwardSearchResult {
        page: parsed::<u32>(&text, "Page:")?,
        x: parsed::<f64>(&text, "x:")?,
        y: parsed::<f64>(&text, "y:")?,
    };
    if result.page == 0
        || !result.x.is_finite()
        || !result.y.is_finite()
        || result.x < 0.0
        || result.y < 0.0
    {
        return Err(stale());
    }
    Ok(result)
}

#[tauri::command]
pub fn synctex_inverse_search(
    project_path: String,
    pdf_path: String,
    page: u32,
    x: f64,
    y: f64,
    access: State<'_, ProjectAccess>,
) -> Result<InverseSearchResult, SyncTexError> {
    if !x.is_finite() || !y.is_finite() || x < 0.0 || y < 0.0 {
        return Err(stale());
    }
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let pdf = resolve_pdf(&root, Path::new(&pdf_path)).map_err(|_| stale())?;
    let output_spec = format!("{}:{x}:{y}:{}", page.max(1), pdf.display());
    let executable = resolve_executable("synctex").ok_or_else(unavailable)?;
    let output = run_bounded(
        Command::new(executable)
            .current_dir(&root)
            .args(["edit", "-o", &output_spec]),
        SYNCTEX_TIMEOUT,
        MAX_SYNCTEX_OUTPUT_BYTES,
    )
    .map_err(|_| unavailable())?;
    if !output.status.success() {
        return Err(stale());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let input = value(&text, "Input:").ok_or_else(stale)?;
    let source = Path::new(input).canonicalize().map_err(|_| stale())?;
    if !source.starts_with(&root)
        || !source.is_file()
        || source.extension().and_then(|value| value.to_str()) != Some("tex")
    {
        return Err(stale());
    }
    let path = source.strip_prefix(&root).map_err(|_| stale())?;
    Ok(InverseSearchResult {
        path: path.to_string_lossy().into_owned(),
        line: parsed::<u32>(&text, "Line:")?.max(1),
        column: value(&text, "Column:")
            .and_then(|value| value.parse::<i32>().ok())
            .map_or(1, |value| if value >= 0 { value as u32 + 1 } else { 1 }),
    })
}

fn value<'a>(output: &'a str, prefix: &str) -> Option<&'a str> {
    output
        .lines()
        .find_map(|line| line.strip_prefix(prefix).map(str::trim))
}

fn parsed<T: std::str::FromStr>(output: &str, prefix: &str) -> Result<T, SyncTexError> {
    value(output, prefix)
        .and_then(|value| value.parse().ok())
        .ok_or_else(stale)
}

fn stale() -> SyncTexError {
    SyncTexError {
        code: "synctex-unavailable",
        message: "Synchronization data is unavailable or stale. Build the PDF with SyncTeX enabled and try again.",
    }
}

fn unavailable() -> SyncTexError {
    SyncTexError {
        code: "synctex-tool-unavailable",
        message: "The SyncTeX command-line tool is unavailable in the current TeX installation.",
    }
}

#[cfg(test)]
mod tests {
    use super::{parsed, value};

    const OUTPUT: &str = "SyncTeX result begin\nPage:6\nx:143.8\ny:287.9\nSyncTeX result end";

    #[test]
    fn parses_the_first_synctex_record() -> Result<(), Box<dyn std::error::Error>> {
        assert_eq!(parsed::<u32>(OUTPUT, "Page:").map_err(|_| "page")?, 6);
        assert_eq!(value(OUTPUT, "x:"), Some("143.8"));
        Ok(())
    }
}
