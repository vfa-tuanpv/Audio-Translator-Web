let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let micLevelAnimationId;
let isPlayingAudio = false;

const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const resultText = document.getElementById('resultText');
const resultTime = document.getElementById('resultTime');
const translationSection = document.getElementById('translationSection');
const translatedText = document.getElementById('translatedText');
const playTranslationBtn = document.getElementById('playTranslationBtn');
const micLevelContainer = document.getElementById('micLevelContainer');
const micLevelBar = document.getElementById('micLevelBar');
const micLevelValue = document.getElementById('micLevelValue');
const micLevelText = document.getElementById('micLevelText');
let startTime = 0;

// Get language selects
const modelSelect = document.getElementById('modelSelect');
const micSelect = document.getElementById('micSelect');
const languageSelect = document.getElementById('languageSelect');
const targetLanguage = document.getElementById('targetLanguage');
const voiceSelect = document.getElementById('voiceSelect');

// Initialize Translation Service
const translationService = new TranslationService();
translationService.onStatusChanged = updateStatus;

recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
playTranslationBtn.addEventListener('click', playTranslatedText);
targetLanguage.addEventListener('change', updateVoiceList);

// Initialize microphone stream on page load
window.addEventListener('load', async () => {
  await updateMicrophoneList();
  updateVoiceList();
  await initializeMicrophoneStream();
});

// Wait for voices to be loaded before initializing voice list
if (window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.onvoiceschanged = updateVoiceList;
}

// Check if running in Electron
const isElectron = window.electronAPI && window.electronAPI.transcribeWithWhisperCpp;

async function startRecording() {
    try {
        audioChunks = [];
        startTime = Date.now();
        
        // Get selected microphone device ID
        const selectedDeviceId = micSelect.value;
        const constraints = {
            audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            
            // Skip playback of initial recording
            updateStatus('⏳ Processing...', 'active');
            
            if (isElectron) {
                // Use Whisper.cpp via Electron - send raw blob buffer
                const arrayBuffer = await audioBlob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                const language = languageSelect ? languageSelect.value : 'en';
                const model = modelSelect ? modelSelect.value : 'medium';
                
                try {
                    const result = await window.electronAPI.transcribeWithWhisperCpp(
                        Array.from(uint8Array),
                        language,
                        model
                    );
                    
                    if (result.success) {
                        const duration = Math.round((Date.now() - startTime) / 1000);
                        displayResult(result.text, duration, result.language);
                    } else {
                        updateStatus('❌ Error: ' + result.error, 'error');
                    }
                } catch (error) {
                    updateStatus('❌ IPC Error: ' + error.message, 'error');
                }
            } else {
                // Fallback to Web Speech API (browser)
                performSpeechRecognition(audioBlob);
            }
        };

        mediaRecorder.start();
        recordBtn.disabled = true;
        recordBtn.classList.add('recording');
        stopBtn.disabled = false;
        
        updateStatus('🎤 Recording...', 'active');
        resultDiv.style.display = 'none';
    } catch (error) {
        updateStatus('❌ Microphone error: ' + error.message, 'error');
        recordBtn.disabled = false;
    }
}

function stopRecording() {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    
    recordBtn.disabled = false;
    recordBtn.classList.remove('recording');
    stopBtn.disabled = true;
    
    updateStatus('⏳ Processing...', 'active');
}

function playbackAudio(audioBlob) {
    // Create audio element and play
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio();
    audio.src = audioUrl;
    audio.volume = 1.0;
    
    audio.onplay = () => {
        console.log('▶️ Playing back recorded audio...');
        updateStatus('▶️ Playing back your recording...', 'active');
    };
    
    audio.onended = () => {
        console.log('✓ Playback complete');
        URL.revokeObjectURL(audioUrl);
        updateStatus('⏳ Processing...', 'active');
    };
    
    audio.onerror = (err) => {
        console.error('❌ Playback error:', err);
        URL.revokeObjectURL(audioUrl);
        updateStatus('⚠️ Playback error (continuing...)', 'error');
    };
    
    // Play the audio
    audio.play().catch(err => {
        console.error('❌ Play error:', err);
        URL.revokeObjectURL(audioUrl);
        updateStatus('⚠️ Cannot play audio', 'error');
    });
}

