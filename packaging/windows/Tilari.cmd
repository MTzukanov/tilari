@echo off
setlocal
set "ROOT=%~dp0"
set "TILARI_STATIC=%ROOT%app\www"
cd /d "%ROOT%app\server" || exit /b 1
"%ROOT%node\node.exe" --import tsx src\launcher.ts %*
exit /b %ERRORLEVEL%
