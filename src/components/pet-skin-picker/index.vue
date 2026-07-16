<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

import { PET_SKINS } from '@/constants/pets'
import { usePetStore } from '@/stores/pet'

withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false,
})

const emit = defineEmits<{
  close: []
}>()

const petStore = usePetStore()
const filter = ref<'all' | 'cat' | 'dog'>('all')
const customizationOpen = ref(false)
const customizationDialog = ref<HTMLElement>()
const filteredSkins = computed(() => filter.value === 'all'
  ? PET_SKINS
  : PET_SKINS.filter(skin => skin.kind === filter.value))

async function openCustomization() {
  customizationOpen.value = true
  await nextTick()
  customizationDialog.value?.focus()
}

function closeCustomization() {
  customizationOpen.value = false
}
</script>

<template>
  <section
    class="skin-picker"
    :class="{ 'is-embedded': embedded }"
    @contextmenu.stop
    @mousedown.stop
    @mousemove.stop
  >
    <header
      v-if="!embedded"
      class="skin-header"
    >
      <div>
        <small>DRUMCAT 衣橱</small>
        <strong>今天和谁一起？</strong>
      </div>

      <button
        aria-label="关闭皮肤选择"
        type="button"
        @click="emit('close')"
      >
        <span class="i-solar:close-circle-bold" />
      </button>
    </header>

    <div class="skin-filters">
      <button
        :class="{ active: filter === 'all' }"
        type="button"
        @click="filter = 'all'"
      >
        全部
      </button>
      <button
        :class="{ active: filter === 'cat' }"
        type="button"
        @click="filter = 'cat'"
      >
        猫猫
      </button>
      <button
        :class="{ active: filter === 'dog' }"
        type="button"
        @click="filter = 'dog'"
      >
        狗狗
      </button>
    </div>

    <div class="skin-grid">
      <button
        v-for="skin in filteredSkins"
        :key="skin.id"
        class="skin-card"
        :class="{ active: petStore.skinId === skin.id }"
        :data-skin-id="skin.id"
        :style="{ '--accent': skin.accent }"
        type="button"
        @click="petStore.setSkin(skin.id)"
      >
        <span class="preview-wrap">
          <span class="realism-badge">半写实 3D</span>
          <span
            class="skin-preview"
            :style="{
              backgroundImage: `url(${skin.spritesheet})`,
              backgroundSize: `800% ${skin.spriteRows * 100}%`,
            }"
          />
        </span>

        <span class="skin-copy">
          <span>
            <strong>{{ skin.name }}</strong>
            <i v-if="petStore.skinId === skin.id">使用中</i>
          </span>
          <small>{{ skin.breed }}</small>
          <em>{{ skin.tagline }}</em>
        </span>
      </button>

      <button
        aria-label="定制专属桌宠皮肤"
        class="skin-card custom-card"
        data-testid="custom-skin"
        style="--accent: #6f7fd8"
        type="button"
        @click="openCustomization"
      >
        <span class="preview-wrap custom-preview">
          <span class="realism-badge">专属定制</span>
          <img
            alt=""
            draggable="false"
            src="/custom-skin/arvin-wechat.jpg"
          >
        </span>

        <span class="skin-copy">
          <span>
            <strong>定制你的专属皮肤</strong>
            <i>扫码联系</i>
          </span>
          <small>猫猫、狗狗或原创角色</small>
          <em>把熟悉的它带到桌面，适配完整动作与目光跟随</em>
        </span>

        <span
          aria-hidden="true"
          class="custom-arrow i-solar:arrow-right-up-bold"
        />
      </button>
    </div>

    <footer>
      <span class="i-solar:shield-check-bold" />
      真实毛发质感 · 全动作与 16 向目光完整适配
    </footer>

    <Teleport to="body">
      <Transition name="custom-modal">
        <div
          v-if="customizationOpen"
          class="custom-overlay"
          role="presentation"
          @click.self="closeCustomization"
          @mousedown.stop
          @mousemove.stop
        >
          <section
            ref="customizationDialog"
            aria-labelledby="customization-title"
            aria-modal="true"
            class="custom-dialog"
            data-testid="custom-skin-dialog"
            role="dialog"
            tabindex="-1"
            @keydown.esc="closeCustomization"
          >
            <div class="custom-qr">
              <img
                alt="Arvin 的微信二维码"
                draggable="false"
                src="/custom-skin/arvin-wechat.jpg"
              >
            </div>

            <div class="custom-details">
              <button
                aria-label="关闭定制皮肤二维码"
                class="custom-close"
                type="button"
                @click="closeCustomization"
              >
                <span class="i-solar:close-circle-bold" />
              </button>

              <span class="custom-eyebrow">DRUMCAT CUSTOM</span>
              <h2 id="customization-title">
                把你熟悉的它，带到桌面
              </h2>
              <p>
                扫码添加 Arvin，发送宠物或角色照片，并告诉我品种、花色和想要的动作，即可沟通专属桌宠皮肤。
              </p>

              <ol>
                <li><span>1</span><strong>发送参考图</strong><small>建议准备 3–6 张清晰照片</small></li>
                <li><span>2</span><strong>确认角色细节</strong><small>品种、花色、名字和动作偏好</small></li>
                <li><span>3</span><strong>交付完整皮肤</strong><small>适配眨眼、互动、睡眠与目光跟随</small></li>
              </ol>

              <div class="custom-contact">
                <span class="i-solar:qr-code-bold" />
                <div>
                  <strong>微信：Arvin</strong>
                  <small>使用微信扫一扫添加好友</small>
                </div>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.skin-picker {
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

.skin-picker.is-embedded {
  position: static;
  width: 100%;
  height: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.skin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 17px 11px;
}

.skin-header div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.skin-header small {
  color: #9aa1ae;
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 1.3px;
}

.skin-header strong {
  color: #363d49;
  font-size: 17px;
  letter-spacing: -0.5px;
}

.skin-header button {
  display: grid;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 10px;
  place-items: center;
  background: transparent;
  color: #858d9b;
  cursor: pointer;
  font-size: 18px;
}

.skin-header button:hover {
  background: #eef1f5;
  color: #505866;
}

.skin-filters {
  display: flex;
  gap: 4px;
  padding: 0 14px 10px;
}

.is-embedded .skin-filters {
  padding-inline: 0;
}

.skin-filters button {
  border: 0;
  border-radius: 999px;
  padding: 5px 11px;
  background: #edf0f4;
  color: #858c99;
  cursor: pointer;
  font-size: 10px;
  font-weight: 650;
}

.skin-filters button.active {
  background: #3f4653;
  color: #fff;
}

.skin-grid {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  overflow-y: auto;
  padding: 0 12px 12px;
}

.is-embedded .skin-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  overflow: visible;
  padding: 0;
}

