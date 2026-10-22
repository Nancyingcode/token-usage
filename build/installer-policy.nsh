; 安装器共享策略：版本比较与目录校验不写文件或注册表，测试与正式安装器编译同一份函数。
!ifndef CODEX_INSTALLER_POLICY_INCLUDED
!define CODEX_INSTALLER_POLICY_INCLUDED
!include "LogicLib.nsh"

!define CODEX_MODE_FRESH "fresh"
!define CODEX_MODE_REPAIR "repair"
!define CODEX_MODE_UPDATE "update"
!define CODEX_MODE_BLOCKED "blocked"
!define CODEX_FILE_ATTRIBUTE_DIRECTORY 0x10
!define CODEX_FILE_ATTRIBUTE_REPARSE_POINT 0x400
!define CODEX_INVALID_FILE_ATTRIBUTES 0xFFFFFFFF
!define CODEX_ERROR_FILE_NOT_FOUND 2
!define CODEX_ERROR_PATH_NOT_FOUND 3

!macro CodexRejectAncestor ROOT
  Push $0
  Push "${ROOT}"
  Call CodexIsPathAncestor
  Pop $1
  ${If} $1 == "1"
    Goto codex_path_done
  ${EndIf}
!macroend

!macro CodexPolicyFunctions
; 严格三段稳定版本避免将预发布版本、未知值或前导零静默解释成可覆盖的正式版本。
Function CodexValidateVersion
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  StrCpy $1 0
  StrCpy $2 0
  StrCpy $3 0
  StrCpy $4 ""
  codex_version_scan:
    StrCpy $5 $0 1 $1
    StrCmp $5 "" codex_version_end
    StrCmp $5 "." codex_version_dot
    StrCmp $5 "0" codex_version_digit
    StrCmp $5 "1" codex_version_digit
    StrCmp $5 "2" codex_version_digit
    StrCmp $5 "3" codex_version_digit
    StrCmp $5 "4" codex_version_digit
    StrCmp $5 "5" codex_version_digit
    StrCmp $5 "6" codex_version_digit
    StrCmp $5 "7" codex_version_digit
    StrCmp $5 "8" codex_version_digit
    StrCmp $5 "9" codex_version_digit codex_version_invalid
  codex_version_digit:
    ${If} $3 == 0
      StrCpy $4 $5
    ${ElseIf} $4 == "0"
      Goto codex_version_invalid
    ${EndIf}
    IntOp $3 $3 + 1
    Goto codex_version_next
  codex_version_dot:
    ${If} $3 == 0
    ${OrIf} $2 == 2
      Goto codex_version_invalid
    ${EndIf}
    IntOp $2 $2 + 1
    StrCpy $3 0
  codex_version_next:
    IntOp $1 $1 + 1
    Goto codex_version_scan
  codex_version_end:
    ${If} $2 == 2
    ${AndIf} $3 > 0
      StrCpy $0 "valid"
      Goto codex_version_done
    ${EndIf}
  codex_version_invalid:
    StrCpy $0 "invalid"
  codex_version_done:
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; 入栈顺序为已安装版本、安装包版本；newer/older 描述安装包，按段长度和数字比较避免整数溢出。
Function CodexCompareVersions
  Exch $1
  Exch 1
  Exch $0
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  Push $0
  Call CodexValidateVersion
  Pop $2
  Push $1
  Call CodexValidateVersion
  Pop $3
  ${If} $2 != "valid"
  ${OrIf} $3 != "valid"
    StrCpy $0 "invalid"
    Goto codex_compare_done
  ${EndIf}
  StrCpy $2 0
  StrCpy $3 0
  codex_compare_component:
    StrCpy $4 ""
    StrCpy $5 ""
  codex_compare_installed:
    StrCpy $6 $0 1 $2
    StrCmp $6 "" codex_compare_package
    IntOp $2 $2 + 1
    StrCmp $6 "." codex_compare_package
    StrCpy $4 "$4$6"
    Goto codex_compare_installed
  codex_compare_package:
    StrCpy $6 $1 1 $3
    StrCmp $6 "" codex_compare_lengths
    IntOp $3 $3 + 1
    StrCmp $6 "." codex_compare_lengths
    StrCpy $5 "$5$6"
    Goto codex_compare_package
  codex_compare_lengths:
    StrLen $7 $4
    StrLen $8 $5
    ${If} $8 > $7
      Goto codex_compare_newer
    ${ElseIf} $8 < $7
      Goto codex_compare_older
    ${EndIf}
    StrCpy $9 0
  codex_compare_digit:
    StrCpy $6 $4 1 $9
    StrCmp $6 "" codex_compare_next
    StrCpy $7 $5 1 $9
    ${If} $7 > $6
      Goto codex_compare_newer
    ${ElseIf} $7 < $6
      Goto codex_compare_older
    ${EndIf}
    IntOp $9 $9 + 1
    Goto codex_compare_digit
  codex_compare_next:
    StrCpy $6 $0 1 $2
    ${If} $6 != ""
      Goto codex_compare_component
    ${EndIf}
    StrCpy $0 "equal"
    Goto codex_compare_done
  codex_compare_newer:
    StrCpy $0 "newer"
    Goto codex_compare_done
  codex_compare_older:
    StrCpy $0 "older"
  codex_compare_done:
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Exch $0
  Exch 1
  Pop $1
