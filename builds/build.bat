:: ============================================================================
:: .zip package builder
:: ============================================================================
@echo off

:: Set output filename
set OUTPUT_FILE=%~dp0%lan.zip

:: Delete
del "%OUTPUT_FILE%" > NUL 2> NUL

:: Temp folder
set TEMP_DIR=%~dp0%files
mkdir "%TEMP_DIR%" > NUL 2> NUL
copy ..\src\template.html "%TEMP_DIR%"\index.html > NUL 2> NUL

:: Compress
7z.exe a -tzip -mx=9 -mtc=off "%OUTPUT_FILE%" "..\src\node.*.exe" "..\src\lan.js" "..\src\run.bat" ".\files\"

:: Clean
rmdir /S /Q "%TEMP_DIR%" > NUL 2> NUL
