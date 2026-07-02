@echo off
REM Stop the running Cognitive Swarm Engine (uses the PID it wrote on startup).
cd /d "%~dp0"

if not exist ".swarm.pid" (
  echo No .swarm.pid found - the server does not appear to be running.
  goto :fallback
)

set /p PID=<.swarm.pid
echo Stopping Cognitive Swarm Engine (PID %PID%)...
taskkill /PID %PID% /T /F >nul 2>&1
del ".swarm.pid" >nul 2>&1
echo Stopped.
goto :eof

:fallback
REM Fallback: close the launcher window by title if it is still open.
taskkill /FI "WINDOWTITLE eq CognitiveSwarmEngine*" /T /F >nul 2>&1
