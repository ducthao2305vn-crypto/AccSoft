; Giữ lại dữ liệu người dùng (AccSoft_Data) khi gỡ cài đặt hoặc cập nhật phiên bản mới
!macro customRemoveFiles
  ${if} ${FileExists} "$INSTDIR\AccSoft_Data\*.*"
    Rename "$INSTDIR\AccSoft_Data" "$INSTDIR.AccSoft_Data.keep"
    RMDir /r "$INSTDIR"
    CreateDirectory "$INSTDIR"
    Rename "$INSTDIR.AccSoft_Data.keep" "$INSTDIR\AccSoft_Data"
  ${else}
    RMDir /r "$INSTDIR"
  ${endif}
!macroend
