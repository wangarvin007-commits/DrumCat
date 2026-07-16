import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

export async function sendSystemNotification(title: string, body: string): Promise<boolean> {
  try {
    let permissionGranted = await isPermissionGranted()

    if (!permissionGranted) {
      permissionGranted = await requestPermission() === 'granted'
    }

    if (!permissionGranted) return false

    sendNotification({ title, body })
    return true
  } catch {
    return false
  }
}
