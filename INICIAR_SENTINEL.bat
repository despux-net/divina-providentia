@echo off
echo ============================================================
echo   DIVINA PROVIDENTIA - SENTINEL SYSTEM
echo ============================================================
echo.
echo Iniciando sincronizacion con Google Sheets...
echo.
echo IMPORTANTE: NO CIERRES ESTA VENTANA
echo El script debe quedarse corriendo continuamente.
echo.
echo Para detenerlo: Presiona Ctrl+C
echo.
echo ============================================================
echo.

python auto-upload.py

echo.
echo ============================================================
echo El script se detuvo. Presiona cualquier tecla para cerrar.
pause
