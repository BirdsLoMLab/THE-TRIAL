import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fathomsContent } from './scripts/vite-plugin-content.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [fathomsContent(), react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
