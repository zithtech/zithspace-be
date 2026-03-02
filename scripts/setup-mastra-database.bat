@echo off
REM Mastra Database Setup Script for Windows
REM This script helps you set up a dedicated PostgreSQL database for Mastra AI agent

echo ==========================================
echo Mastra AI Agent Database Setup
echo ==========================================
echo.

REM Check if psql is available
where psql >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: PostgreSQL client (psql) is not installed or not in PATH.
    echo Please install PostgreSQL client tools first.
    exit /b 1
)

echo PostgreSQL client found
echo.

REM Get database details
set /p DB_HOST="PostgreSQL host [localhost]: "
if "%DB_HOST%"=="" set DB_HOST=localhost

set /p DB_PORT="PostgreSQL port [5432]: "
if "%DB_PORT%"=="" set DB_PORT=5432

set /p ADMIN_USER="PostgreSQL admin user [postgres]: "
if "%ADMIN_USER%"=="" set ADMIN_USER=postgres

echo.
set /p MASTRA_DB="Mastra database name [mastra_db]: "
if "%MASTRA_DB%"=="" set MASTRA_DB=mastra_db

set /p MASTRA_USER="Mastra database user [mastra_user]: "
if "%MASTRA_USER%"=="" set MASTRA_USER=mastra_user

set /p MASTRA_PASS="Password for %MASTRA_USER%: "

echo.
echo Creating database and user...
echo.

REM Create temporary SQL file
set SQL_FILE=%TEMP%\mastra_setup.sql

(
echo CREATE USER %MASTRA_USER% WITH PASSWORD '%MASTRA_PASS%';
echo CREATE DATABASE %MASTRA_DB% WITH OWNER %MASTRA_USER% ENCODING 'UTF8';
echo GRANT ALL PRIVILEGES ON DATABASE %MASTRA_DB% TO %MASTRA_USER%;
) > %SQL_FILE%

REM Execute SQL
psql -h %DB_HOST% -p %DB_PORT% -U %ADMIN_USER% -f %SQL_FILE%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Database setup completed successfully!
    echo.
    echo ==========================================
    echo Add this to your .env file:
    echo ==========================================
    echo.
    echo MASTRA_DATABASE_URL=postgresql://%MASTRA_USER%:%MASTRA_PASS%@%DB_HOST%:%DB_PORT%/%MASTRA_DB%
    echo.
    echo Important:
    echo 1. Keep this connection string secure
    echo 2. Don't commit to version control
    echo 3. Mastra will auto-create tables on first run
    echo.
) else (
    echo.
    echo Database setup failed.
    echo Please check the error messages above.
)

REM Cleanup
del %SQL_FILE%

echo.
echo For manual setup, see: scripts\setup-mastra-database.sql
echo.
pause
