mod core;
use core::{ai::stream_ai_reply, device::start_device_listening, prevent_default, setup};
use tauri::{
    Manager, WindowEvent, generate_handler,
    menu::{MenuBuilder, SubmenuBuilder},
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_custom_window::{
    MAIN_WINDOW_LABEL, PREFERENCE_WINDOW_LABEL, show_preference_window,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .menu(|app| {
            let app_menu = SubmenuBuilder::new(app, "DrumCat")
                .about_with_text("关于 DrumCat", None)
                .separator()
                .text("preferences", "设置…")
                .separator()
                .hide_with_text("隐藏 DrumCat")
                .hide_others_with_text("隐藏其他应用")
                .show_all_with_text("全部显示")
                .separator()
                .quit_with_text("退出 DrumCat")
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "编辑")
                .undo_with_text("撤销")
                .redo_with_text("重做")
                .separator()
                .cut_with_text("剪切")
                .copy_with_text("复制")
                .paste_with_text("粘贴")
                .select_all_with_text("全选")
                .build()?;
            let window_menu = SubmenuBuilder::new(app, "窗口")
                .minimize_with_text("最小化")
                .close_window_with_text("关闭窗口")
                .build()?;

            MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()
        })
        .on_menu_event(|app_handle, event| {
            if event.id() == "preferences" {
                show_preference_window(app_handle);
            }
        })
        .setup(|app| {
            let app_handle = app.handle();

            let main_window = app.get_webview_window(MAIN_WINDOW_LABEL).unwrap();

            let preference_window = app.get_webview_window(PREFERENCE_WINDOW_LABEL).unwrap();

            setup::default(app_handle, main_window.clone(), preference_window.clone());

            Ok(())
        })
        .invoke_handler(generate_handler![start_device_listening, stream_ai_reply])
        .plugin(tauri_plugin_admin_status::init())
        .plugin(tauri_plugin_custom_window::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_pinia::init())
        .plugin(prevent_default::init())
        .plugin(tauri_plugin_single_instance::init(
            |app_handle, _argv, _cwd| {
                show_preference_window(app_handle);
            },
        ))
        .plugin(
            tauri_plugin_log::Builder::new()
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_locale::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();

                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_preference_window(app_handle);
        }
        _ => {
            let _ = app_handle;
        }
    });
}
