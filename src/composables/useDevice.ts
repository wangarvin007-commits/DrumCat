import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { error as logError } from '@tauri-apps/plugin-log'
import { useThrottleFn } from '@vueuse/core'
import { isNil } from 'es-toolkit'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAppStore } from '@/stores/app'
import { useCatStore } from '@/stores/cat'
import { useCompanionStore } from '@/stores/companion'
import { usePetStore } from '@/stores/pet'
import { createHoverAvoidanceController } from '@/utils/hover'
import { inBetween } from '@/utils/is'
import { isMac } from '@/utils/platform'

import { INVOKE_KEY, LISTEN_KEY, WINDOW_LABEL } from '../constants'
import { useTauriListen } from './useTauriListen'

interface MouseButtonEvent {
  kind: 'MousePress' | 'MouseRelease'
  value: string
}

export interface CursorPoint {
  x: number
  y: number
}

interface MouseMoveEvent {
  kind: 'MouseMove'
  value: CursorPoint
}

interface KeyboardEvent {
  kind: 'KeyboardPress' | 'KeyboardRelease'
  value: string
}

type DeviceEvent = MouseButtonEvent | MouseMoveEvent | KeyboardEvent

const appWindow = getCurrentWebviewWindow()

export function useDevice() {
  const appStore = useAppStore()
  const catStore = useCatStore()
  const companionStore = useCompanionStore()
  const petStore = usePetStore()
  const scaleFactor = ref(1)
  const hoverHidden = ref(false)
  const pointerThrottle = computed(() => 1_000 / Math.max(15, catStore.model.maxFPS))
  let unlistenScaleChange: (() => void) | undefined

  function applyCursorPolicy() {
    document.body.style.setProperty('opacity', hoverHidden.value ? '0' : 'unset')
    void appWindow.setIgnoreCursorEvents(catStore.window.passThrough || hoverHidden.value)
  }

  const hoverAvoidance = createHoverAvoidanceController((hidden) => {
    hoverHidden.value = hidden
    applyCursorPolicy()
  })

  onMounted(async () => {
    scaleFactor.value = isMac ? await appWindow.scaleFactor() : 1

    unlistenScaleChange = await appWindow.onScaleChanged(({ payload }) => {
      if (!isMac) return

      scaleFactor.value = payload.scaleFactor
    })
  })

  onBeforeUnmount(() => {
    unlistenScaleChange?.()
    hoverAvoidance.reset()
  })

  watch(
    [() => catStore.window.passThrough, () => catStore.window.hideOnHover],
    ([, hideOnHover]) => {
      if (!hideOnHover) hoverAvoidance.reset()
      applyCursorPolicy()
    },
    { immediate: true },
  )

  const startListening = async () => {
    try {
      await invoke(INVOKE_KEY.START_DEVICE_LISTENING)
    } catch (reason) {
      logError(`全局键鼠监听启动失败：${String(reason)}`)
    }
  }

  function updateHoverAvoidance(x: number, y: number) {
    const { x: winX, y: winY, width, height } = appStore.windowState[WINDOW_LABEL.MAIN] ?? {}

    if (isNil(winX) || isNil(winY) || isNil(width) || isNil(height)) return

    hoverAvoidance.update({
      delayMs: Math.max(0, catStore.window.hideOnHoverDelay) * 1000,
      enabled: catStore.window.hideOnHover,
      inside: inBetween(x, winX, winX + width)
        && inBetween(y, winY, winY + height),
    })
  }

  const handleCursorMove = useThrottleFn((cursorPoint: CursorPoint) => {
    const x = cursorPoint.x * scaleFactor.value
    const y = cursorPoint.y * scaleFactor.value
    const { x: winX, y: winY, width, height } = appStore.windowState[WINDOW_LABEL.MAIN] ?? {}

    if (companionStore.privacy.mouseInteraction
      && !companionStore.interactionMuted
      && !isNil(winX)
      && !isNil(winY)
      && !isNil(width)
      && !isNil(height)) {
      const centerX = winX + width / 2
      const centerY = winY + height / 2
      const mirror = catStore.model.mouseMirror ? -1 : 1
      const lookX = (x - centerX) / Math.max(width * 0.8, 1) * mirror
      const lookY = (y - centerY) / Math.max(height * 0.8, 1)

      petStore.setLook(lookX, lookY)
    }

    updateHoverAvoidance(x, y)
  }, pointerThrottle)

  const handleKeyboardPress = useThrottleFn(() => {
    if (!companionStore.privacy.keyboardInteraction
      || companionStore.interactionMuted
      || companionStore.mode === 'game') {
      return
    }

    if (catStore.model.behavior) {
      petStore.executeAction(companionStore.actionBindings.keyboard)
    } else {
      petStore.noteActivity()
    }
  }, 80)

  useTauriListen<DeviceEvent>(LISTEN_KEY.DEVICE_CHANGED, ({ payload }) => {
    const { kind, value } = payload

    if (kind === 'KeyboardPress') {
      return handleKeyboardPress()
    }

    if (kind === 'KeyboardRelease') {
      return
    }

    if (kind === 'MouseMove') {
      return handleCursorMove(value)
    }

    if (!companionStore.privacy.mouseInteraction
      || companionStore.interactionMuted) {
      return
    }

    if (kind === 'MousePress' && catStore.model.behavior) {
      const trigger = value === 'Left'
        ? 'mouseLeft'
        : value === 'Right'
          ? 'mouseRight'
          : 'mouseMiddle'

      return petStore.executeAction(companionStore.actionBindings[trigger])
    }

    petStore.noteActivity()
  })

  useTauriListen<string>(LISTEN_KEY.DEVICE_LISTENING_ERROR, ({ payload }) => {
    logError(payload)
  })

  return {
    startListening,
  }
}
