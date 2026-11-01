// src-tauri/src/lib.rs
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use serde::Serialize;
use sysinfo::System;
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_opener::OpenerExt;

mod errors;
mod logger;

use errors::ErrorPayload;

fn classified_error(error: impl std::fmt::Display) -> ErrorPayload {
    let raw = error.to_string();
    tracing::error!(target: "nogic", error = %raw, "Command failed");
    let (bucket, message, action) = errors::classify(&raw);
    ErrorPayload {
        bucket,
        message,
        action,
    }
}

// A wrapper to hold the Python stdin so we can write to it from React
struct SidecarProcess(Mutex<std::process::ChildStdin>);

// CREATE_NO_WINDOW (0x08000000). Windows still allocates a console for a
// console-subsystem child process even when its stdio is piped, so without this
// flag the Python sidecar (or the bundled nogic-backend.exe) flashes a CMD window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Spawn the sidecar without a console window on Windows.
fn spawn_hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn sanitize_law_identifier(law_name: &str) -> Option<String> {
    let mut identifier = law_name.trim();
    loop {
        let prefix = identifier.get(..4).unwrap_or_default();
        if prefix.eq_ignore_ascii_case("loi ")
            || prefix.eq_ignore_ascii_case("loi_")
            || prefix.eq_ignore_ascii_case("law ")
            || prefix.eq_ignore_ascii_case("law_")
        {
            identifier = identifier.get(4..)?;
        } else {
            break;
        }
    }

    let sanitized = identifier
        .chars()
        .filter(|character| !r#"\/:*?"<>|"#.contains(*character))
        .map(|character| if character == ' ' { '_' } else { character })
        .collect::<String>();
    if sanitized.is_empty() {
        None
    } else {
        Some(sanitized)
    }
}

fn sanitize_legacy_law_identifier(law_name: &str) -> Option<String> {
    let identifier = law_name
        .get(..4)
        .filter(|prefix| prefix.eq_ignore_ascii_case("loi "))
        .and_then(|_| law_name.get(4..))?;
    let mut sanitized = String::new();
    let mut previous_was_separator = false;
    for character in identifier.chars() {
        if character.is_alphanumeric() || character == '.' || character == '-' {
            sanitized.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator {
            sanitized.push('_');
            previous_was_separator = true;
        }
    }

    let trimmed = sanitized.trim_matches(|character: char| {
        character == '_' || character == '.' || character == '-'
    });
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn valid_country_code(country: &str) -> bool {
    country == "INT"
        || (country.len() == 2
            && country
                .bytes()
                .all(|character| character.is_ascii_alphabetic()))
}

#[tauri::command]
fn send_to_sidecar(state: State<'_, SidecarProcess>, message: String) -> Result<(), ErrorPayload> {
    let mut stdin = state.0.lock().map_err(classified_error)?;
    writeln!(stdin, "{}", message).map_err(classified_error)?;
    stdin.flush().map_err(classified_error)?;
    Ok(())
}

#[tauri::command]
fn copy_law_file(source_path: String) -> Result<String, ErrorPayload> {
    let path = PathBuf::from(&source_path);
    if !path.is_file() {
        return Err(classified_error(format!("PDF not found: {source_path}")));
    }
    let is_pdf = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return Err(classified_error("The selected file must be a PDF."));
    }
    Ok(source_path)
}

#[tauri::command]
fn law_file_size(source_path: String) -> Result<u64, String> {
    std::fs::metadata(&source_path)
        .map(|metadata| metadata.len())
        .map_err(|error| format!("Could not read the PDF: {error}"))
}

#[tauri::command]
fn get_file_metadata(file_path: String) -> Result<serde_json::Value, String> {
    let path = PathBuf::from(&file_path);
    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("Could not read the selected file: {error}"))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The selected file has no valid name.".to_string())?;
    let file_type = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("file")
        .to_uppercase();
    Ok(serde_json::json!({
        "name": name,
        "size": metadata.len(),
        "type": file_type,
    }))
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn open_law_pdf(
    app: tauri::AppHandle,
    law_name: String,
    country: String,
    page_num: u32,
) -> Result<(), String> {
    if page_num == 0 {
        return Err("Law PDF page number must be greater than zero.".to_owned());
    }
    let country = country.to_ascii_uppercase();
    if !valid_country_code(&country) {
        return Err(format!("Unsupported law country code: {country}"));
    }

    let identifier = sanitize_law_identifier(&law_name)
        .ok_or_else(|| format!("Unsupported law source: {law_name}"))?;
    let legacy_identifier = sanitize_legacy_law_identifier(&law_name)
        .unwrap_or_else(|| identifier.clone());
    let laws_directory = if cfg!(not(debug_assertions)) {
        app.path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve app data directory: {error}"))?
            .join("data")
            .join("laws")
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("backend")
            .join("data")
            .join("laws")
    };

    // Custom uploads keep the sanitized name. Built-in Arabic/French editions
    // may carry a language suffix, so fall back to those variants.
    let pdf_path = [
        format!("Law_{country}_{identifier}.pdf"),
        format!("Law_{legacy_identifier}.pdf"),
        format!("Law_{legacy_identifier}_fr.pdf"),
        format!("Law_{legacy_identifier}_ar.pdf"),
    ]
    .into_iter()
    .map(|filename| laws_directory.join(filename))
    .find(|candidate| candidate.is_file())
    .ok_or_else(|| format!("Law PDF does not exist for: {law_name}"))?;

    let mut pdf_url = tauri::Url::from_file_path(&pdf_path).map_err(|_| {
        format!(
            "Could not create a file URL for law PDF: {}",
            pdf_path.display()
        )
    })?;
    pdf_url.set_fragment(Some(&format!("page={page_num}")));

    app.opener()
        .open_url(pdf_url.to_string(), None::<&str>)
        .map_err(|error| format!("Failed to open law PDF: {error}"))
}


#[derive(Serialize)]
struct HardwareInfo {
    cpu_name: String,
    cpu_cores: usize,
    total_ram_gb: f32,
    available_ram_gb: f32,
    os_name: String,
    os_version: String,
    gpu_name: Option<String>,
    gpu_vendor: Option<String>,
    vram_gb: Option<f32>,
    has_nvidia: bool,
    has_amd: bool,
    has_intel: bool,
    detection_warnings: Vec<String>,
}

fn round1(value: f32) -> f32 {
    (value * 10.0).round() / 10.0
}

fn infer_vendor(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if lower.contains("amd") || lower.contains("radeon") {
        "amd"
    } else if lower.contains("intel") {
        "intel"
    } else if lower.contains("nvidia") || lower.contains("geforce") || lower.contains("quadro") || lower.contains("rtx") || lower.contains("gtx") {
        "nvidia"
    } else {
        "unknown"
    }
}


fn run_wmic() -> Result<String, String> {
    let mut child = Command::new("wmic")
        .args([
            "path",
            "win32_VideoController",
            "get",
            "name,AdapterRAM",
            "/format:csv",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(3);

    loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(_) => {
                let mut stdout = child
                    .stdout
                    .take()
                    .ok_or_else(|| "WMI returned no output.".to_string())?;
                let mut output = String::new();
                stdout
                    .read_to_string(&mut output)
                    .map_err(|error| error.to_string())?;
                return Ok(output);
            }
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("WMI GPU query timed out.".to_string());
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
}

fn detect_hardware_info() -> HardwareInfo {
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_name = sys
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    let cpu_cores = sys.cpus().len();

    let total_ram_gb = round1(sys.total_memory() as f32 / 1_073_741_824.0);
    let available_ram_gb = round1(sys.available_memory() as f32 / 1_073_741_824.0);

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::long_os_version().unwrap_or_else(|| "Unknown".to_string());

    let mut has_nvidia = false;
    let mut has_amd = false;
    let mut has_intel = false;
    let mut gpu_name: Option<String> = None;
    let mut gpu_vendor: Option<String> = None;
    let mut vram_gb: Option<f32> = None;
    let mut warnings: Vec<String> = Vec::new();

    match nvml_wrapper::Nvml::init() {
        Ok(nvml) => {
            match nvml.device_by_index(0) {
                Ok(device) => {
                    has_nvidia = true;
                    gpu_name = Some(device.name().unwrap_or_else(|_| "NVIDIA GPU".to_string()));
                    if let Ok(mem) = device.memory_info() {
                        vram_gb = Some(round1(mem.total as f32 / 1_073_741_824.0));
                    }
                    gpu_vendor = Some("nvidia".to_string());
                }
                Err(_) => {
                    warnings.push("NVIDIA NVML initialized but no GPU device found".to_string());
                }
            }
        }
        Err(_) => {}
    }

    if gpu_name.is_none() {
        match run_wmic() {
            Ok(stdout) => for line in stdout.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with("Node,") {
                    continue;
                }
                let parts: Vec<&str> = trimmed.split(',').collect();
                if parts.len() >= 3 {
                    let name = parts[1].trim();
                    if !name.is_empty() && name != "Name" {
                        let vendor = infer_vendor(name);
                        match vendor {
                            "amd" => has_amd = true,
                            "intel" => has_intel = true,
                            "nvidia" => has_nvidia = true,
                            _ => {}
                        }
                        gpu_name = Some(name.to_string());
                        gpu_vendor = Some(vendor.to_string());
                        if let Ok(ram_bytes) = parts[2].trim().parse::<u64>() {
                            if ram_bytes > 0 {
                                vram_gb = Some(round1(ram_bytes as f32 / 1_073_741_824.0));
                                if ram_bytes >= 4_294_967_296 {
                                    warnings.push("GPU VRAM capped at 4 GB by WMI AdapterRAM (int32 limit); actual VRAM may be higher".to_string());
                                }
                            }
                        }
                        break;
                    }
                }
            },
            Err(error) => warnings.push(format!("WMI GPU query failed: {error}")),
        }
    }

    if gpu_name.is_none() {
        gpu_vendor = None;
        vram_gb = None;
        warnings.push("GPU detection unavailable".to_string());
    }

    HardwareInfo {
        cpu_name,
        cpu_cores,
        total_ram_gb,
        available_ram_gb,
        os_name,
        os_version,
        gpu_name,
        gpu_vendor,
        vram_gb,
        has_nvidia,
        has_amd,
        has_intel,
        detection_warnings: warnings,
    }
}

#[tauri::command]
async fn get_hardware_info() -> Result<HardwareInfo, ErrorPayload> {
    tauri::async_runtime::spawn_blocking(detect_hardware_info)
        .await
        .map_err(classified_error)
}

const BYTES_PER_GIB: f32 = 1_073_741_824.0;

const WMI_IGPU_ENGINE_SCRIPT: &str = concat!(
    "$sum = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine ",
    "| Where-Object { $_.Name -like '*engtype_3D*' } ",
    "| Measure-Object -Property UtilizationPercentage -Sum).Sum; ",
    "if ($null -ne $sum) { $sum.ToString([System.Globalization.CultureInfo]::InvariantCulture) }"
);

/// Runs a PowerShell snippet without opening a console window. The timeout keeps
/// a stalled WMI query from blocking the usage poll.
fn run_powershell(script: &str, timeout: Duration) -> Option<String> {
    let mut command = Command::new("powershell");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = spawn_hidden(&mut command).spawn().ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                let mut stdout = child.stdout.take()?;
                let mut output = String::new();
                stdout.read_to_string(&mut output).ok()?;
                return Some(output);
            }
            Ok(Some(_)) => return None,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(_) => return None,
        }
    }
}

