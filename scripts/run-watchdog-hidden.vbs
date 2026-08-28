' Launches watchdog.ps1 with a genuinely hidden window. Task Scheduler
' calling powershell.exe directly with -WindowStyle Hidden still flashes a
' visible console on Windows (a known PowerShell 5.1 quirk) -- routing
' through WScript.Shell.Run with windowStyle=0 is the reliable fix.
Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""D:\EffCorp_Products\IOCLSERPLBudget\IOCLSERPLBudget\scripts\watchdog.ps1""", 0, True
