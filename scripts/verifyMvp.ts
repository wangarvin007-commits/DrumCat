import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'

import {
  DEFAULT_PET_SKIN_ID,
  getPetSkin,
  isPetSkinId,
  PET_SKINS,
} from '../src/constants/pets'
import { getLocalDateKey, useCompanionStore } from '../src/stores/companion'
import { usePetStore } from '../src/stores/pet'
import {
  createCompanionReply,
  createMessage,
  parseDirectCommand,
  streamCompanionReply,
} from '../src/utils/companion'
import { createHoverAvoidanceController } from '../src/utils/hover'
import { clampWindowPosition, getWindowBounds } from '../src/utils/window'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let timerId = 0

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    clearTimeout() {},
    setTimeout() {
      timerId += 1
      return timerId
    },
  },
})

const checks: string[] = []

async function check(name: string, run: () => Promise<void> | void) {
  await run()
  checks.push(name)
  console.log(`✓ ${name}`)
}

function freshCompanionStore() {
  setActivePinia(createPinia())
  return useCompanionStore()
}

await check('只注册两套半写实猫狗皮肤，旧皮肤不会回退', () => {
  assert.equal(PET_SKINS.length, 2)
  assert.deepEqual(PET_SKINS.map(skin => skin.kind).sort(), ['cat', 'dog'])
  assert.equal(DEFAULT_PET_SKIN_ID, 'realistic-british-shorthair')
  assert.equal(isPetSkinId('ragdoll'), false)
  assert.equal(existsSync(join(root, 'public', 'pets', 'ragdoll')), false)
  assert.equal(getPetSkin('missing').id, DEFAULT_PET_SKIN_ID)
  assert(PET_SKINS.every(skin => skin.spriteRows === 11))
})

await check('两套 v2 图集和元数据均已打包', () => {
  for (const skin of PET_SKINS) {
    const directory = join(root, 'public', 'pets', skin.id)
    const spritesheet = join(directory, 'spritesheet.webp')
    const metadata = JSON.parse(readFileSync(join(directory, 'pet.json'), 'utf8')) as {
      spriteVersionNumber: number
      spritesheetPath: string
    }

    assert(existsSync(spritesheet))
    assert(statSync(spritesheet).size > 1_000_000)
    assert.equal(metadata.spriteVersionNumber, 2)
    assert.equal(metadata.spritesheetPath, 'spritesheet.webp')
  }
})

await check('定制皮肤入口和 Arvin 微信二维码已打包', () => {
  const picker = readFileSync(join(root, 'src', 'components', 'pet-skin-picker', 'index.vue'), 'utf8')
  const qrCode = join(root, 'public', 'custom-skin', 'arvin-wechat.jpg')

  assert(existsSync(qrCode))
  assert(statSync(qrCode).size > 50_000)
  assert.match(picker, /定制你的专属皮肤/u)
  assert.match(picker, /微信：Arvin/u)
  assert.deepEqual(parseDirectCommand('定制皮肤'), { type: 'skin', query: '定制' })
})

await check('本地指令覆盖睡眠、唤醒、专注、提醒、模式和换肤', () => {
  assert.deepEqual(parseDirectCommand('睡觉'), { type: 'sleep' })
  assert.deepEqual(parseDirectCommand('醒醒'), { type: 'wake' })
  assert.deepEqual(parseDirectCommand('专注 35 分钟'), { type: 'focus', minutes: 35 })
  assert.deepEqual(parseDirectCommand('2 小时后提醒我开会'), {
    type: 'reminder',
    minutes: 120,
    text: '开会',
  })
  assert.deepEqual(parseDirectCommand('会议模式'), { type: 'mode', mode: 'meeting' })
  assert.deepEqual(parseDirectCommand('换成柴犬皮肤'), { type: 'skin', query: '柴犬' })
})

await check('本地回复会驱动对应动作和表情', () => {
  const success = createCompanionReply('我完成了', { personality: 'warm' })
  const error = createCompanionReply('代码报错了', { personality: 'coach' })

  assert.equal(success.action, 'celebrate')
  assert.equal(success.emotion, 'excited')
  assert.equal(error.action, 'think')
  assert.equal(error.emotion, 'thinking')
})

await check('聊天记录限制、隐私开关和清空逻辑完整', () => {
  const store = freshCompanionStore()
  store.init()

  for (let index = 0; index < 25; index += 1) {
    store.addMessage(createMessage('user', `消息 ${index}`))
  }

  assert.equal(store.messages.length, 20)
  assert.equal(store.rememberedMessages.length, 20)
  store.privacy.rememberConversation = false
  assert.equal(store.rememberedMessages.length, 0)
  store.clearMessages()
  assert.equal(store.messages.length, 1)
})

