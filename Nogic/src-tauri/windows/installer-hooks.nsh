; Guarantee both shortcuts for every install, including silent and passive
; runs where the NSIS finish page (and its shortcut checkbox) never appears.
; Tauri 2's NSIS config has no createDesktopShortcut/createStartMenuShortcut
; keys (unknown fields fail config parsing), so the hooks own the behaviour.
!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  CreateDirectory "$SMPROGRAMS"
  CreateShortCut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS"
!macroend
