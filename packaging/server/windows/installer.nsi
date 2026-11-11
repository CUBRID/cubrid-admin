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
!include "FileFunc.nsh"

!define PRODUCT "CUBRID Admin Server"
!define COMPANY "CUBRID Corporation"
!define SERVICE "$INSTDIR\cubrid-admin-service.exe"
; The service runs as this virtual account, not LocalSystem (WinSW 2.12 has no
; setting for virtual accounts, so sc.exe sets it after WinSW registers the service).
!define SERVICE_ACCOUNT "NT SERVICE\cubrid-admin"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CUBRID Admin Server"
; Kept on uninstall: records that setup made the data folder (only administrators can write HKLM).
!define DATA_KEY "Software\CUBRID\CUBRID Admin Server"

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
; An upgrade keeps the installed folder: the running service points there.
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipDirectoryOnUpgrade
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var DataDir
Var WasRunning
Var Registered
Var InstalledDir

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${PRODUCT} needs 64-bit Windows." /SD IDOK
    Abort
  ${EndIf}
  SetRegView 64
  ReadRegStr $InstalledDir HKLM "${UNINSTALL_KEY}" "InstallLocation"
  ${If} $InstalledDir != ""
    StrCpy $INSTDIR $InstalledDir
  ${EndIf}
FunctionEnd

Function SkipDirectoryOnUpgrade
  ${If} $InstalledDir != ""
    Abort
  ${EndIf}
FunctionEnd

; Stops setup when a step that protects the data folder fails.
!macro StopOnFailure what
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "${PRODUCT} setup could not ${what} (exit code $0). Setup stopped; the data folder may not be protected yet, and the ${PRODUCT} service is stopped. Run setup again as an administrator; to start the service anyway: sc start cubrid-admin" /SD IDOK
    Abort
  ${EndIf}
!macroend

Function un.onInit
  SetRegView 64
FunctionEnd

