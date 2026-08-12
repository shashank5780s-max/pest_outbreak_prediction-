@echo off
echo.
echo 🌾 AgriPredict Setup Script
echo ================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Python is not installed. Please install Python 3.8+
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js 16+
    pause
    exit /b 1
)

echo ✅ Python and Node.js are installed
echo.

REM Setup Backend
echo 📦 Setting up Backend...
cd backend

REM Create virtual environment
python -m venv .venv

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Install dependencies
pip install -r requirements.txt

cd ..

REM Setup Frontend
echo 📦 Setting up Frontend...
cd frontend

REM Install npm dependencies
call npm install

cd ..

echo.
echo ✅ Setup Complete!
echo.
echo To start the application:
echo.
echo Terminal 1 - Backend:
echo   cd backend
echo   .venv\Scripts\activate
echo   uvicorn app.main:app --reload
echo.
echo Terminal 2 - Frontend:
echo   cd frontend
echo   npm start
echo.
echo Open http://localhost:3000 in your browser
echo.
pause
