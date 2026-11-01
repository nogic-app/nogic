use chrono::{Duration as ChronoDuration, Local, NaiveDate};
use std::error::Error;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::EnvFilter;

pub fn cleanup_old_logs(log_dir: &Path) -> Result<(), Box<dyn Error + Send + Sync>> {
    let cutoff = Local::now().date_naive() - ChronoDuration::days(7);
    for entry in fs::read_dir(log_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name();
        if let Some(log_date) = log_date_from_filename(&name.to_string_lossy()) {
            if log_date < cutoff {
                fs::remove_file(entry.path())?;
            }
        }
    }
    Ok(())
}

fn log_date_from_filename(filename: &str) -> Option<NaiveDate> {
    let date = filename
        .strip_prefix("nogic-")
        .or_else(|| filename.strip_prefix("sidecar-"))?
        .strip_suffix(".log")?;
    let date = date.strip_prefix('.').unwrap_or(date);
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

fn log_file_path(log_dir: &Path, date: NaiveDate) -> PathBuf {
    log_dir.join(format!("nogic-{date}.log"))
}

struct DailyLogWriter {
    log_dir: PathBuf,
    date: NaiveDate,
    file: File,
}

impl DailyLogWriter {
    fn new(log_dir: &Path) -> io::Result<Self> {
        let date = Local::now().date_naive();
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file_path(log_dir, date))?;
        Ok(Self {
            log_dir: log_dir.to_path_buf(),
            date,
            file,
        })
    }

    fn rotate_if_needed(&mut self) -> io::Result<()> {
        let date = Local::now().date_naive();
        if date != self.date {
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_file_path(&self.log_dir, date))?;
            self.file = file;
            self.date = date;
        }
        Ok(())
    }
}

impl Write for DailyLogWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.rotate_if_needed()?;
        self.file.write(buffer)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

pub fn init() -> Result<WorkerGuard, Box<dyn Error + Send + Sync>> {
    let app_data = std::env::var_os("APPDATA").ok_or("APPDATA is not set")?;
    let log_directory = PathBuf::from(app_data).join("com.nogic.app").join("logs");
    fs::create_dir_all(&log_directory)?;
    cleanup_old_logs(&log_directory)?;

    // The rolling appender inserts a period before the date, so use a writer that preserves the required hyphen.
    let (writer, guard) = tracing_appender::non_blocking(DailyLogWriter::new(&log_directory)?);
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .try_init()?;
    Ok(guard)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_log_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("nogic-log-test-{}-{unique}", std::process::id()))
    }

    #[test]
    fn daily_log_writer_uses_hyphenated_filename() {
        let directory = test_log_dir();
        fs::create_dir_all(&directory).unwrap();

        let writer = DailyLogWriter::new(&directory).unwrap();
        let expected = log_file_path(&directory, Local::now().date_naive());
        assert!(expected.is_file());
        assert_eq!(
            expected.file_name().unwrap().to_string_lossy(),
            format!("nogic-{}.log", writer.date)
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cleanup_removes_only_matching_logs_older_than_seven_days() {
        let directory = test_log_dir();
        fs::create_dir_all(&directory).unwrap();
        let old_date = Local::now().date_naive() - ChronoDuration::days(8);
        let recent_date = Local::now().date_naive() - ChronoDuration::days(7);
        let old_logs = [
            directory.join(format!("nogic-{old_date}.log")),
            directory.join(format!("sidecar-{old_date}.log")),
        ];
        let retained_logs = [
            directory.join(format!("nogic-{recent_date}.log")),
            directory.join(format!("unrelated-{old_date}.log")),
        ];
        for path in old_logs.iter().chain(retained_logs.iter()) {
            fs::write(path, b"log").unwrap();
        }

        cleanup_old_logs(&directory).unwrap();

        assert!(old_logs.iter().all(|path| !path.exists()));
        assert!(retained_logs.iter().all(|path| path.exists()));
        fs::remove_dir_all(directory).unwrap();
    }
}