await check('番茄钟暂停、休息进度和重启后过期事件不会丢失', () => {
  const pausedBreak = freshCompanionStore()
  pausedBreak.startBreak(10)
  pausedBreak.focus.status = 'paused'
  pausedBreak.focus.resumeStatus = 'break'
  pausedBreak.focus.remainingSeconds = 300
  assert.equal(pausedBreak.focusProgress, 0.5)

  const expired = freshCompanionStore()
  expired.startFocus(1)
  expired.focus.endsAt = Date.now() - 1_000
  expired.focus.remainingSeconds = 1
  expired.init()
  assert.equal(expired.focus.status, 'focus')
  assert.equal(expired.syncClock(), 'focus-complete')
  assert.equal(expired.focus.completedSessions, 1)
})

await check('任务和提醒支持新增、到期、完成与删除', () => {
  const store = freshCompanionStore()
  store.addTask('完成验收')
  assert.equal(store.activeTask?.text, '完成验收')
  store.tasks[0].done = true
  assert.equal(store.activeTask, undefined)
  store.removeTask(store.tasks[0].id)
  assert.equal(store.tasks.length, 0)

  const reminder = store.addReminder('喝水', 1)
  assert(reminder)
  reminder.dueAt = Date.now() - 1
  assert.equal(store.dueReminders().map(item => item.text).join(','), '喝水')

  const removable = store.addReminder('删除我', 5)
  assert(removable)
  store.removeReminder(removable.id)
  assert.equal(store.pendingReminders.length, 0)
})

await check('主动关心按本地日期计数并受模式与每日上限约束', () => {
  const store = freshCompanionStore()
  const localDate = new Date(2026, 6, 16, 23, 59)

  assert.equal(getLocalDateKey(localDate), '2026-07-16')
  assert.equal(store.canSendProactive(localDate), true)
  store.proactive.maxPerDay = 1
  store.noteProactiveSent()
  assert.equal(store.canSendProactive(localDate), false)
  store.proactive.sentToday = 0
  store.mode = 'meeting'
  assert.equal(store.canSendProactive(localDate), false)
})

await check('宠物动作状态支持敲鼓、庆祝、思考、睡眠与唤醒', () => {
  setActivePinia(createPinia())
  const pet = usePetStore()

  pet.executeAction('tap')
  assert.equal(pet.animationState, 'tapping')
  assert.equal(pet.currentEmotion, 'excited')

  pet.sleepNow()
  assert.equal(pet.sleeping, true)
  pet.wake()
  assert.equal(pet.sleeping, false)
})

await check('手动睡眠不会被被动目光跟随打断，只会被明确互动唤醒', () => {
  setActivePinia(createPinia())
  const pet = usePetStore()

  pet.sleepNow()
  pet.setLook(0.8, -0.4)
  assert.equal(pet.sleeping, true)
  assert.deepEqual({ ...pet.look }, { x: 0.8, y: -0.4 })

  pet.noteActivity()
  assert.equal(pet.sleeping, false)
})

await check('悬停隐藏会取消过期计时并在关闭功能时立即恢复', () => {
  let nextTimerId = 0
  const timers = new Map<number, () => void>()
  const visibilityChanges: boolean[] = []
  const controller = createHoverAvoidanceController(
    hidden => visibilityChanges.push(hidden),
    {
      clearTimeout: timer => timers.delete(timer),
      setTimeout(callback) {
        nextTimerId += 1
        timers.set(nextTimerId, callback)
        return nextTimerId
      },
    },
  )

  controller.update({ enabled: true, inside: true, delayMs: 300 })
  assert.equal(timers.size, 1)
  controller.update({ enabled: true, inside: true, delayMs: 600 })
  assert.equal(timers.size, 1)
  assert.equal(nextTimerId, 2)
  controller.update({ enabled: true, inside: false, delayMs: 300 })
  assert.equal(timers.size, 0)
  assert.equal(controller.hidden, false)

  controller.update({ enabled: true, inside: true, delayMs: 0 })
  assert.equal(controller.hidden, true)
  controller.update({ enabled: false, inside: true, delayMs: 0 })
  assert.equal(controller.hidden, false)
  assert.deepEqual(visibilityChanges, [true, false])
})

await check('窗口越界和窗口大于屏幕时都能夹紧到有效坐标', () => {
  const normalBounds = getWindowBounds(
    { x: 0, y: 0 },
    { width: 1_920, height: 1_080 },
    { width: 320, height: 347 },
  )
  assert.deepEqual(clampWindowPosition({ x: 1_900, y: -20 }, normalBounds), {
    x: 1_600,
    y: 0,
  })

  const oversizedBounds = getWindowBounds(
    { x: -1_920, y: 0 },
    { width: 1_920, height: 1_080 },
    { width: 2_500, height: 1_200 },
  )
  assert.deepEqual(oversizedBounds, {
    minX: -1_920,
    maxX: -1_920,
    minY: 0,
    maxY: 0,
  })
  assert.deepEqual(clampWindowPosition({ x: 300, y: 800 }, oversizedBounds), {
    x: -1_920,
    y: 0,
  })
})

