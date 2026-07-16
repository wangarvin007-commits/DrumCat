import type { ShortcutHandler } from '@tauri-apps/plugin-global-shortcut'
import type { Ref } from 'vue'

import {
  isRegistered,
  register,
  unregister,
} from '@tauri-apps/plugin-global-shortcut'
import { error } from '@tauri-apps/plugin-log'
import { onUnmounted, ref, watch } from 'vue'

export function useKeyPress(shortcut: Ref<string | undefined, string>, callback: ShortcutHandler) {
  const activeShortcut = ref<string>()
  let bindingQueue = Promise.resolve()

  async function unbind() {
    if (!activeShortcut.value) return

    const registered = await isRegistered(activeShortcut.value)

    if (registered) {
      await unregister(activeShortcut.value)
    }

    activeShortcut.value = undefined
  }

  async function bind(value: string | undefined) {
    await unbind()

    if (!value) return

    await register(value, (event) => {
      if (event.state === 'Released') return

      callback(event)
    })

    activeShortcut.value = value
  }

  function queueBinding(value: string | undefined) {
    bindingQueue = bindingQueue
      .then(() => bind(value))
      .catch((reason) => {
        const message = reason instanceof Error ? reason.message : String(reason)

        error(`注册全局快捷键失败：${message}`)
      })
  }

  watch(shortcut, queueBinding, { immediate: true })

  onUnmounted(() => {
    bindingQueue = bindingQueue.then(unbind)
  })
}