/// Sums the 3D engine utilization reported by Windows' GPU performance
/// counters. NVML cannot see Intel/AMD integrated GPUs, so this covers them.
fn get_wmi_gpu_usage() -> Option<f32> {
    let output = run_powershell(WMI_IGPU_ENGINE_SCRIPT, Duration::from_millis(2500))?;
    output
        .trim()
        .parse::<f32>()
        .ok()
        .map(|value| value.clamp(0.0, 100.0))
}

fn is_integrated_gpu(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.contains("nvidia") || lower.contains("arc") {
        return false;
    }
    let intel = lower.contains("intel")
        && ["graphics", "hd", "uhd", "iris"]
            .iter()
            .any(|token| lower.contains(token));
    let amd = (lower.contains("amd") || lower.contains("radeon"))
        && (lower.contains("graphics") || lower.contains("vega"))
        && !lower.contains("rx ");
    intel || amd
}

fn detect_integrated_gpu_name() -> Option<String> {
    let output = run_powershell(
        "(Get-CimInstance Win32_VideoController).Name",
        Duration::from_secs(3),
    )?;
    output
        .lines()
        .map(str::trim)
        .find(|name| !name.is_empty() && is_integrated_gpu(name))
        .map(str::to_owned)
}

/// The adapter name is stable for the life of the process, so query it once.
/// A desktop with only a discrete GPU resolves to `None` and skips the
/// per-poll WMI usage query entirely.
fn integrated_gpu_name() -> Option<String> {
    static IGPU_NAME: OnceLock<Option<String>> = OnceLock::new();
    IGPU_NAME.get_or_init(detect_integrated_gpu_name).clone()
}

