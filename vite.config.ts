import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { explainApi } from './server/explainApi.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read .env on the server only (the empty prefix loads DEEPSEEK_API_KEY without exposing it to the page).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), explainApi(env.DEEPSEEK_API_KEY)],
  }
})
