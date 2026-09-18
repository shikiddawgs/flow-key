@echo off
title KidFaster Extension Installer
color 0A

:: Switch to script directory to prevent "file not found" errors when running as Admin
cd /d "%~dp0"

echo ===================================================
echo     KidFaster Extension Installer (Windows)
echo ===================================================
echo.
echo IMPORTANT: Please ensure After Effects is CLOSED before proceeding!
echo.
pause

:: Check for Administrator privileges
echo.
echo Checking for administrative privileges...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrative Privileges...
    echo Please click "Yes" on the User Account Control (UAC) prompt.
    :: Use short path to avoid space/quote issues in PowerShell
    powershell -Command "Start-Process cmd -ArgumentList '/c %~s0' -Verb RunAs"
    exit /b
)

echo Success: Administrative privileges confirmed.
echo.

echo [1/3] Enabling CEP PlayerDebugMode...
:: Enable PlayerDebugMode for all modern CSXS versions
REG ADD "HKCU\Software\Adobe\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
REG ADD "HKCU\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
REG ADD "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
REG ADD "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
REG ADD "HKCU\Software\Adobe\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
REG ADD "HKCU\Software\Adobe\CSXS.14" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
REG ADD "HKCU\Software\Adobe\CSXS.15" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
REG ADD "HKCU\Software\Adobe\CSXS.16" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo Debug mode enabled successfully.

echo.
echo [2/3] Setting up installation directories...
set "TARGET_DIR=%APPDATA%\Adobe\CEP\extensions\KidFaster"
if not exist "%APPDATA%\Adobe\CEP\extensions" (
    mkdir "%APPDATA%\Adobe\CEP\extensions"
)
if exist "%TARGET_DIR%" (
    echo Removing old version...
    rmdir /s /q "%TARGET_DIR%" >nul 2>&1
)
mkdir "%TARGET_DIR%"

echo.
echo [3/3] Copying extension files...
xcopy "%~dp0*" "%TARGET_DIR%\" /E /C /I /Q /H /R /Y >nul

:: Ensure dev presets are not deployed to end-user machines
if exist "%TARGET_DIR%\data\my_presets.json" (
    del /q "%TARGET_DIR%\data\my_presets.json" >nul 2>&1
)

echo.
echo ===================================================
echo KidFaster Extension has been successfully installed!
echo ===================================================
echo.
echo You can now restart After Effects.
echo You will find the extension under: Window -^> Extensions -^> KidFaster
echo.
pause
