<script setup lang="ts">
import { getTauriVersion } from '@tauri-apps/api/app'
import { appLogDir } from '@tauri-apps/api/path'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { confirm } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { arch, platform, version } from '@tauri-apps/plugin-os'
import { exit } from '@tauri-apps/plugin-process'
import { useEventListener } from '@vueuse/core'
import { checkInputMonitoringPermission, requestInputMonitoringPermission } from 'tauri-plugin-macos-permissions-api'
import { computed, onMounted, ref, watch } from 'vue'

import type { InteractionTrigger } from '@/stores/companion'

import PetSkinPicker from '@/components/pet-skin-picker/index.vue'
import Shortcut from '@/components/shortcut/index.vue'
import { GITHUB_LINK } from '@/constants'
import { isRunningAsAdministrator } from '@/plugins/adminStatus'
import { useAppStore } from '@/stores/app'
import { useCatStore } from '@/stores/cat'
import {
  ACTION_OPTIONS,
  MODE_OPTIONS,
  PERSONALITY_OPTIONS,
  useCompanionStore,
} from '@/stores/companion'
import { useGeneralStore } from '@/stores/general'
import { usePetStore } from '@/stores/pet'
import { useShortcutStore } from '@/stores/shortcut'
import { isMac, isWindows } from '@/utils/platform'

type SettingsSection = 'appearance' | 'companion' | 'actions' | 'focus' | 'system' | 'about'

const appStore = useAppStore()
const catStore = useCatStore()
const companionStore = useCompanionStore()
const generalStore = useGeneralStore()
const petStore = usePetStore()
const shortcutStore = useShortcutStore()
const appWindow = getCurrentWebviewWindow()
const activeSection = ref<SettingsSection>('appearance')
const inputMonitoringAuthorized = ref(false)
const administratorAuthorized = ref(true)
const logDir = ref('')
const copied = ref(false)

const navigation: ReadonlyArray<{ id: SettingsSection, label: string, hint: string, icon: string }> = [
  { id: 'appearance', label: '外观', hint: '皮肤与窗口', icon: 'i-solar:paw-bold' },
  { id: 'companion', label: '陪伴', hint: '性格与对话', icon: 'i-solar:chat-round-dots-bold' },
  { id: 'actions', label: '互动', hint: '触发器与隐私', icon: 'i-solar:magic-stick-3-bold' },
  { id: 'focus', label: '专注', hint: '番茄钟与提醒', icon: 'i-solar:clock-circle-bold' },
  { id: 'system', label: '系统', hint: '权限与快捷键', icon: 'i-solar:settings-minimalistic-bold' },
  { id: 'about', label: '关于', hint: '版本与日志', icon: 'i-solar:info-circle-bold' },
]

const triggerRows: ReadonlyArray<{ id: InteractionTrigger, label: string, hint: string }> = [
  { id: 'keyboard', label: '键盘输入', hint: '打字时播放的动作' },
  { id: 'mouseLeft', label: '鼠标左键', hint: '单击桌宠时播放' },
  { id: 'mouseRight', label: '鼠标右键', hint: '右键互动与菜单前播放' },
  { id: 'mouseMiddle', label: '鼠标中键', hint: '中键点击时播放' },
  { id: 'idle', label: '长时间待机', hint: '随机待机小动作' },
  { id: 'focusComplete', label: '专注完成', hint: '番茄钟结束时播放' },
  { id: 'reminder', label: '提醒到点', hint: '提醒触发时播放' },
]

const sectionMeta = computed(() => navigation.find(item => item.id === activeSection.value)!)
const permissionLabel = computed(() => {
  if (isMac) return inputMonitoringAuthorized.value ? '已授权' : '需要授权'
  if (isWindows) return administratorAuthorized.value ? '权限正常' : '建议以管理员运行'
  return '无需额外权限'
})

watch(() => generalStore.appearance.isDark, (value) => {
  document.documentElement.classList.toggle('dark', value)
}, { immediate: true })

onMounted(async () => {
  await appWindow.setTitle('DrumCat 设置')
  logDir.value = await appLogDir()
  await refreshPermission()
})

useEventListener(window, 'focus', refreshPermission)

