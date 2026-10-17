@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0runtime\node.exe" (
 echo 缺少运行环境，请下载完整便携包，源码请先构建。
 pause
 exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0scripts\start.cjs" --stop
if errorlevel 1 pause