FunctionEnd

; 在目录边界比较祖先，避免 C:\App 被误判为 C:\Application 的父目录。
Function CodexIsPathAncestor
  Exch $1
  Exch 1
  Exch $0
  Push $2
  Push $3
  StrLen $2 $0
  StrCpy $3 $1 $2
  ${If} $0 == ""
  ${OrIf} $1 == ""
  ${OrIf} $3 != $0
    StrCpy $0 "0"
  ${Else}
    StrCpy $3 $1 1 $2
    ${If} $3 == ""
    ${OrIf} $3 == "\"
      StrCpy $0 "1"
    ${Else}
      StrCpy $0 "0"
    ${EndIf}
  ${EndIf}
  Pop $3
  Pop $2
  Exch $0
  Exch 1
  Pop $1
FunctionEnd

; 只有路径确实不存在时才允许创建，权限、共享或设备错误不能当成空目录继续安装。
Function CodexMissingPathResult
  Exch $0
  ${If} $0 == ${CODEX_ERROR_FILE_NOT_FOUND}
  ${OrIf} $0 == ${CODEX_ERROR_PATH_NOT_FOUND}
    StrCpy $0 "safe"
  ${Else}
    StrCpy $0 "unsafe"
  ${EndIf}
  Exch $0
FunctionEnd