async function refreshPermission() {
  try {
    if (isMac) inputMonitoringAuthorized.value = await checkInputMonitoringPermission()
    if (isWindows) administratorAuthorized.value = await isRunningAsAdministrator()
  } catch {
    inputMonitoringAuthorized.value = false
  }
}

async function requestPermission() {
  if (isMac) {
    await requestInputMonitoringPermission()
    window.setTimeout(refreshPermission, 800)
    return
  }

  if (isWindows && !administratorAuthorized.value) {
    const accepted = await confirm('部分全局键鼠事件需要管理员权限。退出后，请右键 DrumCat 并选择“以管理员身份运行”。', {
      title: 'Windows 权限说明',
      okLabel: '退出应用',
      cancelLabel: '稍后设置',
      kind: 'warning',
    })
    if (accepted) await exit(0)
  }
}

async function copyAppInfo() {
  const info = {
    appName: appStore.name,
    appVersion: appStore.version,
    tauriVersion: await getTauriVersion(),
    platform: platform(),
    architecture: arch(),
    platformVersion: version(),
  }

  await writeText(JSON.stringify(info, null, 2))
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1_500)
}

function testAction(trigger: InteractionTrigger) {
  petStore.executeAction(companionStore.actionBindings[trigger])
}

function formatReminderTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
</script>

