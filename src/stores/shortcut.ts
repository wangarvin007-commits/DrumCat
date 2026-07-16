import { defineStore } from 'pinia'
import { ref } from 'vue'

import { isMac } from '@/utils/platform'

export type HotKey = 'visibleCat' | 'mirrorMode' | 'penetrable' | 'alwaysOnTop'

export const useShortcutStore = defineStore('shortcut', () => {
  const primaryModifier = isMac ? 'Command' : 'Control'
  const visibleCat = ref(`${primaryModifier}+Shift+D`)
  const visiblePreference = ref(`${primaryModifier}+Shift+P`)
  const chatPanel = ref(`${primaryModifier}+Shift+C`)
  const mirrorMode = ref(`${primaryModifier}+Shift+M`)
  const penetrable = ref(`${primaryModifier}+Shift+X`)
  const alwaysOnTop = ref(`${primaryModifier}+Shift+T`)

  return {
    visibleCat,
    visiblePreference,
    chatPanel,
    mirrorMode,
    penetrable,
    alwaysOnTop,
  }
})
