import { nanoid } from 'nanoid'

export type CompanionEmotion = 'neutral' | 'happy' | 'sleepy' | 'excited' | 'thinking'

export type CompanionAction = 'idle' | 'wave' | 'tap' | 'sleep' | 'celebrate' | 'think' | 'failed'

export type CompanionPersonality = 'warm' | 'tsundere' | 'coach' | 'quiet'

export type CompanionMode = 'companion' | 'focus' | 'quiet' | 'meeting' | 'game' | 'stream'

export interface CompanionAttachment {
  name: string
  type: string
}

export interface ChatSendPayload {
  content: string
  image?: CompanionAttachment & { dataUrl: string }
}

export interface CompanionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  emotion?: CompanionEmotion
  action?: CompanionAction
  attachment?: CompanionAttachment
}

export interface CompanionReply {
  content: string
  emotion: CompanionEmotion
  action: CompanionAction
}

export interface CompanionContext {
  personality: CompanionPersonality
  userName?: string
  currentGoal?: string
  memoryNotes?: string
}

export type DirectCommand
  = | { type: 'sleep' }
    | { type: 'wake' }
    | { type: 'focus', minutes: number }
    | { type: 'reminder', minutes: number, text: string }
    | { type: 'skin', query: string }
    | { type: 'mode', mode: CompanionMode }

export interface StreamCompanionOptions {
  apiKey: string
  endpoint: string
  imageDataUrl?: string
  messages: CompanionMessage[]
  model: string
  stream?: boolean
  systemPrompt: string
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

const rules: Array<{ keywords: string[], reply: CompanionReply }> = [
  {
    keywords: ['你是谁', '叫什么', '名字'],
    reply: { content: '我是 DrumCat，你桌面上的猫狗搭子。', emotion: 'happy', action: 'wave' },
  },
  {
    keywords: ['你好', '嗨', 'hello', 'hi'],
    reply: { content: '你好！我在这里陪你工作。', emotion: 'happy', action: 'wave' },
  },
  {
    keywords: ['敲鼓', '打鼓', '鼓'],
    reply: { content: '收到！给你来一段节奏。', emotion: 'excited', action: 'tap' },
  },
  {
    keywords: ['加油', '鼓励', '没动力', '不想干'],
    reply: { content: '先完成最小的一步就算赢，我在旁边给你打节拍！', emotion: 'excited', action: 'celebrate' },
  },
  {
    keywords: ['工作', '写代码', '编程', '开发'],
    reply: { content: '那我们开始吧。把目标拆成现在就能完成的一小步。', emotion: 'thinking', action: 'tap' },
  },
  {
    keywords: ['累', '困', '疲惫', '休息一下'],
    reply: { content: '伸个懒腰、喝口水，再回来继续也不迟。', emotion: 'sleepy', action: 'wave' },
  },
  {
    keywords: ['开心', '完成了', '成功了', '搞定'],
    reply: { content: '太棒了！这一步值得认真庆祝。', emotion: 'excited', action: 'celebrate' },
  },
  {
    keywords: ['难过', '烦', '失败', '报错'],
    reply: { content: '先别急，我们把问题缩小到一个能验证的小步骤。', emotion: 'thinking', action: 'think' },
  },
  {
    keywords: ['摸摸', '抱抱', '可爱', '喜欢你'],
    reply: { content: '收到摸摸！我会继续乖乖陪着你。', emotion: 'happy', action: 'celebrate' },
  },
  {
    keywords: ['谢谢', '感谢'],
    reply: { content: '不用客气，继续加油！', emotion: 'happy', action: 'celebrate' },
  },
]

const personalityFallbacks: Record<CompanionPersonality, CompanionReply> = {
  warm: {
    content: '我听到了。慢慢说，我会陪你把这件事理清楚。',
    emotion: 'happy',
    action: 'wave',
  },
  tsundere: {
    content: '我可不是特意关心你，只是刚好在旁边。再说具体一点吧。',
    emotion: 'thinking',
    action: 'wave',
  },
  coach: {
    content: '把它改写成一个十分钟内能完成的动作，我们马上开始。',
    emotion: 'thinking',
    action: 'tap',
  },
  quiet: {
    content: '嗯，我在。',
    emotion: 'neutral',
    action: 'idle',
  },
}

const personalityPrompts: Record<CompanionPersonality, string> = {
  warm: '温暖、耐心、简短，像可靠的桌面伙伴。',
  tsundere: '轻微傲娇但不刻薄，嘴硬心软，不使用攻击性语言。',
  coach: '像专注教练，优先给出一个明确、可执行的下一步。',
  quiet: '安静克制，通常只回复一到两句，不主动延伸话题。',
}

export function createMessage(
  role: CompanionMessage['role'],
  content: string,
  extra: Pick<CompanionMessage, 'emotion' | 'action' | 'attachment'> = {},
): CompanionMessage {
  return {
    id: nanoid(),
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  }
}

export function createCompanionReply(input: string, context: CompanionContext): CompanionReply {
  const normalized = input.trim().toLowerCase()
  const matched = rules.find(({ keywords }) => keywords.some(keyword => normalized.includes(keyword)))

  if (matched) return matched.reply

  const fallback = personalityFallbacks[context.personality]
  const goalHint = context.currentGoal && context.personality !== 'quiet'
    ? ` 你现在的目标是“${context.currentGoal}”，要不要从最小一步开始？`
    : ''

  return {
    ...fallback,
    content: `${fallback.content}${goalHint}`,
  }
}

export function parseDirectCommand(input: string): DirectCommand | undefined {
  const normalized = input.trim()

  if (/^(?:睡觉|去睡吧|晚安|休息吧)[。！!]?$/u.test(normalized)) return { type: 'sleep' }
  if (/^(?:醒醒|起床|回来吧|别睡了)[。！!]?$/u.test(normalized)) return { type: 'wake' }
  if (/^(?:定制|专属)(?:桌宠)?皮肤[。！!]?$/u.test(normalized)) return { type: 'skin', query: '定制' }

  const reminder = normalized.match(/(\d+)\s*(分钟|小时)后提醒我\s*(.+)/u)
  if (reminder) {
    const amount = Number(reminder[1])
    const minutes = reminder[2] === '小时' ? amount * 60 : amount

    return { type: 'reminder', minutes: Math.max(1, Math.min(minutes, 7 * 24 * 60)), text: reminder[3].trim() }
  }

  const exactModes: Record<string, CompanionMode> = {
    安静模式: 'quiet',
    勿扰模式: 'quiet',
    会议模式: 'meeting',
    游戏模式: 'game',
    直播模式: 'stream',
    OBS模式: 'stream',
    工作模式: 'focus',
    专注模式: 'focus',
    陪伴模式: 'companion',
    普通模式: 'companion',
  }
  const exactMode = exactModes[normalized.replace(/\s+/gu, '')]

  if (exactMode) return { type: 'mode', mode: exactMode }

  const focus = normalized.match(/(?:番茄钟|专注)(?:模式)?\s*(\d+)?\s*(?:分钟)?/u)
  if (focus && /番茄钟|专注/u.test(normalized)) {
    return { type: 'focus', minutes: Math.max(1, Math.min(Number(focus[1] || 25), 180)) }
  }

  const skin = normalized.match(/(?:换成|切换到|换个|使用)(.+?)(?:皮肤)?[。！!]?$/u)
  if (skin) return { type: 'skin', query: skin[1].trim() }

  const modeMap: Array<[RegExp, CompanionMode]> = [
    [/安静模式|勿扰模式/u, 'quiet'],
    [/会议模式/u, 'meeting'],
    [/游戏模式/u, 'game'],
    [/直播模式|OBS\s*模式/iu, 'stream'],
    [/专注模式|工作模式/u, 'focus'],
    [/陪伴模式|普通模式/u, 'companion'],
  ]
  const matchedMode = modeMap.find(([pattern]) => pattern.test(normalized))

  if (matchedMode) return { type: 'mode', mode: matchedMode[1] }
}

export function getCompanionSystemPrompt(context: CompanionContext): string {
  const profile = [
    context.userName ? `用户称呼：${context.userName}` : '',
    context.currentGoal ? `用户当前目标：${context.currentGoal}` : '',
    context.memoryNotes ? `用户偏好备忘：${context.memoryNotes}` : '',
  ].filter(Boolean).join('\n')

  return [
    '你是 DrumCat，一只住在电脑桌面的中文桌宠。',
    personalityPrompts[context.personality],
    '回复自然、友好，默认不超过 100 个汉字。不要声称已执行你无法执行的外部操作。',
    '如果用户在聊天中给出明确目标，优先帮助其推进；如果只是闲聊，就像熟悉的伙伴一样回应。',
    profile,
  ].filter(Boolean).join('\n')
}

function normalizeChatEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/u, '')

  if (/\/chat\/completions$/u.test(trimmed)) return trimmed
  if (/\/v1$/u.test(trimmed)) return `${trimmed}/chat/completions`

  return `${trimmed}/v1/chat/completions`
}

