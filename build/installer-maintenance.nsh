; 安装器维护边界：只读取本产品登记，快照由本次安装进程持有，初始化时重置。
; 提权后的实例经 UAC 通道核对外层快照，不将中间状态写入文件或注册表。
!ifndef CODEX_INSTALLER_MAINTENANCE_INCLUDED
!define CODEX_INSTALLER_MAINTENANCE_INCLUDED

!include "FileFunc.nsh"
!include "StrFunc.nsh"
${StrStr}

!define CODEX_DESKTOP_PREFERENCE "DesktopShortcut"
!define CODEX_SHELL_CHANGE_EVENT 0x8000000
!define CODEX_SCOPE_CURRENT_USER "CurrentUser"
!define CODEX_SCOPE_ALL "all"
!define CODEX_ERROR_INVALID_VERSION "invalid-version"
!define CODEX_ERROR_DOWNGRADE "downgrade"
!define CODEX_ERROR_REGISTRATION "registration"
!define CODEX_ERROR_PATH "path"
!define CODEX_ERROR_SCOPE "scope"
!define CODEX_ERROR_PARAMETERS "parameters"
!define CODEX_ERROR_CHANGED "changed"
!define CODEX_ERROR_WRITE "write"
; 静默安装没有可见错误页，稳定退出码让部署工具保留具体失败原因。
!define CODEX_EXIT_FAILURE 1603
!define CODEX_EXIT_INVALID_VERSION 17001
!define CODEX_EXIT_DOWNGRADE 17002
!define CODEX_EXIT_REGISTRATION 17003
!define CODEX_EXIT_PATH 17004
!define CODEX_EXIT_SCOPE 17005
!define CODEX_EXIT_PARAMETERS 17006
!define CODEX_EXIT_CHANGED 17007
!define CODEX_EXIT_WRITE 17008

Var CodexMaintenanceMode
Var CodexMaintenanceError
Var CodexInstalledVersion
Var CodexInstalledDirectory
Var CodexInstalledScope
Var CodexDesktopShortcutWanted
Var CodexStartMenuShortcutWanted

; 这些快照只属于当前安装尝试，前进/后退不重置；重新启动安装器才重新采集。
Var CodexInitialMode
Var CodexInitialDirectory
Var CodexInitialVersion
Var CodexInitialScope
Var CodexUserPresent
Var CodexUserDirectory
Var CodexUserVersion
Var CodexUserUninstaller
Var CodexMachinePresent
Var CodexMachineDirectory
Var CodexMachineVersion
Var CodexMachineUninstaller
Var CodexRegisteredUninstaller
Var CodexSavedShortcutName
Var CodexSavedMenuDirectory

!macro CodexReadRegistration ROOT INSTALL_KEY UNINSTALL_KEY PRESENT DIRECTORY VERSION UNINSTALLER
  StrCpy ${PRESENT} "0"
  ClearErrors
  EnumRegValue $0 ${ROOT} "${INSTALL_KEY}" 0
  ${IfNot} ${Errors}
    StrCpy ${PRESENT} "1"
  ${EndIf}
  ClearErrors
  EnumRegValue $0 ${ROOT} "${UNINSTALL_KEY}" 0
  ${IfNot} ${Errors}
    StrCpy ${PRESENT} "1"
  ${EndIf}
  ReadRegStr ${DIRECTORY} ${ROOT} "${INSTALL_KEY}" "InstallLocation"
  ReadRegStr ${VERSION} ${ROOT} "${UNINSTALL_KEY}" "DisplayVersion"
  ReadRegStr ${UNINSTALLER} ${ROOT} "${UNINSTALL_KEY}" "UninstallString"
  ClearErrors
!macroend

!macro CodexRejectScopeDescendant ROOT
  Push "${ROOT}"
  Push $1
  Call CodexIsPathAncestor
  Pop $3
  ${If} $3 == "1"
    Goto codex_scope_done
  ${EndIf}
!macroend

