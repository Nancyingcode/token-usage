; 此夹具只执行实际安装器的纯策略函数，将结果写入测试临时目录，不访问产品登记。
Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
OutFile "${OUTPUT_EXE}"

!include "${POLICY_FILE}"
!insertmacro CodexPolicyFunctions

Var Results

!macro PrepareCase
  StrCpy $0 "register-zero"
  StrCpy $1 "register-one"
  Push "stack-guard"
!macroend

!macro StoreCase NAME
  Pop $R0
  Pop $R1
  ${If} $0 != "register-zero"
  ${OrIf} $1 != "register-one"
  ${OrIf} $R1 != "stack-guard"
    StrCpy $R0 "call-state-corrupted"
  ${EndIf}
  FileWrite $Results "${NAME}=$R0$\r$\n"
!macroend

!macro VersionCase NAME INSTALLED PACKAGE
  !insertmacro PrepareCase
  Push "${INSTALLED}"
  Push "${PACKAGE}"
  Call CodexCompareVersions
  !insertmacro StoreCase "${NAME}"
!macroend

!macro PathCase NAME PATH
  !insertmacro PrepareCase
  Push "${PATH}"
  Call CodexValidateInstallPath
  !insertmacro StoreCase "${NAME}"
!macroend

!macro MissingPathCase NAME ERROR_CODE
  !insertmacro PrepareCase
  Push "${ERROR_CODE}"
  Call CodexMissingPathResult
  !insertmacro StoreCase "${NAME}"
!macroend

!macro AncestorCase NAME ANCESTOR PATH
  !insertmacro PrepareCase
  Push "${ANCESTOR}"
  Push "${PATH}"
  Call CodexIsPathAncestor
  !insertmacro StoreCase "${NAME}"
!macroend

!macro ShortPathCase NAME PATH
  System::Call 'kernel32::GetShortPathNameW(w "${PATH}", w.r0, i ${NSIS_MAX_STRLEN})i.r1'
  ${If} $1 > 0
  ${AndIf} $1 < ${NSIS_MAX_STRLEN}
  ${AndIf} $0 != "${PATH}"
    Push $0
    Call CodexValidateInstallPath
    Pop $0
    FileWrite $Results "${NAME}=$0$\r$\n"
  ${Else}
    FileWrite $Results "${NAME}=unavailable$\r$\n"
  ${EndIf}
!macroend

Section
  FileOpen $Results "${RESULT_FILE}" w
  !include "${CASES_FILE}"
  FileClose $Results
SectionEnd
