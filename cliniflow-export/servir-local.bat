@echo off
cd /d "%~dp0"
echo Iniciando servidor em http://localhost:3000/ ...
start /B python -m http.server 3000
timeout /t 2 /nobreak >nul
start http://localhost:3000/
echo.
echo Servidor rodando. Pressione qualquer tecla para encerrar.
pause >nul
taskkill /F /IM python.exe /T >nul 2>&1
echo Servidor encerrado.
