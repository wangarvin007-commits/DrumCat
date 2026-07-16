<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { ChatSendPayload, CompanionAction, CompanionMessage } from '@/utils/companion'

import { MODE_OPTIONS, useCompanionStore } from '@/stores/companion'
import { usePetStore } from '@/stores/pet'
import { getAiProviderPreset } from '@/utils/companion'

const props = withDefaults(defineProps<{
  aiReady?: boolean
  messages: CompanionMessage[]
  busy?: boolean
}>(), {
  aiReady: false,
  busy: false,
})

const emit = defineEmits<{
  action: [value: CompanionAction]
  close: []
  openSettings: []
  send: [payload: ChatSendPayload]
}>()

const companionStore = useCompanionStore()
const petStore = usePetStore()
const activeTab = ref<'chat' | 'focus' | 'actions'>('chat')
const draft = ref('')
const taskDraft = ref('')
const selectedImage = ref<ChatSendPayload['image']>()
const attachmentError = ref('')
const messagesRef = ref<HTMLElement>()
const fileInput = ref<HTMLInputElement>()

const quickPrompts = ['给我加油', '敲鼓给我听', '帮我拆下一步']
const focusTime = computed(() => {
  const minutes = Math.floor(companionStore.focus.remainingSeconds / 60).toString().padStart(2, '0')
  const seconds = (companionStore.focus.remainingSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
})
const focusLabel = computed(() => ({
  idle: '准备开始',
  focus: '保持专注',
  break: '放松一下',
  paused: '已暂停',
})[companionStore.focus.status])
const focusRingStyle = computed(() => ({
  background: `conic-gradient(#6f88dc ${companionStore.focusProgress * 360}deg, #e9edf5 0deg)`,
}))
const activeTask = computed(() => companionStore.activeTask?.text || '这一轮只做一件事')
const aiStatusLabel = computed(() => {
  if (!companionStore.ai.enabled) return '本地陪伴模式'
  if (!props.aiReady) return 'AI 已开启，等待完整配置'
  return `${getAiProviderPreset(companionStore.ai.provider).name} 已连接`
})

watch(() => props.messages.length, async () => {
  await nextTick()
  messagesRef.value?.scrollTo({ top: messagesRef.value.scrollHeight, behavior: 'smooth' })
})

watch(activeTab, async (tab) => {
  if (tab !== 'chat') return
  await nextTick()
  messagesRef.value?.scrollTo({ top: messagesRef.value.scrollHeight })
})

function submit() {
  const value = draft.value.trim()
  if ((!value && !selectedImage.value) || props.busy) return

  emit('send', { content: value, image: selectedImage.value })
  draft.value = ''
  selectedImage.value = undefined
  attachmentError.value = ''
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}

function sendQuickPrompt(value: string) {
  if (props.busy) return
  emit('send', { content: value })
}

function startFocus() {
  emit('send', { content: `专注 ${companionStore.focus.focusMinutes} 分钟` })
  activeTab.value = 'focus'
}

function toggleFocusPause() {
  if (companionStore.focus.status === 'paused') companionStore.resumeFocus()
  else companionStore.pauseFocus()
}

function addTask() {
  companionStore.addTask(taskDraft.value)
  taskDraft.value = ''
}

function formatReminderTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function triggerAction(action: CompanionAction) {
  emit('action', action)
}

function chooseImage() {
  if (!companionStore.privacy.imageUnderstanding) {
    attachmentError.value = '请先在设置中开启图片理解权限。'
    return
  }
  fileInput.value?.click()
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void loadImage(file)
  input.value = ''
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  void loadImage(file)
}

async function loadImage(file: File) {
  attachmentError.value = ''

  if (!companionStore.privacy.imageUnderstanding) {
    attachmentError.value = '图片理解权限当前关闭，文件没有被读取。'
    return
  }
  if (!file.type.startsWith('image/')) {
    attachmentError.value = '目前只支持图片文件。'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    attachmentError.value = '图片不能超过 5 MB。'
    return
  }

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

    selectedImage.value = { name: file.name, type: file.type, dataUrl }
  } catch {
    selectedImage.value = undefined
    attachmentError.value = '图片读取失败，请重新选择文件。'
  }
}
</script>

