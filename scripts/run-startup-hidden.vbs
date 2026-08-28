' Placed in the current user's Startup folder (see RESTART_RESILIENCE.md)
' so it fires automatically on login -- the only non-admin way to get
' something running again after a full system restart, since both real
' Windows Services and Task Scheduler logon triggers need elevation this
' session doesn't have.
'
' waitOnReturn=False (unlike run-watchdog-hidden.vbs's True) deliberately,
' so this doesn't block the desktop/login sequence while its retry loop
' runs in the background over the following few minutes.
Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""D:\EffCorp_Products\IOCLSERPLBudget\IOCLSERPLBudget\scripts\startup.ps1""", 0, False
