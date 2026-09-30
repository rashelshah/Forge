import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = process.env.VITE_API_URL || 'http://localhost:4000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173, proxy: { '/api': api, '/p': api } },
})