<template>
  <section
    class="companion-panel"
    data-testid="companion-panel"
    @contextmenu.stop
    @dragover.prevent
    @drop="handleDrop"
    @keydown.esc="emit('close')"
    @mousedown.stop
    @mousemove.stop
  >
    <header
      class="panel-header"
      data-tauri-drag-region
    >
      <div
        class="pet-identity"
        data-tauri-drag-region
      >
        <span class="identity-dot" />
        <div data-tauri-drag-region>
          <strong>{{ petStore.currentSkin.name }}</strong>
          <small>{{ aiStatusLabel }}</small>
        </div>
      </div>

      <div class="header-actions">
        <button
          title="设置"
          type="button"
          @click="emit('openSettings')"
        >
          <span class="i-solar:settings-minimalistic-bold" />
        </button>
        <button
          aria-label="关闭陪伴面板"
          type="button"
          @click="emit('close')"
        >
          <span class="i-solar:close-circle-bold" />
        </button>
      </div>
    </header>

    <nav class="panel-tabs">
      <button
        :class="{ active: activeTab === 'chat' }"
        type="button"
        @click="activeTab = 'chat'"
      >
        对话
      </button>
      <button
        :class="{ active: activeTab === 'focus' }"
        type="button"
        @click="activeTab = 'focus'"
      >
        专注
      </button>
      <button
        :class="{ active: activeTab === 'actions' }"
        type="button"
        @click="activeTab = 'actions'"
      >
        快捷
      </button>
    </nav>

    <template v-if="activeTab === 'chat'">
      <div
        ref="messagesRef"
        class="messages"
      >
        <article
          v-for="message in messages"
          :key="message.id"
          class="message"
          :class="`is-${message.role}`"
        >
          <span
            v-if="message.attachment"
            class="attachment-label"
          >
            <span class="i-solar:gallery-bold" />
            {{ message.attachment.name }}
          </span>
          <span>{{ message.content }}</span>
        </article>

        <article
          v-if="busy"
          class="message is-assistant is-typing"
        >
          <i /><i /><i />
        </article>
      </div>

      <div class="quick-prompts">
        <button
          v-for="prompt in quickPrompts"
          :key="prompt"
          :disabled="busy"
          type="button"
          @click="sendQuickPrompt(prompt)"
        >
          {{ prompt }}
        </button>
      </div>

      <div
        v-if="selectedImage"
        class="selected-image"
      >
        <img
          :alt="selectedImage.name"
          :src="selectedImage.dataUrl"
        >
        <span>{{ selectedImage.name }}</span>
        <button
          type="button"
          @click="selectedImage = undefined"
        >
          ×
        </button>
      </div>

      <p
        v-if="attachmentError"
        class="composer-error"
      >
        {{ attachmentError }}
      </p>

      <form
        class="composer"
        @submit.prevent="submit"
      >
        <textarea
          v-model="draft"
          aria-label="输入消息"
          data-testid="chat-input"
          :disabled="busy"
          placeholder="说点什么，或输入“专注 25 分钟”…"
          rows="1"
          @keydown="handleComposerKeydown"
        />

        <div class="composer-row">
          <div class="composer-tools">
            <input
              ref="fileInput"
              accept="image/*"
              hidden
              type="file"
              @change="handleFileInput"
            >
            <button
              :class="{ disabled: !companionStore.privacy.imageUnderstanding }"
              title="添加图片"
              type="button"
              @click="chooseImage"
            >
              <span class="i-solar:gallery-add-bold" />
            </button>
          </div>

          <button
            class="send-button"
            :disabled="busy || (!draft.trim() && !selectedImage)"
            type="submit"
          >
            <span class="i-solar:plain-2-bold" />
          </button>
        </div>
      </form>
    </template>

    <div
      v-else-if="activeTab === 'focus'"
      class="focus-view"
    >
      <div
        class="focus-ring"
        :style="focusRingStyle"
      >
        <div>
          <strong>{{ focusTime }}</strong>
          <span>{{ focusLabel }}</span>
        </div>
      </div>

      <div class="focus-copy">
        <small>当前任务</small>
        <strong>{{ activeTask }}</strong>
        <span>已完成 {{ companionStore.focus.completedSessions }} 轮</span>
      </div>

      <div class="focus-controls">
        <template v-if="companionStore.focus.status === 'idle'">
          <label>
            <input
              v-model.number="companionStore.focus.focusMinutes"
              max="180"
              min="1"
              type="number"
            >
            分钟
          </label>
          <button
            class="primary"
            type="button"
            @click="startFocus"
          >
            开始专注
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            @click="toggleFocusPause"
          >
            {{ companionStore.focus.status === 'paused' ? '继续' : '暂停' }}
          </button>
          <button
            type="button"
            @click="companionStore.stopFocus()"
          >
            结束
          </button>
        </template>
      </div>

      <form
        class="task-composer"
        @submit.prevent="addTask"
      >
        <input
          v-model="taskDraft"
          placeholder="添加这一轮要做的事…"
        >
        <button
          :disabled="!taskDraft.trim()"
          type="submit"
        >
          添加
        </button>
      </form>

      <div class="task-list">
        <label
          v-for="task in companionStore.tasks"
          :key="task.id"
        >
          <input
            v-model="task.done"
            type="checkbox"
          >
          <span :class="{ done: task.done }">{{ task.text }}</span>
          <button
            type="button"
            @click="companionStore.removeTask(task.id)"
          >×</button>
        </label>
        <p v-if="!companionStore.tasks.length">
          任务越少，越容易进入状态。
        </p>
      </div>

      <section class="reminder-list">
        <header>
          <strong>待触发提醒</strong>
          <small>{{ companionStore.pendingReminders.length }} 条</small>
        </header>
        <div
          v-for="reminder in companionStore.pendingReminders"
          :key="reminder.id"
        >
          <span>
            <strong>{{ reminder.text }}</strong>
            <small>{{ formatReminderTime(reminder.dueAt) }}</small>
          </span>
          <button
            aria-label="删除提醒"
            type="button"
            @click="companionStore.removeReminder(reminder.id)"
          >
            ×
          </button>
        </div>
        <p v-if="!companionStore.pendingReminders.length">
          在对话里输入“20 分钟后提醒我喝水”即可添加。
        </p>
      </section>
    </div>

    <div
      v-else
      class="actions-view"
    >
      <section>
        <header>
          <strong>逗逗它</strong>
          <small>立即预览动作</small>
        </header>
        <div class="action-grid">
          <button
            type="button"
            @click="triggerAction('tap')"
          >
            <span>🥁</span>敲鼓
          </button>
          <button
            type="button"
            @click="triggerAction('wave')"
          >
            <span>👋</span>挥爪
          </button>
          <button
            type="button"
            @click="triggerAction('celebrate')"
          >
            <span>✨</span>庆祝
          </button>
          <button
            type="button"
            @click="triggerAction('think')"
          >
            <span>💭</span>思考
          </button>
        </div>
      </section>

      <section>
        <header>
          <strong>场景模式</strong>
          <small>一键控制打扰程度</small>
        </header>
        <div class="mode-list">
          <button
            v-for="option in MODE_OPTIONS"
            :key="option.id"
            :class="{ active: companionStore.mode === option.id }"
            type="button"
            @click="companionStore.mode = option.id"
          >
            <span>
              <strong>{{ option.name }}</strong>
              <small>{{ option.description }}</small>
            </span>
            <i />
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.companion-panel {
  position: absolute;
  z-index: 32;
  top: 10px;
  right: 10px;
  display: flex;
  width: 352px;
  height: calc(100vh - 20px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(218, 222, 231, 0.92);
  border-radius: 23px;
  background: rgba(250, 251, 253, 0.96);
  box-shadow: 0 24px 70px rgba(36, 42, 55, 0.2);
  color: #343a47;
  backdrop-filter: blur(24px) saturate(1.12);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 16px 10px;
}

.pet-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.identity-dot {
  width: 11px;
  height: 11px;
  border: 3px solid #e8f4ec;
  border-radius: 50%;
  background: #6fad87;
  box-sizing: content-box;
}

.pet-identity div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pet-identity strong {
  font-size: 14px;
  letter-spacing: -0.2px;
}

.pet-identity small {
  color: #9299a7;
  font-size: 10px;
}

.header-actions {
  display: flex;
  gap: 3px;
}

.header-actions button {
  display: grid;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 10px;
  place-items: center;
  background: transparent;
  color: #818997;
  cursor: pointer;
  font-size: 17px;
}

.header-actions button:hover {
  background: #eef1f6;
  color: #4d5564;
}

.panel-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin: 0 14px 8px;
  border-radius: 12px;
  padding: 3px;
  background: #eef1f5;
}

