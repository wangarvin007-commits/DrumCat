<script setup lang="ts">
import { LogicalSize } from '@tauri-apps/api/dpi'
import { Menu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { round } from 'es-toolkit'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { PetCommand } from '@/stores/pet'
import type {
  ChatSendPayload,
  CompanionAction,
  CompanionEmotion,
} from '@/utils/companion'

import CompanionChat from '@/components/companion-chat/index.vue'
import PetSkinPicker from '@/components/pet-skin-picker/index.vue'
import PetSprite from '@/components/pet-sprite/index.vue'
import { useAppMenu } from '@/composables/useAppMenu'
import { useDevice } from '@/composables/useDevice'
import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import { PET_SKINS } from '@/constants/pets'
import { hideWindow, setAlwaysOnTop, setTaskbarVisibility, showWindow } from '@/plugins/window'
import { useCatStore } from '@/stores/cat'
import { useCompanionStore } from '@/stores/companion'
import { useGeneralStore } from '@/stores/general'
import { usePetStore } from '@/stores/pet'
import {
  createCompanionReply,
  createMessage,
  getCompanionSystemPrompt,
  parseDirectCommand,
  speakText,
  streamCompanionReply,
} from '@/utils/companion'
import { sendSystemNotification } from '@/utils/notification'
import { isWindows } from '@/utils/platform'

const BASE_WINDOW_SIZE = { width: 320, height: 347 }
const PANEL_WIDTH = 372
const PANEL_HEIGHT = 520
const MIN_PANEL_PET_SCALE = 92

type OpenPanel = 'chat' | 'skins' | null

const { startListening } = useDevice()
const appWindow = getCurrentWebviewWindow()
const catStore = useCatStore()
const companionStore = useCompanionStore()
const petStore = usePetStore()
const generalStore = useGeneralStore()
const { getBaseMenu, getExitMenu } = useAppMenu()
const openPanel = ref<OpenPanel>(null)
const chatBusy = ref(false)
const bubbleText = ref('')
const bubbleVisible = ref(false)

let dragCandidate: { x: number, y: number } | undefined
let applyingScale = false
let bubbleTimer: number | undefined
let clockTimer: number | undefined
let proactiveTimer: number | undefined
let chatAbortController: AbortController | undefined

const panelOpen = computed(() => openPanel.value !== null)
const displayScale = computed(() => panelOpen.value
  ? Math.max(catStore.window.scale, MIN_PANEL_PET_SCALE)
  : catStore.window.scale)
const petViewportSize = computed(() => ({
  width: Math.round(BASE_WINDOW_SIZE.width * displayScale.value / 100),
  height: Math.round(BASE_WINDOW_SIZE.height * displayScale.value / 100),
}))
const shellStyle = computed(() => ({
  '--pet-width': `${petViewportSize.value.width}px`,
  '--pet-height': `${petViewportSize.value.height}px`,
  '--pet-opacity': catStore.window.opacity / 100,
}))
const modeLabel = computed(() => ({
  companion: '陪伴中',
  focus: '专注中',
  quiet: '安静模式',
  meeting: '会议模式',
  game: '游戏模式',
  stream: '直播模式',
})[companionStore.mode])

onMounted(() => {
  startListening()
  petStore.wake()

  clockTimer = window.setInterval(handleClockTick, 1_000)
  proactiveTimer = window.setInterval(handleProactiveCheck, 60_000)
})

onBeforeUnmount(() => {
  if (bubbleTimer) window.clearTimeout(bubbleTimer)
  if (clockTimer) window.clearInterval(clockTimer)
  if (proactiveTimer) window.clearInterval(proactiveTimer)
  chatAbortController?.abort()
})

useTauriListen<PetCommand>(LISTEN_KEY.PET_COMMAND, ({ payload }) => {
  petStore.executeCommand(payload)
})

useTauriListen(LISTEN_KEY.TOGGLE_CHAT, () => {
  togglePanel('chat')
})

watch(() => petStore.skinId, (skinId, previousSkinId) => {
  if (!previousSkinId || skinId === previousSkinId) return
  petStore.play('jumping', 1_100)
})

useEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
  event.preventDefault()
  togglePanel('chat')
})

