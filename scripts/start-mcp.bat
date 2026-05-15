@echo off
REM ============================================================
REM Design Pattern Multiverse — MCP Server Startup (Windows)
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════╗
echo ║ Design Pattern Multiverse — MCP Server Startup    ║
echo ╚════════════════════════════════════════════════════╝
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ✗ Node.js is not installed
    echo   Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✓ Node.js %NODE_VERSION%

REM Check npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ✗ npm is not installed
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✓ npm v%NPM_VERSION%

REM Install dependencies if needed
if not exist "node_modules" (
    echo.
    echo ⚠ Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ✗ npm install failed
        pause
        exit /b 1
    )
)

REM Build if needed
if not exist "dist" (
    echo.
    echo ⚠ Building project...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo ✗ Build failed
        pause
        exit /b 1
    )
)

REM Check that dist/mcp-server/index.js exists
if not exist "dist\mcp-server\index.js" (
    echo ✗ MCP server build not found
    echo   Run: npm run build
    pause
    exit /b 1
)

echo.
echo ⚠ Starting MCP server...
echo.

REM Start the MCP server
node dist\mcp-server\index.js

pause
