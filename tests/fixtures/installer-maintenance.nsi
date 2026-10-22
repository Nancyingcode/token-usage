; 本夹具只写独立临时目录和唯一测试键；两个安装范围均映射到 HKCU，永不使用真实产品登记。
Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
OutFile "${OUTPUT_EXE}"

!addincludedir "${PROJECT_ROOT}\node_modules\app-builder-lib\templates\nsis\include"
!addplugindir /x86-unicode "${PLUGIN_DIRECTORY}"
!include LogicLib.nsh
!include FileFunc.nsh
!include UAC.nsh
!include StdUtils.nsh

!define VERSION "0.10.0"
!define APP_FILENAME "CodexTokenUsage"
!define APP_EXECUTABLE_FILENAME "CodexTokenUsage.exe"
!define UNINSTALL_FILENAME "Uninstall CodexTokenUsage.exe"
!define SHORTCUT_NAME "Codex Installer Test ${TEST_ID}"
!define APP_DESCRIPTION "Installer test"
!define APP_ID "io.codex.installer-test"
!define INSTALL_REGISTRY_KEY "${TEST_KEY}\User"
!define UNINSTALL_REGISTRY_KEY "${TEST_KEY}\UserUninstall"
!define CODEX_MACHINE_ROOT HKCU
!define CODEX_MACHINE_INSTALL_KEY "${TEST_KEY}\Machine"
!define CODEX_MACHINE_UNINSTALL_KEY "${TEST_KEY}\MachineUninstall"

Var installMode
Var appExe
Var newStartMenuLink
Var newDesktopLink
Var launchLink
Var Results
Var TestPath

!include "${PROJECT_ROOT}\build\installer-policy.nsh"
!include "${PROJECT_ROOT}\build\installer-maintenance.nsh"
!insertmacro CodexPolicyFunctions
!insertmacro CodexMaintenanceFunctions

Function ResetFixture
  DeleteRegKey HKCU "${TEST_KEY}"
  StrCpy $TestPath "${TEST_DIRECTORY}\CodexTokenUsage"
  StrCpy $INSTDIR $TestPath
  StrCpy $installMode CurrentUser
  SetShellVarContext current
FunctionEnd

!macro UserInstall VERSION
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$TestPath"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$TestPath\${UNINSTALL_FILENAME}" /currentuser'
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" DesktopShortcut "0"
!macroend

!macro Result NAME
  FileWrite $Results "${NAME}=$CodexMaintenanceMode:$CodexMaintenanceError$\r$\n"
!macroend

!macro ExitCode ERROR
  StrCpy $CodexMaintenanceError "${ERROR}"
  StrCpy $0 "preserved"
  Call CodexGetFailureExitCode
  Pop $1
  FileWrite $Results "exit-${ERROR}=$1:$0$\r$\n"
!macroend