!macro CodexMaintenanceFunctions
  ; 测试可以映射到独立键；生产构建仍只使用 electron-builder 的固定产品键。
  !define /ifndef CODEX_USER_ROOT HKCU
  !define /ifndef CODEX_USER_INSTALL_KEY "${INSTALL_REGISTRY_KEY}"
  !define /ifndef CODEX_USER_UNINSTALL_KEY "${UNINSTALL_REGISTRY_KEY}"
  !define /ifndef CODEX_MACHINE_ROOT HKLM
  !define /ifndef CODEX_MACHINE_INSTALL_KEY "${INSTALL_REGISTRY_KEY}"
  !define /ifndef CODEX_MACHINE_UNINSTALL_KEY "${UNINSTALL_REGISTRY_KEY}"

  Function CodexGetFailureExitCode
    ${If} $CodexMaintenanceError == "${CODEX_ERROR_INVALID_VERSION}"
      Push ${CODEX_EXIT_INVALID_VERSION}
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_DOWNGRADE}"
      Push ${CODEX_EXIT_DOWNGRADE}
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_REGISTRATION}"
      Push ${CODEX_EXIT_REGISTRATION}
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_PATH}"
      Push ${CODEX_EXIT_PATH}
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_SCOPE}"
      Push ${CODEX_EXIT_SCOPE}
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_PARAMETERS}"
      Push ${CODEX_EXIT_PARAMETERS}
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_CHANGED}"
      Push ${CODEX_EXIT_CHANGED}
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_WRITE}"
      Push ${CODEX_EXIT_WRITE}
    ${Else}
      Push ${CODEX_EXIT_FAILURE}
    ${EndIf}
  FunctionEnd

  ; 范围与目录必须一致；只按系统返回的根目录判断，不枚举其他账户的配置或安装。
  Function CodexValidateScopeDirectory
    Exch $1
    Exch 1
    Exch $0
    Push $2
    Push $3
    Push $4
    StrCpy $2 "unsafe"
    ${If} $0 == "${CODEX_SCOPE_CURRENT_USER}"
      !insertmacro CodexRejectScopeDescendant "$PROGRAMFILES"
      !insertmacro CodexRejectScopeDescendant "$PROGRAMFILES64"
      !insertmacro CodexRejectScopeDescendant "$COMMONFILES"
      !insertmacro CodexRejectScopeDescendant "$COMMONFILES64"
    ${ElseIf} $0 == "${CODEX_SCOPE_ALL}"
      System::Call 'userenv::GetProfilesDirectoryW(w .r3, *i ${NSIS_MAX_STRLEN}) i.r4'
      ${If} $4 == 0
      ${OrIf} $3 == ""
        Goto codex_scope_done
      ${EndIf}
      !insertmacro CodexRejectScopeDescendant "$3"
      !insertmacro CodexRejectScopeDescendant "$PROFILE"
    ${Else}
      Goto codex_scope_done
    ${EndIf}
    StrCpy $2 "safe"
  codex_scope_done:
    StrCpy $0 $2
    Pop $4
    Pop $3
    Pop $2
    Exch $0
    Exch 1
    Pop $1
  FunctionEnd

  Function CodexDetectInstallation
    StrCpy $CodexMaintenanceMode "${CODEX_MODE_FRESH}"
    StrCpy $CodexMaintenanceError ""
    StrCpy $CodexInstalledDirectory ""
    StrCpy $CodexInstalledVersion ""
    StrCpy $CodexInstalledScope ""
    StrCpy $CodexRegisteredUninstaller ""

    !insertmacro CodexReadRegistration ${CODEX_USER_ROOT} "${CODEX_USER_INSTALL_KEY}" "${CODEX_USER_UNINSTALL_KEY}" $CodexUserPresent $CodexUserDirectory $CodexUserVersion $CodexUserUninstaller
    !insertmacro CodexReadRegistration ${CODEX_MACHINE_ROOT} "${CODEX_MACHINE_INSTALL_KEY}" "${CODEX_MACHINE_UNINSTALL_KEY}" $CodexMachinePresent $CodexMachineDirectory $CodexMachineVersion $CodexMachineUninstaller

    ${If} $CodexUserPresent == "1"
    ${AndIf} $CodexMachinePresent == "1"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_SCOPE}"
      Goto codex_detect_blocked
    ${EndIf}

    Push "${VERSION}"
    Push "${VERSION}"
    Call CodexCompareVersions
    Pop $0
    ${If} $0 == "invalid"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_INVALID_VERSION}"
      Goto codex_detect_blocked
    ${EndIf}

    ${If} $CodexUserPresent == "1"
      StrCpy $CodexInstalledDirectory $CodexUserDirectory
      StrCpy $CodexInstalledVersion $CodexUserVersion
      StrCpy $CodexRegisteredUninstaller $CodexUserUninstaller
      StrCpy $CodexInstalledScope "${CODEX_SCOPE_CURRENT_USER}"
    ${ElseIf} $CodexMachinePresent == "1"
      StrCpy $CodexInstalledDirectory $CodexMachineDirectory
      StrCpy $CodexInstalledVersion $CodexMachineVersion
      StrCpy $CodexRegisteredUninstaller $CodexMachineUninstaller
      StrCpy $CodexInstalledScope "${CODEX_SCOPE_ALL}"
    ${Else}
      Return
    ${EndIf}

    ${If} $CodexInstalledDirectory == ""
    ${OrIf} $CodexRegisteredUninstaller == ""
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_REGISTRATION}"
      Goto codex_detect_blocked
    ${EndIf}
    Push $CodexInstalledDirectory
    Call CodexValidateInstallPath
    Pop $0
    ${If} $0 != "safe"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_PATH}"
      Goto codex_detect_blocked
    ${EndIf}
    Push $CodexInstalledScope
    Push $CodexInstalledDirectory
    Call CodexValidateScopeDirectory
    Pop $0
    ${If} $0 != "safe"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_SCOPE}"
      Goto codex_detect_blocked
    ${EndIf}

    ; 原生流程会执行登记的旧卸载器，必须先限制到所维护目录的固定卸载器。
    ${If} $CodexInstalledScope == "${CODEX_SCOPE_ALL}"
      StrCpy $0 '"$CodexInstalledDirectory\${UNINSTALL_FILENAME}" /allusers'
    ${Else}
      StrCpy $0 '"$CodexInstalledDirectory\${UNINSTALL_FILENAME}" /currentuser'
    ${EndIf}
    ${If} $CodexRegisteredUninstaller != $0
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_REGISTRATION}"
      Goto codex_detect_blocked
    ${EndIf}

    Push $CodexInstalledVersion
    Push "${VERSION}"
    Call CodexCompareVersions
    Pop $0
    ${If} $0 == "equal"
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_REPAIR}"
    ${ElseIf} $0 == "newer"
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_UPDATE}"
    ${ElseIf} $0 == "older"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_DOWNGRADE}"
      Goto codex_detect_blocked
    ${Else}
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_INVALID_VERSION}"
      Goto codex_detect_blocked
    ${EndIf}
    Return

  codex_detect_blocked:
    StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
  FunctionEnd

  Function CodexValidateParameters
    ${StdUtils.TestParameter} $0 "delete-app-data"
    ${If} $0 == "true"
      Goto codex_parameters_blocked
    ${EndIf}
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_FRESH}"
      Return
    ${EndIf}
    ${StdUtils.TestParameter} $0 "allusers"
    ${If} $0 == "true"
    ${AndIf} $CodexInstalledScope != "${CODEX_SCOPE_ALL}"
      Goto codex_parameters_blocked
    ${EndIf}
    ${StdUtils.TestParameter} $0 "currentuser"
    ${If} $0 == "true"
    ${AndIf} $CodexInstalledScope != "${CODEX_SCOPE_CURRENT_USER}"
      Goto codex_parameters_blocked
    ${EndIf}
    ; NSIS 会从常规参数视图剥离 /D，必须读取完整命令行才能阻止目录迁移。
    ${StdUtils.GetAllParameters} $0 "0"
    ${GetOptions} $0 "/D=" $1
    ${IfNot} ${Errors}
    ${AndIf} $1 != $CodexInstalledDirectory
      Goto codex_parameters_blocked
    ${EndIf}
    ClearErrors
    Return
  codex_parameters_blocked:
    StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
    StrCpy $CodexMaintenanceError "${CODEX_ERROR_PARAMETERS}"
  FunctionEnd

  Function CodexReadShortcutPreferences
    StrCpy $CodexDesktopShortcutWanted "1"
    StrCpy $CodexStartMenuShortcutWanted "1"
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_FRESH}"
      ${StdUtils.TestParameter} $0 "no-desktop-shortcut"
      ${If} $0 == "true"
        StrCpy $CodexDesktopShortcutWanted "0"
      ${EndIf}
      Return
    ${EndIf}

    Call CodexValidateShortcutRegistration
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Return
    ${EndIf}
    ${If} $CodexInstalledScope == "${CODEX_SCOPE_ALL}"
      SetShellVarContext all
      ReadRegStr $0 ${CODEX_MACHINE_ROOT} "${CODEX_MACHINE_INSTALL_KEY}" "${CODEX_DESKTOP_PREFERENCE}"
    ${Else}
      SetShellVarContext current
      ReadRegStr $0 ${CODEX_USER_ROOT} "${CODEX_USER_INSTALL_KEY}" "${CODEX_DESKTOP_PREFERENCE}"
    ${EndIf}
    StrCpy $CodexDesktopShortcutWanted "0"
    ${If} $0 == "1"
      StrCpy $CodexDesktopShortcutWanted "1"
    ${ElseIf} $0 != "0"
      ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
        StrCpy $CodexDesktopShortcutWanted "1"
      ${EndIf}
    ${EndIf}
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_UPDATE}"
      StrCpy $CodexStartMenuShortcutWanted "0"
      ${If} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
        StrCpy $CodexStartMenuShortcutWanted "1"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  Function CodexValidateShortcutRegistration
    ${If} $CodexInstalledScope == "${CODEX_SCOPE_ALL}"
      ReadRegStr $CodexSavedShortcutName ${CODEX_MACHINE_ROOT} "${CODEX_MACHINE_INSTALL_KEY}" ShortcutName
      ReadRegStr $CodexSavedMenuDirectory ${CODEX_MACHINE_ROOT} "${CODEX_MACHINE_INSTALL_KEY}" MenuDirectory
    ${Else}
      ReadRegStr $CodexSavedShortcutName ${CODEX_USER_ROOT} "${CODEX_USER_INSTALL_KEY}" ShortcutName
      ReadRegStr $CodexSavedMenuDirectory ${CODEX_USER_ROOT} "${CODEX_USER_INSTALL_KEY}" MenuDirectory
    ${EndIf}
    ${If} $CodexSavedShortcutName == ""
      StrCpy $CodexSavedShortcutName "${SHORTCUT_NAME}"
    ${EndIf}
    ; 产品没有可变菜单目录；拒绝被改写的入口，避免原生重命名/清理处理越出产品范围。
    ${If} $CodexSavedShortcutName != "${SHORTCUT_NAME}"
    ${OrIf} $CodexSavedMenuDirectory != ""
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_REGISTRATION}"
      Return
    ${EndIf}

  FunctionEnd

  Function CodexCheckSnapshot
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Return
    ${EndIf}
    ${If} $CodexInstalledDirectory != $CodexInitialDirectory
    ${OrIf} $CodexInstalledVersion != $CodexInitialVersion
    ${OrIf} $CodexInstalledScope != $CodexInitialScope
    ${OrIf} $CodexMaintenanceMode != $CodexInitialMode
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_CHANGED}"
    ${EndIf}
  FunctionEnd

  Function CodexExportOuterState
    ; UAC 同步的是寄存器；重新读外层 HKCU，防止换账号提权漏掉调用者副本。
    Call CodexDetectInstallation
    Call CodexCheckSnapshot
    ${If} $CodexMaintenanceMode != "${CODEX_MODE_BLOCKED}"
      Call CodexValidateShortcutRegistration
    ${EndIf}
    StrCpy $R0 $CodexMaintenanceError
    StrCpy $R1 $CodexInitialMode
    StrCpy $R2 $CodexInitialDirectory
    StrCpy $R3 $CodexInitialVersion
    StrCpy $R4 $CodexInitialScope
    StrCpy $R5 $CodexDesktopShortcutWanted
    StrCpy $R6 $CodexStartMenuShortcutWanted
  FunctionEnd

  Function CodexCheckOuterState
    ${If} ${UAC_IsInnerInstance}
      StrCpy $R0 "${CODEX_ERROR_CHANGED}"
      !insertmacro UAC_AsUser_Call Function CodexExportOuterState ${UAC_SYNCREGISTERS}
      ${If} $R0 != ""
        StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
        StrCpy $CodexMaintenanceError $R0
        Return
      ${EndIf}
      ${If} $R4 == "${CODEX_SCOPE_CURRENT_USER}"
      ${OrIf} $R1 != $CodexMaintenanceMode
      ${OrIf} $R2 != $CodexInstalledDirectory
      ${OrIf} $R3 != $CodexInstalledVersion
      ${OrIf} $R4 != $CodexInstalledScope
        StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
        StrCpy $CodexMaintenanceError "${CODEX_ERROR_SCOPE}"
        Return
      ${EndIf}
    ${EndIf}
  FunctionEnd

  Function CodexInitializeMaintenance
    Call CodexDetectInstallation
    ${If} $CodexMaintenanceMode != "${CODEX_MODE_BLOCKED}"
      Call CodexValidateParameters
    ${EndIf}
    ${If} $CodexMaintenanceMode != "${CODEX_MODE_BLOCKED}"
      Call CodexReadShortcutPreferences
    ${EndIf}
    ${If} $CodexMaintenanceMode != "${CODEX_MODE_BLOCKED}"
      Call CodexCheckOuterState
      ${If} ${UAC_IsInnerInstance}
      ${AndIf} $CodexMaintenanceMode != "${CODEX_MODE_BLOCKED}"
        StrCpy $CodexDesktopShortcutWanted $R5
        StrCpy $CodexStartMenuShortcutWanted $R6
      ${EndIf}
    ${EndIf}
    StrCpy $CodexInitialMode $CodexMaintenanceMode
    StrCpy $CodexInitialDirectory $CodexInstalledDirectory
    StrCpy $CodexInitialVersion $CodexInstalledVersion
    StrCpy $CodexInitialScope $CodexInstalledScope
  FunctionEnd

  Function CodexPrepareInstall
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Return
    ${EndIf}
    Call CodexDetectInstallation
    Call CodexCheckSnapshot
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Return
    ${EndIf}
    Call CodexValidateParameters
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Return
    ${EndIf}
    Call CodexValidateShortcutRegistration
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Return
    ${EndIf}
    Call CodexCheckOuterState
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Return
    ${EndIf}

    ${If} $CodexMaintenanceMode == "${CODEX_MODE_FRESH}"
      ; 关闭模板目录页后仍保留原生应用子目录约定，只对首次安装整理路径。
      ${StrStr} $0 $INSTDIR "${APP_FILENAME}"
      ${If} $0 == ""
        StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
      ${EndIf}
    ${Else}
      ${If} $installMode != $CodexInstalledScope
        StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
        StrCpy $CodexMaintenanceError "${CODEX_ERROR_SCOPE}"
        Return
      ${EndIf}
      ${If} $INSTDIR != $CodexInstalledDirectory
        StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
        StrCpy $CodexMaintenanceError "${CODEX_ERROR_PATH}"
        Return
      ${EndIf}
    ${EndIf}
    Push $INSTDIR
    Call CodexValidateInstallPath
    Pop $0
    ${If} $0 != "safe"
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_PATH}"
      Return
    ${EndIf}
    Push $installMode
    Push $INSTDIR
    Call CodexValidateScopeDirectory
    Pop $0
    ${If} $0 != "safe"
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_SCOPE}"
    ${EndIf}
    ClearErrors
  FunctionEnd

  Function CodexAfterInstall
    ClearErrors
    ${If} $CodexStartMenuShortcutWanted == "1"
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ${If} ${Errors}
        Goto codex_after_failed
      ${EndIf}
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
      StrCpy $launchLink "$newStartMenuLink"
    ${Else}
      ClearErrors
      Delete "$newStartMenuLink"
      ${If} ${Errors}
        Goto codex_after_failed
      ${EndIf}
      IfFileExists "$newStartMenuLink" codex_after_failed
      StrCpy $launchLink "$appExe"
    ${EndIf}
    ${If} $CodexDesktopShortcutWanted == "1"
      ClearErrors
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ${If} ${Errors}
        Goto codex_after_failed
      ${EndIf}
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${Else}
      ClearErrors
      Delete "$newDesktopLink"
      ${If} ${Errors}
        Goto codex_after_failed
      ${EndIf}
      IfFileExists "$newDesktopLink" codex_after_failed
    ${EndIf}
    ClearErrors
    ${If} $installMode == "${CODEX_SCOPE_ALL}"
      WriteRegStr ${CODEX_MACHINE_ROOT} "${CODEX_MACHINE_INSTALL_KEY}" "${CODEX_DESKTOP_PREFERENCE}" $CodexDesktopShortcutWanted
    ${Else}
      WriteRegStr ${CODEX_USER_ROOT} "${CODEX_USER_INSTALL_KEY}" "${CODEX_DESKTOP_PREFERENCE}" $CodexDesktopShortcutWanted
    ${EndIf}
    ${If} ${Errors}
      Goto codex_after_failed
    ${EndIf}
    System::Call 'Shell32::SHChangeNotify(i ${CODEX_SHELL_CHANGE_EVENT}, i 0, i 0, i 0)'
    Return
  codex_after_failed:
    StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
    StrCpy $CodexMaintenanceError "${CODEX_ERROR_WRITE}"
  FunctionEnd
!macroend
!endif