<template>
  <main class="settings-shell">
    <aside
      class="settings-sidebar"
      data-tauri-drag-region
    >
      <div
        class="brand"
        data-tauri-drag-region
      >
        <img
          alt="DrumCat"
          src="/logo.png"
        >
        <div>
          <strong>DrumCat</strong>
          <small>桌面陪伴中心</small>
        </div>
      </div>

      <nav>
        <button
          v-for="item in navigation"
          :key="item.id"
          :class="{ active: activeSection === item.id }"
          type="button"
          @click="activeSection = item.id"
        >
          <span :class="item.icon" />
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
        </button>
      </nav>

      <div class="sidebar-status">
        <span />
        <div>
          <strong>本地运行</strong>
          <small>你的设置保存在本机</small>
        </div>
      </div>
    </aside>

    <section class="settings-content">
      <header
        class="content-header"
        data-tauri-drag-region
      >
        <div data-tauri-drag-region>
          <small>{{ sectionMeta.hint }}</small>
          <h1>{{ sectionMeta.label }}</h1>
        </div>
        <span class="version-pill">v{{ appStore.version || '0.1.0' }}</span>
      </header>

      <div
        v-if="activeSection === 'appearance'"
        class="settings-page"
      >
        <section class="settings-card skin-section">
          <div class="card-heading">
            <div>
              <h2>半写实 3D 皮肤</h2>
              <p>真实毛发与品种特征，完整适配动作、眨眼和 16 向目光。</p>
            </div>
          </div>
          <PetSkinPicker embedded />
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>窗口</h2><p>调整桌宠在桌面上的呈现方式。</p></div>
          </div>
          <div class="setting-row slider-row">
            <div><strong>尺寸</strong><small>拖动窗口也可以改变大小</small></div>
            <input
              v-model.number="catStore.window.scale"
              max="250"
              min="25"
              type="range"
            >
            <output>{{ catStore.window.scale }}%</output>
          </div>
          <div class="setting-row slider-row">
            <div><strong>透明度</strong><small>只影响桌宠本体与浮动控件</small></div>
            <input
              v-model.number="catStore.window.opacity"
              max="100"
              min="20"
              type="range"
            >
            <output>{{ catStore.window.opacity }}%</output>
          </div>
          <div class="setting-row">
            <div><strong>始终置顶</strong><small>让桌宠保持在其他窗口上方</small></div>
            <label class="switch"><input
              v-model="catStore.window.alwaysOnTop"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>鼠标穿透</strong><small>开启后通过托盘或快捷键恢复交互</small></div>
            <label class="switch"><input
              v-model="catStore.window.passThrough"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>镜像角色</strong><small>水平翻转桌宠朝向</small></div>
            <label class="switch"><input
              v-model="catStore.model.mirror"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>保持在屏幕内</strong><small>多显示器切换后自动修正窗口位置</small></div>
            <label class="switch"><input
              v-model="catStore.window.keepInScreen"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row split-control">
            <div><strong>鼠标靠近时隐藏</strong><small>需要点到桌面内容时暂时让开</small></div>
            <label class="switch"><input
              v-model="catStore.window.hideOnHover"
              type="checkbox"
            ><span /></label>
            <label class="number-field"><input
              v-model.number="catStore.window.hideOnHoverDelay"
              max="10"
              min="0"
              step="0.5"
              type="number"
            >秒</label>
          </div>
          <div class="setting-row split-control">
            <div><strong>屏幕边缘吸附</strong><small>靠近边缘时自动贴齐，并避免跑出屏幕</small></div>
            <label class="switch"><input
              v-model="catStore.window.snapToEdges"
              type="checkbox"
            ><span /></label>
            <label class="number-field"><input
              v-model.number="catStore.window.snapDistance"
              max="64"
              min="0"
              type="number"
            >像素</label>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>动画与性能</h2><p>在流畅度、功耗和减少动态效果之间选择。</p></div>
          </div>
          <div class="setting-row">
            <div><strong>减少动态效果</strong><small>使用静态关键帧，适合低功耗或易晕动用户</small></div>
            <label class="switch"><input
              v-model="catStore.model.reducedMotion"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row slider-row">
            <div><strong>动作速度</strong><small>改变眨眼、挥爪和互动动画速度</small></div>
            <input
              v-model.number="catStore.model.animationSpeed"
              max="200"
              min="25"
              type="range"
            >
            <output>{{ catStore.model.animationSpeed }}%</output>
          </div>
          <div class="setting-row slider-row">
            <div><strong>事件采样</strong><small>降低数值可减少鼠标跟随带来的功耗</small></div>
            <input
              v-model.number="catStore.model.maxFPS"
              max="60"
              min="15"
              step="15"
              type="range"
            >
            <output>{{ catStore.model.maxFPS }} FPS</output>
          </div>
        </section>
      </div>

      <div
        v-else-if="activeSection === 'companion'"
        class="settings-page"
      >
        <section class="settings-card">
          <div class="card-heading">
            <div><h2>性格模板</h2><p>只改变表达方式，不改变隐私边界。</p></div>
          </div>
          <div class="choice-grid two-columns">
            <button
              v-for="option in PERSONALITY_OPTIONS"
              :key="option.id"
              :class="{ active: companionStore.personality === option.id }"
              type="button"
              @click="companionStore.personality = option.id"
            >
              <span><strong>{{ option.name }}</strong><small>{{ option.description }}</small></span><i />
            </button>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>关于你</h2><p>用于简短记忆和更贴合当前任务的回应。</p></div>
          </div>
          <label class="text-field"><span>怎么称呼你</span><input
            v-model="companionStore.userName"
            maxlength="24"
            placeholder="例如：Arvin"
          ></label>
          <label class="text-field"><span>当前目标</span><input
            v-model="companionStore.currentGoal"
            maxlength="80"
            placeholder="例如：完成桌宠 MVP"
          ></label>
          <label class="text-field"><span>偏好备忘</span><textarea
            v-model="companionStore.memoryNotes"
            maxlength="300"
            placeholder="只保存在本机；直播模式不会发送这段内容。"
          /></label>
          <div class="setting-row compact-row">
            <div><strong>保留最近对话</strong><small>最多保存 20 条，不保存图片内容</small></div>
            <label class="switch"><input
              v-model="companionStore.privacy.rememberConversation"
              type="checkbox"
            ><span /></label>
            <button
              class="secondary-button"
              type="button"
              @click="companionStore.clearMessages()"
            >
              清空记录
            </button>
          </div>
        </section>

        <section class="settings-card ai-card">
          <div class="card-heading">
            <div><h2>可选 AI 对话</h2><p>不开启时，本地规则仍可聊天和执行指令。</p></div>
            <label class="switch"><input
              v-model="companionStore.ai.enabled"
              type="checkbox"
            ><span /></label>
          </div>
          <div
            class="ai-fields"
            :class="{ disabled: !companionStore.ai.enabled }"
          >
            <label class="text-field"><span>兼容接口地址</span><input
              v-model="companionStore.ai.endpoint"
              :disabled="!companionStore.ai.enabled"
              placeholder="https://api.openai.com"
            ></label>
            <label class="text-field"><span>模型</span><input
              v-model="companionStore.ai.model"
              :disabled="!companionStore.ai.enabled"
              placeholder="gpt-4.1-mini"
            ></label>
            <label class="text-field"><span>本次会话密钥</span><input
              v-model="companionStore.sessionApiKey"
              autocomplete="off"
              :disabled="!companionStore.ai.enabled"
              placeholder="不会写入磁盘"
              type="password"
            ></label>
            <div class="setting-row compact-row">
              <div><strong>流式回复</strong><small>边生成边显示；关闭后等待完整回复</small></div>
              <label class="switch"><input
                v-model="companionStore.ai.streaming"
                :disabled="!companionStore.ai.enabled"
                type="checkbox"
              ><span /></label>
            </div>
          </div>
          <p class="privacy-note">
            <span class="i-solar:shield-check-bold" />密钥仅存在内存中；退出 DrumCat 后自动清空。远程对话和图片只在你主动开启后发送。
          </p>
        </section>
      </div>

      <div
        v-else-if="activeSection === 'actions'"
        class="settings-page"
      >
        <section class="settings-card">
          <div class="card-heading">
            <div><h2>动作编辑器</h2><p>把每个触发条件映射成你喜欢的动作。</p></div>
          </div>
          <div
            v-for="row in triggerRows"
            :key="row.id"
            class="setting-row action-row"
          >
            <div><strong>{{ row.label }}</strong><small>{{ row.hint }}</small></div>
            <select v-model="companionStore.actionBindings[row.id]">
              <option
                v-for="option in ACTION_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <button
              type="button"
              @click="testAction(row.id)"
            >
              预览
            </button>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>键鼠互动</h2><p>全局事件只用于驱动动作，不记录输入内容。</p></div>
          </div>
          <div class="setting-row">
            <div><strong>启用自动互动</strong><small>键鼠事件会触发上面选择的动作</small></div><label class="switch"><input
              v-model="catStore.model.behavior"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>键盘输入动作</strong><small>关闭后键盘事件不会驱动桌宠</small></div><label class="switch"><input
              v-model="companionStore.privacy.keyboardInteraction"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>鼠标跟随与点击</strong><small>关闭后桌宠不再看向鼠标或响应点击</small></div><label class="switch"><input
              v-model="companionStore.privacy.mouseInteraction"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>反向看向鼠标</strong><small>适用于镜像布局</small></div><label class="switch"><input
              v-model="catStore.model.mouseMirror"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row split-control">
            <div><strong>自动睡觉</strong><small>多久无互动后进入睡眠；0 表示关闭</small></div><label class="number-field"><input
              v-model.number="petStore.sleepAfterMinutes"
              max="120"
              min="0"
              type="number"
            >分钟</label>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>语音与图片权限</h2><p>默认关闭，只有你主动开启后聊天面板才会读取。</p></div>
          </div>
          <div class="setting-row">
            <div><strong>语音输入</strong><small>依赖系统 WebView；不支持时会明确提示，不随 MVP 打包大型离线模型</small></div><label class="switch"><input
              v-model="companionStore.privacy.voiceInput"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>语音朗读</strong><small>使用系统语音朗读桌宠回复</small></div><label class="switch"><input
              v-model="companionStore.privacy.voiceOutput"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>图片理解</strong><small>允许读取你手动拖入聊天框的图片</small></div><label class="switch"><input
              v-model="companionStore.privacy.imageUnderstanding"
              type="checkbox"
            ><span /></label>
          </div>
        </section>
      </div>

      <div
        v-else-if="activeSection === 'focus'"
        class="settings-page"
      >
        <section class="settings-card focus-summary">
          <div class="focus-stat">
            <strong>{{ companionStore.focus.completedSessions }}</strong><span>已完成专注轮次</span>
          </div>
          <div class="focus-stat">
            <strong>{{ companionStore.tasks.filter(item => item.done).length }}</strong><span>已完成任务</span>
          </div>
          <div class="focus-stat">
            <strong>{{ companionStore.reminders.filter(item => !item.done).length }}</strong><span>待触发提醒</span>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>番茄钟默认值</h2><p>可在主面板里随时为单次计时修改。</p></div>
          </div>
          <div class="setting-row split-control">
            <div><strong>专注时长</strong><small>建议从 25 分钟开始</small></div><label class="number-field"><input
              v-model.number="companionStore.focus.focusMinutes"
              max="180"
              min="1"
              type="number"
            >分钟</label>
          </div>
          <div class="setting-row split-control">
            <div><strong>休息时长</strong><small>每轮完成后自动进入休息</small></div><label class="number-field"><input
              v-model.number="companionStore.focus.breakMinutes"
              max="60"
              min="1"
              type="number"
            >分钟</label>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>系统提醒</h2><p>桌宠隐藏或被其他窗口遮挡时，仍可收到番茄钟和定时提醒。</p></div>
          </div>
          <div class="setting-row">
            <div><strong>允许系统通知</strong><small>首次触发时由系统询问通知权限</small></div><label class="switch"><input
              v-model="companionStore.privacy.systemNotifications"
              type="checkbox"
            ><span /></label>
          </div>
          <div
            v-for="reminder in companionStore.pendingReminders"
            :key="reminder.id"
            class="setting-row reminder-row"
          >
            <div>
              <strong>{{ reminder.text }}</strong>
              <small>{{ formatReminderTime(reminder.dueAt) }}</small>
            </div>
            <button
              class="secondary-button"
              type="button"
              @click="companionStore.removeReminder(reminder.id)"
            >
              删除
            </button>
          </div>
          <p
            v-if="!companionStore.pendingReminders.length"
            class="empty-reminders"
          >
            暂无待触发提醒。可以在对话里输入“20 分钟后提醒我喝水”。
          </p>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>场景模式</h2><p>控制桌宠在工作、会议和直播时的打扰程度。</p></div>
          </div>
          <div class="choice-grid two-columns">
            <button
              v-for="option in MODE_OPTIONS"
              :key="option.id"
              :class="{ active: companionStore.mode === option.id }"
              type="button"
              @click="companionStore.mode = option.id"
            >
              <span><strong>{{ option.name }}</strong><small>{{ option.description }}</small></span><i />
            </button>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>主动关心</h2><p>只在陪伴模式且长时间无操作时出现。</p></div>
          </div>
          <div class="setting-row">
            <div><strong>允许主动消息</strong><small>安静、会议和专注模式会自动暂停</small></div><label class="switch"><input
              v-model="companionStore.proactive.enabled"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row split-control">
            <div><strong>每天最多</strong><small>避免桌宠频繁打扰</small></div><label class="number-field"><input
              v-model.number="companionStore.proactive.maxPerDay"
              max="12"
              min="0"
              type="number"
            >条</label>
          </div>
        </section>
      </div>

      <div
        v-else-if="activeSection === 'system'"
        class="settings-page"
      >
        <section class="settings-card permission-card">
          <div
            class="permission-icon"
            :class="{ warning: (isMac && !inputMonitoringAuthorized) || (isWindows && !administratorAuthorized) }"
          >
            <span class="i-solar:shield-check-bold" />
          </div>
          <div><h2>键鼠监听权限</h2><p>用于敲鼓、挥爪和目光跟随；不会保存你按下的按键内容。</p></div>
          <button
            type="button"
            @click="requestPermission"
          >
            {{ permissionLabel }}
          </button>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>启动与图标</h2><p>控制 DrumCat 如何随系统运行。</p></div>
          </div>
          <div class="setting-row">
            <div><strong>开机自动启动</strong><small>登录系统后自动出现</small></div><label class="switch"><input
              v-model="generalStore.app.autostart"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>显示任务栏 / Dock 图标</strong><small>关闭后主要通过托盘操作</small></div><label class="switch"><input
              v-model="generalStore.app.taskbarVisible"
              type="checkbox"
            ><span /></label>
          </div>
          <div class="setting-row">
            <div><strong>显示托盘图标</strong><small>建议保持开启，方便退出穿透模式</small></div><label class="switch"><input
              v-model="generalStore.app.trayVisible"
              type="checkbox"
            ><span /></label>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-heading">
            <div><h2>全局快捷键</h2><p>点击输入框后直接按下新的组合键。</p></div>
          </div>
          <div class="setting-row shortcut-row">
            <div><strong>显示 / 隐藏桌宠</strong><small>快速收起桌面角色</small></div><Shortcut v-model="shortcutStore.visibleCat" />
          </div>
          <div class="setting-row shortcut-row">
            <div><strong>打开设置</strong><small>显示这个设置窗口</small></div><Shortcut v-model="shortcutStore.visiblePreference" />
          </div>
          <div class="setting-row shortcut-row">
            <div><strong>打开陪伴面板</strong><small>对话、专注和快捷动作</small></div><Shortcut v-model="shortcutStore.chatPanel" />
          </div>
          <div class="setting-row shortcut-row">
            <div><strong>镜像角色</strong><small>切换宠物朝向</small></div><Shortcut v-model="shortcutStore.mirrorMode" />
          </div>
          <div class="setting-row shortcut-row">
            <div><strong>鼠标穿透</strong><small>快速进入或退出穿透</small></div><Shortcut v-model="shortcutStore.penetrable" />
          </div>
          <div class="setting-row shortcut-row">
            <div><strong>切换置顶</strong><small>在置顶与普通窗口间切换</small></div><Shortcut v-model="shortcutStore.alwaysOnTop" />
          </div>
        </section>
      </div>

      <div
        v-else
        class="settings-page about-page"
      >
        <section class="hero-card settings-card">
          <img
            alt="DrumCat"
            src="/logo.png"
          >
          <div><small>DESKTOP COMPANION</small><h2>DrumCat</h2><p>一只会看你打字、陪你专注，也愿意安静待着的本地桌宠。</p></div>
        </section>
        <section class="settings-card">
          <div class="setting-row">
            <div><strong>当前版本</strong><small>本地 MVP</small></div><span class="value-text">v{{ appStore.version }}</span>
          </div>
          <div class="setting-row">
            <div><strong>技术底座</strong><small>保留原项目许可与来源说明</small></div><a :href="GITHUB_LINK">查看上游项目</a>
          </div>
          <div class="setting-row">
            <div><strong>诊断信息</strong><small>复制系统和运行时版本，不含聊天记录</small></div><button
              class="secondary-button"
              type="button"
              @click="copyAppInfo"
            >
              {{ copied ? '已复制' : '复制信息' }}
            </button>
          </div>
          <div class="setting-row">
            <div><strong>应用日志</strong><small>{{ logDir }}</small></div><button
              class="secondary-button"
              type="button"
              @click="openPath(logDir)"
            >
              打开目录
            </button>
          </div>
        </section>
        <section class="settings-card privacy-summary">
          <span class="i-solar:lock-keyhole-minimalistic-bold" />
          <div><h2>隐私默认优先</h2><p>聊天、任务和偏好保存在本机；API 密钥不落盘；语音、图片和远程 AI 默认关闭。直播模式不会把私人备忘放进模型上下文。</p></div>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.settings-shell {
  display: grid;
  width: 100vw;
  height: 100vh;
  grid-template-columns: 210px minmax(0, 1fr);
  overflow: hidden;
  background: #f4f5f7;
  color: #353b47;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'SF Pro Text',
    'Segoe UI',
    sans-serif;
}