.panel-tabs button {
  border: 0;
  border-radius: 9px;
  padding: 6px;
  background: transparent;
  color: #818997;
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
}

.panel-tabs button.active {
  background: #fff;
  box-shadow: 0 2px 7px rgba(48, 55, 70, 0.08);
  color: #414958;
}

.messages {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  overflow-y: auto;
  padding: 8px 14px 10px;
  scrollbar-width: thin;
}

.message {
  display: flex;
  max-width: 86%;
  flex-direction: column;
  gap: 5px;
  border-radius: 15px;
  padding: 9px 11px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.is-user {
  align-self: flex-end;
  border-bottom-right-radius: 5px;
  background: #dfe8ff;
  color: #334268;
}

.message.is-assistant {
  align-self: flex-start;
  border: 1px solid #e7e9ee;
  border-bottom-left-radius: 5px;
  background: #fff;
  color: #4c5360;
}

.attachment-label {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #7180a8;
  font-size: 10px;
  font-weight: 650;
}

.is-typing {
  flex-direction: row;
  gap: 4px;
  padding: 12px 14px;
}

.is-typing i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #98a0af;
  animation: typing-dot 900ms ease-in-out infinite;
}

.is-typing i:nth-child(2) {
  animation-delay: 120ms;
}
.is-typing i:nth-child(3) {
  animation-delay: 240ms;
}

