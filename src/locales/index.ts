import antdZhCN from 'antdv-next/locale/zh_CN'
import { createI18n } from 'vue-i18n'

import { LANGUAGE } from '@/constants'

import zhCN from './zh-CN.json'

export const i18n = createI18n({
  legacy: false,
  locale: LANGUAGE.ZH_CN,
  fallbackLocale: LANGUAGE.ZH_CN,
  messages: {
    [LANGUAGE.ZH_CN]: zhCN,
  },
})

export function getAntdLocale() {
  return antdZhCN
}
