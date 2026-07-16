<script setup lang="ts">
import { HappyProvider } from '@antdv-next/happy-work-theme'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { error } from '@tauri-apps/plugin-log'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useEventListener } from '@vueuse/core'
import { ConfigProvider, theme } from 'antdv-next'
import { isString } from 'es-toolkit'
import isURL from 'is-url'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { useGlobalShortcuts } from './composables/useGlobalShortcuts'
import { useTauriListen } from './composables/useTauriListen'
import { useTray } from './composables/useTray'
import { useWindowState } from './composables/useWindowState'
import { LANGUAGE, LISTEN_KEY, WINDOW_LABEL } from './constants'
import { getAntdLocale } from './locales/index.ts'
import { hideWindow, showWindow } from './plugins/window'
import { useAppStore } from './stores/app'
import { useCatStore } from './stores/cat'
import { useCompanionStore } from './stores/companion'
import { useGeneralStore } from './stores/general'
import { usePetStore } from './stores/pet'
import { useShortcutStore } from './stores/shortcut.ts'

const appStore = useAppStore()
const catStore = useCatStore()
const companionStore = useCompanionStore()
const petStore = usePetStore()
const generalStore = useGeneralStore()
const shortcutStore = useShortcutStore()
const appWindow = getCurrentWebviewWindow()
const { isRestored, restoreState } = useWindowState()
const { darkAlgorithm, defaultAlgorithm } = theme
const { locale } = useI18n()

if (appWindow.label === WINDOW_LABEL.MAIN) {
  useGlobalShortcuts()
  useTray()
}

onMounted(async () => {
  await appStore.$tauri.start()
  await appStore.init()
  await catStore.$tauri.start()
  catStore.init()
  await petStore.$tauri.start()
  petStore.init()
  await companionStore.$tauri.start()
  companionStore.init()
  await generalStore.$tauri.start()
  await generalStore.init()
  await syncAutostart(generalStore.app.autostart)
  await shortcutStore.$tauri.start()
  await restoreState()
})

watch(() => generalStore.appearance.language, () => {
  locale.value = LANGUAGE.ZH_CN
})

watch(() => generalStore.appearance.isDark, (value) => {
  document.documentElement.classList.toggle('dark', value)
}, { immediate: true })

watch(() => generalStore.app.autostart, syncAutostart)

async function syncAutostart(shouldEnable: boolean) {
  try {
    const enabled = await isEnabled()

    if (shouldEnable && !enabled) await enable()
    if (!shouldEnable && enabled) await disable()
  } catch {
    // Autostart can be unavailable in a browser-only or unsigned dev environment.
  }
}

useTauriListen(LISTEN_KEY.SHOW_WINDOW, ({ payload }) => {
  if (appWindow.label !== payload) return

  showWindow()
})

useTauriListen(LISTEN_KEY.HIDE_WINDOW, ({ payload }) => {
  if (appWindow.label !== payload) return

  hideWindow()
})

useEventListener('unhandledrejection', ({ reason }) => {
  const message = isString(reason) ? reason : JSON.stringify(reason)

  error(message)
})

useEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest('a')

  if (!link) return

  const { href, target } = link

  if (target === '_blank') return

  event.preventDefault()

  if (!isURL(href)) return

  openUrl(href)
})
</script>

<template>
  <HappyProvider
    v-slot="{ wave }"
    enabled
  >
    <ConfigProvider
      :locale="getAntdLocale()"
      :theme="{
        algorithm: generalStore.appearance.isDark ? darkAlgorithm : defaultAlgorithm,
      }"
      :wave="wave"
    >
      <RouterView v-if="isRestored" />
    </ConfigProvider>
  </HappyProvider>
</template>
