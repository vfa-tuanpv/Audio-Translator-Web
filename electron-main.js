const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { transcribeWithWhisperCpp } = require("./whisper-cpp-wrapper");
const { convertBlobToWav, createWavFile } = require("./audio-converter");

let mainWindow;
let hotkeyDebounce = {}; // Debounce tracker for hotkeys

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: false, // Disable sandbox to allow audio capture
    },
  });

  // Load demo file HTML
  mainWindow.loadFile("demo/index.html");

  // Set CSP headers for secure connections
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
            "connect-src 'self' https://*.google.com https://www.google.com https://api.mymemory.translated.net https://dns.google; " +
            "script-src 'self' 'unsafe-inline'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "media-src 'self' blob:; " +
            "img-src 'self' data:;",
        ],
      },
    });
  });

  // Debug: Uncomment to open DevTools
  // mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", () => {
  createWindow();

  // Setup global hotkeys
  // setupGlobalHotkeys();
});

// Grant audio/microphone permissions automatically
app.whenReady().then(() => {
  const { session } = require("electron");

  // Set permission request handler for all sessions
  session.defaultSession?.setPermissionRequestHandler((webContents, permission, callback) => {
    // Auto-approve microphone/audio permissions
    if (permission === "microphone" || permission === "audio" || permission === "media") {
      callback(true);
    } else {
      callback(false);
    }
  });
});

/**
 * Debounce helper - prevent hotkey triggers too quickly
 */
function debounceHotkey(key, callback, delayMs = 300) {
  const now = Date.now();
  if (!hotkeyDebounce[key] || now - hotkeyDebounce[key] >= delayMs) {
    hotkeyDebounce[key] = now;
    callback();
  }
}

/**
 * Setup global hotkeys using Electron globalShortcut (Mac native)
 */
function setupGlobalHotkeys() {
  try {
    // Register G key for toggle start/stop recording
    globalShortcut.register("g", () => {
      debounceHotkey(
        "g-toggle",
        () => {
          mainWindow?.webContents.send("hotkey-pressed", { key: "G", action: "toggle" });
        },
        300
      );
    });
  } catch (error) {
    console.error("Failed to setup global shortcuts:", error);
  }
}

// IPC: Nhận từ renderer process
ipcMain.on("app-event", (event, arg) => {
  // Silently handle app events
});

// IPC: Whisper.cpp transcription handler
ipcMain.handle("whisper-cpp-transcribe", async (event, audioBuffer, language = "en", model = "medium") => {
  try {
    const tmpDir = path.join(__dirname, "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const tempAudioFile = path.join(tmpDir, `audio_${Date.now()}.wav`);
    
    // Convert blob to WAV using ffmpeg (most reliable)
    console.log("🎬 Converting audio blob to WAV using ffmpeg...");
    let wavData;
    try {
      wavData = await convertBlobToWav(audioBuffer);
    } catch (ffmpegError) {
      console.warn("⚠️ ffmpeg failed, falling back to manual WAV creation:", ffmpegError.message);
      // Fallback: assume it's already WAV-like and just write it
      wavData = Buffer.from(audioBuffer);
    }
    
    // Write audio file
    console.log("💾 Writing audio to:", tempAudioFile);
    fs.writeFileSync(tempAudioFile, wavData);
    
    const stats = fs.statSync(tempAudioFile);
    console.log(`📊 Audio file size: ${stats.size} bytes`);
    
    // Transcribe with whisper.cpp
    console.log(`🎤 Transcribing (${language})...`);
    const result = await transcribeWithWhisperCpp(tempAudioFile, language, model);
    
    // Clean up temp file after transcription
    try {
      fs.unlinkSync(tempAudioFile);
      console.log(`🗑️ Temp file deleted: ${tempAudioFile}`);
    } catch (deleteError) {
      console.warn(`⚠️ Failed to delete temp file: ${deleteError.message}`);
    }
    
    return result;
  } catch (error) {
    console.error("❌ Transcription error:", error.message);
    return { success: false, error: error.message };
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
  globalShortcut.unregisterAll();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Unregister shortcuts before quit
app.on("before-quit", () => {
  globalShortcut.unregisterAll();
});
