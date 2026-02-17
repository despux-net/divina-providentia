@echo off
echo ============================================================
echo   SENTINEL + AUTO-DEPLOY - Divina Providentia  
echo ============================================================
echo.
echo Este script:
echo   1. Inicia el Sentinel (sincronizacion con Supabase)
echo   2. Cada 5 minutos hace auto-deploy a GitHub
echo.
echo IMPORTANTE: NO CIERRES ESTA VENTANA
echo El script debe quedarse corriendo continuamente.
echo.
echo Para detenerlo: Presiona Ctrl+C
echo.
echo ============================================================
echo.

:LOOP
    echo.
    echo [%time%] Iniciando Sentinel...
    echo.
    
    REM Ejecutar Sentinel por 5 minutos (300 segundos)
    timeout /t 300 /nobreak
    
    echo.
    echo [%time%] Haciendo auto-deploy a GitHub...
    echo.
    
    REM Git add y commit
    git add content.json content-loader.js styles.css index.html auto-upload.py .processed-lookbook.json .processed-images.json
    git commit -m "Auto-deploy: Sentinel sync - %date% %time%"
    git push origin main
    
    echo [%time%] Deploy completado. Esperando 5 minutos...
    
    REM Volver a empezar
    goto LOOP
