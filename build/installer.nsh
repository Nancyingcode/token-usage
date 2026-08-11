!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var CodexDesktopShortcutCheckbox
Var CodexCreateDesktopShortcut

LangString codexShortcutPageTitle 1033 "Shortcuts"
LangString codexShortcutPageTitle 2052 "快捷方式"
LangString codexShortcutPageDescription 1033 "Choose where setup creates shortcuts."
LangString codexShortcutPageDescription 2052 "选择安装程序创建快捷方式的位置。"
LangString codexDesktopShortcutOption 1033 "Create a desktop shortcut"
LangString codexDesktopShortcutOption 2052 "创建桌面快捷方式"

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Function CodexShortcutPageCreate
    ${If} ${isUpdated}
      Abort
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "$(codexShortcutPageTitle)" "$(codexShortcutPageDescription)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateCheckbox} 0 12u 100% 12u "$(codexDesktopShortcutOption)"
    Pop $CodexDesktopShortcutCheckbox
    ${NSD_Check} $CodexDesktopShortcutCheckbox
    nsDialogs::Show
  FunctionEnd

  Function CodexShortcutPageLeave
    ${NSD_GetState} $CodexDesktopShortcutCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $CodexCreateDesktopShortcut "1"
    ${Else}
      StrCpy $CodexCreateDesktopShortcut "0"
    ${EndIf}
  FunctionEnd

  Page custom CodexShortcutPageCreate CodexShortcutPageLeave
!macroend

!macro customInit
  StrCpy $CodexCreateDesktopShortcut "1"
!macroend

!macro customInstall
  ${If} $CodexCreateDesktopShortcut == "0"
    Delete "$newDesktopLink"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend
!endif
