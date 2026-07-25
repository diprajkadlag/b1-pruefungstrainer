@echo off
setlocal EnableDelayedExpansion
title B1-Pruefungstrainer

rem  Starts the trainer with whatever the machine already has.
rem
rem  The app is a static site, but it cannot be opened straight from the file
rem  system: browsers block module scripts and fetch() on file:// URLs. So it
rem  needs a local web server, and this tries every one a Windows machine is
rem  likely to have before giving up.

cd /d "%~dp0"
if exist "dist\index.html" cd dist

echo.
echo   B1-Pruefungstrainer
echo   -------------------
echo.

set PORT=8123
set SERVER=

where node >nul 2>&1 && set SERVER=node
if "%SERVER%"=="" ( where python >nul 2>&1 && set SERVER=python )
if "%SERVER%"=="" ( where py >nul 2>&1 && set SERVER=py )

if "%SERVER%"=="" goto :nichts

echo   Server startet auf http://localhost:%PORT%
echo   Zum Beenden dieses Fenster schliessen.
echo.

rem Give the server a moment before the browser asks for the page.
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%/"

if "%SERVER%"=="node"   npx --yes serve -s . -l %PORT%
if "%SERVER%"=="python" python -m http.server %PORT%
if "%SERVER%"=="py"     py -m http.server %PORT%

goto :ende

:nichts
echo   Es wurde weder Node.js noch Python gefunden.
echo.
echo   Sie haben zwei Moeglichkeiten:
echo.
echo     1. Nutzen Sie die Online-Version - dort ist nichts zu installieren:
echo        https://diprajkadlag.github.io/b1-pruefungstrainer/
echo.
echo     2. Installieren Sie Python (kostenlos) und starten Sie diese Datei
echo        erneut: https://www.python.org/downloads/
echo.
pause

:ende
endlocal