watch([() => catStore.window.scale, panelOpen], async () => {
  applyingScale = true

  await appWindow.setSize(new LogicalSize(
    petViewportSize.value.width + (panelOpen.value ? PANEL_WIDTH : 0),
    Math.max(petViewportSize.value.height, panelOpen.value ? PANEL_HEIGHT : 0),
  ))

  window.setTimeout(() => {
    applyingScale = false
  }, 120)
}, { immediate: true })

const syncScaleFromWindow = useDebounceFn(async () => {
  if (applyingScale || panelOpen.value) return

  const size = await appWindow.innerSize()
  const scaleFactor = await appWindow.scaleFactor()
  const logicalWidth = size.width / scaleFactor
  const nextScale = round(logicalWidth / BASE_WINDOW_SIZE.width * 100)

  if (Math.abs(nextScale - catStore.window.scale) < 1) return
  catStore.window.scale = Math.max(25, Math.min(250, nextScale))
}, 120)

useEventListener('resize', syncScaleFromWindow)

watch(() => catStore.window.visible, async (value) => {
  value ? await showWindow() : await hideWindow()
})

watch(() => catStore.window.alwaysOnTop, setAlwaysOnTop, { immediate: true })
watch(() => generalStore.app.taskbarVisible, setTaskbarVisibility, { immediate: true })

function getCompanionContext() {
  const hidePrivateProfile = companionStore.mode === 'stream'

  return {
    personality: companionStore.personality,
    userName: hidePrivateProfile ? '' : companionStore.userName,
    currentGoal: hidePrivateProfile ? '' : companionStore.currentGoal,
    memoryNotes: hidePrivateProfile ? '' : companionStore.memoryNotes,
  }
}

function showBubble(content: string, duration = 5_000) {
  if (openPanel.value === 'chat') return
  if (bubbleTimer) window.clearTimeout(bubbleTimer)

  bubbleText.value = content
  bubbleVisible.value = true
  bubbleTimer = window.setTimeout(() => {
    bubbleVisible.value = false
  }, duration)
}

function presentAssistantMessage(
  content: string,
  action: CompanionAction = 'wave',
  emotion: CompanionEmotion = 'happy',
  addToHistory = true,
) {
  if (addToHistory) {
    companionStore.addMessage(createMessage('assistant', content, { action, emotion }))
  }

  petStore.reactToCompanion(action, emotion)
  showBubble(content)

  if (companionStore.privacy.voiceOutput && companionStore.mode !== 'meeting') {
    speakText(content)
  }
}

function inferPresentation(content: string): { action: CompanionAction, emotion: CompanionEmotion } {
  if (/完成|成功|太棒|做到了|恭喜/u.test(content)) return { action: 'celebrate', emotion: 'excited' }
  if (/休息|困|晚安|睡/u.test(content)) return { action: 'wave', emotion: 'sleepy' }
  if (/抱歉|失败|错误|不行/u.test(content)) return { action: 'failed', emotion: 'thinking' }
  if (/想想|分析|步骤|建议/u.test(content)) return { action: 'think', emotion: 'thinking' }
  return { action: 'wave', emotion: 'happy' }
}

async function executeDirectCommand(content: string): Promise<boolean> {
  const command = parseDirectCommand(content)
  if (!command) return false

  if (command.type === 'sleep') {
    presentAssistantMessage('好，我先安静睡一会儿。叫我“醒醒”就行。', 'sleep', 'sleepy')
    return true
  }

  if (command.type === 'wake') {
    petStore.wake()
    presentAssistantMessage('我醒啦，又可以陪你了。', 'wave', 'happy')
    return true
  }

  if (command.type === 'focus') {
    companionStore.startFocus(command.minutes)
    presentAssistantMessage(`计时开始：专注 ${command.minutes} 分钟。我会安静陪着你。`, 'think', 'thinking')
    return true
  }

  if (command.type === 'reminder') {
    companionStore.addReminder(command.text, command.minutes)
    presentAssistantMessage(`记住了，${command.minutes} 分钟后提醒你：${command.text}`, 'wave', 'happy')
    return true
  }

  if (command.type === 'mode') {
    companionStore.mode = command.mode
    presentAssistantMessage(`已经切换到${modeLabel.value}。`, command.mode === 'meeting' ? 'idle' : 'wave', 'happy')
    return true
  }

  const query = command.query.replace(/猫猫|狗狗|猫|狗|皮肤/gu, '').trim().toLowerCase()
  if (!query) {
    openPanel.value = 'skins'
    presentAssistantMessage('衣橱已经打开，选一位今天陪你的搭子吧。', 'wave', 'happy')
    return true
  }

  if (/定制|专属|二维码|微信/u.test(query)) {
    openPanel.value = 'skins'
    presentAssistantMessage('衣橱最下方有“定制你的专属皮肤”，点开就能扫码联系 Arvin。', 'wave', 'happy')
    return true
  }

  const skin = PET_SKINS.find(item => [item.name, item.breed, item.id]
    .some(value => value.toLowerCase().includes(query) || query.includes(value.toLowerCase())))

  if (!skin) {
    presentAssistantMessage('我没找到这套皮肤。打开爪印按钮可以查看全部皮肤。', 'think', 'thinking')
    return true
  }

  petStore.setSkin(skin.id)
  presentAssistantMessage(`已经换成${skin.name}，新造型怎么样？`, 'celebrate', 'excited')
  return true
}

