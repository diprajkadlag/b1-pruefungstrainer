@echo off
setlocal EnableDelayedExpansion
title B1-Pruefungstrainer

rem  Start the trainer from a fresh clone. Double-click this file.
rem
rem  It installs what is missing, builds the app, and opens it in the browser.
rem  The first run takes a few minutes; later runs take seconds.
rem
rem  Not to be confused with tools\Start-B1-Trainer.cmd, which is a different
rem  and much smaller script: that one ships inside the portable ZIP, where the
rem  app is already built and only needs a web server.
rem
rem  Port 8123 on purpose. A service worker claims a whole origin - scheme,
rem  host and port - so anything else you have opened on a common port such as
rem  3000 would keep answering here from its own cache.

cd /d "%~dp0"

set PORT=8123
set URL=http://localhost:%PORT%/
set REPO=https://github.com/diprajkadlag/b1-pruefungstrainer

echo.
echo   B1-Pruefungstrainer
echo   ===================
echo.

rem --------------------------------------------------------------------------
rem  Prerequisites
rem --------------------------------------------------------------------------

where npm >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js was not found.
  echo.
  echo   Install the LTS version from https://nodejs.org/ and run this again.
  echo.
  echo   Or skip installing altogether and use the hosted version:
  echo     https://diprajkadlag.github.io/b1-pruefungstrainer/
  echo.
  pause
  exit /b 1
)

rem  The exam content is generated, not committed, and the generator needs
rem  Python. It uses only the standard library, so any Python 3 will do.
set PY=
for %%C in (python py python3) do (
  if not defined PY (
    %%C -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>&1
    if not errorlevel 1 set PY=%%C
  )
)

if not defined PY (
  echo   [X] Python 3 was not found.
  echo.
  echo   The exam content is generated at build time and the generator needs
  echo   it. Install it from https://www.python.org/downloads/ - tick
  echo   "Add python.exe to PATH" - then run this file again.
  echo.
  echo   Or use the hosted version, where nothing needs installing:
  echo     https://diprajkadlag.github.io/b1-pruefungstrainer/
  echo.
  pause
  exit /b 1
)

echo   [1/5] Node.js and Python found ^(using "%PY%"^).

rem --------------------------------------------------------------------------
rem  Dependencies
rem --------------------------------------------------------------------------

if exist "node_modules" (
  echo   [2/5] Dependencies already installed.
) else (
  echo   [2/5] Installing dependencies. This is the slow part, once only...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [X] npm install failed. Read the messages above.
    pause
    exit /b 1
  )
  echo.
)

rem --------------------------------------------------------------------------
rem  Printable papers - small, so just fetch them
rem --------------------------------------------------------------------------
rem  Building these needs a TeX distribution, which almost nobody has to hand.
rem  The release carries them and the whole set is about 5 MB, so there is no
rem  reason to ask. Without them the app simply offers no print links.

if exist "content\exams\pruefung-01\pdf" goto :pdf_ok
if /i "%B1_SKIP_DOWNLOADS%"=="1" goto :pdf_ok
where curl >nul 2>&1 || goto :pdf_ok
where tar  >nul 2>&1 || goto :pdf_ok

echo   ... fetching the printable papers ^(about 5 MB^)
curl -sSL -o "%TEMP%\b1-pdfs.zip" "%REPO%/releases/latest/download/pdfs.zip"
if not errorlevel 1 (
  rem  The archive stores full relative paths, so it unpacks straight into
  rem  content\exams\...\pdf and content\lernhilfe\pdf.
  tar -xf "%TEMP%\b1-pdfs.zip"
  del /q "%TEMP%\b1-pdfs.zip" >nul 2>&1
)

:pdf_ok

rem --------------------------------------------------------------------------
rem  Listening audio - optional, and large
rem --------------------------------------------------------------------------
rem  Generating it needs the Piper voice models: hundreds of megabytes and
rem  several minutes per paper. Downloading the finished tracks from the
rem  release is far quicker. Reading, writing and speaking work without it.

if exist "content\exams\pruefung-01\audio" goto :audio_ok
if /i "%B1_SKIP_AUDIO%"=="1" goto :audio_skipped
if /i "%B1_SKIP_DOWNLOADS%"=="1" goto :audio_skipped

echo.
echo   The listening tracks are not in the repository - they are too big.
echo   They can be downloaded from the latest release ^(about 80 MB^).
echo.
set HOLEN=
set /p HOLEN=  Download them now? [Y/n]:
if /i "%HOLEN%"=="n" goto :audio_skipped

where curl >nul 2>&1 || goto :audio_no_tools
where tar  >nul 2>&1 || goto :audio_no_tools

echo.
for %%P in (01 02 03 04 05) do (
  echo   Downloading audio for Pruefung %%P...
  if not exist "content\exams\pruefung-%%P\audio" mkdir "content\exams\pruefung-%%P\audio"
  curl -sSL -o "%TEMP%\b1-audio-%%P.zip" "%REPO%/releases/latest/download/audio-pruefung-%%P.zip"
  if errorlevel 1 (
    echo   ... download failed, skipping.
  ) else (
    tar -xf "%TEMP%\b1-audio-%%P.zip" -C "content\exams\pruefung-%%P\audio"
    del /q "%TEMP%\b1-audio-%%P.zip" >nul 2>&1
  )
)
goto :audio_ok

:audio_no_tools
echo   curl or tar is missing ^(they ship with Windows 10 and 11^).
echo   Continuing without listening audio.
goto :audio_skipped

:audio_skipped
echo   [3/5] Continuing without listening audio.
echo         Lesen, Schreiben and Sprechen work; Hoeren needs the tracks.
echo         To add them later, run this file again, or: npm run content:audio
goto :build

:audio_ok
echo   [3/5] Listening audio present.

rem --------------------------------------------------------------------------
rem  Build
rem --------------------------------------------------------------------------

:build
echo   [4/5] Preparing the exams and building the app...

call npm run build --workspace=@b1/core >nul
if errorlevel 1 (
  echo   [X] Building the scoring package failed.
  pause
  exit /b 1
)

%PY% tools\export_web.py
if errorlevel 1 (
  echo   [X] Preparing the exam content failed.
  pause
  exit /b 1
)

call npm run build --workspace=@b1/web
if errorlevel 1 (
  echo   [X] Building the app failed.
  pause
  exit /b 1
)

rem --------------------------------------------------------------------------
rem  Serve
rem --------------------------------------------------------------------------

echo.
echo   [5/5] Starting on %URL%
echo         Close this window to stop the server.
echo.

rem  Open the browser only once the server actually answers, rather than
rem  racing it and landing on a connection error.
start "" /b cmd /c "for /l %%i in (1,1,60) do (curl -s -o nul %URL% && (start %URL% & exit) || timeout /t 1 /nobreak >nul)"

call npm run preview --workspace=@b1/web -- --port %PORT% --strictPort

endlocal
