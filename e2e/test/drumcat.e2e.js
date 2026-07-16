import { expect } from 'chai'
import { after, before, describe, it } from 'mocha'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Builder, By, Capabilities, Key, until } from 'selenium-webdriver'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const application = process.env.DRUMCAT_BINARY
  || path.resolve(
    testDirectory,
    '..',
    '..',
    'target',
    'release',
    process.platform === 'win32' ? 'drum-cat.exe' : 'drum-cat',
  )

let driver
let initialPetWindowRect
let tauriDriver
let shuttingDown = false

async function switchToWindowByUrl(fragment, timeoutMs = 10_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const handles = await driver.getAllWindowHandles()

    for (const handle of handles) {
      await driver.switchTo().window(handle)

      if ((await driver.getCurrentUrl()).includes(fragment)) return handle
    }

    await driver.sleep(200)
  }

  throw new Error(`Unable to find window URL containing: ${fragment}`)
}

async function getAttribute(selector, attribute) {
  try {
    const element = await driver.findElement(By.css(selector))
    return await element.getAttribute(attribute)
  } catch {
    return null
  }
}

before(async function () {
  this.timeout(120_000)

  if (!existsSync(application)) {
    throw new Error(`DrumCat binary does not exist: ${application}`)
  }

  const driverName = process.platform === 'win32' ? 'tauri-driver.exe' : 'tauri-driver'
  tauriDriver = spawn(path.join(os.homedir(), '.cargo', 'bin', driverName), [], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  tauriDriver.on('error', (error) => {
    throw error
  })
  tauriDriver.on('exit', (code) => {
    if (!shuttingDown && code !== null) {
      console.error(`tauri-driver exited unexpectedly with code ${code}`)
    }
  })

  const capabilities = new Capabilities()
  capabilities.set('tauri:options', { application })
  capabilities.setBrowserName('wry')

  driver = await new Builder()
    .withCapabilities(capabilities)
    .usingServer('http://127.0.0.1:4444/')
    .build()
})

after(async () => {
  shuttingDown = true

  try {
    await driver?.quit()
  } finally {
    tauriDriver?.kill()
  }
})

describe('DrumCat Windows native MVP', () => {
  it('opens the local chat and drives a reply animation', async () => {
    const viewport = await driver.wait(until.elementLocated(By.css('.pet-viewport')), 30_000)
    await driver.actions().move({ origin: viewport }).perform()
    initialPetWindowRect = await driver.manage().window().getRect()

    const chatButton = await driver.findElement(By.css('[data-testid="open-chat"]'))
    await driver.wait(until.elementIsVisible(chatButton), 5_000)
    await chatButton.click()

    await driver.wait(until.elementLocated(By.css('[data-testid="companion-panel"]')), 5_000)
    await driver.wait(async () => {
      const panelRect = await driver.manage().window().getRect()
      return panelRect.width > initialPetWindowRect.width && panelRect.width <= 500
    }, 5_000)

    const panelWindowRect = await driver.manage().window().getRect()
    expect(panelWindowRect.width).to.be.within(350, 500)
    expect(panelWindowRect.height).to.be.within(480, 560)

    const input = await driver.findElement(By.css('[data-testid="chat-input"]'))
    await input.sendKeys('敲鼓给我听', Key.ENTER)

    await driver.wait(async () => {
      const bodyText = await driver.executeScript('return document.body?.innerText || ""')
      return bodyText.includes('给你来一段节奏')
    }, 8_000)

    await driver.wait(
      async () => await getAttribute('[data-testid="pet-sprite"]', 'data-animation-state') === 'tapping',
      5_000,
    )
  })

  it('keeps manual sleep active during passive mouse movement and wakes explicitly', async () => {
    const input = await driver.findElement(By.css('[data-testid="chat-input"]'))

    await input.sendKeys('睡觉', Key.ENTER)
    await driver.wait(
      async () => await getAttribute('[data-testid="pet-sprite"]', 'data-sleeping') === 'true',
      8_000,
    )

    const panel = await driver.findElement(By.css('[data-testid="companion-panel"]'))
    await driver.actions().move({ origin: panel, x: 20, y: 20 }).perform()
    await driver.sleep(400)
    expect(await getAttribute('[data-testid="pet-sprite"]', 'data-sleeping')).to.equal('true')

    await input.sendKeys('醒醒', Key.ENTER)
    await driver.wait(
      async () => await getAttribute('[data-testid="pet-sprite"]', 'data-sleeping') === 'false',
      8_000,
    )
  })

  it('switches to the dog skin and opens the custom-skin QR dialog', async () => {
    const closeButton = await driver.findElement(By.css('[aria-label="关闭陪伴面板"]'))
    await closeButton.click()
    await driver.wait(async () => {
      const restoredRect = await driver.manage().window().getRect()
      return restoredRect.width <= 360 && restoredRect.height <= 390
    }, 5_000)
    const restoredRect = await driver.manage().window().getRect()
    expect(Math.abs(restoredRect.x - initialPetWindowRect.x)).to.be.at.most(4)
    expect(Math.abs(restoredRect.y - initialPetWindowRect.y)).to.be.at.most(4)

    const viewport = await driver.findElement(By.css('.pet-viewport'))
    await driver.actions().move({ origin: viewport }).perform()

    const skinsButton = await driver.findElement(By.css('[data-testid="open-skins"]'))
    await driver.wait(until.elementIsVisible(skinsButton), 5_000)
    await skinsButton.click()

    const shiba = await driver.wait(
      until.elementLocated(By.css('[data-skin-id="realistic-shiba-inu"]')),
      5_000,
    )
    await shiba.click()

    await driver.wait(
      async () => await getAttribute('[data-testid="pet-sprite"]', 'data-skin-id') === 'realistic-shiba-inu',
      5_000,
    )

    await driver.findElement(By.css('[data-testid="custom-skin"]')).click()
    await driver.wait(async () => {
      try {
        const currentDialog = await driver.findElement(By.css('[data-testid="custom-skin-dialog"]'))
        return await currentDialog.isDisplayed()
      } catch {
        return false
      }
    }, 5_000)

    const dialog = await driver.findElement(By.css('[data-testid="custom-skin-dialog"]'))
    const qr = await dialog.findElement(By.css('img[alt="Arvin 的微信二维码"]'))
    expect(await qr.getAttribute('src')).to.include('/custom-skin/arvin-wechat.jpg')
  })

  it('syncs the memory-only AI key across windows and hides source rows', async () => {
    const closeDialog = await driver.findElement(By.css('[aria-label="关闭定制皮肤二维码"]'))
    await closeDialog.click()
    await driver.wait(async () => (
      await driver.findElements(By.css('[data-testid="custom-skin-dialog"]'))
    ).length === 0, 5_000)
    await driver.findElement(By.css('[aria-label="关闭皮肤选择"]')).click()

    const mainHandle = await driver.getWindowHandle()
    const viewport = await driver.findElement(By.css('.pet-viewport'))
    await driver.actions().move({ origin: viewport }).perform()

    const settingsButton = await driver.findElement(By.css('[data-testid="open-settings"]'))
    await driver.wait(until.elementIsVisible(settingsButton), 5_000)
    await settingsButton.click()

    await switchToWindowByUrl('#/preference')
    await driver.wait(until.elementLocated(By.css('[data-testid="settings-nav-companion"]')), 8_000)
    await driver.findElement(By.css('[data-testid="settings-nav-companion"]')).click()

    const enabled = await driver.findElement(By.css('[data-testid="ai-enabled"]'))
    if (!await enabled.isSelected()) await enabled.click()

    const provider = await driver.findElement(By.css('[data-testid="ai-provider"]'))
    await driver.executeScript(`
      const select = arguments[0]
      select.value = 'openai'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    `, provider)

    const companionName = await driver.findElement(By.css('[data-testid="companion-name"]'))
    await companionName.clear()
    await companionName.sendKeys('小鼓')

    const ownerName = await driver.findElement(By.css('[data-testid="owner-name"]'))
    await ownerName.clear()
    await ownerName.sendKeys('Arvin')

    const apiKey = await driver.findElement(By.css('[data-testid="ai-session-key"]'))
    await apiKey.sendKeys('memory-only-test-key')

    await driver.switchTo().window(mainHandle)
    await driver.findElement(By.css('[data-testid="open-chat"]')).click()
    await driver.wait(async () => {
      const bodyText = await driver.executeScript('return document.body?.innerText || ""')
      return bodyText.includes('OpenAI 已连接')
    }, 5_000)

    await switchToWindowByUrl('#/preference')
    await driver.findElement(By.css('[data-testid="settings-nav-about"]')).click()
    const bodyText = await driver.findElement(By.css('body')).getText()
    expect(bodyText).not.to.include('项目源码')
    expect(bodyText).not.to.include('技术底座')
  })
})