async function handleSendMessage(payload: ChatSendPayload) {
  const content = payload.content.trim() || (payload.image ? '看看这张图片' : '')
  if (!content || chatBusy.value) return

  companionStore.addMessage(createMessage('user', content, {
    attachment: payload.image ? { name: payload.image.name, type: payload.image.type } : undefined,
  }))
  chatBusy.value = true
  petStore.play('review', 900)

  if (await executeDirectCommand(content)) {
    chatBusy.value = false
    return
  }

  const canUseImage = Boolean(payload.image && companionStore.privacy.imageUnderstanding)
  const canUseRemoteAi = companionStore.ai.enabled
    && Boolean(companionStore.ai.endpoint.trim())
    && Boolean(companionStore.ai.model.trim())
    && Boolean(companionStore.sessionApiKey.trim())

  if (canUseRemoteAi) {
    const placeholder = createMessage('assistant', '')
    companionStore.addMessage(placeholder)
    chatAbortController = new AbortController()
    let streamed = ''

    try {
      const reply = await streamCompanionReply({
        apiKey: companionStore.sessionApiKey,
        endpoint: companionStore.ai.endpoint,
        imageDataUrl: canUseImage ? payload.image?.dataUrl : undefined,
        messages: companionStore.messages.filter(message => message.id !== placeholder.id),
        model: companionStore.ai.model,
        stream: companionStore.ai.streaming,
        systemPrompt: getCompanionSystemPrompt(getCompanionContext()),
        signal: chatAbortController.signal,
        onDelta(delta) {
          streamed += delta
          companionStore.updateMessage(placeholder.id, streamed)
        },
      })

      if (!reply) throw new Error('接口没有返回内容')
      const presentation = inferPresentation(reply)
      companionStore.updateMessage(placeholder.id, reply, presentation)
      petStore.reactToCompanion(presentation.action, presentation.emotion)
      showBubble(reply)
      if (companionStore.privacy.voiceOutput && companionStore.mode !== 'meeting') speakText(reply)
    } catch (error) {
      const fallback = createCompanionReply(content, getCompanionContext())
      const detail = error instanceof Error ? error.message : String(error)
      const safeDetail = detail.length > 80 ? `${detail.slice(0, 80)}…` : detail
      const reply = `${fallback.content}\n\nAI 接口暂时不可用，已切回本地模式（${safeDetail}）`
      companionStore.updateMessage(placeholder.id, reply, fallback)
      petStore.reactToCompanion(fallback.action, fallback.emotion)
      showBubble(reply)
      if (companionStore.privacy.voiceOutput && companionStore.mode !== 'meeting') speakText(reply)
    } finally {
      chatAbortController = undefined
      chatBusy.value = false
    }

    return
  }

  window.setTimeout(() => {
    let reply = createCompanionReply(content, getCompanionContext())

    if (payload.image) {
      reply = canUseImage
        ? { content: '图片理解需要先在设置里启用 AI 接口并填入本次会话密钥；图片不会在本地模式中上传。', emotion: 'thinking', action: 'think' }
        : { content: `我看到了附件“${payload.image.name}”。图片理解目前被隐私设置关闭，所以我不会读取或上传它。`, emotion: 'thinking', action: 'think' }
    }

    presentAssistantMessage(reply.content, reply.action, reply.emotion)
    chatBusy.value = false
  }, 260)
}