.settings-sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid #e3e5e9;
  padding: 36px 13px 14px;
  background: rgba(248, 249, 251, 0.94);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 7px 23px;
}

.brand img {
  width: 38px;
  height: 38px;
  border: 1px solid #e0e3e8;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 5px 14px rgba(45, 51, 63, 0.08);
}

.brand div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.brand strong {
  font-size: 14px;
  letter-spacing: -0.25px;
}
.brand small {
  color: #999fab;
  font-size: 9px;
}

.settings-sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.settings-sidebar nav button {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 12px;
  padding: 8px 9px;
  background: transparent;
  color: #7c8491;
  cursor: pointer;
  text-align: left;
}

.settings-sidebar nav button > span:first-child {
  font-size: 18px;
}
.settings-sidebar nav button > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}
.settings-sidebar nav strong {
  color: inherit;
  font-size: 11px;
}
.settings-sidebar nav small {
  color: #a5abb5;
  font-size: 8px;
}
.settings-sidebar nav button:hover {
  background: #eef0f4;
  color: #515968;
}
.settings-sidebar nav button.active {
  background: #e8edfb;
  color: #526cb9;
}
.settings-sidebar nav button.active small {
  color: #8798c7;
}

.sidebar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  border: 1px solid #e3e6eb;
  border-radius: 12px;
  padding: 9px 10px;
  background: #fff;
}

