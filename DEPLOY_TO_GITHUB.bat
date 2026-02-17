@echo off
echo ============================================================
echo   DEPLOY TO GITHUB - Divina Providentia
echo ============================================================
echo.
echo Este script va a subir los archivos modificados a GitHub
echo.
echo Archivos que se van a subir:
echo   - content.json
echo   - content-loader.js
echo   - styles.css
echo   - index.html
echo   - auto-upload.py (si tiene cambios)
echo.
pause
echo.
echo ============================================================
echo Subiendo archivos a GitHub...
echo ============================================================
echo.

REM Agregar archivos
git add content.json
git add content-loader.js
git add styles.css
git add index.html
git add library.js
git add app.js
git add supabase-config.js
git add carousel-new.js
git add auto-upload.py
git add .processed-lookbook.json
git add .processed-images.json

REM Crear commit con timestamp
git commit -m "Update: Content management, mobile cart fix, and Sentinel improvements - %date% %time%"

REM Subir a GitHub
git push origin main

echo.
echo ============================================================
echo Deployment completado!
echo Espera 1-2 minutos para que GitHub Pages se actualice
echo ============================================================
echo.
pause