function handleClockTick() {
  const focusEvent = companionStore.syncClock()

  if (focusEvent === 'focus-complete') {
    companionStore.startBreak()
    const message = `这一轮专注完成！现在休息 ${companionStore.focus.breakMinutes} 分钟。`
    presentAssistantMessage(message, companionStore.actionBindings.focusComplete, 'excited')
    if (companionStore.privacy.systemNotifications) {
      void sendSystemNotification('DrumCat · 专注完成', message)
    }
  } else if (focusEvent === 'break-complete') {
    companionStore.mode = 'companion'
    const message = '休息结束，状态已经补满。准备好再开下一轮。'
    presentAssistantMessage(message, 'wave', 'happy')
    if (companionStore.privacy.systemNotifications) {
      void sendSystemNotification('DrumCat · 休息结束', message)
    }
  }

  for (const reminder of companionStore.dueReminders()) {
    const message = `提醒时间到：${reminder.text}`
    presentAssistantMessage(message, companionStore.actionBindings.reminder, 'excited')
    if (companionStore.privacy.systemNotifications) {
      void sendSystemNotification('DrumCat · 提醒', reminder.text)
    }
  }
}

function handleProactiveCheck() {
  if (chatBusy.value || Date.now() - petStore.lastActivityAt < 20 * 60_000) return
  if (!companionStore.canSendProactive()) return

  companionStore.noteProactiveSent()
  presentAssistantMessage('坐得有点久啦，喝口水、看看远处，再继续也不迟。', 'wave', 'happy')
}

function handleMouseDown(event: MouseEvent) {
  petStore.noteActivity()
  if (event.button !== 0) return
  dragCandidate = { x: event.screenX, y: event.screenY }
}

function handleMouseUp(event: MouseEvent) {
  if (event.button === 0
    && dragCandidate
    && catStore.model.behavior
    && companionStore.privacy.mouseInteraction
    && !companionStore.interactionMuted) {
    petStore.executeAction(companionStore.actionBindings.mouseLeft)
  }

  dragCandidate = undefined
}

async function handleContextmenu(event: MouseEvent) {
  event.preventDefault()
  if (event.shiftKey) return

  if (catStore.model.behavior
    && companionStore.privacy.mouseInteraction
    && !companionStore.interactionMuted) {
    petStore.executeAction(companionStore.actionBindings.mouseRight)
  }

  const menu = await Menu.new({
    items: [
      ...await getBaseMenu(),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      ...await getExitMenu(),
    ],
  })

  const restoreTopmost = isWindows && catStore.window.alwaysOnTop

  if (restoreTopmost) await setAlwaysOnTop(false)

  try {
    await menu.popup()
  } finally {
    if (restoreTopmost) await setAlwaysOnTop(true)
  }
}

function handleMouseMove(event: MouseEvent) {
  const { buttons, shiftKey, movementX, movementY } = event

  if (buttons === 1 && dragCandidate) {
    const distance = Math.hypot(event.screenX - dragCandidate.x, event.screenY - dragCandidate.y)

    if (distance >= 4) {
      dragCandidate = undefined
      void appWindow.startDragging()
      return
    }
  }

  if (buttons !== 2 || !shiftKey) return
  const delta = (movementX + movementY) * 0.5
  catStore.window.scale = round(Math.max(25, Math.min(catStore.window.scale + delta, 250)))
}

function togglePanel(panel: Exclude<OpenPanel, null>) {
  openPanel.value = openPanel.value === panel ? null : panel
}

function openSettings() {
  void showWindow(WINDOW_LABEL.PREFERENCE)
}

function handlePanelAction(action: CompanionAction) {
  petStore.executeAction(action)
}
</script>

