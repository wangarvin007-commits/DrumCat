import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

import type {
  CompanionAction,
  CompanionMessage,
  CompanionMode,
  CompanionPersonality,
} from '@/utils/companion'

import { createMessage } from '@/utils/companion'

export type InteractionTrigger
  = | 'keyboard'
    | 'mouseLeft'
    | 'mouseRight'
    | 'mouseMiddle'
    | 'idle'
    | 'focusComplete'
    | 'reminder'

export interface ReminderItem {
  id: string
  text: string
  dueAt: number
  done: boolean
}

export interface TaskItem {
  id: string
  text: string
  done: boolean
}

export type FocusStatus = 'idle' | 'focus' | 'break' | 'paused'

export const PERSONALITY_OPTIONS: ReadonlyArray<{
  id: CompanionPersonality
  name: string
  description: string
}> = [
  { id: 'warm', name: '温暖搭子', description: '耐心、亲切，会温柔地陪你推进' },
  { id: 'tsundere', name: '轻傲娇', description: '嘴硬心软，但不会刻薄' },
  { id: 'coach', name: '专注教练', description: '少寒暄，优先给出下一步' },
  { id: 'quiet', name: '安静陪伴', description: '低打扰，只在需要时回应' },
]

export const MODE_OPTIONS: ReadonlyArray<{
  id: CompanionMode
  name: string
  description: string
}> = [
  { id: 'companion', name: '陪伴', description: '完整互动与主动关心' },
  { id: 'focus', name: '专注', description: '保留输入动作，减少主动消息' },
  { id: 'quiet', name: '安静', description: '暂停键鼠动作与主动消息' },
  { id: 'meeting', name: '会议', description: '完全静音，只保留手动操作' },
  { id: 'game', name: '游戏', description: '保留点击互动，不发主动消息' },
  { id: 'stream', name: '直播', description: '隐藏私人记忆，适合 OBS 捕捉' },
]

export const ACTION_OPTIONS: ReadonlyArray<{ value: CompanionAction, label: string }> = [
  { value: 'tap', label: '敲鼓 / 挥爪' },
  { value: 'wave', label: '挥手打招呼' },
  { value: 'celebrate', label: '跳起庆祝' },
  { value: 'think', label: '认真思考' },
  { value: 'failed', label: '失落趴下' },
  { value: 'idle', label: '保持安静' },
]

const MAX_MESSAGES = 20
const MAX_REMINDER_MINUTES = 7 * 24 * 60