.sidebar-status > span {
  width: 8px;
  height: 8px;
  border: 2px solid #e8f3eb;
  border-radius: 50%;
  background: #72ae85;
  box-sizing: content-box;
}
.sidebar-status div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sidebar-status strong {
  font-size: 9px;
}
.sidebar-status small {
  color: #a0a6b0;
  font-size: 7px;
}

.settings-content {
  min-width: 0;
  overflow-y: auto;
  background: #f4f5f7;
}

.content-header {
  position: sticky;
  z-index: 10;
  top: 0;
  display: flex;
  height: 86px;
  align-items: flex-end;
  justify-content: space-between;
  padding: 30px 34px 14px;
  background: rgba(244, 245, 247, 0.88);
  backdrop-filter: blur(18px);
}

.content-header > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.content-header small {
  color: #9ca2ad;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
}
.content-header h1 {
  margin: 0;
  color: #343a46;
  font-size: 23px;
  letter-spacing: -0.75px;
}
.version-pill {
  border: 1px solid #e0e3e8;
  border-radius: 999px;
  padding: 4px 8px;
  background: #fff;
  color: #9299a5;
  font-size: 8px;
}

.settings-page {
  display: flex;
  max-width: 920px;
  flex-direction: column;
  gap: 13px;
  padding: 0 34px 34px;
}

