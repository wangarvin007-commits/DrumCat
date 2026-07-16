import { emit } from '@tauri-apps/api/event'
import { storeToRefs } from 'pinia'

import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import { toggleWindowVisible } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { useShortcutStore } from '@/stores/shortcut'

import { useKeyPress } from './useKeyPress'

export function useGlobalShortcuts() {
  const shortcutStore = useShortcutStore()
  const catStore = useCatStore()
  const {
    alwaysOnTop,
    mirrorMode,
    penetrable,
    visibleCat,
    visiblePreference,
    chatPanel,
  } = storeToRefs(shortcutStore)

  useKeyPress(visibleCat, () => {
    catStore.window.visible = !catStore.window.visible
  })

  useKeyPress(visiblePreference, () => {
    void toggleWindowVisible(WINDOW_LABEL.PREFERENCE)
  })

  useKeyPress(chatPanel, () => {
    void emit(LISTEN_KEY.TOGGLE_CHAT)
  })

  useKeyPress(mirrorMode, () => {
    catStore.model.mirror = !catStore.model.mirror
  })

  useKeyPress(penetrable, () => {
    catStore.window.passThrough = !catStore.window.passThrough
  })

  useKeyPress(alwaysOnTop, () => {
    catStore.window.alwaysOnTop = !catStore.window.alwaysOnTop
  })
}
