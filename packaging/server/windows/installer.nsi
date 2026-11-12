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

; Drops the line break and spaces at the end of a command's output. nsExec
; returns the output as printed, with its trailing CR LF (PowerShell prints
; "S-1-5-32-544" + CR LF), so it must be trimmed before any comparison:
; without this the owner check failed on every Windows and an upgrade moved
; the data folder, and its secrets.json, aside.
!macro TrimOutput var
  ${Do}
    StrCpy $R9 ${var} 1 -1
    ${If} $R9 == "$\r"
    ${OrIf} $R9 == "$\n"
    ${OrIf} $R9 == " "
    ${OrIf} $R9 == "$\t"
      StrCpy ${var} ${var} -1
    ${Else}
      ${ExitDo}
    ${EndIf}
  ${Loop}
!macroend

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

; Reads the owner SID of $DataDir as a string ("S-1-5-32-544") into $4, with
; $3 = 0 on success, through Win32 (GetNamedSecurityInfoW, then
; ConvertSidToStringSidW). Not PowerShell: launched from a PowerShell 7
; session, setup passes PSModulePath on and Windows PowerShell's Get-Acl then
; fails to load its module, which stopped every reinstall.
Function ReadDataFolderOwner
  StrCpy $4 ""
  ; SE_FILE_OBJECT = 1, OWNER_SECURITY_INFORMATION = 1; $5 = owner SID, $6 = descriptor to free.
  System::Call 'advapi32::GetNamedSecurityInfoW(w "$DataDir", i 1, i 1, *p .r5, p 0, p 0, p 0, *p .r6) i .r3'
  ${If} $3 != 0
    Return
  ${EndIf}
  System::Call 'advapi32::ConvertSidToStringSidW(p r5, *p .r7) i .r8'
  ${If} $8 == 0
    StrCpy $3 "SID"
  ${Else}
    System::Call '*$7(&w256 .r4)'
    System::Call 'kernel32::LocalFree(p r7)'
  ${EndIf}
  System::Call 'kernel32::LocalFree(p r6)'
  !insertmacro TrimOutput $4
FunctionEnd

; Moves a data folder that setup did not make out of the way, and says where.
Function MoveDataFolderAside
  ${GetTime} "" "L" $3 $4 $5 $6 $7 $8 $9
  StrCpy $9 "$DataDir.preexisting-$5$4$3-$7$8$9"
  Rename "$DataDir" "$9"
  ${If} ${FileExists} "$DataDir\*.*"
    MessageBox MB_ICONSTOP "$DataDir already exists and was not made by ${PRODUCT} setup. Move it away, then run setup again." /SD IDOK
    Abort
  ${EndIf}
  DetailPrint "$DataDir was not made by ${PRODUCT} setup: moved it to $9."
  MessageBox MB_ICONINFORMATION "$DataDir was not made by ${PRODUCT} setup, so it was moved to:$\r$\n$9$\r$\n$\r$\nSetup creates a new, empty data folder." /SD IDOK
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
    !insertmacro TrimOutput $1
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
  ;  - Installed now (a registered service or our install entry, i.e. an
  ;    upgrade or a repair): the folder is ours, locked since that install,
  ;    so it is kept as it is. Its secrets.json must never change.
  ;  - Not installed, but our record says setup made it (uninstall keeps it):
  ;    kept if Administrators or SYSTEM still own it; if the owner cannot be
  ;    read, setup stops and changes nothing.
  ;  - Otherwise it may hold settings or keys planted by another local user,
  ;    so it is moved aside (and the user is told where) and a new one is made.
  ReadRegStr $0 HKLM "${DATA_KEY}" "DataFolder"
  ReadRegStr $1 HKLM "${UNINSTALL_KEY}" "InstallLocation"
  ${If} ${FileExists} "$DataDir\*.*"
    ${If} $Registered == 1
    ${OrIf} $1 != ""
      DetailPrint "Keeping the data folder of the installed ${PRODUCT}: $DataDir"
    ${ElseIf} $0 == $DataDir
      Call ReadDataFolderOwner
      DetailPrint "Owner of $DataDir: $4 (exit code $3)"
      ${If} $3 != 0
      ${OrIf} $4 == ""
        MessageBox MB_ICONSTOP "Setup could not check who owns $DataDir (error $3). Nothing was changed. Run setup again as an administrator." /SD IDOK
        Abort
      ${EndIf}
      ${If} $4 != "S-1-5-32-544"
      ${AndIf} $4 != "S-1-5-18"
        Call MoveDataFolderAside
      ${EndIf}
    ${Else}
      Call MoveDataFolderAside
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
