export interface HoverAvoidanceScheduler {
  clearTimeout: (timer: number) => void
  setTimeout: (callback: () => void, delay: number) => number
}

export interface HoverAvoidanceUpdate {
  delayMs: number
  enabled: boolean
  inside: boolean
}

export function createHoverAvoidanceController(
  onHiddenChange: (hidden: boolean) => void,
  scheduler: HoverAvoidanceScheduler = {
    clearTimeout: timer => window.clearTimeout(timer),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  },
) {
  let hidden = false
  let enabled = false
  let inside = false
  let delayMs = 0
  let timer: number | undefined

  function clearTimer() {
    if (timer === undefined) return

    scheduler.clearTimeout(timer)
    timer = undefined
  }

  function setHidden(value: boolean) {
    if (hidden === value) return

    hidden = value
    onHiddenChange(value)
  }

  function reset() {
    clearTimer()
    enabled = false
    inside = false
    delayMs = 0
    setHidden(false)
  }

  function update({
    delayMs: nextDelayMs,
    enabled: nextEnabled,
    inside: nextInside,
  }: HoverAvoidanceUpdate) {
    if (!nextEnabled) {
      reset()
      return
    }

    const normalizedDelay = Math.max(0, nextDelayMs)
    const shouldReschedule = !enabled
      || nextInside !== inside
      || normalizedDelay !== delayMs

    enabled = true
    inside = nextInside
    delayMs = normalizedDelay

    if (!shouldReschedule) return
    clearTimer()

    if (!inside) {
      setHidden(false)
      return
    }

    if (hidden) return

    if (delayMs === 0) {
      setHidden(true)
      return
    }

    timer = scheduler.setTimeout(() => {
      timer = undefined
      if (inside) setHidden(true)
    }, delayMs)
  }

  return {
    get hidden() {
      return hidden
    },
    reset,
    update,
  }
}
