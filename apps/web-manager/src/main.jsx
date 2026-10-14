import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import AppRouter from './app/AppRouter'
import { store } from './app/store'
import './styles/index.css'
import App from './app/App'

import { ToastProvider } from './infrastructure/context/ToastContext'
import { CmsJobProvider } from './infrastructure/context/CmsJobContext'
import { ConfirmProvider } from './infrastructure/context/ConfirmContext'
import { ErrorBoundary } from './infrastructure/ErrorBoundary'
import { registerDesktopExitAuthReset } from './app/registerDesktopExitAuthReset'

registerDesktopExitAuthReset()

// Development must always reflect current source. Clean up any production
// PWA worker/cache left behind on the same localhost origin.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    await Promise.all(registrations.map((registration) => registration.unregister()))
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ToastProvider>
        <CmsJobProvider>
          <ConfirmProvider>
            <AppRouter>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </AppRouter>
          </ConfirmProvider>
        </CmsJobProvider>
      </ToastProvider>
    </Provider>
  </StrictMode>,
)
