import { Channel, invoke } from '@tauri-apps/api/core'

export type NativeAiProtocol = 'anthropic' | 'openai'

export interface NativeAiRequest {
  body: Record<string, unknown>
  headers: Record<string, string>
  protocol: NativeAiProtocol
  stream: boolean
  timeoutMs?: number
  url: string
}

interface NativeAiStreamEvent {
  data: string
  event: 'delta'
}

export function canUseNativeAiTransport(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function streamNativeAiReply(
  request: NativeAiRequest,
  onDelta: (delta: string) => void,
): Promise<string> {
  const onEvent = new Channel<NativeAiStreamEvent>()
  onEvent.onmessage = (message) => {
    if (message.event === 'delta' && message.data) onDelta(message.data)
  }

  return invoke<string>('stream_ai_reply', { request, onEvent })
}
