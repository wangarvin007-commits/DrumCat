import { CheckMenuItem, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import { exit, relaunch } from '@tauri-apps/plugin-process'
import { range } from 'es-toolkit'
import { useI18n } from 'vue-i18n'

import { WINDOW_LABEL } from '@/constants'
import { PET_SKINS } from '@/constants/pets'
import { showWindow } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { MODE_OPTIONS, useCompanionStore } from '@/stores/companion'
import { usePetStore } from '@/stores/pet'
import { isMac } from '@/utils/platform'

export function useAppMenu() {
  const catStore = useCatStore()
  const companionStore = useCompanionStore()
  const petStore = usePetStore()
  const { t } = useI18n()

  const getPetSkinMenuItems = async () => {
    return Promise.all(PET_SKINS.map(skin => CheckMenuItem.new({
      text: `${skin.kind === 'cat' ? '🐱' : '🐶'} ${skin.name}`,
      checked: petStore.skinId === skin.id,
      action: () => petStore.setSkin(skin.id),
    })))
  }

  const getScaleMenuItems = async () => {
    const options = range(50, 151, 25)

    const items = options.map((item) => {
      return CheckMenuItem.new({
        text: `${item}%`,
        checked: catStore.window.scale === item,
        action: () => {
          catStore.window.scale = item
        },
      })
    })

    if (!options.includes(catStore.window.scale)) {
      items.unshift(CheckMenuItem.new({
        text: `${catStore.window.scale}%`,
        checked: true,
        enabled: false,
      }))
    }

    return Promise.all(items)
  }

  const getOpacityMenuItems = async () => {
    const options = range(25, 101, 25)

    const items = options.map((item) => {
      return CheckMenuItem.new({
        text: `${item}%`,
        checked: catStore.window.opacity === item,
        action: () => {
          catStore.window.opacity = item
        },
      })
    })

    if (!options.includes(catStore.window.opacity)) {
      items.unshift(CheckMenuItem.new({
        text: `${catStore.window.opacity}%`,
        checked: true,
        enabled: false,
      }))
    }

    return Promise.all(items)
  }

  const getBaseMenu = async () => {
    return await Promise.all([
      MenuItem.new({
        text: t('composables.useAppMenu.labels.preference'),
        accelerator: isMac ? 'Cmd+,' : '',
        action: () => showWindow(WINDOW_LABEL.PREFERENCE),
      }),
      MenuItem.new({
        text: catStore.window.visible ? t('composables.useAppMenu.labels.hideCat') : t('composables.useAppMenu.labels.showCat'),
        action: () => {
          catStore.window.visible = !catStore.window.visible
        },
      }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      Submenu.new({
        text: t('composables.useAppMenu.labels.petSkin'),
        items: await getPetSkinMenuItems(),
      }),
      Submenu.new({
        text: '场景模式',
        items: await Promise.all(MODE_OPTIONS.map(option => CheckMenuItem.new({
          text: option.name,
          checked: companionStore.mode === option.id,
          action: () => {
            companionStore.mode = option.id
          },
        }))),
      }),
      MenuItem.new({
        text: companionStore.focus.status === 'idle' ? '开始 25 分钟专注' : '结束当前专注',
        action: () => {
          if (companionStore.focus.status === 'idle') companionStore.startFocus(25)
          else companionStore.stopFocus()
        },
      }),
      CheckMenuItem.new({
        text: t('composables.useAppMenu.labels.passThrough'),
        checked: catStore.window.passThrough,
        action: () => {
          catStore.window.passThrough = !catStore.window.passThrough
        },
      }),
      CheckMenuItem.new({
        text: t('composables.useAppMenu.labels.alwaysOnTop'),
        checked: catStore.window.alwaysOnTop,
        action: () => {
          catStore.window.alwaysOnTop = !catStore.window.alwaysOnTop
        },
      }),
      MenuItem.new({
        text: petStore.sleeping
          ? t('composables.useAppMenu.labels.wakeUp')
          : t('composables.useAppMenu.labels.sleepNow'),
        action: () => {
          petStore.sleeping ? petStore.wake() : petStore.sleepNow()
        },
      }),
      Submenu.new({
        text: t('composables.useAppMenu.labels.windowSize'),
        items: await getScaleMenuItems(),
      }),
      Submenu.new({
        text: t('composables.useAppMenu.labels.opacity'),
        items: await getOpacityMenuItems(),
      }),
    ])
  }

  const getExitMenu = async () => {
    return await Promise.all([
      MenuItem.new({
        text: t('composables.useAppMenu.labels.restartApp'),
        action: relaunch,
      }),
      MenuItem.new({
        text: t('composables.useAppMenu.labels.quitApp'),
        accelerator: isMac ? 'Cmd+Q' : '',
        action: () => exit(0),
      }),
    ])
  }

  return {
    getBaseMenu,
    getExitMenu,
  }
}