.settings-card {
  overflow: hidden;
  border: 1px solid #e1e4e9;
  border-radius: 18px;
  padding: 17px;
  background: #fff;
  box-shadow: 0 4px 15px rgba(46, 52, 64, 0.035);
}

.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.card-heading h2,
.permission-card h2,
.privacy-summary h2 {
  margin: 0 0 2px;
  color: #3d4450;
  font-size: 13px;
  letter-spacing: -0.15px;
}
.card-heading p,
.permission-card p,
.privacy-summary p {
  margin: 0;
  color: #969da9;
  font-size: 9px;
  line-height: 1.5;
}
.skin-section {
  padding-bottom: 15px;
}

.setting-row {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 12px;
  border-top: 1px solid #eef0f3;
  padding: 9px 2px;
}

.card-heading + .setting-row {
  border-top: 0;
}
.setting-row > div:first-child {
  display: flex;
  min-width: 180px;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.setting-row strong {
  color: #4b5260;
  font-size: 10px;
}
.setting-row small {
  max-width: 520px;
  overflow: hidden;
  color: #9ca2ad;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.setting-row a {
  color: #627cc9;
  font-size: 9px;
  text-decoration: none;
}

.switch {
  position: relative;
  display: inline-flex;
  width: 35px;
  height: 20px;
  flex: none;
  cursor: pointer;
}
.switch input {
  position: absolute;
  opacity: 0;
}
.switch span {
  width: 100%;
  border-radius: 999px;
  background: #d8dce3;
  transition: background 150ms ease;
}
.switch span::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(49, 56, 68, 0.2);
  content: '';
  transition: transform 150ms ease;
}
.switch input:checked + span {
  background: #687fd0;
}
.switch input:checked + span::after {
  transform: translateX(15px);
}

