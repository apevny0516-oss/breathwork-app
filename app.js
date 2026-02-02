// DOM Elements
const breathingCircle = document.getElementById('breathingCircle');
const breathInstruction = document.getElementById('breathInstruction');
const breathTimer = document.getElementById('breathTimer');
const timeRemaining = document.getElementById('timeRemaining');
const breathingPatternSelect = document.getElementById('breathingPattern');
const sessionDurationSelect = document.getElementById('sessionDuration');
const musicVolumeSlider = document.getElementById('musicVolume');
const cueVolumeSlider = document.getElementById('cueVolume');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

// Web Audio API
let audioContext = null;
let inhaleBuffer = null;
let exhaleBuffer = null;
let musicBuffer = null;
let cueVolume = 0.7;
let musicVolume = 0.3;

// Music crossfade state
const CROSSFADE_DURATION = 4; // seconds
let currentMusicSource = null;
let currentMusicGain = null;
let nextMusicSource = null;
let nextMusicGain = null;
let musicStartTime = 0;
let isCrossfading = false;

// Breathing Patterns Configuration
const breathingPatterns = {
    buteyko: {
        name: 'Buteyko',
        inhale: 5.5,
        exhale: 5.5,
        holdAfterInhale: 0,
        holdAfterExhale: 0
    }
};

// App State
let isSessionActive = false;
let animationFrameId = null;
let sessionStartTime = 0;
let sessionDuration = 0;
let currentPhase = 'ready';
let audioLoaded = false;

// Initialize Web Audio API and load audio buffers
async function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Load and decode all audio files
        const [inhaleResponse, exhaleResponse, musicResponse] = await Promise.all([
            fetch('Audio/inhale.mp3'),
            fetch('Audio/exhale.mp3'),
            fetch('Audio/music1.m4a')
        ]);
        
        const [inhaleData, exhaleData, musicData] = await Promise.all([
            inhaleResponse.arrayBuffer(),
            exhaleResponse.arrayBuffer(),
            musicResponse.arrayBuffer()
        ]);
        
        [inhaleBuffer, exhaleBuffer, musicBuffer] = await Promise.all([
            audioContext.decodeAudioData(inhaleData),
            audioContext.decodeAudioData(exhaleData),
            audioContext.decodeAudioData(musicData)
        ]);
        
        audioLoaded = true;
        startBtn.textContent = 'Start Session';
        startBtn.disabled = false;
        console.log('Audio loaded successfully');
        console.log('Music duration:', musicBuffer.duration, 'seconds');
    } catch (error) {
        console.error('Error loading audio:', error);
        audioLoaded = false;
        startBtn.textContent = 'Start Session';
        startBtn.disabled = false;
    }
}

// Play a sound buffer using Web Audio API (instant, no cut-off)
function playCueSound(buffer) {
    if (!audioContext || !buffer) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = buffer;
    gainNode.gain.value = cueVolume;
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start(0);
}

// Start background music with crossfade looping
function startMusic() {
    if (!audioContext || !musicBuffer) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // Create the first music source
    currentMusicSource = audioContext.createBufferSource();
    currentMusicGain = audioContext.createGain();
    
    currentMusicSource.buffer = musicBuffer;
    currentMusicGain.gain.value = musicVolume;
    
    currentMusicSource.connect(currentMusicGain);
    currentMusicGain.connect(audioContext.destination);
    
    musicStartTime = audioContext.currentTime;
    isCrossfading = false;
    
    currentMusicSource.start(0);
}

// Stop all music
function stopMusic() {
    try {
        if (currentMusicSource) {
            currentMusicSource.stop();
            currentMusicSource.disconnect();
            currentMusicSource = null;
        }
        if (currentMusicGain) {
            currentMusicGain.disconnect();
            currentMusicGain = null;
        }
        if (nextMusicSource) {
            nextMusicSource.stop();
            nextMusicSource.disconnect();
            nextMusicSource = null;
        }
        if (nextMusicGain) {
            nextMusicGain.disconnect();
            nextMusicGain = null;
        }
    } catch (e) {
        // Ignore errors when stopping already stopped sources
    }
    isCrossfading = false;
}