.quick-prompts {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 0 12px 8px;
}

.quick-prompts button {
  flex: none;
  border: 1px solid #e1e4ea;
  border-radius: 999px;
  padding: 5px 9px;
  background: #fff;
  color: #737b8a;
  cursor: pointer;
  font-size: 10px;
}

.selected-image {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 7px;
  border: 1px solid #dfe4ed;
  border-radius: 11px;
  padding: 5px;
  background: #f4f6f9;
  font-size: 10px;
}

.selected-image img {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: cover;
}

.selected-image span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-image button {
  border: 0;
  background: transparent;
  color: #7d8492;
  cursor: pointer;
}

.composer-error {
  margin: 0 14px 6px;
  color: #c16b6b;
  font-size: 10px;
}

.composer {
  margin: 0 10px 10px;
  border: 1px solid #dfe3ea;
  border-radius: 15px;
  padding: 8px;
  background: #fff;
  box-shadow: 0 5px 16px rgba(47, 54, 67, 0.05);
}

.composer textarea {
  width: 100%;
  min-height: 38px;
  max-height: 82px;
  resize: none;
  border: 0;
  outline: 0;
  padding: 2px 3px;
  background: transparent;
  color: #3f4653;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}

.composer textarea::placeholder {
  color: #a7adba;
}

.composer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.composer-tools {
  display: flex;
  gap: 2px;
}

.composer-tools button,
.send-button {
  display: grid;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 9px;
  place-items: center;
  background: transparent;
  color: #7d8594;
  cursor: pointer;
  font-size: 16px;
}

.composer-tools button:hover {
  background: #f0f2f6;
}
.composer-tools button.active {
  background: #fee8e8;
  color: #cb6262;
}
.composer-tools button.disabled {
  opacity: 0.38;
}

.send-button {
  background: #667fd1;
  color: #fff;
}

.send-button:disabled,
.quick-prompts button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.focus-view,
.actions-view {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 16px;
}

.focus-view {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.focus-ring {
  display: grid;
  width: 142px;
  height: 142px;
  margin: 4px 0 12px;
  border-radius: 50%;
  place-items: center;
}

.focus-ring > div {
  display: flex;
  width: 126px;
  height: 126px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border-radius: 50%;
  background: #fff;
  box-shadow: inset 0 0 0 1px #edf0f4;
}

.focus-ring strong {
  color: #3d4555;
  font-size: 29px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
}

.focus-ring span {
  color: #9299a6;
  font-size: 10px;
}

.focus-copy {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
}

.focus-copy small,
.focus-copy span {
  color: #989fab;
  font-size: 10px;
}
.focus-copy strong {
  max-width: 260px;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 13px;
}

.focus-controls label {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #dfe3ea;
  border-radius: 11px;
  padding: 0 8px;
  background: #fff;
  color: #7c8492;
  font-size: 10px;
}

.focus-controls input {
  width: 34px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #4d5563;
  font-weight: 700;
}

.focus-controls button,
.task-composer button {
  border: 1px solid #dfe3ea;
  border-radius: 11px;
  padding: 8px 14px;
  background: #fff;
  color: #626a79;
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
}

.focus-controls button.primary {
  border-color: #667fd1;
  background: #667fd1;
  color: #fff;
}

.task-composer {
  display: flex;
  width: 100%;
  gap: 7px;
}

.task-composer input {
  min-width: 0;
  flex: 1;
  border: 1px solid #dfe3ea;
  border-radius: 11px;
  outline: 0;
  padding: 8px 10px;
  background: #fff;
  color: #4d5563;
  font-size: 11px;
}

.task-composer button {
  padding-inline: 11px;
}

.task-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 5px;
  margin-top: 9px;
}

.task-list label {
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 10px;
  padding: 7px 9px;
  background: #f1f3f6;
  color: #5c6472;
  font-size: 11px;
}

.task-list label span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-list label span.done {
  opacity: 0.5;
  text-decoration: line-through;
}
.task-list label button {
  border: 0;
  background: transparent;
  color: #9ba1ac;
  cursor: pointer;
}
.task-list p {
  margin: 8px 0;
  color: #a0a6b1;
  font-size: 10px;
  text-align: center;
}

.reminder-list {
  width: 100%;
  margin-top: 12px;
  border-top: 1px solid #e5e8ee;
  padding-top: 10px;
}

.reminder-list > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.reminder-list > header strong {
  color: #555d6b;
  font-size: 10px;
}

.reminder-list > header small {
  color: #9aa1ad;
  font-size: 9px;
}

.reminder-list > div {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  padding: 7px 9px;
  background: #f1f3f6;
}

.reminder-list > div + div {
  margin-top: 5px;
}

.reminder-list > div > span {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.reminder-list > div strong {
  overflow: hidden;
  color: #5c6472;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-list > div small {
  color: #999fab;
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.reminder-list button {
  border: 0;
  background: transparent;
  color: #9ba1ac;
  cursor: pointer;
}

.reminder-list > p {
  margin: 7px 0 0;
  color: #a0a6b1;
  font-size: 9px;
  line-height: 1.45;
  text-align: center;
}

.actions-view {
  display: flex;
  flex-direction: column;
  gap: 17px;
}

.actions-view section > header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.actions-view header strong {
  font-size: 12px;
}
.actions-view header small {
  color: #9aa1ad;
  font-size: 9px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.action-grid button {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-direction: column;
  border: 1px solid #e1e4ea;
  border-radius: 13px;
  padding: 9px 4px;
  background: #fff;
  color: #6b7381;
  cursor: pointer;
  font-size: 9px;
}

.action-grid button:hover {
  border-color: #bdc9ef;
  background: #f6f8ff;
}
.action-grid span {
  font-size: 19px;
}

.mode-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mode-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 8px 10px;
  background: #f1f3f6;
  color: #565e6c;
  cursor: pointer;
  text-align: left;
}

.mode-list button > span {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mode-list strong {
  font-size: 11px;
}
.mode-list small {
  color: #969da9;
  font-size: 9px;
}
.mode-list i {
  width: 8px;
  height: 8px;
  border: 2px solid #ccd1da;
  border-radius: 50%;
}
.mode-list button.active {
  border-color: #ccd6f5;
  background: #eef2ff;
}
.mode-list button.active i {
  border-color: #667fd1;
  background: #667fd1;
  box-shadow: inset 0 0 0 2px #eef2ff;
}

@keyframes typing-dot {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
</style>