/// Live system usage. `None` on the VRAM/GPU fields means "not measurable on
/// this machine" so the UI can show "—" instead of inventing a number.
#[derive(Serialize)]
struct SystemUsage {
    cpu_usage: f32,
    ram_used_gb: f32,
    ram_total_gb: f32,
    vram_used_gb: Option<f32>,
    vram_total_gb: Option<f32>,
    gpu_usage: Option<f32>,
    gpu_name: Option<String>,
    igpu_usage: Option<f32>,
    igpu_name: Option<String>,
}

// One long-lived System keeps the CPU sampler's previous tick, so polling
// returns a real delta instead of a fresh process's first-sample zero.
static USAGE_SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
static USAGE_NVML: OnceLock<Option<nvml_wrapper::Nvml>> = OnceLock::new();

fn read_system_usage() -> SystemUsage {
    let mut cpu_usage = 0.0_f32;
    let mut ram_used_gb = 0.0_f32;
    let mut ram_total_gb = 0.0_f32;

    let system = USAGE_SYSTEM.get_or_init(|| Mutex::new(System::new()));
    if let Ok(mut sys) = system.lock() {
        // sysinfo derives CPU usage from the delta between two samples. Refresh,
        // let the documented minimum window elapse, then refresh again so the
        // reading covers a real interval. Two refreshes back-to-back produced a
        // near-zero window and the drift from Task Manager.
        sys.refresh_cpu_all();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_cpu_usage();
        cpu_usage = if sys.cpus().is_empty() {
            0.0
        } else {
            sys.global_cpu_usage().clamp(0.0, 100.0)
        };
        sys.refresh_memory();
        ram_used_gb = round1(sys.used_memory() as f32 / BYTES_PER_GIB);
        ram_total_gb = round1(sys.total_memory() as f32 / BYTES_PER_GIB);
    }

    let nvml = USAGE_NVML.get_or_init(|| nvml_wrapper::Nvml::init().ok());
    let mut vram_used_gb = None;
    let mut vram_total_gb = None;
    let mut gpu_usage = None;
    let mut gpu_name = None;

    if let Some(nvml) = nvml {
        if let Ok(device) = nvml.device_by_index(0) {
            gpu_name = device.name().ok();
            if let Ok(memory) = device.memory_info() {
                vram_used_gb = Some(round1(memory.used as f32 / BYTES_PER_GIB));
                vram_total_gb = Some(round1(memory.total as f32 / BYTES_PER_GIB));
            }
            if let Ok(utilization) = device.utilization_rates() {
                gpu_usage = Some((utilization.gpu as f32).clamp(0.0, 100.0));
            }
        }
    }

    let igpu_name = integrated_gpu_name();
    let igpu_usage = if igpu_name.is_some() {
        get_wmi_gpu_usage()
    } else {
        None
    };

    SystemUsage {
        cpu_usage: round1(cpu_usage),
        ram_used_gb,
        ram_total_gb,
        vram_used_gb,
        vram_total_gb,
        gpu_usage,
        gpu_name,
        igpu_usage,
        igpu_name,
    }
}