function performSpeechRecognition(audioBlob) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        updateStatus('❌ Speech Recognition not supported', 'error');
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.language = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        updateStatus('👂 Listening...', 'active');
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        displayResult(transcript, duration);
    };

    recognition.onerror = (event) => {
        updateStatus('❌ Error: ' + event.error, 'error');
    };

    recognition.onend = () => {
        // Recognition ended
    };

    // Start recognition with audio blob
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio();
    audio.src = audioUrl;
    
    // Play audio and run recognition
    audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        recognition.start();
    };
    
    audio.play();
}

function displayResult(text, duration, language = 'en') {
    resultText.textContent = text || '(No speech detected)';
    const langDisplay = language ? ` • Language: ${language}` : '';
    resultTime.textContent = `⏱️ Recognized in ${duration}s${langDisplay}`;
    resultDiv.style.display = 'block';
    translationSection.style.display = 'none';
    updateStatus('✓ Done!', 'success');
    
    // Auto-translate after recognition
    if (text && text.trim() !== '') {
        translateAndDisplay(text, language);
    }
}

async function translateAndDisplay(originalText, sourceLang) {
    try {
        const targetLang = targetLanguage.value;
        if (targetLang === sourceLang) {
            translationSection.style.display = 'none';
            return;
        }
        
        updateStatus('🔄 Translating...', 'active');
        const translated = await translationService.translateText(originalText, sourceLang, targetLang);
        
        if (translated && translated !== originalText) {
            translatedText.textContent = translated;
            translationSection.style.display = 'block';
            updateStatus('✓ Translation complete!', 'success');
            
            // Auto-play translation if it's Chinese or any other language
            if (targetLang !== 'en') {
                setTimeout(() => playTranslation(translated, targetLang), 500);
            }
        }
    } catch (error) {
        console.error('Translation error:', error);
        updateStatus('❌ Translation failed', 'error');
    }
}

function playTranslation(text, language) {
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Map language codes to voice language strings
        const voiceMap = {
            'zh': 'zh-CN',
            'en': 'en-US',
            'vi': 'vi-VN',
            'ja': 'ja-JP',
            'ko': 'ko-KR'
        };
        
        const voiceLanguage = voiceMap[language] || language;
        
        // Get available voices and select based on user choice or first match
        const voices = window.speechSynthesis.getVoices();
        let selectedVoice = null;
        
        // If user selected a specific voice, use it
        if (voiceSelect.value) {
            const selectedVoiceIndex = parseInt(voiceSelect.value);
            if (selectedVoiceIndex >= 0 && selectedVoiceIndex < voices.length) {
                selectedVoice = voices[selectedVoiceIndex];
            }
        } else {
            // Otherwise find voice matching the language
            selectedVoice = voices.find(v => v.lang.startsWith(language)) || voices[0];
        }
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log(`Using voice: ${selectedVoice.name} (${selectedVoice.lang})`);
        }
        
        utterance.language = voiceLanguage;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onstart = () => {
            // Mute microphone level when playing
            isPlayingAudio = true;
            if (micLevelAnimationId) {
                cancelAnimationFrame(micLevelAnimationId);
            }
            micLevelBar.style.opacity = '0.5';
            micLevelValue.textContent = 'MUTED';
            micLevelBar.style.width = '0%';
            updateStatus(`🔊 Playing translation (${voiceLanguage})...`, 'active');
        };
        
        utterance.onend = () => {
            // Resume microphone level monitoring
            isPlayingAudio = false;
            micLevelBar.style.opacity = '1';
            startMicLevelMonitoring();
            updateStatus('✓ Playback complete!', 'success');
        };
        
        utterance.onerror = (event) => {
            // Resume microphone level monitoring on error
            isPlayingAudio = false;
            micLevelBar.style.opacity = '1';
            startMicLevelMonitoring();
            console.error('Speech synthesis error:', event);
            updateStatus('❌ Playback error: ' + event.error, 'error');
        };
        
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.error('Error playing translation:', error);
        updateStatus('❌ Cannot play audio: ' + error.message, 'error');
    }
}

