import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const devServiceWorkerCleanup = {
  name: 'dev-service-worker-cleanup',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname
      if (pathname !== '/sw.js') {
        next()
        return
      }

      // A production PWA worker previously registered on this localhost
      // origin can keep serving an old bundle even while Vite serves current
      // source. Replace it with a one-shot worker that clears caches,
      // unregisters itself, and reloads controlled tabs onto the dev server.
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(`
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.map((client) => client.navigate(client.url)));
  })());
});
`)
    })
  },
}

export default defineConfig(({ mode, command }) => {
  const isElectronBuild = mode === 'electron'
  const disablePwa = isElectronBuild || process.env.DISABLE_PWA === '1'
  const isDevServer = command === 'serve'

  return {
  base: isElectronBuild ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    ...(isDevServer ? [devServiceWorkerCleanup] : []),
  ].concat(
    disablePwa
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['cubrid-logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
            manifest: {
              name: 'CUBRID Web Manager',
              short_name: 'CWM',
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
