/**
 * Whisper.cpp wrapper - C++ implementation of Whisper
 * Faster and lighter than Python version
 * 
 * Installation:
 *   bash setup-whisper-cpp.sh
 * 
 * Usage:
 *   const { transcribeWithWhisperCpp } = require('./whisper-cpp-wrapper');
 *   const result = await transcribeWithWhisperCpp('./audio.wav', 'en', 'medium');
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const WHISPER_CPP_DIR = path.join(__dirname, 'whisper.cpp');
const WHISPER_BIN = path.join(WHISPER_CPP_DIR, 'build', 'bin', 'whisper-cli');
const MODELS_DIR = path.join(WHISPER_CPP_DIR, 'models');

// Model paths
const MODELS = {
  'base': path.join(MODELS_DIR, 'ggml-base.bin'),
  'small': path.join(MODELS_DIR, 'ggml-small.bin'),
  'medium': path.join(MODELS_DIR, 'ggml-medium.bin')
};

// Language map for whisper.cpp
const LANGUAGE_MAP = {
  'en': 'en',      // English
  'vi': 'vi',      // Vietnamese
  'zh': 'zh',      // Chinese
  'ja': 'ja',      // Japanese
  'ko': 'ko',      // Korean
  'th': 'th',      // Thai
};

/**
 * Transcribe audio using whisper.cpp
 * @param {string} audioPath - Path to audio file (WAV, MP3, etc)
 * @param {string} language - Language code (en, vi, zh, etc)
 * @param {string} model - Model name (base, small, medium)
 * @returns {Promise<{text: string, language: string, success: boolean}>}
 */
async function transcribeWithWhisperCpp(audioPath, language = 'en', model = 'medium') {
  return new Promise((resolve, reject) => {
    // Get model path
    const modelPath = MODELS[model] || MODELS['medium'];
    
    // Check if model exists
    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Model not found: ${modelPath}`));
      return;
    }

    // Check if binary exists
    if (!fs.existsSync(WHISPER_BIN)) {
      reject(new Error(
        `Whisper binary not found at ${WHISPER_BIN}`
      ));
      return;
    }

    // Map language code
    const lang = LANGUAGE_MAP[language] || 'auto';

    // Build command arguments
    const args = [
      '-m', modelPath,
      '-l', lang,
      '-f', audioPath
    ];

    console.log(`🎤 Transcribing: ${audioPath}`);
    console.log(`🌍 Language: ${language}`);
    console.log(`🧠 Model: ${model}`);
    console.log(`📋 Command: ${WHISPER_BIN} ${args.join(' ')}`);

    const startTime = Date.now();

    // Execute whisper.cpp - capture both stdout and stderr
    execFile(WHISPER_BIN, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`📤 Stdout length: ${stdout.length}`);
      console.log(`📤 Stderr length: ${stderr.length}`);
      
      if (error && !stdout) {
        console.error(`❌ Transcription error: ${error.message}`);
        return reject(error);
      }

      try {
        // Parse output from stdout OR stderr (whisper.cpp outputs to stderr)
        const output = stdout || stderr;
        const lines = output.split('\n');
        let text = '';
        
        for (const line of lines) {
          // Match format: [time] text
          const match = line.match(/^\[[\d:\.]+\s*-->\s*[\d:\.]+\]\s+(.+)$/);
          if (match) {
            text += match[1] + ' ';
          }
        }

        if (!text.trim()) {
          console.error(`⚠️ No text found in output`);
          console.error(`First 500 chars stdout: ${stdout.substring(0, 500)}`);
          console.error(`First 500 chars stderr: ${stderr.substring(0, 500)}`);
          throw new Error('No transcription text extracted');
        }

        console.log(`✓ Transcription complete (${duration}s)`);
        console.log(`📝 Text: ${text.substring(0, 100).trim()}...`);

        resolve({
          text: text.trim(),
          language: language,
          success: true,
          duration: parseFloat(duration)
        });
      } catch (parseError) {
        console.error(`❌ Error parsing output: ${parseError.message}`);
        reject(parseError);
      }
    });
  });
}

module.exports = {
  transcribeWithWhisperCpp
};
