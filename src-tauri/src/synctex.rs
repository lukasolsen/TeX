use std::{path::Path, process::Command};

use serde::Serialize;
use tauri::State;

use crate::project_access::ProjectAccess;

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
    let pdf = project_file(&root, &pdf_path, "pdf")?;
    let source = project_file(&root, &source_path, "tex")?;
    let input = format!("{}:{}:{}", line.max(1), column.max(1), source.display());
    let output = Command::new("synctex")
        .current_dir(&root)
        .args(["view", "-i", &input, "-o"])
        .arg(pdf)
        .output()
        .map_err(|_| unavailable())?;
    if !output.status.success() {
        return Err(stale());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(ForwardSearchResult {
        page: parsed::<u32>(&text, "Page:")?,
        x: parsed::<f64>(&text, "x:")?,
        y: parsed::<f64>(&text, "y:")?,
    })
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
    let pdf = project_file(&root, &pdf_path, "pdf")?;
    let output_spec = format!("{}:{x}:{y}:{}", page.max(1), pdf.display());
    let output = Command::new("synctex")
        .current_dir(&root)
        .args(["edit", "-o", &output_spec])
        .output()
        .map_err(|_| unavailable())?;
    if !output.status.success() {
        return Err(stale());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let input = value(&text, "Input:").ok_or_else(stale)?;
    let source = Path::new(input).canonicalize().map_err(|_| stale())?;
    if !source.starts_with(&root) || !source.is_file() {
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

fn project_file(
    root: &Path,
    relative: &str,
    extension: &str,
) -> Result<std::path::PathBuf, SyncTexError> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || !relative
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
    {
        return Err(stale());
    }
    let file = root.join(relative).canonicalize().map_err(|_| stale())?;
    if file.starts_with(root) && file.is_file() {
        Ok(file)
    } else {
        Err(stale())
    }
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
