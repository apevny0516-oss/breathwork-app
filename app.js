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

// Audio Elements (for background music - HTML5 audio works fine for long tracks)
const backgroundMusic = document.getElementById('backgroundMusic');

// Web Audio API for cue sounds (instant playback)
let audioContext = null;
let inhaleBuffer = null;
let exhaleBuffer = null;
let cueVolume = 0.7;

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
        
        // Load and decode audio files
        const [inhaleResponse, exhaleResponse] = await Promise.all([
            fetch('Audio/inhale.mp3'),
            fetch('Audio/exhale.mp3')
        ]);
        
        const [inhaleData, exhaleData] = await Promise.all([
            inhaleResponse.arrayBuffer(),
            exhaleResponse.arrayBuffer()
        ]);
        
        [inhaleBuffer, exhaleBuffer] = await Promise.all([
            audioContext.decodeAudioData(inhaleData),
            audioContext.decodeAudioData(exhaleData)
        ]);
        
        audioLoaded = true;
        startBtn.textContent = 'Start Session';
        startBtn.disabled = false;
        console.log('Audio loaded successfully');
    } catch (error) {
        console.error('Error loading audio:', error);
        // Fallback - still allow session to start
        audioLoaded = false;
        startBtn.textContent = 'Start Session';
        startBtn.disabled = false;
    }
}

// Play a sound buffer using Web Audio API (instant, no cut-off)
function playCueSound(buffer) {
    if (!audioContext || !buffer) return;
    
    // Resume audio context if suspended (browser autoplay policy)
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

// Initialize
function init() {
    // Disable start button until audio is loaded
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
    
    // Load audio buffers
    initAudio();
}

// Volume Controls
function updateMusicVolume() {
    backgroundMusic.volume = musicVolumeSlider.value / 100;
}

function updateCueVolume() {
    cueVolume = cueVolumeSlider.value / 100;
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

    // Resume audio context (required for user interaction)
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    // Get session duration in milliseconds
    sessionDuration = parseInt(sessionDurationSelect.value) * 60 * 1000;
    sessionStartTime = performance.now();
    
    // Reset phase tracking
    currentPhase = 'ready';

    // Set up breathing circle transition
    const pattern = breathingPatterns[breathingPatternSelect.value];
    const transitionDuration = Math.max(pattern.inhale, pattern.exhale);
    breathingCircle.style.transition = `transform ${transitionDuration}s ease-in-out, box-shadow ${transitionDuration}s ease-in-out`;
    breathingCircle.classList.add('active');

    // Start background music
    backgroundMusic.currentTime = 0;
    backgroundMusic.play().catch(e => console.log('Music autoplay blocked:', e));

    // Start the main animation loop
    tick();
}

function stopSession() {
    isSessionActive = false;
    document.querySelector('.app-container').classList.remove('session-active');

    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Cancel animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Stop audio
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;

    // Reset visuals
    breathingCircle.classList.remove('inhale', 'exhale', 'active');
    breathingCircle.style.transition = '';
    breathInstruction.textContent = 'Ready';
    breathInstruction.classList.remove('inhale', 'exhale');
    breathTimer.textContent = '0.0s';
    
    // Reset state
    currentPhase = 'ready';

    updateTimeDisplay();
}

// Main animation loop - single source of truth for timing
function tick() {
    if (!isSessionActive) return;

    const now = performance.now();
    const elapsed = now - sessionStartTime;
    const remaining = sessionDuration - elapsed;

    // Check if session is complete
    if (remaining <= 0) {
        stopSession();
        return;
    }

    // Update session timer display
    timeRemaining.textContent = formatTime(Math.ceil(remaining / 1000));

    // Calculate current breath phase based on elapsed time
    updateBreathingPhase(elapsed);

    // Continue the loop
    animationFrameId = requestAnimationFrame(tick);
}

// Calculate which phase we should be in based on elapsed time
function updateBreathingPhase(elapsed) {
    const pattern = breathingPatterns[breathingPatternSelect.value];
    
    // Calculate total cycle duration
    const cycleDuration = (pattern.inhale + pattern.holdAfterInhale + 
                          pattern.exhale + pattern.holdAfterExhale) * 1000;
    
    // Find position within current cycle
    const cyclePosition = elapsed % cycleDuration;
    
    // Determine current phase and time within phase
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
    
    // Update phase remaining time display
    const phaseRemaining = (phaseDuration - phaseElapsed) / 1000;
    breathTimer.textContent = phaseRemaining.toFixed(1) + 's';
    
    // Handle phase transitions
    if (phase !== currentPhase) {
        onPhaseChange(phase);
    }
    
    currentPhase = phase;
}

// Handle phase transitions - play audio and update visuals
function onPhaseChange(newPhase) {
    // Remove all phase classes
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
