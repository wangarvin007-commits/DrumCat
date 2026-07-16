import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useAiSessionStore = defineStore('ai-session', () => {
  const apiKey = ref('')
  const hasApiKey = computed(() => Boolean(apiKey.value.trim()))

  function clearApiKey() {
    apiKey.value = ''
  }

  return {
    apiKey,
    clearApiKey,
    hasApiKey,
  }
}, {
  tauri: {
    save: false,
    saveOnChange: false,
    saveOnExit: false,
    sync: true,
  },
})
