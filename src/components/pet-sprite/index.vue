<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { PetSkin } from '@/constants/pets'
import type { PetAnimationState } from '@/stores/pet'
import type { CompanionEmotion } from '@/utils/companion'

interface Frame {
  column: number
  duration: number
  row: number
}

const props = defineProps<{
  animationNonce: number
  emotion: CompanionEmotion
  emotionNonce: number
  look: { x: number, y: number }
  mirror?: boolean
  animationSpeed?: number
  reducedMotion?: boolean
  skin: PetSkin
  sleeping?: boolean
  state: PetAnimationState
}>()

const STATE_ROWS: Record<PetAnimationState, { frames: number, row: number, duration: number }> = {
  'failed': { row: 5, frames: 8, duration: 180 },
  'idle': { row: 0, frames: 6, duration: 720 },
  'jumping': { row: 4, frames: 5, duration: 150 },
  'review': { row: 8, frames: 6, duration: 180 },
  'running': { row: 7, frames: 6, duration: 135 },
  'running-left': { row: 2, frames: 8, duration: 120 },
  'running-right': { row: 1, frames: 8, duration: 120 },
  'tapping': { row: 3, frames: 4, duration: 105 },
  'waiting': { row: 6, frames: 6, duration: 190 },
  'waving': { row: 3, frames: 4, duration: 125 },
}

const IDLE_FRAMES: Frame[] = [
  { row: 0, column: 0, duration: 1_680 },
  { row: 0, column: 1, duration: 660 },
  { row: 0, column: 2, duration: 660 },
  { row: 0, column: 3, duration: 840 },
  { row: 0, column: 4, duration: 840 },
  { row: 0, column: 5, duration: 1_920 },
]

const frame = ref<Frame>(IDLE_FRAMES[0])
let frameIndex = 0
let frameTimer: number | undefined

const lookDirectionFrame = computed<Frame | undefined>(() => {
  if (props.skin.spriteRows !== 11 || props.sleeping || props.state !== 'idle') return

  const magnitude = Math.hypot(props.look.x, props.look.y)
  if (magnitude < 0.24) return

  const degrees = (Math.atan2(props.look.x, -props.look.y) * 180 / Math.PI + 360) % 360
  const directionIndex = Math.round(degrees / 22.5) % 16

  return directionIndex < 8
    ? { row: 9, column: directionIndex, duration: 0 }
    : { row: 10, column: directionIndex - 8, duration: 0 }
})

const visibleFrame = computed(() => lookDirectionFrame.value ?? frame.value)

const spriteStyle = computed(() => ({
  backgroundImage: `url(${props.skin.spritesheet})`,
  backgroundPosition: `${visibleFrame.value.column / 7 * 100}% ${visibleFrame.value.row / (props.skin.spriteRows - 1) * 100}%`,
  backgroundSize: `800% ${props.skin.spriteRows * 100}%`,
  transform: [
    `translate3d(${lookDirectionFrame.value ? 0 : props.look.x * 5}px, ${lookDirectionFrame.value ? 0 : props.look.y * 2}px, 0)`,
    `rotate(${lookDirectionFrame.value ? 0 : props.look.x * 1.3}deg)`,
    props.mirror ? 'scaleX(-1)' : 'scaleX(1)',
  ].join(' '),
}))

const emotionEmoji = computed(() => ({
  excited: '♪',
  happy: '♥',
  neutral: '',
  sleepy: 'Zz',
  thinking: '…',
})[props.emotion])

function clearFrameTimer() {
  if (frameTimer === undefined) return

  window.clearTimeout(frameTimer)
  frameTimer = undefined
}

function getFrames(): Frame[] {
  if (props.sleeping) {
    return [{ row: 0, column: props.skin.sleepFrame, duration: 2_400 }]
  }

  if (props.state === 'idle') return props.reducedMotion ? [IDLE_FRAMES[0]] : IDLE_FRAMES

  const state = STATE_ROWS[props.state]

  const frames = Array.from({ length: state.frames }, (_, column) => ({
    row: state.row,
    column,
    duration: column === state.frames - 1 ? state.duration * 1.65 : state.duration,
  }))

  return props.reducedMotion ? [frames[0]] : frames
}

function startAnimation() {
  clearFrameTimer()
  frameIndex = 0

  const frames = getFrames()

  frame.value = frames[0]

  if (frames.length === 1) return

  const advance = () => {
    frameTimer = window.setTimeout(() => {
      frameIndex = (frameIndex + 1) % frames.length
      frame.value = frames[frameIndex]
      advance()
    }, frame.value.duration * 100 / Math.max(25, Math.min(props.animationSpeed ?? 100, 200)))
  }

  advance()
}

