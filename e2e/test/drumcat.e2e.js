/* global before, describe, it */

import { $, $$, browser } from '@wdio/globals'
import assert from 'node:assert/strict'
import process from 'node:process'

let initialPetWindowRect

function logStep(message) {
  process.stdout.write(`[drumcat-e2e] ${message}\n`)
}

async function getAttribute(selector, attribute) {
  const elements = await $$(selector)
  if (elements.length === 0) return null
  return elements[0].getAttribute(attribute)
}

async function switchToWindowByHash(hash, timeoutMs = 10_000) {
  let matchingHandle

  await browser.waitUntil(async () => {
    const handles = await browser.getWindowHandles()

    for (const handle of handles) {
      await browser.switchToWindow(handle)

      if (new URL(await browser.getUrl()).hash === hash) {
        matchingHandle = handle
        return true
      }
    }

    return false
  }, {
    timeout: timeoutMs,
    timeoutMsg: `Unable to find window route: ${hash}`,
  })

  return matchingHandle
}

async function enterTextCommand(input, text) {
  await input.click()
  await input.setValue(text)
  await browser.keys('Enter')
}

describe('DrumCat Windows native MVP', () => {
  before(async () => {
    await switchToWindowByHash('#/', 30_000)
  })

  it('opens the compact text-only companion panel', async () => {
    logStep('opening companion chat')
    const viewport = await $('.pet-viewport')
    await viewport.waitForDisplayed({ timeout: 30_000 })
    await viewport.moveTo()
    initialPetWindowRect = await browser.getWindowRect()

    const chatButton = await $('[data-testid="open-chat"]')
    await chatButton.waitForDisplayed({ timeout: 5_000 })
    await chatButton.click()

    const panel = await $('[data-testid="companion-panel"]')
    await panel.waitForExist({ timeout: 5_000 })
    logStep('companion chat is visible')
    await browser.waitUntil(async () => {
      const panelRect = await browser.getWindowRect()
      return panelRect.width > initialPetWindowRect.width && panelRect.width <= 500
    }, { timeout: 5_000 })

    const panelWindowRect = await browser.getWindowRect()
    assert(panelWindowRect.width >= 350 && panelWindowRect.width <= 500)
    assert(panelWindowRect.height >= 480 && panelWindowRect.height <= 560)
    logStep('compact panel geometry is correct')
  })

  it('handles a local text reply and drives its animation', async () => {
    const input = await $('[data-testid="chat-input"]')
    await enterTextCommand(input, '敲鼓给我听')
    logStep('local text command was submitted')

    await browser.waitUntil(async () => {
      const bodyText = await $('body').getText()
      return bodyText.includes('给你来一段节奏')
    }, { timeout: 8_000 })
    logStep('local reply is visible')

    const replyAction = await $('.message.is-assistant[data-action="tap"]')
    await replyAction.waitForExist({ timeout: 5_000 })
    logStep('reply action is recorded as tap')
  })

  it('keeps manual sleep active during passive mouse movement', async () => {
    const input = await $('[data-testid="chat-input"]')

    await enterTextCommand(input, '睡觉')
    await browser.waitUntil(
      async () => await getAttribute('[data-testid="pet-sprite"]', 'data-sleeping') === 'true',
      { timeout: 8_000 },
    )

    const panel = await $('[data-testid="companion-panel"]')
    await panel.moveTo({ xOffset: 20, yOffset: 20 })
    await browser.pause(400)
    assert.equal(await getAttribute('[data-testid="pet-sprite"]', 'data-sleeping'), 'true')
  })

  it('wakes from manual sleep after an explicit command', async () => {
    const input = await $('[data-testid="chat-input"]')
    await enterTextCommand(input, '醒醒')
    await browser.waitUntil(
      async () => await getAttribute('[data-testid="pet-sprite"]', 'data-sleeping') === 'false',
      { timeout: 8_000 },
    )
  })

  it('switches to the dog skin and opens the custom-skin QR dialog', async () => {
    await $('[aria-label="关闭陪伴面板"]').click()
    await browser.waitUntil(async () => {
      const restoredRect = await browser.getWindowRect()
      return restoredRect.width <= 360 && restoredRect.height <= 390
    }, { timeout: 5_000 })

    const restoredRect = await browser.getWindowRect()
    assert(Math.abs(restoredRect.x - initialPetWindowRect.x) <= 4)
    assert(Math.abs(restoredRect.y - initialPetWindowRect.y) <= 4)

    const viewport = await $('.pet-viewport')
    await viewport.moveTo()

    const skinsButton = await $('[data-testid="open-skins"]')
    await skinsButton.waitForDisplayed({ timeout: 5_000 })
    await skinsButton.click()

    const shiba = await $('[data-skin-id="realistic-shiba-inu"]')
    await shiba.waitForExist({ timeout: 5_000 })
    await shiba.click()

    await browser.waitUntil(
      async () => await getAttribute('[data-testid="pet-sprite"]', 'data-skin-id') === 'realistic-shiba-inu',
      { timeout: 5_000 },
    )

    await $('[data-testid="custom-skin"]').click()
    const dialog = await $('[data-testid="custom-skin-dialog"]')
    await dialog.waitForDisplayed({ timeout: 5_000 })

    const qr = await dialog.$('img[alt="Arvin 的微信二维码"]')
    assert((await qr.getAttribute('src')).includes('/custom-skin/arvin-wechat.jpg'))
  })

  it('syncs the memory-only AI key across windows and hides source and voice rows', async () => {
    await $('[aria-label="关闭定制皮肤二维码"]').click()
    await browser.waitUntil(
      async () => (await $$('[data-testid="custom-skin-dialog"]')).length === 0,
      { timeout: 5_000 },
    )
    await $('[aria-label="关闭皮肤选择"]').click()

    const mainHandle = await browser.getWindowHandle()
    const viewport = await $('.pet-viewport')
    await viewport.moveTo()

    const settingsButton = await $('[data-testid="open-settings"]')
    await settingsButton.waitForDisplayed({ timeout: 5_000 })
    await settingsButton.click()

    await switchToWindowByHash('#/preference')
    const companionNav = await $('[data-testid="settings-nav-companion"]')
    await companionNav.waitForExist({ timeout: 8_000 })
    await companionNav.click()

    const enabled = await $('[data-testid="ai-enabled"]')
    if (!await enabled.isSelected()) {
      await $('//input[@data-testid="ai-enabled"]/following-sibling::span').click()
      await browser.waitUntil(() => enabled.isSelected(), { timeout: 5_000 })
    }

    await $('[data-testid="ai-provider"]').selectByAttribute('value', 'openai')
    await $('[data-testid="companion-name"]').setValue('小鼓')
    await $('[data-testid="owner-name"]').setValue('Arvin')
    await $('[data-testid="ai-session-key"]').setValue('memory-only-test-key')

    const companionSettingsText = await $('body').getText()
    assert(!companionSettingsText.includes('语音输入'))
    assert(!companionSettingsText.includes('语音朗读'))

    await browser.switchToWindow(mainHandle)
    await $('[data-testid="open-chat"]').click()
    await browser.waitUntil(async () => {
      const bodyText = await $('body').getText()
      return bodyText.includes('OpenAI 已连接')
    }, { timeout: 5_000 })

    await switchToWindowByHash('#/preference')
    await $('[data-testid="settings-nav-about"]').click()
    const bodyText = await $('body').getText()
    assert(!bodyText.includes('项目源码'))
    assert(!bodyText.includes('技术底座'))
  })
})
