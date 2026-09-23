import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const isElectronBuild = mode === 'electron'
  const disablePwa = isElectronBuild || process.env.DISABLE_PWA === '1'

  return {
  base: isElectronBuild ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
  ].concat(
    disablePwa
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['cubrid-logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
            manifest: {
              name: 'Next CUBRID Admin',
              short_name: 'NCA',
              description: 'Modern Web-based Management Interface for CUBRID Database.',
              theme_color: '#ffffff',
              background_color: '#ffffff',
              display: 'standalone',
              start_url: '/',
              scope: '/',
              icons: [
                {
                  src: 'pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
                {
                  src: 'pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                },
              ],
            },
            devOptions: {
              // Self-signed HTTPS (local stack) cannot register SW — avoid console SecurityError
              enabled: false,
            },
          }),
        ]
  ),
  /** Same output as `tools/serve-web-manager.js`: root `dist/apps/web-manager` */
  build: {
    outDir: '../../dist/apps/web-manager',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '0.0.0.0', // Necessary for Tailscale/Docker
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:8080',
        changeOrigin: true,
        secure: false, // self-signed cert in dev
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: true,
  },
  }
})
