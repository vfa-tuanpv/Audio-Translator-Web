/**
 * Electron IPC handler for whisper.cpp transcription
 * 
 * Add to electron-main.js:
 * 
 * const { transcribeWithWhisperCpp } = require('./whisper-cpp-wrapper');
 * 
 * ipcMain.handle('whisper-cpp-transcribe', async (event, audioBuffer, language) => {
 *   try {
 *     const tempAudioFile = path.join(__dirname, 'tmp', `temp_${Date.now()}.wav`);
 *     fs.writeFileSync(tempAudioFile, Buffer.from(audioBuffer));
 *     
 *     const result = await transcribeWithWhisperCpp(tempAudioFile, language);
 *     fs.unlinkSync(tempAudioFile);
 *     
 *     return result;
 *   } catch (error) {
 *     return { success: false, error: error.message };
 *   }
 * });
 */

// Example usage in React/frontend:
/*
const { electronAPI } = window;

async function transcribeAudio(audioBuffer, language = 'en') {
  try {
    const result = await electronAPI.ipcRenderer.invoke(
      'whisper-cpp-transcribe',
      Array.from(audioBuffer),
      language
    );
    
    if (result.success) {
      console.log('✓ Transcribed:', result.text);
      return result.text;
    } else {
      console.error('❌ Error:', result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('IPC error:', error);
    throw error;
  }
}

// Call from recording stop:
mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = new Uint8Array(arrayBuffer);
  
  const text = await transcribeAudio(audioBuffer, 'vi');
  displayResult(text);
};
*/