<template>
  <main
    class="pet-shell"
    :class="{ 'has-panel': panelOpen }"
    :style="shellStyle"
    @contextmenu="handleContextmenu"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
  >
    <div class="pet-viewport">
      <Transition name="bubble">
        <button
          v-if="bubbleVisible && bubbleText"
          class="speech-bubble"
          type="button"
          @click.stop="togglePanel('chat')"
          @mousedown.stop
        >
          {{ bubbleText }}
        </button>
      </Transition>

      <PetSprite
        :animation-nonce="petStore.animationNonce"
        :animation-speed="catStore.model.animationSpeed"
        :emotion="petStore.currentEmotion"
        :emotion-nonce="petStore.emotionNonce"
        :look="petStore.look"
        :mirror="catStore.model.mirror"
        :reduced-motion="catStore.model.reducedMotion"
        :skin="petStore.currentSkin"
        :sleeping="petStore.sleeping"
        :state="petStore.animationState"
      />

      <div
        class="pet-toolbar"
        @mousedown.stop
      >
        <button
          :class="{ active: openPanel === 'skins' }"
          data-testid="open-skins"
          title="切换皮肤"
          type="button"
          @click.stop="togglePanel('skins')"
        >
          <span class="i-solar:paw-bold" />
        </button>
        <button
          :class="{ active: openPanel === 'chat' }"
          data-testid="open-chat"
          title="打开陪伴面板（⌘/Ctrl + K）"
          type="button"
          @click.stop="togglePanel('chat')"
        >
          <span class="i-solar:chat-round-dots-bold" />
        </button>
        <button
          data-testid="open-settings"
          title="设置"
          type="button"
          @click.stop="openSettings"
        >
          <span class="i-solar:settings-minimalistic-bold" />
        </button>
      </div>

      <div class="mode-chip">
        <span />
        {{ modeLabel }}
      </div>
    </div>

    <PetSkinPicker
      v-if="openPanel === 'skins'"
      @close="openPanel = null"
    />

    <CompanionChat
      v-if="openPanel === 'chat'"
      :busy="chatBusy"
      :messages="companionStore.messages"
      @action="handlePanelAction"
      @close="openPanel = null"
      @open-settings="openSettings"
      @send="handleSendMessage"
    />
  </main>
</template>

<style scoped>
.pet-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family:
    Inter,
    ui-rounded,
    -apple-system,
    BlinkMacSystemFont,
    'SF Pro Text',
    'Segoe UI',
    sans-serif;
}

.pet-viewport {
  position: absolute;
  bottom: 0;
  left: 0;
  width: var(--pet-width);
  height: var(--pet-height);
  overflow: hidden;
  opacity: var(--pet-opacity);
}

.pet-toolbar {
  position: absolute;
  z-index: 24;
  top: 12px;
  right: 10px;
  display: flex;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 14px;
  background: rgba(249, 250, 252, 0.76);
  box-shadow: 0 8px 24px rgba(38, 43, 57, 0.13);
  opacity: 0;
  backdrop-filter: blur(20px) saturate(1.2);
  transform: translateY(-5px);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.pet-viewport:hover .pet-toolbar,
.pet-toolbar:focus-within,
.has-panel .pet-toolbar {
  opacity: 1;
  transform: translateY(0);
}

.pet-toolbar button {
  display: grid;
  width: 31px;
  height: 31px;
  border: 0;
  border-radius: 10px;
  place-items: center;
  background: transparent;
  color: #626b7b;
  cursor: pointer;
  font-size: 17px;
  transition:
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.pet-toolbar button:hover {
  background: rgba(112, 126, 151, 0.1);
  color: #303746;
  transform: translateY(-1px);
}

.pet-toolbar button.active {
  background: #e7edff;
  color: #5873cb;
}

.mode-chip {
  position: absolute;
  z-index: 8;
  bottom: 7px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 999px;
  padding: 4px 9px;
  background: rgba(250, 251, 253, 0.72);
  box-shadow: 0 5px 16px rgba(38, 43, 57, 0.1);
  color: #6d7585;
  font-size: 10px;
  font-weight: 650;
  opacity: 0;
  pointer-events: none;
  backdrop-filter: blur(16px);
  transform: translateX(-50%) translateY(5px);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.mode-chip span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7bb891;
  box-shadow: 0 0 0 3px rgba(123, 184, 145, 0.13);
}

.pet-viewport:hover .mode-chip,
.has-panel .mode-chip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.speech-bubble {
  position: absolute;
  z-index: 22;
  top: 14px;
  left: 14px;
  width: min(205px, calc(100% - 70px));
  max-height: 72px;
  overflow: hidden;
  border: 1px solid rgba(218, 222, 232, 0.9);
  border-radius: 16px 16px 16px 5px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 11px 28px rgba(43, 48, 62, 0.16);
  color: #424956;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  backdrop-filter: blur(18px);
}

.bubble-enter-active,
.bubble-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(5px) scale(0.97);
}
</style>
