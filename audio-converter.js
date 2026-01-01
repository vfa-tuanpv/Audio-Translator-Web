/**
 * Audio Converter Module
 * Handles converting audio blobs to WAV format using ffmpeg or manual PCM conversion
 */

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

/**
 * Convert raw audio blob to WAV file using ffmpeg
 * @param {Uint8Array} uint8Array - Raw audio buffer
 * @returns {Promise<Buffer>} - WAV file buffer
 */
async function convertBlobToWav(uint8Array) {
  const tmpDir = path.join(__dirname, "tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  
  const inputFile = path.join(tmpDir, `input_${Date.now()}.webm`);
  const outputFile = path.join(tmpDir, `output_${Date.now()}.wav`);
  
  // Write raw blob to input file
  fs.writeFileSync(inputFile, Buffer.from(uint8Array));
  
  return new Promise((resolve, reject) => {
    // Use ffmpeg to convert to WAV
    execFile(ffmpegPath, [
      '-i', inputFile,
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      outputFile
    ], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Clean up input file
      try { fs.unlinkSync(inputFile); } catch (e) {}
      
      if (error) {
        try { fs.unlinkSync(outputFile); } catch (e) {}
        reject(new Error(`ffmpeg error: ${error.message}`));
        return;
      }
      
      // Read converted WAV file
      const wavData = fs.readFileSync(outputFile);
      try { fs.unlinkSync(outputFile); } catch (e) {}
      
      resolve(wavData);
    });
  });
}

/**
 * Create WAV file from int16 PCM data (fallback method)
 * @param {Int16Array} int16Data - PCM audio data as int16
 * @returns {Buffer} - WAV file buffer
 */
function createWavFile(int16Data) {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  // Convert int16 array to buffer
  const pcmBuffer = Buffer.alloc(int16Data.length * 2);
  let index = 0;
  for (let i = 0; i < int16Data.length; i++) {
    pcmBuffer.writeInt16LE(int16Data[i], index);
    index += 2;
  }
  
  // WAV file header
  const wavHeader = Buffer.alloc(44);
  
  // RIFF chunk
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write('WAVE', 8);
  
  // fmt chunk
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);                    // Subchunk1Size
  wavHeader.writeUInt16LE(1, 20);                     // AudioFormat (PCM)
  wavHeader.writeUInt16LE(numChannels, 22);           // NumChannels
  wavHeader.writeUInt32LE(sampleRate, 24);            // SampleRate
  wavHeader.writeUInt32LE(sampleRate * blockAlign, 28); // ByteRate
  wavHeader.writeUInt16LE(blockAlign, 32);            // BlockAlign
  wavHeader.writeUInt16LE(bitsPerSample, 34);         // BitsPerSample
  
  // data chunk
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);
  
  return Buffer.concat([wavHeader, pcmBuffer]);
}

module.exports = {
  convertBlobToWav,
  createWavFile
};
