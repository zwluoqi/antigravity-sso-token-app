@echo off
echo Starting Kiro Account Manager...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

REM Start the application
echo Starting application...
npm start

pause