.slider-row input[type='range'] {
  width: min(240px, 32vw);
  accent-color: #687fd0;
}
.slider-row output {
  width: 54px;
  color: #69717f;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.split-control .switch {
  margin-left: auto;
}

.number-field {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #dfe3e9;
  border-radius: 10px;
  padding: 5px 8px;
  background: #f8f9fb;
  color: #8b929e;
  font-size: 8px;
}
.number-field input {
  width: 42px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #515866;
  font-size: 9px;
  font-weight: 650;
  text-align: right;
}

.choice-grid {
  display: grid;
  gap: 8px;
}
.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.choice-grid button {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #e2e5ea;
  border-radius: 13px;
  padding: 10px 11px;
  background: #fafbfc;
  color: #555d6b;
  cursor: pointer;
  text-align: left;
}
.choice-grid button > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.choice-grid strong {
  font-size: 10px;
}
.choice-grid small {
  overflow: hidden;
  color: #9aa1ac;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.choice-grid i {
  width: 9px;
  height: 9px;
  flex: none;
  border: 2px solid #ccd1d9;
  border-radius: 50%;
}
.choice-grid button.active {
  border-color: #c7d1f3;
  background: #f0f3ff;
}
.choice-grid button.active i {
  border-color: #687fd0;
  background: #687fd0;
  box-shadow: inset 0 0 0 2px #f0f3ff;
}

