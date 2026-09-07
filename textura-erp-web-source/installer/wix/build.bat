@echo off
echo Running Textura WiX build...
powershell -ExecutionPolicy Bypass -File "%~dp0build.ps1"
pause