function playTranslatedText() {
    const text = translatedText.textContent;
    const targetLang = targetLanguage.value;
    if (text) {
        playTranslation(text, targetLang);
    }
}

function updateStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type + ' active';
}

async function updateMicrophoneList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        // Clear existing options except default
        micSelect.innerHTML = '<option value="">Default Microphone</option>';
        
        if (audioInputs.length > 0) {
            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${audioInputs.indexOf(device) + 1}`;
                micSelect.appendChild(option);
            });
            console.log(`Found ${audioInputs.length} microphone(s)`);
        }
    } catch (error) {
        console.error('Error enumerating devices:', error);
        updateStatus('⚠️ Cannot list microphones', 'error');
    }
}

function updateVoiceList() {
    const targetLang = targetLanguage.value;
    const voices = window.speechSynthesis.getVoices();
    
    // If no voices available yet, wait and retry
    if (voices.length === 0) {
        console.warn('Voices not loaded yet, retrying...');
        setTimeout(updateVoiceList, 500);
        return;
    }
    
    // Filter voices by target language
    const voiceMap = {
        'zh': 'zh',
        'en': 'en',
        'vi': 'vi',
        'ja': 'ja',
        'ko': 'ko'
    };
    
    const langPrefix = voiceMap[targetLang] || targetLang;
    const matchingVoices = voices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));
    
    // Clear and rebuild voice select
    voiceSelect.innerHTML = '<option value="">Default</option>';
    
    if (matchingVoices.length > 0) {
        matchingVoices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = voices.indexOf(voice);
            option.text = `${voice.name} ${voice.lang}`;
            voiceSelect.appendChild(option);
        });
        console.log(`Found ${matchingVoices.length} voice(s) for ${targetLang}`);
    } else {
        console.warn(`No specific voices found for ${targetLang}, will use default`);
    }
}

function startMicLevelMonitoring() {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateLevel = () => {
        micLevelAnimationId = requestAnimationFrame(updateLevel);
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate RMS (Root Mean Square) for more accurate level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(100, Math.round((rms / 128) * 100));
        
        // Update bar width
        micLevelBar.style.width = level + '%';
        micLevelValue.textContent = level + '%';
        
        // Update text inside bar
        if (level > 10) {
            micLevelText.textContent = level + '%';
        } else {
            micLevelText.textContent = '';
        }
        
        // Change color based on level
        if (level < 30) {
            micLevelBar.style.background = 'linear-gradient(90deg, #2196F3, #1976d2)'; // Blue
        } else if (level < 60) {
            micLevelBar.style.background = 'linear-gradient(90deg, #4CAF50, #45a049)'; // Green
        } else if (level < 80) {
            micLevelBar.style.background = 'linear-gradient(90deg, #FF9800, #f57c00)'; // Orange
        } else {
            micLevelBar.style.background = 'linear-gradient(90deg, #f44336, #d32f2f)'; // Red
        }
    };
    
    updateLevel();
}

async function initializeMicrophoneStream() {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup Web Audio API for level detection
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const source = audioContext.createMediaStreamSource(stream);
        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
        }
        source.connect(analyser);
        
        // Show microphone level container
        micLevelContainer.style.display = 'block';
        
        // Start continuous monitoring
        startMicLevelMonitoring();
        
        console.log('✓ Microphone initialized and monitoring');
    } catch (error) {
        console.warn('⚠️ Microphone permission denied or unavailable:', error.message);
        micLevelContainer.style.display = 'none';
    }
}