await check('番茄钟和提醒会拒绝 NaN、Infinity 与越界分钟数', () => {
  const store = freshCompanionStore()
  const now = Date.now()

  store.startFocus(Number.NaN)
  assert.equal(store.focus.focusMinutes, 25)
  store.startFocus(9_999)
  assert.equal(store.focus.focusMinutes, 180)
  store.startBreak(-10)
  assert.equal(store.focus.breakMinutes, 1)

  const reminder = store.addReminder('安全提醒', Number.POSITIVE_INFINITY)
  assert(reminder)
  assert(reminder.dueAt >= now + 59_000)
  assert(reminder.dueAt <= Date.now() + 61_000)
})

await check('流式 AI 回复会消费没有换行符的最后一个 SSE 数据包', async () => {
  const originalFetch = globalThis.fetch
  const deltas: string[] = []
  let requestedUrl = ''

  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response('data: {"choices":[{"delta":{"content":"尾包完整"}}]}', {
      headers: { 'Content-Type': 'text/event-stream' },
      status: 200,
    })
  }

  try {
    const reply = await streamCompanionReply({
      apiKey: 'test-key',
      endpoint: 'https://example.test/v1/',
      messages: [createMessage('user', '测试')],
      model: 'test-model',
      onDelta: delta => deltas.push(delta),
      systemPrompt: 'test',
    })

    assert.equal(requestedUrl, 'https://example.test/v1/chat/completions')
    assert.equal(reply, '尾包完整')
    assert.deepEqual(deltas, ['尾包完整'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

await check('透明无边框、置顶、缩放、穿透和任务栏配置齐全', () => {
  const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const mainWindow = config.app.windows.find((window: { label: string }) => window.label === 'main')

  assert(mainWindow)
  assert.equal(mainWindow.transparent, true)
  assert.equal(mainWindow.decorations, false)
  assert.equal(mainWindow.alwaysOnTop, true)
  assert.equal(mainWindow.resizable, true)
  assert.equal(mainWindow.skipTaskbar, true)
})

await check('键盘、鼠标、拖动缩放、托盘和快捷键调用链存在', () => {
  const device = readFileSync(join(root, 'src', 'composables', 'useDevice.ts'), 'utf8')
  const main = readFileSync(join(root, 'src', 'pages', 'main', 'index.vue'), 'utf8')
  const tray = readFileSync(join(root, 'src', 'composables', 'useTray.ts'), 'utf8')
  const shortcuts = readFileSync(join(root, 'src', 'composables', 'useGlobalShortcuts.ts'), 'utf8')

  assert.match(device, /KeyboardPress/u)
  assert.match(device, /MouseMove/u)
  assert.match(device, /MousePress/u)
  assert.match(main, /startDragging/u)
  assert.match(device, /setIgnoreCursorEvents/u)
  assert.match(main, /catStore\.window\.scale/u)
  assert.match(tray, /TrayIcon\.new/u)
  assert.match(shortcuts, /chatPanel/u)
  assert.match(shortcuts, /penetrable/u)
})

await check('提醒、AI 回退、会议静音和开机启动调用链已接通', () => {
  const main = readFileSync(join(root, 'src', 'pages', 'main', 'index.vue'), 'utf8')
  const app = readFileSync(join(root, 'src', 'App.vue'), 'utf8')
  const capabilities = JSON.parse(readFileSync(join(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8'))
  const macWindow = readFileSync(
    join(root, 'src-tauri', 'src', 'plugins', 'window', 'src', 'commands', 'macos.rs'),
    'utf8',
  )

  assert.match(main, /sendSystemNotification/u)
  assert.match(main, /showBubble\(reply\)/u)
  assert.match(main, /mode !== 'meeting'/u)
  assert.match(app, /syncAutostart/u)
  assert(capabilities.permissions.includes('notification:default'))
  assert.match(macWindow, /PanelLevel::Normal/u)
})

await check('Windows 置顶守护只保留最新一代线程，避免重复空转', () => {
  const windowsWindow = readFileSync(
    join(root, 'src-tauri', 'src', 'plugins', 'window', 'src', 'commands', 'windows.rs'),
    'utf8',
  )

  assert.match(windowsWindow, /AtomicU64/u)
  assert.match(windowsWindow, /TOPMOST_GENERATION\.load/u)
  assert.match(windowsWindow, /Duration::from_millis\(250\)/u)
  assert.doesNotMatch(windowsWindow, /AtomicBool/u)
})

console.log(`\nMVP 自动验收通过：${checks.length} 组检查。`)
