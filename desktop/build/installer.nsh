!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\*\shell\Zyra" "" "Open with Zyra"
  WriteRegStr SHELL_CONTEXT "Software\Classes\*\shell\Zyra" "Icon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\*\shell\Zyra" "Position" "Top"
  WriteRegStr SHELL_CONTEXT "Software\Classes\*\shell\Zyra\command" "" '"$appExe" "%1"'

  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\Zyra" "" "Open with Zyra"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\Zyra" "Icon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\Zyra" "Position" "Top"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\Zyra\command" "" '"$appExe" "%1"'

  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\Background\shell\Zyra" "" "Open Zyra Here"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\Background\shell\Zyra" "Icon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\Background\shell\Zyra" "Position" "Top"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\Background\shell\Zyra\command" "" '"$appExe" "%V"'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey SHELL_CONTEXT "Software\Classes\*\shell\Zyra"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\shell\Zyra"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\Background\shell\Zyra"
  ${endIf}
!macroend