; 路径策略只读取逐级目录属性，不遍历内容；登记归属仍须由调用者核对。
Function CodexValidateInstallPath
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  StrCpy $8 "unsafe"
  StrLen $1 $0
  ${If} $1 <= 3
    Goto codex_path_done
  ${EndIf}
  StrCpy $1 $0 2 1
  ${If} $1 != ":\"
    Goto codex_path_done
  ${EndIf}
  StrCpy $1 $0 1
  StrCpy $2 0
  codex_path_drive:
    StrCpy $3 "ABCDEFGHIJKLMNOPQRSTUVWXYZ" 1 $2
    StrCmp $3 "" codex_path_done
    StrCmp $1 $3 codex_path_segments
    IntOp $2 $2 + 1
    Goto codex_path_drive
  codex_path_segments:
    StrCpy $2 3
    StrCpy $3 ""
  codex_path_scan:
    StrCpy $1 $0 1 $2
    StrCmp $1 "" codex_path_segment_end
    StrCmp $1 "\" codex_path_segment_end
    StrCmp $1 '"' codex_path_done
    StrCmp $1 "'" codex_path_done
    StrCmp $1 "/" codex_path_done
    StrCmp $1 ":" codex_path_done
    StrCmp $1 "*" codex_path_done
    StrCmp $1 "?" codex_path_done
    StrCmp $1 "<" codex_path_done
    StrCmp $1 ">" codex_path_done
    StrCmp $1 "|" codex_path_done
    StrCmp $1 "$\t" codex_path_done
    StrCmp $1 "$\r" codex_path_done
    StrCmp $1 "$\n" codex_path_done
    StrCpy $3 "$3$1"
    IntOp $2 $2 + 1
    Goto codex_path_scan
  codex_path_segment_end:
    ${If} $3 == ""
    ${OrIf} $3 == "."
    ${OrIf} $3 == ".."
      Goto codex_path_done
    ${EndIf}
    StrCpy $4 $3 1 -1
    ${If} $4 == "."
    ${OrIf} $4 == " "
      Goto codex_path_done
    ${EndIf}
    StrCpy $4 0
    StrCpy $5 ""
  codex_path_device_name:
    StrCpy $6 $3 1 $4
    StrCmp $6 "" codex_path_check_device
    StrCmp $6 "." codex_path_check_device
    StrCpy $5 "$5$6"
    IntOp $4 $4 + 1
    Goto codex_path_device_name
  codex_path_check_device:
    ${If} $5 == "CON"
    ${OrIf} $5 == "PRN"
    ${OrIf} $5 == "AUX"
    ${OrIf} $5 == "NUL"
      Goto codex_path_done
    ${EndIf}
    StrLen $4 $5
    ${If} $4 == 4
      StrCpy $6 $5 3
      ${If} $6 == "COM"
      ${OrIf} $6 == "LPT"
        StrCpy $6 $5 1 3
        ${If} $6 >= 1
        ${AndIf} $6 <= 9
          Goto codex_path_done
        ${EndIf}
      ${EndIf}
    ${EndIf}
    StrCpy $3 ""
    ${If} $1 != ""
      IntOp $2 $2 + 1
      Goto codex_path_scan
    ${EndIf}
    ; Win32 规范化也支持尚未创建的首次安装目录，NSIS 的长路径解析要求目标存在。
    System::Call 'kernel32::GetFullPathNameW(w r0, i ${NSIS_MAX_STRLEN}, w.r1, p 0)i.r2'
    ${If} $2 == 0
    ${OrIf} $2 >= ${NSIS_MAX_STRLEN}
    ${OrIf} $1 != $0
      Goto codex_path_done
    ${EndIf}
    !insertmacro CodexRejectAncestor "$WINDIR"
    !insertmacro CodexRejectAncestor "$SYSDIR"
    !insertmacro CodexRejectAncestor "$PROFILE"
    !insertmacro CodexRejectAncestor "$APPDATA"
    !insertmacro CodexRejectAncestor "$LOCALAPPDATA"
    !insertmacro CodexRejectAncestor "$PROGRAMFILES"
    !insertmacro CodexRejectAncestor "$PROGRAMFILES64"
    !insertmacro CodexRejectAncestor "$COMMONFILES"
    !insertmacro CodexRejectAncestor "$COMMONFILES64"
    Push "$WINDIR"
    Push $0
    Call CodexIsPathAncestor
    Pop $1
    ${If} $1 == "1"
      Goto codex_path_done
    ${EndIf}
    Push "$APPDATA"
    Push $0
    Call CodexIsPathAncestor
    Pop $1
    ${If} $1 == "1"
      Goto codex_path_done
    ${EndIf}
    StrCpy $2 3
  codex_path_attributes:
    StrCpy $1 $0 1 $2
    ${If} $1 == "\"
    ${OrIf} $1 == ""
      StrCpy $3 $0 $2
      System::Call 'kernel32::GetFileAttributesW(w r3)i.r4 ?e'
      Pop $6
      ${If} $4 = ${CODEX_INVALID_FILE_ATTRIBUTES}
        Push $6
        Call CodexMissingPathResult
        Pop $8
        Goto codex_path_done
      ${EndIf}
      IntOp $5 $4 & ${CODEX_FILE_ATTRIBUTE_REPARSE_POINT}
      ${If} $5 != 0
        Goto codex_path_done
      ${EndIf}
      IntOp $5 $4 & ${CODEX_FILE_ATTRIBUTE_DIRECTORY}
      ${If} $5 == 0
        Goto codex_path_done
      ${EndIf}
      ; 已有前缀必须使用长目录名，防止 8.3 别名绕过系统与数据目录的边界检查。
      System::Call 'kernel32::GetLongPathNameW(w r3, w.r7, i ${NSIS_MAX_STRLEN})i.r6'
      ${If} $6 == 0
      ${OrIf} $6 >= ${NSIS_MAX_STRLEN}
      ${OrIf} $7 != $3
        Goto codex_path_done
      ${EndIf}
      ${If} $1 == ""
        StrCpy $8 "safe"
        Goto codex_path_done
      ${EndIf}
    ${EndIf}
    IntOp $2 $2 + 1
    Goto codex_path_attributes
  codex_path_done:
  StrCpy $0 $8
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd
!macroend
!endif
