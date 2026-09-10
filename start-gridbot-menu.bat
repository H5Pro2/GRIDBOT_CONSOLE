@echo off
set "ROOT=%~dp0"

start "Gridbot Konsole" powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath $env:ROOT; npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173/"