// Check and handle music crossfade
function updateMusicCrossfade() {
    if (!audioContext || !musicBuffer || !currentMusicSource) return;
    
    const elapsed = audioContext.currentTime - musicStartTime;
    const trackDuration = musicBuffer.duration;
    const crossfadeStart = trackDuration - CROSSFADE_DURATION;
    
    // Start crossfade when we're CROSSFADE_DURATION seconds from the end
    if (elapsed >= crossfadeStart && !isCrossfading) {
        isCrossfading = true;
        
        // Create the next music source (starts from beginning)
        nextMusicSource = audioContext.createBufferSource();
        nextMusicGain = audioContext.createGain();
        
        nextMusicSource.buffer = musicBuffer;
        nextMusicGain.gain.value = 0; // Start silent
        
        nextMusicSource.connect(nextMusicGain);
        nextMusicGain.connect(audioContext.destination);
        
        // Start the next track
        nextMusicSource.start(0);
        
        // Crossfade: fade out current, fade in next
        const now = audioContext.currentTime;
        currentMusicGain.gain.setValueAtTime(musicVolume, now);
        currentMusicGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION);
        
        nextMusicGain.gain.setValueAtTime(0, now);
        nextMusicGain.gain.linearRampToValueAtTime(musicVolume, now + CROSSFADE_DURATION);
        
        // Schedule cleanup and swap after crossfade completes
        setTimeout(() => {
            if (!isSessionActive) return;
            
            // Clean up old source
            try {
                if (currentMusicSource) {
                    currentMusicSource.stop();
                    currentMusicSource.disconnect();
                }
                if (currentMusicGain) {
                    currentMusicGain.disconnect();
                }
            } catch (e) {
                // Ignore - source may have already stopped
            }
            
            // Swap: next becomes current
            currentMusicSource = nextMusicSource;
            currentMusicGain = nextMusicGain;
            nextMusicSource = null;
            nextMusicGain = null;
            
            // Reset timing for the new loop
            musicStartTime = audioContext.currentTime;
            isCrossfading = false;
            
        }, CROSSFADE_DURATION * 1000);
    }
}

// Update music volume (called when slider changes)
function updateMusicVolume() {
    musicVolume = musicVolumeSlider.value / 100;
    
    // Update currently playing music if active
    if (currentMusicGain && !isCrossfading) {
        currentMusicGain.gain.value = musicVolume;
    }
}

function updateCueVolume() {
    cueVolume = cueVolumeSlider.value / 100;
}

// Initialize
function init() {
    startBtn.textContent = 'Loading...';
    startBtn.disabled = true;
    
    updateMusicVolume();
    updateCueVolume();

    startBtn.addEventListener('click', startSession);
    stopBtn.addEventListener('click', stopSession);
    musicVolumeSlider.addEventListener('input', updateMusicVolume);
    cueVolumeSlider.addEventListener('input', updateCueVolume);
    sessionDurationSelect.addEventListener('change', updateTimeDisplay);

    updateTimeDisplay();
    
    initAudio();
}

