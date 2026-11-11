; CUBRID Admin Server setup for Windows x64, built by scripts/package-server-installers.mjs:
;   makensis -DVERSION=0.1.0.0001 -DVERSION4=0.1.0.1 -DYEAR=2026 -DSRCDIR=<files> -DOUTFILE=<setup.exe> installer.nsi
; Program files go to Program Files; settings and data stay in
; %ProgramData%\CUBRID Admin Server, which upgrade and uninstall never remove.
; The Windows service is WinSW (cubrid-admin-service.exe + cubrid-admin-service.xml).

Unicode true
ManifestDPIAware true
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"

!define PRODUCT "CUBRID Admin Server"
!define COMPANY "CUBRID Corporation"
!define SERVICE "$INSTDIR\cubrid-admin-service.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CUBRID Admin Server"

Name "${PRODUCT}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\${PRODUCT}"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
BrandingText "${PRODUCT} ${VERSION}"

VIProductVersion "${VERSION4}"
VIAddVersionKey "ProductName" "${PRODUCT}"
VIAddVersionKey "CompanyName" "${COMPANY}"
VIAddVersionKey "FileDescription" "${PRODUCT} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright © ${YEAR} ${COMPANY}"

!define MUI_FINISHPAGE_TITLE "${PRODUCT} is installed"
!define MUI_FINISHPAGE_TEXT "Settings: %ProgramData%\${PRODUCT}\conf\cwm.conf$\r$\n$\r$\nOn a new install the service is registered but not started, because PORT (8080 by default) may be in use. Set PORT, then start the $\"${PRODUCT}$\" service (services.msc, or: sc start cubrid-admin).$\r$\n$\r$\nOn an upgrade the service is started again if it was running."
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var DataDir
Var WasRunning

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${PRODUCT} needs 64-bit Windows." /SD IDOK
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Function un.onInit
  SetRegView 64
FunctionEnd

Section "Install"
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${PRODUCT}" ; ProgramData (all users)

  ; Upgrade: stop the service before its files are replaced, and remember whether it ran.
  StrCpy $WasRunning 0
  ${If} ${FileExists} "${SERVICE}"
    nsExec::ExecToStack '"${SERVICE}" status'
    Pop $0
    Pop $1
    StrCpy $1 $1 7
    ${If} $1 == "Started"
      StrCpy $WasRunning 1
    ${EndIf}
    nsExec::ExecToLog '"${SERVICE}" stop'
  ${EndIf}

  SetOutPath "$INSTDIR"
  File "${SRCDIR}\cubrid-admin.exe"
  File "${SRCDIR}\cubrid-admin-service.exe"
  File "${SRCDIR}\cubrid-admin-service.xml"
  File "${SRCDIR}\cwm.conf.sample"
  File "${SRCDIR}\cwm.conf.reference.md"

  ; Settings are created once and never replaced.
  CreateDirectory "$DataDir\conf"
  CreateDirectory "$DataDir\logs"
  ${IfNot} ${FileExists} "$DataDir\conf\cwm.conf"
    CopyFiles /SILENT "$INSTDIR\cwm.conf.sample" "$DataDir\conf\cwm.conf"
  ${EndIf}

  ; Register the service on a new install; an upgrade keeps the registered one.
  ${If} $WasRunning == 0
    nsExec::ExecToLog '"${SERVICE}" install'
  ${Else}
    nsExec::ExecToLog '"${SERVICE}" start'
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\cubrid-admin.exe"
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  nsExec::ExecToLog '"${SERVICE}" stop'
  nsExec::ExecToLog '"${SERVICE}" uninstall'
  Delete "$INSTDIR\cubrid-admin.exe"
  Delete "$INSTDIR\cubrid-admin-service.exe"
  Delete "$INSTDIR\cubrid-admin-service.xml"
  Delete "$INSTDIR\cwm.conf.sample"
  Delete "$INSTDIR\cwm.conf.reference.md"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  ; Settings and data in %ProgramData%\${PRODUCT} are kept.
SectionEnd
