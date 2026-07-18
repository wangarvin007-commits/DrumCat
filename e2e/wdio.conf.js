import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const appBinaryPath = process.env.DRUMCAT_BINARY
  || path.resolve(
    directory,
    '..',
    'target',
    'release',
    process.platform === 'win32' ? 'drum-cat.exe' : 'drum-cat',
  )

if (!existsSync(appBinaryPath)) {
  throw new Error(`DrumCat binary does not exist: ${appBinaryPath}`)
}

const windowsWebViewCapabilities = process.platform === 'win32'
  ? {
      'ms:edgeOptions': {
        webviewOptions: {
          userDataFolder: process.env.DRUMCAT_WEBDRIVER_USER_DATA_DIR
            || path.join(process.env.RUNNER_TEMP || process.env.TEMP || directory, 'drumcat-wdio-webview2'),
        },
      },
    }
  : {}

export const config = {
  runner: 'local',
  specs: ['./test/**/*.e2e.js'],
  maxInstances: 1,
  capabilities: [{
    'browserName': 'tauri',
    ...windowsWebViewCapabilities,
    'tauri:options': {
      application: appBinaryPath,
    },
    'wdio:tauriServiceOptions': {
      appBinaryPath,
      appArgs: [],
    },
  }],
  logLevel: process.env.DEBUG ? 'debug' : 'info',
  logLevels: {
    'webdriver': 'info',
    '@wdio/tauri-service': 'info',
  },
  bail: 0,
  baseUrl: '',
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,
  autoXvfb: false,
  outputDir: path.join(directory, 'logs'),
  services: [[
    '@wdio/tauri-service',
    {
      driverProvider: 'external',
      autoInstallTauriDriver: true,
      autoDownloadEdgeDriver: true,
    },
  ]],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 90_000,
  },
}