.text-field {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  border-top: 1px solid #eef0f3;
  padding: 9px 2px;
  color: #555d6a;
  font-size: 9px;
  font-weight: 650;
}
.card-heading + .text-field {
  border-top: 0;
}
.text-field input,
.text-field textarea {
  min-width: 0;
  border: 1px solid #dfe3e9;
  border-radius: 10px;
  outline: 0;
  padding: 8px 9px;
  background: #f9fafb;
  color: #4d5562;
  font: inherit;
  font-size: 9px;
  font-weight: 450;
}
.text-field textarea {
  min-height: 58px;
  resize: vertical;
  line-height: 1.5;
}
.text-field input:focus,
.text-field textarea:focus {
  border-color: #aebde9;
  box-shadow: 0 0 0 3px rgba(104, 127, 208, 0.09);
}

.secondary-button,
.action-row button,
.permission-card button {
  border: 1px solid #dfe3e9;
  border-radius: 9px;
  padding: 6px 9px;
  background: #f8f9fb;
  color: #69717e;
  cursor: pointer;
  font-size: 8px;
  font-weight: 650;
}
.secondary-button:hover,
.action-row button:hover {
  border-color: #bbc7ea;
  background: #f2f5ff;
  color: #5870bd;
}
.compact-row .secondary-button {
  margin-left: 4px;
}

.ai-fields.disabled {
  opacity: 0.48;
}
.privacy-note {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 9px 2px 0;
  color: #7f8997;
  font-size: 8px;
  line-height: 1.45;
}
.privacy-note > span {
  color: #6da27f;
  font-size: 13px;
}

.action-row select {
  min-width: 128px;
  border: 1px solid #dfe3e9;
  border-radius: 9px;
  outline: 0;
  padding: 6px 8px;
  background: #f8f9fb;
  color: #555d69;
  font-size: 8px;
}

.focus-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 0;
}
.focus-stat {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 2px;
  border-left: 1px solid #eceef2;
  padding: 20px;
}
.focus-stat:first-child {
  border-left: 0;
}
.focus-stat strong {
  color: #536bb6;
  font-size: 24px;
  letter-spacing: -1px;
}
.focus-stat span {
  color: #999faa;
  font-size: 8px;
}

.empty-reminders {
  margin: 9px 2px 1px;
  color: #9ca2ad;
  font-size: 8px;
}

.reminder-row small {
  font-variant-numeric: tabular-nums;
}

.permission-card,
.privacy-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
}
.permission-icon {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  place-items: center;
  background: #eaf5ed;
  color: #5f9d73;
  font-size: 20px;
}
.permission-icon.warning {
  background: #fff1e2;
  color: #cf8747;
}
.permission-card button {
  min-width: 84px;
}
.shortcut-row :deep(.relative) {
  border-color: #dfe3e9;
  border-radius: 9px;
  background: #f8f9fb;
  color: #707886;
  font-size: 9px;
}

.about-page {
  max-width: 760px;
}
.hero-card {
  display: flex;
  align-items: center;
  gap: 17px;
  background: linear-gradient(135deg, #fff, #f2f5ff);
}
.hero-card img {
  width: 72px;
  height: 72px;
  border: 1px solid #e2e5eb;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(54, 63, 82, 0.1);
}
.hero-card small {
  color: #8294c9;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 1.1px;
}
.hero-card h2 {
  margin: 3px 0 2px;
  color: #39414e;
  font-size: 21px;
}
.hero-card p {
  margin: 0;
  color: #8d95a2;
  font-size: 9px;
}
.value-text {
  color: #6b7380;
  font-size: 9px;
}
.privacy-summary {
  grid-template-columns: auto minmax(0, 1fr);
  background: #f0f6f2;
}
.privacy-summary > span {
  color: #5f9872;
  font-size: 24px;
}

@media (max-width: 820px) {
  .settings-shell {
    grid-template-columns: 175px minmax(0, 1fr);
  }
  .settings-page {
    padding-inline: 22px;
  }
  .content-header {
    padding-inline: 22px;
  }
  .is-embedded :deep(.skin-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