#[tauri::command]
async fn get_system_usage() -> Result<SystemUsage, ErrorPayload> {
    tauri::async_runtime::spawn_blocking(read_system_usage)
        .await
        .map_err(classified_error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _logger_guard = logger::init().expect("Failed to initialize the Nogic log.");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let mut command;
            if cfg!(not(debug_assertions)) {
                let backend_path = app
                    .path()
                    .resource_dir()?
                    .join("nogic-backend.exe");
                command = Command::new(backend_path);
            } else {
                command = Command::new("python");
                command.args(["../../backend/main.py"]);
            }

            let mut child = spawn_hidden(&mut command)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|error| {
                    tracing::error!(target: "sidecar", error = %error, "Failed to spawn Python sidecar");
                    error
                })?;

            let stdin = child.stdin.take().expect("Failed to open stdin");
            let stdout = child.stdout.take().expect("Failed to open stdout");
            let stderr = child.stderr.take().expect("Failed to open stderr");

            // 2. Save stdin to the app state so React can call it
            app.manage(SidecarProcess(Mutex::new(stdin)));

            // 3. Listen to stdout from Python and emit it to React
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        // Emit the Python response to the frontend
                        app_handle.emit("python-message", line).unwrap();
                    }
                }
            });

            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines() {
                    match line {
                        Ok(line) => tracing::warn!(target: "sidecar", "{}", line),
                        Err(error) => {
                            tracing::error!(target: "sidecar", error = %error, "Could not read sidecar stderr");
                            break;
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_to_sidecar,
            copy_law_file,
            law_file_size,
            get_file_metadata,
            open_law_pdf,
            restart_app,
            get_hardware_info,
            get_system_usage
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod usage_tests {
    use super::*;

    #[test]
    fn system_usage_reports_real_values() {
        let _ = read_system_usage();
        std::thread::sleep(Duration::from_millis(300));
        let usage = read_system_usage();
        assert!(usage.ram_total_gb > 0.0, "total RAM must be measured");
        assert!(usage.ram_used_gb > 0.0, "used RAM must be measured");
        assert!(usage.ram_used_gb <= usage.ram_total_gb);
        assert!((0.0..=100.0).contains(&usage.cpu_usage));
        if let (Some(used), Some(total)) = (usage.vram_used_gb, usage.vram_total_gb) {
            assert!(total > 0.0);
            assert!(used <= total);
        }
        if let Some(gpu) = usage.gpu_usage {
            assert!((0.0..=100.0).contains(&gpu));
        }
        if let Some(igpu) = usage.igpu_usage {
            assert!((0.0..=100.0).contains(&igpu));
            assert!(usage.igpu_name.is_some());
        }
    }
}
