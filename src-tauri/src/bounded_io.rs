use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

/// Reads at most `limit` bytes, including when the file changes after it is opened.
pub(crate) fn read(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    let file = File::open(path)?;
    let advertised_length = file.metadata()?.len();
    if advertised_length > limit {
        return Err(too_large());
    }

    let mut bytes =
        Vec::with_capacity(usize::try_from(advertised_length.min(limit)).unwrap_or(usize::MAX));
    file.take(limit.saturating_add(1)).read_to_end(&mut bytes)?;
    if u64::try_from(bytes.len()).map_or(true, |length| length > limit) {
        return Err(too_large());
    }
    Ok(bytes)
}

/// Reads at most `limit` bytes from the start of the file, discarding any excess
/// instead of failing. Intended for scanning a file's leading region (e.g. a
/// preamble) without loading the whole file into memory.
pub(crate) fn read_prefix(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?.take(limit).read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn too_large() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "file exceeds its read limit")
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::read;

    #[test]
    fn refuses_a_file_larger_than_the_limit() -> Result<(), Box<dyn std::error::Error>> {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_nanos();
        let path = std::env::temp_dir().join(format!("tex-bounded-read-{unique}"));
        fs::write(&path, b"12345")?;
        let result = read(&path, 4);
        fs::remove_file(path)?;

        let Err(error) = result else {
            return Err("oversized read must fail".into());
        };
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        Ok(())
    }
}
