use std::fs;
use std::fs::File;
use std::path::Path;
use std::path::PathBuf;
use zip::ZipArchive;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn extract_zip(file_path: String, destination: String) -> Result<(), String> {
    let destination_path = Path::new(&destination);

    if !destination_path.exists() {
        return Err("Addon Folder does not exist".to_string());
    }

    // Check if the file exists and is readable
    if !Path::new(&file_path).exists() {
        return Err("ZIP file does not exist".to_string());
    }

    // Check file size to ensure it's not empty
    let metadata =
        fs::metadata(&file_path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() == 0 {
        return Err("ZIP file is empty".to_string());
    }

    let file = File::open(&file_path).map_err(|e| format!("Failed to open ZIP file: {}", e))?;

    // Try to create the ZIP archive with better error handling
    let mut archive = match ZipArchive::new(file) {
        Ok(archive) => {
            if archive.len() == 0 {
                return Err("ZIP file contains no entries".to_string());
            }
            archive
        }
        Err(zip::result::ZipError::InvalidArchive(msg)) => {
            return Err(format!("Invalid ZIP file: {}", msg));
        }
        Err(zip::result::ZipError::Io(io_err)) => {
            return Err(format!("I/O error reading ZIP file: {}", io_err));
        }
        Err(zip::result::ZipError::UnsupportedArchive(msg)) => {
            return Err(format!("Unsupported ZIP format: {}", msg));
        }
        Err(e) => {
            return Err(format!("ZIP file error: {}", e));
        }
    };

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read file {} from ZIP: {}", i, e))?;
        let out_path = Path::new(&destination).join(file.name());

        if file.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory {}: {}", out_path.display(), e))?;
        } else {
            if let Some(p) = out_path.parent() {
                std::fs::create_dir_all(p).map_err(|e| {
                    format!("Failed to create parent directory {}: {}", p.display(), e)
                })?;
            }
            let mut outfile = File::create(&out_path)
                .map_err(|e| format!("Failed to create file {}: {}", out_path.display(), e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file {}: {}", out_path.display(), e))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn validate_zip(file_path: String) -> Result<bool, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("ZIP file does not exist".to_string());
    }

    if !path.is_file() {
        return Err("Path is not a file".to_string());
    }

    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    match ZipArchive::new(file) {
        Ok(_) => Ok(true),
        Err(zip::result::ZipError::InvalidArchive(msg)) => {
            Err(format!("Invalid ZIP file: {}", msg))
        }
        Err(zip::result::ZipError::Io(io_err)) => {
            Err(format!("I/O error reading file: {}", io_err))
        }
        Err(zip::result::ZipError::UnsupportedArchive(msg)) => {
            Err(format!("Unsupported ZIP format: {}", msg))
        }
        Err(e) => Err(format!("ZIP validation error: {}", e)),
    }
}

#[tauri::command]
fn get_zip_info(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    if !path.is_file() {
        return Err("Path is not a file".to_string());
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let file_size = metadata.len();

    if file_size == 0 {
        return Err("File is empty (0 bytes)".to_string());
    }

    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    match ZipArchive::new(file) {
        Ok(archive) => {
            let entry_count = archive.len();
            if entry_count == 0 {
                return Err("ZIP file contains no entries".to_string());
            }
            Ok(format!("Valid ZIP file: {} entries, {} bytes", entry_count, file_size))
        }
        Err(zip::result::ZipError::InvalidArchive(msg)) => {
            Err(format!("Invalid ZIP file: {}. This usually means the file is corrupted or incomplete. Try downloading it again.", msg))
        }
        Err(zip::result::ZipError::Io(io_err)) => {
            Err(format!("I/O error reading file: {}. Check if the file is accessible and not locked by another process.", io_err))
        }
        Err(zip::result::ZipError::UnsupportedArchive(msg)) => {
            Err(format!("Unsupported ZIP format: {}. The file might be using an unsupported compression method.", msg))
        }
        Err(e) => {
            Err(format!("ZIP error: {}. This could indicate file corruption.", e))
        }
    }
}

#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            extract_zip,
            read_file,
            validate_zip,
            get_zip_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
