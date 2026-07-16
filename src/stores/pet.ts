import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

import type { PetSkinId } from '@/constants/pets'
import type { CompanionAction, CompanionEmotion } from '@/utils/companion'

import { DEFAULT_PET_SKIN_ID, getPetSkin, isPetSkinId } from '@/constants/pets'
import { useCompanionStore } from '@/stores/companion'

export type PetAnimationState
  = | 'idle'
    | 'running-right'
    | 'running-left'
    | 'waving'
    | 'tapping'
    | 'jumping'
    | 'failed'
    | 'waiting'
    | 'running'
    | 'review'

export type PetCommand = 'celebrate' | 'sleep' | 'tap' | 'thinking' | 'wake' | 'wave'

const DEFAULT_SLEEP_AFTER_MINUTES = 3
const IDLE_GESTURE_MIN_DELAY = 10_000
const IDLE_GESTURE_DELAY_RANGE = 9_000

export const usePetStore = defineStore('pet', () => {
  const companionStore = useCompanionStore()
  const skinId = ref<PetSkinId>(DEFAULT_PET_SKIN_ID)
  const sleepAfterMinutes = ref(DEFAULT_SLEEP_AFTER_MINUTES)
  const animationState = ref<PetAnimationState>('idle')
  const animationNonce = ref(0)
  const currentEmotion = ref<CompanionEmotion>('neutral')
  const emotionNonce = ref(0)
  const sleeping = ref(false)
  const lastActivityAt = ref(Date.now())
  const look = reactive({ x: 0, y: 0 })

  let animationTimer: number | undefined
  let emotionTimer: number | undefined
  let idleGestureTimer: number | undefined
  let sleepTimer: number | undefined
  let lastMouseReactionAt = 0
  let lastBoundActionAt = 0
  let lastSleepScheduleAt = 0

  const currentSkin = computed(() => getPetSkin(skinId.value))

  function clearTimer(timer: number | undefined) {
    if (timer !== undefined) window.clearTimeout(timer)
  }

  function clearAnimationTimer() {
    clearTimer(animationTimer)
    animationTimer = undefined
  }

  function clearEmotionTimer() {
    clearTimer(emotionTimer)
    emotionTimer = undefined
  }

  function clearIdleGestureTimer() {
    clearTimer(idleGestureTimer)
    idleGestureTimer = undefined
  }

  function clearSleepTimer() {
    clearTimer(sleepTimer)
    sleepTimer = undefined
  }

  function setEmotion(emotion: CompanionEmotion, duration = 1_600) {
    clearEmotionTimer()
    currentEmotion.value = emotion
    emotionNonce.value += 1

    if (emotion === 'neutral' || duration <= 0) return

    emotionTimer = window.setTimeout(() => {
      currentEmotion.value = 'neutral'
      emotionNonce.value += 1
      emotionTimer = undefined
    }, duration)
  }

  function scheduleSleep(force = false) {
    const now = Date.now()

    if (!force && now - lastSleepScheduleAt < 500) return

    lastSleepScheduleAt = now
    clearSleepTimer()

    if (sleepAfterMinutes.value <= 0) return

    const delay = Math.max(10_000, sleepAfterMinutes.value * 60_000)

    sleepTimer = window.setTimeout(() => {
      sleepNow()
    }, delay)
  }

  function scheduleIdleGesture() {
    clearIdleGestureTimer()

    if (sleeping.value) return

    const delay = IDLE_GESTURE_MIN_DELAY + Math.random() * IDLE_GESTURE_DELAY_RANGE

    idleGestureTimer = window.setTimeout(() => {
      idleGestureTimer = undefined

      if (sleeping.value) return

      if (animationState.value !== 'idle') {
        scheduleIdleGesture()
        return
      }

      executeAction(companionStore.actionBindings.idle, false)
    }, delay)
  }

  function wake() {
    const wasSleeping = sleeping.value

    sleeping.value = false
    lastActivityAt.value = Date.now()
    scheduleSleep()
    scheduleIdleGesture()

    if (wasSleeping) {
      setEmotion('happy', 1_200)
    }
  }

  function noteActivity() {
    wake()
  }

  function play(state: PetAnimationState, duration = 1_200, countsAsActivity = true) {
    if (countsAsActivity) {
      noteActivity()
    } else if (sleeping.value) {
      return
    }

    clearAnimationTimer()
    animationState.value = state
    animationNonce.value += 1

    if (state === 'idle' || duration <= 0) {
      scheduleIdleGesture()
      return
    }

    animationTimer = window.setTimeout(() => {
      animationState.value = 'idle'
      animationNonce.value += 1
      animationTimer = undefined
      scheduleIdleGesture()
    }, duration)
  }

  function sleepNow() {
    clearAnimationTimer()
    clearIdleGestureTimer()
    clearSleepTimer()
    sleeping.value = true
    animationState.value = 'idle'
    animationNonce.value += 1
    setEmotion('sleepy', 0)
  }

  function setSkin(id: string) {
    if (!isPetSkinId(id) || id === skinId.value) return

    skinId.value = id
  }

  function reactToKeyboard() {
    setEmotion('excited', 720)
    play('tapping', 460)
  }

  function reactToMouse(button: string) {
    const now = Date.now()

    if (now - lastMouseReactionAt < 300) return

    lastMouseReactionAt = now

    if (button === 'Left') {
      setEmotion('happy', 1_000)
      play('jumping', 820)
      return
    }

    if (button === 'Right') {
      setEmotion('happy', 1_000)
      play('waving', 900)
      return
    }

    play('tapping', 620)
  }

  function setLook(x: number, y: number) {
    look.x = Math.max(-1, Math.min(1, x))
    look.y = Math.max(-1, Math.min(1, y))

    if (!sleeping.value && Date.now() - lastActivityAt.value >= 500) {
      noteActivity()
    }
  }

  function reactToCompanion(action: CompanionAction, emotion: CompanionEmotion, countsAsActivity = true) {
    setEmotion(emotion, action === 'sleep' ? 0 : 2_000)

    if (action === 'sleep') {
      sleepNow()
      return
    }

    let state: PetAnimationState = 'idle'

    if (action === 'celebrate') state = 'jumping'
    if ((action === 'idle' && emotion === 'thinking') || action === 'think') state = 'review'
    if (action === 'failed') state = 'failed'
    if (action === 'tap') state = 'tapping'
    if (action === 'wave') state = 'waving'

    play(state, state === 'idle' ? 0 : 1_650, countsAsActivity)
  }

  function executeAction(action: CompanionAction, countsAsActivity = true) {
    const now = Date.now()
    if (countsAsActivity && now - lastBoundActionAt < 120) return
    if (countsAsActivity) lastBoundActionAt = now

    const emotion: CompanionEmotion = ({
      celebrate: 'excited',
      failed: 'sleepy',
      idle: 'neutral',
      sleep: 'sleepy',
      tap: 'excited',
      think: 'thinking',
      wave: 'happy',
    } satisfies Record<CompanionAction, CompanionEmotion>)[action]

    reactToCompanion(action, emotion, countsAsActivity)
  }

  function executeCommand(command: PetCommand) {
    if (command === 'sleep') return sleepNow()
    if (command === 'wake') return wake()
    if (command === 'tap') return reactToKeyboard()
    if (command === 'wave') return reactToCompanion('wave', 'happy')
    if (command === 'celebrate') return reactToCompanion('celebrate', 'excited')

    return reactToCompanion('idle', 'thinking')
  }

  function init() {
    if (!isPetSkinId(skinId.value)) {
      skinId.value = DEFAULT_PET_SKIN_ID
    }

    scheduleSleep(true)
    scheduleIdleGesture()
  }

  watch(sleepAfterMinutes, () => scheduleSleep(true))

  return {
    animationNonce,
    animationState,
    currentEmotion,
    currentSkin,
    emotionNonce,
    executeCommand,
    executeAction,
    init,
    lastActivityAt,
    look,
    noteActivity,
    play,
    reactToCompanion,
    reactToKeyboard,
    reactToMouse,
    setLook,
    setSkin,
    skinId,
    sleeping,
    sleepAfterMinutes,
    sleepNow,
    wake,
  }
}, {
  tauri: {
    filterKeys: [
      'animationNonce',
      'animationState',
      'currentEmotion',
      'emotionNonce',
      'lastActivityAt',
      'look',
      'sleeping',
    ],
  },
})
