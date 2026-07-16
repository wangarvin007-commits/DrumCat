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
let tauriDriver
let shuttingDown = false

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

    const chatButton = await driver.findElement(By.css('[data-testid="open-chat"]'))
    await driver.wait(until.elementIsVisible(chatButton), 5_000)
    await chatButton.click()

    await driver.wait(until.elementLocated(By.css('[data-testid="companion-panel"]')), 5_000)
    const input = await driver.findElement(By.css('[data-testid="chat-input"]'))
    await input.sendKeys('敲鼓给我听', Key.ENTER)

    await driver.wait(async () => {
      const messages = await driver.findElements(By.css('.message.is-assistant'))
      const texts = await Promise.all(messages.map(message => message.getText()))
      return texts.some(text => text.includes('给你来一段节奏'))
    }, 8_000)

    const pet = await driver.findElement(By.css('[data-testid="pet-sprite"]'))
    expect(await pet.getAttribute('data-animation-state')).to.equal('tapping')
  })

  it('keeps manual sleep active during passive mouse movement and wakes explicitly', async () => {
    const input = await driver.findElement(By.css('[data-testid="chat-input"]'))
    const pet = await driver.findElement(By.css('[data-testid="pet-sprite"]'))

    await input.sendKeys('睡觉', Key.ENTER)
    await driver.wait(async () => await pet.getAttribute('data-sleeping') === 'true', 8_000)

    const viewport = await driver.findElement(By.css('.pet-viewport'))
    await driver.actions().move({ origin: viewport, x: 20, y: 20 }).perform()
    await driver.sleep(400)
    expect(await pet.getAttribute('data-sleeping')).to.equal('true')

    await input.sendKeys('醒醒', Key.ENTER)
    await driver.wait(async () => await pet.getAttribute('data-sleeping') === 'false', 8_000)
  })

  it('switches to the dog skin and opens the custom-skin QR dialog', async () => {
    const closeButton = await driver.findElement(By.css('[aria-label="关闭陪伴面板"]'))
    await closeButton.click()

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

    const pet = await driver.findElement(By.css('[data-testid="pet-sprite"]'))
    await driver.wait(
      async () => await pet.getAttribute('data-skin-id') === 'realistic-shiba-inu',
      5_000,
    )

    await driver.findElement(By.css('[data-testid="custom-skin"]')).click()
    const dialog = await driver.wait(
      until.elementLocated(By.css('[data-testid="custom-skin-dialog"]')),
      5_000,
    )
    expect(await dialog.isDisplayed()).to.equal(true)

    const qr = await dialog.findElement(By.css('img[alt="Arvin 的微信二维码"]'))
    expect(await qr.getAttribute('src')).to.include('/custom-skin/arvin-wechat.jpg')
  })
})
