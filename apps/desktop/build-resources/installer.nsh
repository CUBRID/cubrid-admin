; Included by the electron-builder NSIS setup (nsis.include).
; electron-builder writes DisplayVersion as the semver "version" (0.1.0). Write
; the full version (0.1.0.0001) instead, read from the file the desktop build
; writes next to main.js (scripts/product-version.cjs --write). The uninstall
; key does not change, so an upgrade still replaces the same entry.
!searchparse /file "${PROJECT_DIR}/dist/apps/desktop/product-version.json" `{"version":"` CWM_FULL_VERSION `"`

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${CWM_FULL_VERSION}"
!macroend