function normalizeMinutes(value: number, fallback: number, maximum: number) {
  const number = Number(value)

  return Number.isFinite(number)
    ? Math.max(1, Math.min(maximum, Math.round(number)))
    : fallback
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export const useCompanionStore = defineStore('companion', () => {
  const personality = ref<CompanionPersonality>('warm')
  const mode = ref<CompanionMode>('companion')
  const userName = ref('')
  const currentGoal = ref('')
  const memoryNotes = ref('')
  const messages = ref<CompanionMessage[]>([])
  const rememberedMessages = ref<CompanionMessage[]>([])
  const sessionApiKey = ref('')

  const ai = reactive({
    enabled: false,
    endpoint: 'https://api.openai.com',
    model: 'gpt-4.1-mini',
    streaming: true,
  })

  const privacy = reactive({
    rememberConversation: true,
    keyboardInteraction: true,
    mouseInteraction: true,
    systemNotifications: true,
    voiceInput: false,
    voiceOutput: false,
    imageUnderstanding: false,
  })

  const proactive = reactive({
    enabled: true,
    maxPerDay: 3,
    sentToday: 0,
    sentDate: '',
  })

  const actionBindings = reactive<Record<InteractionTrigger, CompanionAction>>({
    keyboard: 'tap',
    mouseLeft: 'celebrate',
    mouseRight: 'wave',
    mouseMiddle: 'tap',
    idle: 'think',
    focusComplete: 'celebrate',
    reminder: 'wave',
  })

  const focus = reactive({
    status: 'idle' as FocusStatus,
    resumeStatus: 'focus' as Exclude<FocusStatus, 'paused' | 'idle'>,
    focusMinutes: 25,
    breakMinutes: 5,
    remainingSeconds: 25 * 60,
    endsAt: 0,
    completedSessions: 0,
  })

  const reminders = ref<ReminderItem[]>([])
  const tasks = ref<TaskItem[]>([])

  const activeTask = computed(() => tasks.value.find(task => !task.done))
  const pendingReminders = computed(() => reminders.value
    .filter(reminder => !reminder.done)
    .sort((first, second) => first.dueAt - second.dueAt))
  const focusProgress = computed(() => {
    const activeStatus = focus.status === 'paused' ? focus.resumeStatus : focus.status
    const total = (activeStatus === 'break' ? focus.breakMinutes : focus.focusMinutes) * 60
    return total > 0 ? Math.max(0, Math.min(1, 1 - focus.remainingSeconds / total)) : 0
  })
  const interactionMuted = computed(() => mode.value === 'quiet' || mode.value === 'meeting')

  function init() {
    if (privacy.rememberConversation && rememberedMessages.value.length) {
      messages.value = rememberedMessages.value.slice(-MAX_MESSAGES)
    }

    if (!messages.value.length) {
      messages.value = [createMessage('assistant', '你好，我是 DrumCat。可以聊天、开番茄钟，或者直接说“20 分钟后提醒我喝水”。', {
        emotion: 'happy',
        action: 'wave',
      })]
    }

    if ((focus.status === 'focus' || focus.status === 'break') && focus.endsAt > Date.now()) {
      syncClock()
    }
  }

  function addMessage(message: CompanionMessage) {
    messages.value.push(message)
    messages.value = messages.value.slice(-MAX_MESSAGES)
    syncRememberedMessages()
  }

  function updateMessage(id: string, content: string, extra: Partial<Pick<CompanionMessage, 'emotion' | 'action'>> = {}) {
    const target = messages.value.find(message => message.id === id)
    if (!target) return
    target.content = content
    Object.assign(target, extra)
    syncRememberedMessages()
  }

  function clearMessages() {
    messages.value = [createMessage('assistant', '聊天记录已经清空。我们重新开始吧。', {
      emotion: 'happy',
      action: 'wave',
    })]
    rememberedMessages.value = privacy.rememberConversation ? [...messages.value] : []
  }

  function syncRememberedMessages() {
    rememberedMessages.value = privacy.rememberConversation
      ? messages.value.map(message => ({ ...message, attachment: message.attachment ? { ...message.attachment } : undefined }))
      : []
  }

  function addTask(text: string) {
    const value = text.trim()
    if (!value) return
    tasks.value.unshift({ id: nanoid(), text: value, done: false })
    tasks.value = tasks.value.slice(0, 20)
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter(task => task.id !== id)
  }

  function addReminder(text: string, minutes: number) {
    const value = text.trim()
    if (!value) return
    const safeMinutes = normalizeMinutes(minutes, 1, MAX_REMINDER_MINUTES)

    const reminder: ReminderItem = {
      id: nanoid(),
      text: value,
      dueAt: Date.now() + safeMinutes * 60_000,
      done: false,
    }
    reminders.value.push(reminder)
    reminders.value = reminders.value
      .sort((first, second) => first.dueAt - second.dueAt)
      .slice(0, 50)
    return reminder
  }

  function removeReminder(id: string) {
    reminders.value = reminders.value.filter(reminder => reminder.id !== id)
  }

  function dueReminders(now = Date.now()): ReminderItem[] {
    const due = reminders.value.filter(item => !item.done && item.dueAt <= now)
    due.forEach((item) => {
      item.done = true
    })
    reminders.value = reminders.value.filter(item => !item.done || now - item.dueAt < 24 * 60 * 60_000)
    return due
  }

  function startFocus(minutes = focus.focusMinutes) {
    focus.focusMinutes = normalizeMinutes(minutes, 25, 180)
    focus.status = 'focus'
    focus.resumeStatus = 'focus'
    focus.remainingSeconds = focus.focusMinutes * 60
    focus.endsAt = Date.now() + focus.remainingSeconds * 1000
    mode.value = 'focus'
  }

  function startBreak(minutes = focus.breakMinutes) {
    focus.breakMinutes = normalizeMinutes(minutes, 5, 60)
    focus.status = 'break'
    focus.resumeStatus = 'break'
    focus.remainingSeconds = focus.breakMinutes * 60
    focus.endsAt = Date.now() + focus.remainingSeconds * 1000
  }

  function pauseFocus() {
    if (focus.status !== 'focus' && focus.status !== 'break') return
    syncClock()
    focus.resumeStatus = focus.status
    focus.status = 'paused'
    focus.endsAt = 0
  }

  function resumeFocus() {
    if (focus.status !== 'paused') return
    focus.status = focus.resumeStatus
    focus.endsAt = Date.now() + focus.remainingSeconds * 1000
  }

  function stopFocus() {
    focus.status = 'idle'
    focus.remainingSeconds = focus.focusMinutes * 60
    focus.endsAt = 0
    if (mode.value === 'focus') mode.value = 'companion'
  }

  function syncClock(now = Date.now()): 'focus-complete' | 'break-complete' | undefined {
    if (focus.status !== 'focus' && focus.status !== 'break') return

    focus.remainingSeconds = Math.max(0, Math.ceil((focus.endsAt - now) / 1000))
    if (focus.remainingSeconds > 0) return

    if (focus.status === 'focus') {
      focus.completedSessions += 1
      focus.status = 'idle'
      focus.endsAt = 0
      return 'focus-complete'
    }

    focus.status = 'idle'
    focus.endsAt = 0
    return 'break-complete'
  }

  function canSendProactive(now = new Date()) {
    const day = getLocalDateKey(now)
    if (proactive.sentDate !== day) {
      proactive.sentDate = day
      proactive.sentToday = 0
    }

    return proactive.enabled
      && mode.value === 'companion'
      && proactive.sentToday < proactive.maxPerDay
  }

  function noteProactiveSent() {
    proactive.sentToday += 1
  }

  watch(() => privacy.rememberConversation, (enabled) => {
    if (enabled) syncRememberedMessages()
    else rememberedMessages.value = []
  }, { flush: 'sync' })

  return {
    actionBindings,
    activeTask,
    addMessage,
    addReminder,
    addTask,
    ai,
    canSendProactive,
    clearMessages,
    currentGoal,
    dueReminders,
    focus,
    focusProgress,
    init,
    interactionMuted,
    memoryNotes,
    messages,
    mode,
    noteProactiveSent,
    pendingReminders,
    pauseFocus,
    personality,
    privacy,
    proactive,
    rememberedMessages,
    reminders,
    removeReminder,
    removeTask,
    resumeFocus,
    sessionApiKey,
    startBreak,
    startFocus,
    stopFocus,
    syncClock,
    tasks,
    updateMessage,
    userName,
  }
}, {
  tauri: {
    filterKeys: ['sessionApiKey', 'messages'],
  },
})