// Time Display
function updateTimeDisplay() {
    const minutes = parseInt(sessionDurationSelect.value);
    timeRemaining.textContent = formatTime(minutes * 60);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Session Control
function startSession() {
    if (isSessionActive) return;

    isSessionActive = true;
    document.querySelector('.app-container').classList.add('session-active');

    startBtn.disabled = true;
    stopBtn.disabled = false;

    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    sessionDuration = parseInt(sessionDurationSelect.value) * 60 * 1000;
    sessionStartTime = performance.now();
    
    currentPhase = 'ready';

    const pattern = breathingPatterns[breathingPatternSelect.value];
    const transitionDuration = Math.max(pattern.inhale, pattern.exhale);
    breathingCircle.style.transition = `transform ${transitionDuration}s ease-in-out, box-shadow ${transitionDuration}s ease-in-out`;
    breathingCircle.classList.add('active');

    // Start background music with crossfade looping
    startMusic();

    tick();
}

function stopSession() {
    isSessionActive = false;
    document.querySelector('.app-container').classList.remove('session-active');

    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Stop music
    stopMusic();

    breathingCircle.classList.remove('inhale', 'exhale', 'active');
    breathingCircle.style.transition = '';
    breathInstruction.textContent = 'Ready';
    breathInstruction.classList.remove('inhale', 'exhale');
    breathTimer.textContent = '0.0s';
    
    currentPhase = 'ready';

    updateTimeDisplay();
}

// Main animation loop
function tick() {
    if (!isSessionActive) return;

    const now = performance.now();
    const elapsed = now - sessionStartTime;
    const remaining = sessionDuration - elapsed;

    if (remaining <= 0) {
        stopSession();
        return;
    }

    timeRemaining.textContent = formatTime(Math.ceil(remaining / 1000));

    updateBreathingPhase(elapsed);
    
    // Check for music crossfade
    updateMusicCrossfade();

    animationFrameId = requestAnimationFrame(tick);
}

// Calculate which phase we should be in based on elapsed time
function updateBreathingPhase(elapsed) {
    const pattern = breathingPatterns[breathingPatternSelect.value];
    
    const cycleDuration = (pattern.inhale + pattern.holdAfterInhale + 
                          pattern.exhale + pattern.holdAfterExhale) * 1000;
    
    const cyclePosition = elapsed % cycleDuration;
    
    let phase;
    let phaseElapsed;
    let phaseDuration;
    
    const inhaleEnd = pattern.inhale * 1000;
    const holdInEnd = inhaleEnd + pattern.holdAfterInhale * 1000;
    const exhaleEnd = holdInEnd + pattern.exhale * 1000;
    
    if (cyclePosition < inhaleEnd) {
        phase = 'inhale';
        phaseElapsed = cyclePosition;
        phaseDuration = pattern.inhale * 1000;
    } else if (cyclePosition < holdInEnd) {
        phase = 'hold-in';
        phaseElapsed = cyclePosition - inhaleEnd;
        phaseDuration = pattern.holdAfterInhale * 1000;
    } else if (cyclePosition < exhaleEnd) {
        phase = 'exhale';
        phaseElapsed = cyclePosition - holdInEnd;
        phaseDuration = pattern.exhale * 1000;
    } else {
        phase = 'hold-out';
        phaseElapsed = cyclePosition - exhaleEnd;
        phaseDuration = pattern.holdAfterExhale * 1000;
    }
    
    const phaseRemaining = (phaseDuration - phaseElapsed) / 1000;
    breathTimer.textContent = phaseRemaining.toFixed(1) + 's';
    
    if (phase !== currentPhase) {
        onPhaseChange(phase);
    }
    
    currentPhase = phase;
}

// Handle phase transitions
function onPhaseChange(newPhase) {
    breathingCircle.classList.remove('inhale', 'exhale');
    breathInstruction.classList.remove('inhale', 'exhale');
    
    switch (newPhase) {
        case 'inhale':
            breathingCircle.classList.add('inhale');
            breathInstruction.textContent = 'Inhale';
            breathInstruction.classList.add('inhale');
            playCueSound(inhaleBuffer);
            break;
            
        case 'exhale':
            breathingCircle.classList.add('exhale');
            breathInstruction.textContent = 'Exhale';
            breathInstruction.classList.add('exhale');
            playCueSound(exhaleBuffer);
            break;
            
        case 'hold-in':
        case 'hold-out':
            breathInstruction.textContent = 'Hold';
            break;
    }
}

// Initialize the app
init();
