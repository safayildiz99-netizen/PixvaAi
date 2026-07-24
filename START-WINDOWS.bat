@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte zuerst Node.js 20.19 oder neuer installieren.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist server\node_modules call npm install --prefix server
if not exist client\node_modules call npm install --prefix client
start "" http://localhost:5173
call npm run dev
pause