Section "Install"
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${PRODUCT}" ; ProgramData (all users)

  ; Upgrade: is the service registered (sc.exe query exits 0) and running? Stop it
  ; with stopwait, which returns only once it has stopped, so its executable is
  ; no longer locked when it is replaced.
  StrCpy $Registered 0
  StrCpy $WasRunning 0
  nsExec::ExecToStack '"$SYSDIR\sc.exe" query cubrid-admin'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $Registered 1
  ${EndIf}
  ${If} $Registered == 1
  ${AndIf} ${FileExists} "${SERVICE}"
    nsExec::ExecToStack '"${SERVICE}" status'
    Pop $0
    Pop $1
    StrCpy $1 $1 7
    ${If} $1 == "Started"
      StrCpy $WasRunning 1
    ${EndIf}
    nsExec::ExecToLog '"${SERVICE}" stopwait'
  ${EndIf}

  SetOutPath "$INSTDIR"
  File "${SRCDIR}\cubrid-admin.exe"
  File "${SRCDIR}\cubrid-admin-service.exe"
  File "${SRCDIR}\cubrid-admin-service.xml"
  File "${SRCDIR}\cwm.conf.sample"
  File "${SRCDIR}\cwm.conf.reference.md"

  ; ---- The data folder ----
  ; It holds cwm-vault\secrets.json, which decrypts every saved password. Only
  ; SYSTEM, Administrators and the service account may use it, and it must be
  ; owned by Administrators or SYSTEM: an owner can always change its access.
  ; An existing folder is kept only when setup made it (our record, a
  ; registered service or an install entry) AND Administrators or SYSTEM own
  ; it; otherwise it may hold settings or keys planted by another local user,
  ; so it is moved aside and a new one is made.
  ReadRegStr $0 HKLM "${DATA_KEY}" "DataFolder"
  ReadRegStr $1 HKLM "${UNINSTALL_KEY}" "InstallLocation"
  ${If} ${FileExists} "$DataDir\*.*"
    StrCpy $2 0
    ${If} $0 == $DataDir
    ${OrIf} $Registered == 1
    ${OrIf} $1 != ""
      nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "[Console]::Write((Get-Acl -LiteralPath '$DataDir').GetOwner([System.Security.Principal.SecurityIdentifier]).Value)"`
      Pop $3
      Pop $4
      ${If} $3 == 0
      ${AndIf} $4 == "S-1-5-32-544"
        StrCpy $2 1
      ${ElseIf} $3 == 0
      ${AndIf} $4 == "S-1-5-18"
        StrCpy $2 1
      ${EndIf}
    ${EndIf}
    ${If} $2 == 0
      ${GetTime} "" "L" $3 $4 $5 $6 $7 $8 $9
      StrCpy $9 "$DataDir.preexisting-$5$4$3-$7$8$9"
      Rename "$DataDir" "$9"
      ${If} ${FileExists} "$DataDir\*.*"
        MessageBox MB_ICONSTOP "$DataDir already exists and was not made by ${PRODUCT} setup. Move it away, then run setup again." /SD IDOK
        Abort
      ${EndIf}
      DetailPrint "$DataDir was not made by ${PRODUCT} setup: moved it to $9."
      MessageBox MB_ICONINFORMATION "$DataDir was not made by ${PRODUCT} setup, so it was moved to:$\r$\n$9$\r$\n$\r$\nSetup creates a new, empty data folder." /SD IDOK
    ${EndIf}
  ${EndIf}

  ; A new data folder is made under a random name, locked and given to
  ; Administrators first, and only then renamed into place: the rename fails
  ; if someone created the name in the meantime, so nothing else can slip in.
  ${IfNot} ${FileExists} "$DataDir\*.*"
    ; An unguessable name (a GUID) that must not exist yet.
    System::Call 'ole32::CoCreateGuid(g .r3)'
    StrCpy $4 "$DataDir.new-$3"
    ${If} ${FileExists} "$4\*.*"
      MessageBox MB_ICONSTOP "$4 already exists. Remove it, then run setup again." /SD IDOK
      Abort
    ${EndIf}
    CreateDirectory "$4"
    nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$4" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F /Q'
    !insertmacro StopOnFailure "restrict access to the new data folder"
    nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$4" /setowner *S-1-5-32-544 /T /C /Q'
    !insertmacro StopOnFailure "give the new data folder to Administrators"
    ; Until the lock above, it had the ProgramData access: anything put in it
    ; meanwhile is not ours. Once locked, nobody else can add to it.
    ${DirState} "$4" $5
    ${If} $5 != 0
      RMDir /r "$4"
      MessageBox MB_ICONSTOP "Something was put into the new data folder while setup was creating it. Setup stopped; run it again." /SD IDOK
      Abort
    ${EndIf}
    ClearErrors
    Rename "$4" "$DataDir"
    ${If} ${Errors}
      RMDir /r "$4"
      MessageBox MB_ICONSTOP "$DataDir appeared while setup was creating it. Check who made it, move it away, then run setup again." /SD IDOK
      Abort
    ${EndIf}
  ${EndIf}

  ; Settings are created once and never replaced.
  CreateDirectory "$DataDir\conf"
  CreateDirectory "$DataDir\logs"
  ${IfNot} ${FileExists} "$DataDir\conf\cwm.conf"
    CopyFiles /SILENT "$INSTDIR\cwm.conf.sample" "$DataDir\conf\cwm.conf"
  ${EndIf}

  ; Register the service only when it is not registered yet (an upgrade keeps it),
  ; then make it run as the virtual account (also on upgrade, for older installs).
  ${If} $Registered == 0
    nsExec::ExecToLog '"${SERVICE}" install'
    !insertmacro StopOnFailure "register the Windows service"
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\sc.exe" config cubrid-admin obj= "${SERVICE_ACCOUNT}"'
  !insertmacro StopOnFailure "set the service account ${SERVICE_ACCOUNT}"

  ; The data folder holds cwm-vault\secrets.json, which decrypts every saved
  ; password: only SYSTEM, Administrators and the service account may use it.
  ; Drop the inherited ProgramData access (Users may read and create there),
  ; and make everything below inherit only these grants. Applied on every
  ; install and upgrade. (*S-1-5-18 = SYSTEM, *S-1-5-32-544 = Administrators,
  ; by SID so a localized Windows works too.)
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$DataDir" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F "${SERVICE_ACCOUNT}:(OI)(CI)F" /Q'
  !insertmacro StopOnFailure "restrict access to the data folder"
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$DataDir\*" /reset /T /C /Q'
  !insertmacro StopOnFailure "reset access below the data folder"
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$DataDir" /setowner *S-1-5-32-544 /T /C /Q'
  !insertmacro StopOnFailure "give the data folder to Administrators"

  ${If} $WasRunning == 1
    nsExec::ExecToLog '"${SERVICE}" start'
  ${EndIf}

  WriteRegStr HKLM "${DATA_KEY}" "DataFolder" "$DataDir"
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
  ; stopwait: the files below can only be deleted once the service has stopped.
  nsExec::ExecToLog '"${SERVICE}" stopwait'
  nsExec::ExecToLog '"${SERVICE}" uninstall'
  Delete "$INSTDIR\cubrid-admin.exe"
  Delete "$INSTDIR\cubrid-admin-service.exe"
  Delete "$INSTDIR\cubrid-admin-service.xml"
  Delete "$INSTDIR\cwm.conf.sample"
  Delete "$INSTDIR\cwm.conf.reference.md"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  ; Settings and data in %ProgramData%\${PRODUCT} are kept, and so is
  ; ${DATA_KEY}, so a later install uses them again.
SectionEnd
