#!/bin/bash

echo "🌾 AgriPredict Setup Script"
echo "================================"

# Check if Python is installed
if ! command -v python &> /dev/null; then
    echo "❌ Python is not installed. Please install Python 3.8+"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+"
    exit 1
fi

echo "✅ Python and Node.js are installed"

# Setup Backend
echo ""
echo "📦 Setting up Backend..."
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    .venv\Scripts\activate
else
    source .venv/bin/activate
fi

# Install dependencies
pip install -r requirements.txt

cd ..

# Setup Frontend
echo "📦 Setting up Frontend..."
cd frontend

# Install npm dependencies
npm install

cd ..

echo ""
echo "✅ Setup Complete!"
echo ""
echo "To start the application:"
echo ""
echo "Terminal 1 - Backend:"
echo "  cd backend"
echo "  .venv\\Scripts\\activate  # Windows"
echo "  source .venv/bin/activate  # macOS/Linux"
echo "  uvicorn app.main:app --reload"
echo ""
echo "Terminal 2 - Frontend:"
echo "  cd frontend"
echo "  npm start"
echo ""
echo "Open http://localhost:3000 in your browser"