export async function streamCompanionReply(options: StreamCompanionOptions): Promise<string> {
  const recentMessages = options.messages.slice(-10).map((message, index, messages) => {
    const isLastUser = message.role === 'user'
      && index === messages.length - 1
      && Boolean(options.imageDataUrl)

    if (!isLastUser) return { role: message.role, content: message.content }

    return {
      role: 'user',
      content: [
        { type: 'text', text: message.content || '请描述这张图片。' },
        { type: 'image_url', image_url: { url: options.imageDataUrl, detail: 'low' } },
      ],
    }
  })

  const response = await fetch(normalizeChatEndpoint(options.endpoint), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      stream: options.stream ?? true,
      messages: [
        { role: 'system', content: options.systemPrompt },
        ...recentMessages,
      ],
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240)
    throw new Error(`接口返回 ${response.status}${detail ? `：${detail}` : ''}`)
  }

  if (options.stream === false) {
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    if (content) options.onDelta(content)
    return content
  }

  if (!response.body) {
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    if (content) options.onDelta(content)
    return content
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const payload = line.trim()
      if (!payload.startsWith('data:')) continue

      const json = payload.slice(5).trim()
      if (!json || json === '[DONE]') continue

      try {
        const data = JSON.parse(json) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = data.choices?.[0]?.delta?.content || ''

        if (!delta) continue
        result += delta
        options.onDelta(delta)
      } catch {
        // Some compatible endpoints send keep-alive or vendor-specific events.
      }
    }

    if (done) break
  }

  return result.trim()
}

export function speakText(content: string) {
  if (!('speechSynthesis' in window)) return

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(content)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.02
  utterance.pitch = 1.08
  window.speechSynthesis.speak(utterance)
}
