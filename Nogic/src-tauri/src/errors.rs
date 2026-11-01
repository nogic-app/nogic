use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorBucket { Network, Model, Gpu, Db, File }

#[derive(Serialize)]
pub struct ErrorAction { pub kind: String, pub label: String }

#[derive(Serialize)]
pub struct ErrorPayload { pub bucket: ErrorBucket, pub message: String, pub action: Option<ErrorAction> }

fn response(bucket: ErrorBucket, message: &str, kind: &str, label: &str) -> (ErrorBucket, String, Option<ErrorAction>) {
    (bucket, message.into(), Some(ErrorAction { kind: kind.into(), label: label.into() }))
}

pub fn classify(err: &str) -> (ErrorBucket, String, Option<ErrorAction>) {
    let lower = err.to_ascii_lowercase();
    let result = if lower.contains("os error 232") || lower.contains("connection refused") || lower.contains("connection error") || lower.contains("connecterror") || lower.contains("failed to connect") {
        response(ErrorBucket::Network, "The Nogic engine isn't running. Click Retry.", "retry", "Retry")
    } else if lower.contains("0xc0000409") || lower.contains("cuda") || lower.contains("vram") || lower.contains("out of memory") {
        response(ErrorBucket::Gpu, "The model ran out of memory.", "open_settings", "Open Settings")
    } else if lower.contains("model not found") || lower.contains("no model selected") || lower.contains("no model is selected") || lower.contains("model does not exist") {
        response(ErrorBucket::Model, "The selected model isn't available.", "open_settings", "Open Settings")
    } else if err.contains("ModuleNotFoundError") {
        response(ErrorBucket::File, "The engine is missing a file.", "open_logs", "Open Logs")
    } else if lower.contains("no such table") || lower.contains("sqlite") {
        response(ErrorBucket::Db, "Couldn't read local data.", "retry", "Retry")
    } else {
        response(ErrorBucket::File, "Nogic couldn't complete this action. Check the logs.", "open_logs", "Open Logs")
    };
    result
}
