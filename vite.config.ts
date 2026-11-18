import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const api = process.env.NOTAS_API_URL ?? 'http://127.0.0.1:18765'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': api } },
  preview: { proxy: { '/api': api } },
})
