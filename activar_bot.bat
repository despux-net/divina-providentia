@echo off
echo ===================================================
echo   CONFIGURANDO EL CEREBRO DEL BOT DE TELEGRAM
echo ===================================================
echo.
echo PASO 1: AUTENTICACION
echo Se abrira tu navegador para conectar con Supabase.
echo Por favor confirma el acceso cuando se te solicite.
echo.
call npx supabase login
echo.
echo ===================================================
echo PASO 2: CONECTANDO SECRETOS
echo ===================================================
echo.
echo Intentando establecer conexión segura con Supabase...
echo URL: https://nzwtafacdpdgulzcwntx.supabase.co
echo KEY: [OCULTA]
echo.

call npx supabase secrets set APP_SERVICE_ROLE_KEY=sb_secret_PLACEHOLDER

echo.
echo ===================================================
echo   ESTADO DE LA OPERACION
echo ===================================================
echo.
echo Si viste "Set secret(s)", ¡el éxito es total!
echo.
pause
