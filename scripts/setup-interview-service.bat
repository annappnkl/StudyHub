@echo off
echo 🎯 Setting up HAWK Interview Practice Service...

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python is not installed. Please install Python 3.8 or higher.
    pause
    exit /b 1
)

REM Check if pip is installed
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ pip is not installed. Please install pip.
    pause
    exit /b 1
)

REM Navigate to the interviewer directory
cd /d "%~dp0\..\interviewer"

echo 📦 Installing Python dependencies...
pip install -r requirements.txt

echo ✅ Python dependencies installed successfully!

echo.
echo 🔧 Next steps:
echo 1. Make sure you have the following environment variables set:
echo    - OPENAI_API_KEY (for GPT-4o-mini and Whisper)
echo    - ELEVENLABS_API_KEY (for text-to-speech)
echo.
echo 2. Start the interview service:
echo    cd interviewer ^&^& python server.py
echo.
echo 3. The service will run on http://localhost:8001
echo.
echo 🚀 Setup complete! The interview practice feature is ready to use.
pause