Section
  FileOpen $Results "${RESULT_FILE}" w
  Call ResetFixture
  ${GetParameters} $0
  ${GetOptions} $0 "/parameters-only" $1
  ${IfNot} ${Errors}
    !insertmacro UserInstall "0.10.0"
    Call CodexInitializeMaintenance
    !insertmacro Result parametersOnly
    Goto done
  ${EndIf}

  Call CodexInitializeMaintenance
  !insertmacro Result fresh
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  !insertmacro Result repairMissingFiles
  FileWrite $Results "preserveDesktopChoice=$CodexDesktopShortcutWanted$\r$\n"
  FileWrite $Results "repairMenu=$CodexStartMenuShortcutWanted$\r$\n"
  Call CodexPrepareInstall
  !insertmacro Result readyRepair

  Call ResetFixture
  !insertmacro UserInstall "0.9.0"
  Call CodexInitializeMaintenance
  !insertmacro Result update
  FileWrite $Results "updateMenu=$CodexStartMenuShortcutWanted$\r$\n"

  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "0.11.0"
  Call CodexInitializeMaintenance
  !insertmacro Result downgrade
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "bad"
  Call CodexInitializeMaintenance
  !insertmacro Result invalidVersion

  Call ResetFixture
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "0.10.0"
  Call CodexInitializeMaintenance
  !insertmacro Result orphanRegistration

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$WINDIR"
  Call CodexInitializeMaintenance
  !insertmacro Result unsafeDirectory

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$TestPath\Other.exe" /currentuser'
  Call CodexInitializeMaintenance
  !insertmacro Result wrongUninstaller

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  WriteRegStr HKCU "${CODEX_MACHINE_INSTALL_KEY}" InstallLocation "$TestPath"
  Call CodexInitializeMaintenance
  !insertmacro Result scopeConflict

  Call ResetFixture
  StrCpy $TestPath "$PROGRAMFILES\CodexInstallerTest"
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  !insertmacro Result userScopeSystemDirectory

  Call ResetFixture
  WriteRegStr HKCU "${CODEX_MACHINE_INSTALL_KEY}" InstallLocation "$TestPath"
  WriteRegStr HKCU "${CODEX_MACHINE_UNINSTALL_KEY}" DisplayVersion "0.9.0"
  WriteRegStr HKCU "${CODEX_MACHINE_UNINSTALL_KEY}" UninstallString '"$TestPath\${UNINSTALL_FILENAME}" /allusers'
  Call CodexInitializeMaintenance
  !insertmacro Result machineScopeUserDirectory

  Call ResetFixture
  StrCpy $TestPath "$PROGRAMFILES\CodexInstallerTest-${TEST_ID}"
  WriteRegStr HKCU "${CODEX_MACHINE_INSTALL_KEY}" InstallLocation "$TestPath"
  WriteRegStr HKCU "${CODEX_MACHINE_UNINSTALL_KEY}" DisplayVersion "0.9.0"
  WriteRegStr HKCU "${CODEX_MACHINE_UNINSTALL_KEY}" UninstallString '"$TestPath\${UNINSTALL_FILENAME}" /allusers'
  Call CodexInitializeMaintenance
  !insertmacro Result machineUpdate

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$TestPath\Other"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$TestPath\Other\${UNINSTALL_FILENAME}" /currentuser'
  Call CodexPrepareInstall
  !insertmacro Result directoryChanged

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "0.9.0"
  Call CodexPrepareInstall
  !insertmacro Result versionChanged

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  StrCpy $installMode all
  Call CodexPrepareInstall
  !insertmacro Result scopeChanged

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  StrCpy $INSTDIR "$TestPath\Other"
  Call CodexPrepareInstall
  !insertmacro Result targetChanged

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" ShortcutName "..\Unexpected"
  Call CodexPrepareInstall
  !insertmacro Result unsafeShortcutChange

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  WriteRegStr HKCU "${CODEX_MACHINE_INSTALL_KEY}" InstallLocation "$TestPath"
  Call CodexPrepareInstall
  !insertmacro Result conflictAfterInit

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  StrCpy $CodexDesktopShortcutWanted "1"
  Call CodexPrepareInstall
  FileWrite $Results "preserveUiChoice=$CodexDesktopShortcutWanted$\r$\n"

  Call ResetFixture
  !insertmacro UserInstall "0.10.0"
  Call CodexInitializeMaintenance
  StrCpy $appExe "$TestPath\${APP_EXECUTABLE_FILENAME}"
  StrCpy $newStartMenuLink "${TEST_DIRECTORY}\Start.lnk"
  StrCpy $newDesktopLink "${TEST_DIRECTORY}\Desktop.lnk"
  CreateDirectory "$TestPath"
  FileOpen $0 "$appExe" w
  FileWrite $0 "fixture"
  FileClose $0
  Call CodexAfterInstall
  StrCpy $1 "0"
  IfFileExists "$newStartMenuLink" 0 +2
    StrCpy $1 "1"
  StrCpy $2 "0"
  IfFileExists "$newDesktopLink" 0 +2
    StrCpy $2 "1"
  ReadRegStr $3 HKCU "${INSTALL_REGISTRY_KEY}" DesktopShortcut
  FileWrite $Results "afterInstall=$1:$2:$3$\r$\n"

  CreateDirectory "${TEST_DIRECTORY}\Blocked.lnk"
  StrCpy $newDesktopLink "${TEST_DIRECTORY}\Blocked.lnk"
  Call CodexAfterInstall
  !insertmacro Result failedShortcutDelete

  !insertmacro ExitCode "invalid-version"
  !insertmacro ExitCode "downgrade"
  !insertmacro ExitCode "registration"
  !insertmacro ExitCode "path"
  !insertmacro ExitCode "scope"
  !insertmacro ExitCode "parameters"
  !insertmacro ExitCode "changed"
  !insertmacro ExitCode "write"
  !insertmacro ExitCode "unknown"

done:
  DeleteRegKey HKCU "${TEST_KEY}"
  FileClose $Results
SectionEnd
