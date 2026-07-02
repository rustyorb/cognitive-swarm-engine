@echo off
REM Start the Cognitive Swarm Engine in its own window.
REM Optional first argument overrides the port (default: 3737 to avoid common 3000 clashes).
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=3737"

echo Starting Cognitive Swarm Engine on port %PORT% (auto-falls-back if busy)...
start "CognitiveSwarmEngine" cmd /c "set PORT=%PORT%&& npm run dev"
echo.
echo Launched in a new window titled "CognitiveSwarmEngine".
echo Watch that window for the exact URL, then run stop.bat to stop it.
