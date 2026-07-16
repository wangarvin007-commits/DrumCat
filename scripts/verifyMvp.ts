import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPinia, setActivePinia } from 'pinia'

import {
  DEFAULT_PET_SKIN_ID,
  PET_SKINS,
  getPetSkin,
  isPetSkinId,
} from '../src/constants/pets'
import { getLocalDateKey, useCompanionStore } from '../src/stores/companion'
import { usePetStore } from '../src/stores/pet'
import { createCompanionReply, createMessage, parseDirectCommand } from '../src/utils/companion'

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

function check(name: string, run: () => void) {
  run()
  checks.push(name)
  console.log(`✓ ${name}`)
}

function freshCompanionStore() {
  setActivePinia(createPinia())
  return useCompanionStore()
}

check('只注册两套半写实猫狗皮肤，旧皮肤不会回退', () => {
  assert.equal(PET_SKINS.length, 2)
  assert.deepEqual(PET_SKINS.map(skin => skin.kind).sort(), ['cat', 'dog'])
  assert.equal(DEFAULT_PET_SKIN_ID, 'realistic-british-shorthair')
  assert.equal(isPetSkinId('ragdoll'), false)
  assert.equal(existsSync(join(root, 'public', 'pets', 'ragdoll')), false)
  assert.equal(getPetSkin('missing').id, DEFAULT_PET_SKIN_ID)
  assert(PET_SKINS.every(skin => skin.spriteRows === 11))
})

check('两套 v2 图集和元数据均已打包', () => {
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

check('定制皮肤入口和 Arvin 微信二维码已打包', () => {
  const picker = readFileSync(join(root, 'src', 'components', 'pet-skin-picker', 'index.vue'), 'utf8')
  const qrCode = join(root, 'public', 'custom-skin', 'arvin-wechat.jpg')

  assert(existsSync(qrCode))
  assert(statSync(qrCode).size > 50_000)
  assert.match(picker, /定制你的专属皮肤/u)
  assert.match(picker, /微信：Arvin/u)
  assert.deepEqual(parseDirectCommand('定制皮肤'), { type: 'skin', query: '定制' })
})

check('本地指令覆盖睡眠、唤醒、专注、提醒、模式和换肤', () => {
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

check('本地回复会驱动对应动作和表情', () => {
  const success = createCompanionReply('我完成了', { personality: 'warm' })
  const error = createCompanionReply('代码报错了', { personality: 'coach' })

  assert.equal(success.action, 'celebrate')
  assert.equal(success.emotion, 'excited')
  assert.equal(error.action, 'think')
  assert.equal(error.emotion, 'thinking')
})

check('聊天记录限制、隐私开关和清空逻辑完整', () => {
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

check('番茄钟暂停、休息进度和重启后过期事件不会丢失', () => {
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

check('任务和提醒支持新增、到期、完成与删除', () => {
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

check('主动关心按本地日期计数并受模式与每日上限约束', () => {
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

check('宠物动作状态支持敲鼓、庆祝、思考、睡眠与唤醒', () => {
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

check('透明无边框、置顶、缩放、穿透和任务栏配置齐全', () => {
  const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const mainWindow = config.app.windows.find((window: { label: string }) => window.label === 'main')

  assert(mainWindow)
  assert.equal(mainWindow.transparent, true)
  assert.equal(mainWindow.decorations, false)
  assert.equal(mainWindow.alwaysOnTop, true)
  assert.equal(mainWindow.resizable, true)
  assert.equal(mainWindow.skipTaskbar, true)
})

check('键盘、鼠标、拖动缩放、托盘和快捷键调用链存在', () => {
  const device = readFileSync(join(root, 'src', 'composables', 'useDevice.ts'), 'utf8')
  const main = readFileSync(join(root, 'src', 'pages', 'main', 'index.vue'), 'utf8')
  const tray = readFileSync(join(root, 'src', 'composables', 'useTray.ts'), 'utf8')
  const shortcuts = readFileSync(join(root, 'src', 'composables', 'useGlobalShortcuts.ts'), 'utf8')

  assert.match(device, /KeyboardPress/u)
  assert.match(device, /MouseMove/u)
  assert.match(device, /MousePress/u)
  assert.match(main, /startDragging/u)
  assert.match(main, /setIgnoreCursorEvents/u)
  assert.match(main, /catStore\.window\.scale/u)
  assert.match(tray, /TrayIcon\.new/u)
  assert.match(shortcuts, /chatPanel/u)
  assert.match(shortcuts, /penetrable/u)
})

check('提醒、AI 回退、会议静音和开机启动调用链已接通', () => {
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

console.log(`\nMVP 自动验收通过：${checks.length} 组检查。`)
