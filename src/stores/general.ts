import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

import { LANGUAGE } from '@/constants'

export type Theme = 'auto' | 'light' | 'dark'
export type Language = typeof LANGUAGE[keyof typeof LANGUAGE]

export interface GeneralStore {
  app: {
    autostart: boolean
    taskbarVisible: boolean
    trayVisible: boolean
  }
  appearance: {
    theme: Theme
    isDark: boolean
    language?: Language
  }
}

export const useGeneralStore = defineStore('general', () => {
  /* ------------ 废弃字段（后续删除） ------------ */

  /** @deprecated 请使用 `app.autostart` */
  const autostart = ref(false)

  /** @deprecated 请使用 `app.taskbarVisible` */
  const taskbarVisibility = ref(false)

  /** @deprecated 用于标识数据是否已迁移，后续版本将删除 */
  const migrated = ref(false)

  const app = reactive<GeneralStore['app']>({
    autostart: false,
    taskbarVisible: false,
    trayVisible: true,
  })

  const appearance = reactive<GeneralStore['appearance']>({
    theme: 'auto',
    isDark: false,
    language: LANGUAGE.ZH_CN,
  })

  const init = async () => {
    // MVP 固定使用简体中文和已完整适配的亮色界面。
    appearance.language = LANGUAGE.ZH_CN
    appearance.theme = 'light'
    appearance.isDark = false

    if (migrated.value) return

    app.autostart = autostart.value
    app.taskbarVisible = taskbarVisibility.value

    appearance.language = LANGUAGE.ZH_CN

    migrated.value = true
  }

  return {
    migrated,
    app,
    appearance,
    init,
  }
})