.skin-card {
  position: relative;
  display: grid;
  min-width: 0;
  align-items: stretch;
  grid-template-columns: 132px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #e2e5eb;
  border-radius: 17px;
  padding: 0;
  background: #fff;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    transform 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.is-embedded .skin-card {
  display: flex;
  flex-direction: column;
}

.custom-card {
  position: relative;
}

.is-embedded .custom-card {
  display: grid;
  min-height: 142px;
  grid-column: 1 / -1;
  grid-template-columns: 150px minmax(0, 1fr);
}

.skin-card:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, #dfe3ea);
  box-shadow: 0 9px 24px rgba(50, 57, 72, 0.09);
  transform: translateY(-2px);
}

.skin-card.active {
  border-color: color-mix(in srgb, var(--accent) 78%, #fff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent);
}

.preview-wrap {
  position: relative;
  display: grid;
  height: 142px;
  place-items: end center;
  background:
    radial-gradient(circle at 50% 73%, color-mix(in srgb, var(--accent) 17%, transparent), transparent 48%),
    linear-gradient(150deg, color-mix(in srgb, var(--accent) 9%, #fff), #f8f9fb);
}

.is-embedded .preview-wrap {
  height: 156px;
}

.skin-preview {
  display: block;
  width: 112px;
  aspect-ratio: 192 / 208;
  background-position: 0 0;
  background-repeat: no-repeat;
  filter: drop-shadow(0 7px 7px rgba(42, 47, 59, 0.13));
}

.is-embedded .skin-preview {
  width: 120px;
}

.custom-preview {
  overflow: hidden;
  background: radial-gradient(circle at 48% 50%, rgba(111, 127, 216, 0.16), transparent 58%), #f5f6fb;
}

.custom-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 57%;
  transform: scale(1.42);
}

.is-embedded .custom-preview {
  height: 142px;
}

.skin-copy {
  display: flex;
  min-width: 0;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
}

.skin-copy > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.skin-copy strong {
  overflow: hidden;
  color: #3f4653;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skin-copy i {
  flex: none;
  border-radius: 999px;
  padding: 2px 5px;
  background: color-mix(in srgb, var(--accent) 14%, #fff);
  color: color-mix(in srgb, var(--accent) 75%, #303744);
  font-size: 7px;
  font-style: normal;
  font-weight: 750;
}

.realism-badge {
  position: absolute;
  z-index: 2;
  top: 9px;
  left: 9px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 999px;
  padding: 3px 6px;
  background: rgba(44, 49, 58, 0.68);
  color: #fff;
  font-size: 7px;
  font-weight: 750;
  letter-spacing: 0.2px;
  backdrop-filter: blur(8px);
}

.skin-copy small,
.skin-copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skin-copy small {
  color: #868e9b;
  font-size: 9px;
}
.skin-copy em {
  color: #a3a9b3;
  font-size: 8px;
  font-style: normal;
}

.custom-card .skin-copy {
  padding-right: 35px;
}

.custom-card .skin-copy em {
  overflow: visible;
  line-height: 1.45;
  text-overflow: clip;
  white-space: normal;
}

.custom-arrow {
  position: absolute;
  right: 12px;
  bottom: 12px;
  color: #7a86c4;
  font-size: 16px;
}

footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: auto;
  border-top: 1px solid #eceef2;
  padding: 9px 12px;
  color: #989faa;
  font-size: 8px;
}

.is-embedded footer {
  justify-content: flex-start;
  margin-top: 12px;
  border: 0;
  padding: 0;
}

.custom-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  padding: 18px;
  place-items: center;
  background: rgba(27, 31, 41, 0.48);
  backdrop-filter: blur(15px);
}

.custom-dialog {
  display: grid;
  width: min(620px, calc(100vw - 36px));
  max-height: calc(100vh - 36px);
  grid-template-columns: minmax(0, 250px) minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 26px;
  outline: 0;
  background: #fff;
  box-shadow: 0 28px 90px rgba(18, 23, 34, 0.3);
}

.custom-qr {
  display: grid;
  min-height: 350px;
  place-items: center;
  overflow: hidden;
  border-right: 1px solid #eceef3;
  padding: 14px;
  background: radial-gradient(circle at 50% 45%, rgba(111, 127, 216, 0.13), transparent 55%), #f6f7fa;
}

.custom-qr img {
  display: block;
  width: 100%;
  max-height: 100%;
  border: 1px solid #e5e7ec;
  border-radius: 18px;
  object-fit: contain;
  box-shadow: 0 12px 32px rgba(55, 63, 83, 0.1);
}

.custom-details {
  position: relative;
  display: flex;
  min-width: 0;
  justify-content: center;
  flex-direction: column;
  padding: 29px 26px;
}

.custom-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  place-items: center;
  background: #f1f3f6;
  color: #737c8c;
  cursor: pointer;
  font-size: 18px;
}

.custom-eyebrow {
  color: #7888d0;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.25px;
}

.custom-details h2 {
  margin: 7px 0 8px;
  color: #343b49;
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.7px;
}

.custom-details > p {
  margin: 0;
  color: #878f9d;
  font-size: 10px;
  line-height: 1.65;
}

.custom-details ol {
  display: grid;
  gap: 8px;
  margin: 18px 0;
  padding: 0;
  list-style: none;
}

.custom-details li {
  display: grid;
  align-items: center;
  grid-template-columns: 25px minmax(0, 1fr);
  border: 1px solid #eceef3;
  border-radius: 13px;
  padding: 8px 9px;
  background: #fafbfc;
}

.custom-details li > span {
  display: grid;
  width: 19px;
  height: 19px;
  border-radius: 7px;
  place-items: center;
  background: #e9edff;
  color: #6375c5;
  font-size: 8px;
  font-weight: 800;
  grid-row: 1 / 3;
}

.custom-details li strong {
  color: #515966;
  font-size: 9px;
}

.custom-details li small {
  margin-top: 1px;
  color: #a0a6b0;
  font-size: 7px;
}

.custom-contact {
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 14px;
  padding: 10px 12px;
  background: #303746;
  color: #fff;
}

.custom-contact > span {
  font-size: 24px;
}

.custom-contact div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.custom-contact strong {
  font-size: 10px;
}

.custom-contact small {
  color: rgba(255, 255, 255, 0.66);
  font-size: 7px;
}

.custom-modal-enter-active,
.custom-modal-leave-active {
  transition: opacity 160ms ease;
}

.custom-modal-enter-active .custom-dialog,
.custom-modal-leave-active .custom-dialog {
  transition: transform 180ms ease;
}

.custom-modal-enter-from,
.custom-modal-leave-to {
  opacity: 0;
}

.custom-modal-enter-from .custom-dialog,
.custom-modal-leave-to .custom-dialog {
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 580px) {
  .custom-dialog {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .custom-qr {
    min-height: 0;
    border-right: 0;
    border-bottom: 1px solid #eceef3;
  }

  .custom-qr img {
    width: min(260px, 100%);
  }
}
</style>
