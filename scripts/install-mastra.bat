@echo off
REM Mastra AI Agent Installation Script for Zithmi Backend (Windows)
REM This script installs the required Mastra dependencies

echo ==================================
echo Mastra AI Agent Installation
echo ==================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo Error: package.json not found. Please run this script from the z-backend-v2 directory.
    exit /b 1
)

echo Installing Mastra dependencies...
echo.

REM Install Mastra packages
call npm install @mastra/core@latest @mastra/memory@latest @mastra/engine@latest

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Mastra dependencies installed successfully!
    echo.
    echo ==================================
    echo Next Steps:
    echo ==================================
    echo.
    echo 1. Add your OpenAI API key to .env:
    echo    OPENAI_API_KEY=your_key_here
    echo.
    echo 2. Set the API base URL in .env:
    echo    API_BASE_URL=http://localhost:3001/api
    echo.
    echo 3. Start the backend:
    echo    npm run dev
    echo.
    echo 4. Test the agent with Postman or cURL
    echo.
    echo For more information, see MASTRA_SETUP.md
    echo.
) else (
    echo.
    echo Installation failed. Please check the errors above.
    exit /b 1
)
