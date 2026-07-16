use rdev::{Event, EventType, listen};
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Runtime, command};

const DEVICE_LISTENING_ERROR_EVENT: &str = "device-listening-error";

#[derive(Debug, Clone, Serialize)]
pub enum DeviceEventKind {
    MousePress,
    MouseRelease,
    MouseMove,
    KeyboardPress,
    KeyboardRelease,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceEvent {
    kind: DeviceEventKind,
    value: Value,
}

static IS_LISTENING: AtomicBool = AtomicBool::new(false);

#[command]
pub fn start_device_listening<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    if IS_LISTENING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }

    std::thread::Builder::new()
        .name("drumcat-device-listener".into())
        .spawn(move || {
            let event_app_handle = app_handle.clone();
            let callback = move |event: Event| {
                let device_event = match event.event_type {
                    EventType::ButtonPress(button) => DeviceEvent {
                        kind: DeviceEventKind::MousePress,
                        value: json!(format!("{:?}", button)),
                    },
                    EventType::ButtonRelease(button) => DeviceEvent {
                        kind: DeviceEventKind::MouseRelease,
                        value: json!(format!("{:?}", button)),
                    },
                    EventType::MouseMove { x, y } => DeviceEvent {
                        kind: DeviceEventKind::MouseMove,
                        value: json!({ "x": x, "y": y }),
                    },
                    EventType::KeyPress(key) => DeviceEvent {
                        kind: DeviceEventKind::KeyboardPress,
                        value: json!(format!("{:?}", key)),
                    },
                    EventType::KeyRelease(key) => DeviceEvent {
                        kind: DeviceEventKind::KeyboardRelease,
                        value: json!(format!("{:?}", key)),
                    },
                    _ => return,
                };

                let _ = event_app_handle.emit("device-changed", device_event);
            };

            if let Err(err) = listen(callback) {
                IS_LISTENING.store(false, Ordering::SeqCst);
                let _ = app_handle.emit(
                    DEVICE_LISTENING_ERROR_EVENT,
                    format!("全局键鼠监听启动失败：{:?}", err),
                );
            }
        })
        .map_err(|err| {
            IS_LISTENING.store(false, Ordering::SeqCst);
            format!("无法创建全局键鼠监听线程：{err}")
        })?;

    Ok(())
}
