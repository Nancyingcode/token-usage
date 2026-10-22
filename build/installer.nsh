; 安装器只扩展维护决策与页面，文件部署、UAC、卸载及进程占用处理继续由上游负责。
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
!include "installer-policy.nsh"
!include "installer-maintenance.nsh"

!define CODEX_NEXT_BUTTON 1
!define CODEX_DIALOG_TEMPLATE 1018

; 页面句柄与文案属于当前安装器进程；每次进入页面重新创建，提权实例重新初始化。
Var CodexDesktopShortcutCheckbox
Var CodexRepairRadio
Var CodexUpdateRadio
Var CodexProgressTitle
Var CodexProgressText
Var CodexFinishTitle
Var CodexFinishText
Var CodexErrorText
Var CodexScopeText

!include "installer-messages.nsh"

!macro customHeader
  !insertmacro CodexPolicyFunctions
  !insertmacro CodexMaintenanceFunctions

  ; 隐藏检查节先于上游 install 节执行，静默安装也不能绕过页面之外的最终校验。
  Section -CodexPreflight
    SectionIn RO
    Call CodexPrepareInstall
    Call CodexAbortIfBlocked
    Call CodexUpdateOperationText
  SectionEnd

  Function CodexUpdateOperationText
    StrCpy $CodexProgressTitle "$(codexInstallProgressTitle)"
    StrCpy $CodexProgressText "$(codexInstallProgressText)"
    StrCpy $CodexFinishTitle "$(codexInstallFinishTitle)"
    StrCpy $CodexFinishText "$(codexInstallFinishText)"
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_REPAIR}"
      StrCpy $CodexProgressTitle "$(codexRepairProgressTitle)"
      StrCpy $CodexProgressText "$(codexRepairProgressText)"
      StrCpy $CodexFinishTitle "$(codexRepairFinishTitle)"
      StrCpy $CodexFinishText "$(codexRepairFinishText)"
    ${ElseIf} $CodexMaintenanceMode == "${CODEX_MODE_UPDATE}"
      StrCpy $CodexProgressTitle "$(codexUpdateProgressTitle)"
      StrCpy $CodexProgressText "$(codexUpdateProgressText)"
      StrCpy $CodexFinishTitle "$(codexUpdateFinishTitle)"
      StrCpy $CodexFinishText "$(codexUpdateFinishText)"
    ${EndIf}
  FunctionEnd

  Function CodexGetErrorText
    StrCpy $CodexErrorText "$(codexErrorRegistration)"
    ${If} $CodexMaintenanceError == "${CODEX_ERROR_INVALID_VERSION}"
      StrCpy $CodexErrorText "$(codexErrorVersion)"
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_DOWNGRADE}"
      StrCpy $CodexErrorText "$(codexErrorDowngrade)"
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_PATH}"
      StrCpy $CodexErrorText "$(codexErrorPath)"
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_SCOPE}"
      StrCpy $CodexErrorText "$(codexErrorScope)"
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_PARAMETERS}"
      StrCpy $CodexErrorText "$(codexErrorParameters)"
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_CHANGED}"
      StrCpy $CodexErrorText "$(codexErrorChanged)"
    ${ElseIf} $CodexMaintenanceError == "${CODEX_ERROR_WRITE}"
      StrCpy $CodexErrorText "$(codexErrorWrite)"
    ${EndIf}
  FunctionEnd

  Function CodexAbortIfBlocked
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Call CodexGetErrorText
      DetailPrint "$CodexErrorText"
      ${IfNot} ${Silent}
        MessageBox MB_OK|MB_ICONSTOP "$CodexErrorText"
      ${EndIf}
      Call CodexGetFailureExitCode
      Pop $0
      SetErrorLevel $0
      Quit
    ${EndIf}
  FunctionEnd

  Function CodexWelcomePre
    ${If} $CodexMaintenanceMode != "${CODEX_MODE_FRESH}"
      Abort
    ${EndIf}
  FunctionEnd

  Function CodexMaintenancePageCreate
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_FRESH}"
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(codexMaintenanceTitle)" "$(codexMaintenanceDescription)"
    nsDialogs::Create ${CODEX_DIALOG_TEMPLATE}
    Pop $0
    ${If} $0 == error
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_WRITE}"
      Call CodexAbortIfBlocked
    ${EndIf}

    StrCpy $CodexScopeText "$(codexScopeCurrentUser)"
    ${If} $CodexInstalledScope == "${CODEX_SCOPE_ALL}"
      StrCpy $CodexScopeText "$(codexScopeAllUsers)"
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 22u "$(codexVersions)"
    Pop $0
    ${NSD_CreateLabel} 0 24u 100% 10u "$(codexScope)"
    Pop $0
    ${NSD_CreateLabel} 0 39u 17% 12u "$(codexInstallLocation)"
    Pop $0
    ${NSD_CreateText} 17% 36u 83% 14u "$CodexInstalledDirectory"
    Pop $0
    ${NSD_Edit_SetReadOnly} $0 1
    ${NSD_CreateRadioButton} 0 54u 100% 12u "$(codexRepairOption)"
    Pop $CodexRepairRadio
    ${NSD_CreateRadioButton} 0 90u 100% 12u "$(codexUpdateOption)"
    Pop $CodexUpdateRadio
    GetDlgItem $1 $HWNDPARENT ${CODEX_NEXT_BUTTON}
    EnableWindow $1 1

    ${If} $CodexMaintenanceMode == "${CODEX_MODE_REPAIR}"
      ${NSD_Check} $CodexRepairRadio
      EnableWindow $CodexUpdateRadio 0
      ${NSD_CreateLabel} 10u 68u 96% 20u "$(codexRepairDescription)"
      Pop $0
      ${NSD_CreateLabel} 10u 104u 96% 20u "$(codexUpdateUnavailable)"
      Pop $0
      ${NSD_CreateCheckbox} 10u 125u 96% 12u "$(codexDesktopShortcutOption)"
      Pop $CodexDesktopShortcutCheckbox
      ${If} $CodexDesktopShortcutWanted == "1"
        ${NSD_Check} $CodexDesktopShortcutCheckbox
      ${EndIf}
      ${NSD_OnClick} $CodexDesktopShortcutCheckbox CodexDesktopChoiceChanged
      SendMessage $1 ${WM_SETTEXT} 0 "STR:$(codexRepairButton)"
      ${NSD_SetFocus} $CodexRepairRadio
    ${ElseIf} $CodexMaintenanceMode == "${CODEX_MODE_UPDATE}"
      EnableWindow $CodexRepairRadio 0
      ${NSD_Check} $CodexUpdateRadio
      ${NSD_CreateLabel} 10u 68u 96% 20u "$(codexRepairUnavailable)"
      Pop $0
      ${NSD_CreateLabel} 10u 104u 96% 30u "$(codexUpdateDescription)"
      Pop $0
      SendMessage $1 ${WM_SETTEXT} 0 "STR:$(codexUpdateButton)"
      ${NSD_SetFocus} $CodexUpdateRadio
    ${Else}
      EnableWindow $CodexRepairRadio 0
      EnableWindow $CodexUpdateRadio 0
      EnableWindow $1 0
      Call CodexGetErrorText
      ${NSD_CreateLabel} 0 104u 100% 34u "$CodexErrorText"
      Pop $0
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function CodexMaintenancePageLeave
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_BLOCKED}"
      Abort
    ${EndIf}
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_REPAIR}"
      Call CodexReadDesktopChoice
    ${EndIf}
  FunctionEnd

  Function CodexDirectoryPre
    ${If} $CodexMaintenanceMode != "${CODEX_MODE_FRESH}"
      Abort
    ${EndIf}
  FunctionEnd

  Function CodexShortcutPageCreate
    ${If} $CodexMaintenanceMode != "${CODEX_MODE_FRESH}"
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(codexShortcutPageTitle)" "$(codexShortcutPageDescription)"
    nsDialogs::Create ${CODEX_DIALOG_TEMPLATE}
    Pop $0
    ${If} $0 == error
      StrCpy $CodexMaintenanceMode "${CODEX_MODE_BLOCKED}"
      StrCpy $CodexMaintenanceError "${CODEX_ERROR_WRITE}"
      Call CodexAbortIfBlocked
    ${EndIf}
    ${NSD_CreateCheckbox} 0 12u 100% 12u "$(codexDesktopShortcutOption)"
    Pop $CodexDesktopShortcutCheckbox
    ${If} $CodexDesktopShortcutWanted == "1"
      ${NSD_Check} $CodexDesktopShortcutCheckbox
    ${EndIf}
    ${NSD_OnClick} $CodexDesktopShortcutCheckbox CodexDesktopChoiceChanged
    GetDlgItem $0 $HWNDPARENT ${CODEX_NEXT_BUTTON}
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(codexInstallButton)"
    nsDialogs::Show
  FunctionEnd

  Function CodexReadDesktopChoice
    ${NSD_GetState} $CodexDesktopShortcutCheckbox $0
    StrCpy $CodexDesktopShortcutWanted "0"
    ${If} $0 == ${BST_CHECKED}
      StrCpy $CodexDesktopShortcutWanted "1"
    ${EndIf}
  FunctionEnd

  Function CodexDesktopChoiceChanged
    Pop $0
    Call CodexReadDesktopChoice
  FunctionEnd

  Function CodexShortcutPageLeave
    ${If} $CodexMaintenanceMode == "${CODEX_MODE_FRESH}"
      Call CodexReadDesktopChoice
    ${EndIf}
  FunctionEnd

  Function CodexStartApp
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${EndIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
!macroend

!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_PRE CodexWelcomePre
  !insertmacro MUI_PAGE_WELCOME
  Page custom CodexMaintenancePageCreate CodexMaintenancePageLeave
!macroend

!macro customInstallMode
  ${If} $CodexMaintenanceMode != "${CODEX_MODE_FRESH}"
    ${If} $CodexInstalledScope == "${CODEX_SCOPE_ALL}"
      StrCpy $isForceMachineInstall "1"
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  ; 标准目录页保留首次安装选择；维护页跳过它，避免上游自动页允许迁移已有安装。
  !define MUI_PAGE_CUSTOMFUNCTION_PRE CodexDirectoryPre
  !insertmacro MUI_PAGE_DIRECTORY
  Page custom CodexShortcutPageCreate CodexShortcutPageLeave
  !define MUI_PAGE_HEADER_TEXT "$CodexProgressTitle"
  !define MUI_PAGE_HEADER_SUBTEXT "$CodexProgressText"
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "$CodexFinishTitle"
  !define MUI_FINISHPAGE_TEXT "$CodexFinishText"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION CodexStartApp
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customInit
  Call CodexInitializeMaintenance
  Call CodexUpdateOperationText
  ${If} ${Silent}
    Call CodexAbortIfBlocked
  ${EndIf}
!macroend

!macro customInstall
  Call CodexAfterInstall
  Call CodexAbortIfBlocked
!macroend
!endif
