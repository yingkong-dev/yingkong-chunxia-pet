param([Parameter(Mandatory=$true)][string]$IconPath)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
# Application-owned registration only. Never changes user notification preferences.
$key='HKCU:\Software\Classes\AppUserModelId\Yingkong.Chunxia.DesktopPet'
New-Item -Path $key -Force | Out-Null
New-ItemProperty -LiteralPath $key -Name DisplayName -Value ([string]::Concat([char]0x6625,[char]0x590F,[char]0x684C,[char]0x5BA0,' · ',[char]0x83BA,[char]0x7A7A,[char]0x793E,[char]0x533A)) -PropertyType String -Force | Out-Null
New-ItemProperty -LiteralPath $key -Name IconUri -Value $IconPath -PropertyType String -Force | Out-Null
# Electron 43 registers this own COM activator; do not create or alter its COM server.
$activator='{ADD1C0A1-1AA2-495A-8CE7-044ECC89E7FE}'
if(Test-Path -LiteralPath ('HKCU:\Software\Classes\CLSID\'+$activator)){
 New-ItemProperty -LiteralPath $key -Name CustomActivator -Value $activator -PropertyType String -Force | Out-Null
}
[void][Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]
[void][Windows.UI.Notifications.ToastNotifier,Windows.UI.Notifications,ContentType=WindowsRuntime]
[void][Windows.UI.Notifications.NotificationSetting,Windows.UI.Notifications,ContentType=WindowsRuntime]
$notifier=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Yingkong.Chunxia.DesktopPet')
# Reflection preserves errors which PowerShell otherwise silently converts to null properties.
try{
 $value=$notifier.GetType().GetProperty('Setting').GetValue($notifier,$null)
 @{registered=$true;setting=[string]$value;settingValue=[int]$value} | ConvertTo-Json -Compress
}catch{
 # A new unpackaged identity may have no notification-handler row until first Show.
 # Registration is still valid; report unknown rather than calling it Enabled or blocking its first toast.
 @{registered=$true;setting='unknown_until_first_send';settingValue=$null} | ConvertTo-Json -Compress
}
