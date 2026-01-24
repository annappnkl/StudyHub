#!/bin/bash

# Setup script for the Interview Practice service
echo "🎯 Setting up HAWK Interview Practice Service..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed. Please install pip3."
    exit 1
fi

# Navigate to the interviewer directory
cd "$(dirname "$0")/../interviewer"

echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

echo "✅ Python dependencies installed successfully!"

echo ""
echo "🔧 Next steps:"
echo "1. Make sure you have the following environment variables set:"
echo "   - OPENAI_API_KEY (for GPT-4o-mini and Whisper)"
echo "   - ELEVENLABS_API_KEY (for text-to-speech)"
echo ""
echo "2. Start the interview service:"
echo "   cd interviewer && python3 server.py"
echo ""
echo "3. The service will run on http://localhost:8001"
echo ""
echo "🚀 Setup complete! The interview practice feature is ready to use."
