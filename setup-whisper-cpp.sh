#!/bin/bash
# Setup script for whisper.cpp

echo "📦 Installing whisper.cpp..."

# Clone repo if not exists
if [ ! -d "whisper.cpp" ]; then
    git clone https://github.com/ggerganov/whisper.cpp.git
    cd whisper.cpp
else
    cd whisper.cpp
    git pull
fi

# Build
echo "🔨 Building whisper.cpp..."
make

# Download model
echo "📥 Downloading base model (139MB)..."
bash ./models/download-ggml-model.sh base

cd ..
echo "✅ whisper.cpp setup complete!"
echo ""
echo "Usage:"
echo "  ./whisper.cpp/main -m ./whisper.cpp/models/ggml-base.bin -f audio.wav"