watch(
  () => [props.animationNonce, props.skin.id, props.sleeping, props.state, props.reducedMotion, props.animationSpeed],
  startAnimation,
  { immediate: true },
)

onBeforeUnmount(clearFrameTimer)
</script>

<template>
  <div
    class="pet-sprite-stage"
    :class="{ 'is-sleeping': sleeping }"
    :data-animation-state="state"
    :data-skin-id="skin.id"
    :data-sleeping="sleeping ? 'true' : 'false'"
    data-testid="pet-sprite"
  >
    <div
      aria-hidden="true"
      class="pet-sprite"
      :style="spriteStyle"
    />

    <div
      v-if="state === 'tapping'"
      :key="animationNonce"
      aria-hidden="true"
      class="pet-drum"
    >
      <span>♪</span>
    </div>

    <div
      v-if="emotion !== 'neutral'"
      :key="emotionNonce"
      aria-hidden="true"
      class="emotion-badge"
      :class="`is-${emotion}`"
    >
      {{ emotionEmoji }}
    </div>

    <div
      v-if="sleeping"
      aria-hidden="true"
      class="sleep-badge"
    >
      <span>Z</span><span>z</span><span>z</span>
    </div>
  </div>
</template>

<style scoped>
.pet-sprite-stage {
  position: absolute;
  inset: 0;
  display: grid;
  overflow: hidden;
  place-items: end center;
  padding: 8px 10px 2px;
  pointer-events: none;
}

.pet-sprite {
  width: 92%;
  aspect-ratio: 192 / 208;
  background-position: 0 0;
  background-repeat: no-repeat;
  background-size: 800% 900%;
  filter: drop-shadow(0 9px 9px rgba(22, 26, 35, 0.16));
  transform-origin: 50% 84%;
  transition:
    transform 90ms linear,
    filter 180ms ease;
  will-change: background-position, transform;
}

.pet-drum {
  position: absolute;
  z-index: 4;
  bottom: 5%;
  left: 8%;
  display: grid;
  width: clamp(38px, 19vw, 62px);
  aspect-ratio: 1.12;
  border: clamp(2px, 0.8vw, 4px) solid #b66542;
  border-radius: 50%;
  place-items: center;
  background:
    radial-gradient(circle at 50% 42%, #fff7df 0 58%, transparent 59%), linear-gradient(160deg, #ef9a64, #bf5b41);
  box-shadow:
    inset 0 -7px 0 rgba(128, 55, 38, 0.2),
    0 6px 10px rgba(31, 25, 22, 0.16);
  color: #8f3f36;
  font-family: ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;
  font-size: clamp(13px, 5vw, 21px);
  font-weight: 900;
  transform-origin: 50% 100%;
  animation: drum-hit 230ms ease-out 2;
}

.emotion-badge {
  position: absolute;
  z-index: 5;
  top: 10%;
  left: 50%;
  min-width: clamp(27px, 10vw, 42px);
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: 999px;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 5px 14px rgba(42, 50, 76, 0.15);
  color: #e06372;
  font-family: ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;
  font-size: clamp(13px, 5vw, 20px);
  font-weight: 900;
  text-align: center;
  animation: emotion-pop 1.2s ease both;
}

.emotion-badge.is-thinking {
  color: #6e78a8;
}

.emotion-badge.is-sleepy {
  color: #6274ad;
}

.is-sleeping .pet-sprite {
  animation: sleep-breathe 2.8s ease-in-out infinite;
  filter: drop-shadow(0 7px 8px rgba(22, 26, 35, 0.12)) saturate(0.92);
}

.sleep-badge {
  position: absolute;
  top: 9%;
  right: 14%;
  display: flex;
  align-items: end;
  gap: 2px;
  color: rgba(72, 93, 156, 0.88);
  filter: drop-shadow(0 2px 3px rgba(255, 255, 255, 0.7));
  font-family: ui-rounded, 'SF Pro Rounded', system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -1px;
}

.sleep-badge span:nth-child(1) {
  font-size: 23px;
}
.sleep-badge span:nth-child(2) {
  font-size: 17px;
}
.sleep-badge span:nth-child(3) {
  font-size: 12px;
}

@keyframes sleep-breathe {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 2px;
  }
}

@keyframes drum-hit {
  0%,
  100% {
    transform: rotate(-3deg) scale(1);
  }
  45% {
    transform: rotate(3deg) scale(0.91);
  }
}

@keyframes emotion-pop {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.7);
  }
  18%,
  78% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-8px) scale(0.92);
  }
}
</style>
