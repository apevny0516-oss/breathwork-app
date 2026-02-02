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

// Admin Panel Elements
const adminPanel = document.getElementById('adminPanel');
const adminToggle = document.getElementById('adminToggle');
const crossfadeSlider = document.getElementById('crossfadeSlider');
const crossfadeValue = document.getElementById('crossfadeValue');
const musicGainSlider = document.getElementById('musicGainSlider');
const musicGainValue = document.getElementById('musicGainValue');
const inhaleGainSlider = document.getElementById('inhaleGainSlider');
const inhaleGainValue = document.getElementById('inhaleGainValue');
const exhaleGainSlider = document.getElementById('exhaleGainSlider');
const exhaleGainValue = document.getElementById('exhaleGainValue');
const musicPositionInfo = document.getElementById('musicPositionInfo');
const musicDurationInfo = document.getElementById('musicDurationInfo');
const activeSourceInfo = document.getElementById('activeSourceInfo');

// HTML Audio Elements (for preloading)
const inhaleAudio = document.getElementById('inhaleAudio');
const exhaleAudio = document.getElementById('exhaleAudio');
const musicAudio = document.getElementById('musicAudio');

// Web Audio API
let audioContext = null;
let cueVolume = 0.7;
let musicVolume = 0.3;

// Gain multipliers (from admin panel)
let musicGainMultiplier = 1.0;
let inhaleGainMultiplier = 1.0;
let exhaleGainMultiplier = 1.0;

// Music crossfade state
let CROSSFADE_DURATION = 4; // seconds (adjustable via admin)
let musicSource1 = null;
let musicGain1 = null;
let musicSource2 = null;
let musicGain2 = null;
let activeSource = 1; // Which source is currently the "main" one
let musicStartTime = 0;
let musicDuration = 0;
let crossfadeScheduled = false;

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

// Wait for audio to be ready
function waitForAudioReady(audioElement) {
    return new Promise((resolve) => {
        if (audioElement.readyState >= 3) {
            resolve();
        } else {
            audioElement.addEventListener('canplaythrough', () => resolve(), { once: true });
        }
    });
}

// Initialize
async function init() {
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
    
    // Wait for audio files to load
    try {
        await Promise.all([
            waitForAudioReady(inhaleAudio),
            waitForAudioReady(exhaleAudio),
            waitForAudioReady(musicAudio)
        ]);
        console.log('All audio loaded');
        console.log('Music duration:', musicAudio.duration, 'seconds');
        musicDuration = musicAudio.duration;
    } catch (e) {
        console.error('Error loading audio:', e);
    }
    
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    startBtn.textContent = 'Start Session';
    startBtn.disabled = false;
}

// Play cue sound using HTML audio (clone for overlapping)
function playCueSound(audioElement, gainMultiplier = 1.0) {
    const clone = audioElement.cloneNode();
    clone.volume = Math.min(1, cueVolume * gainMultiplier);
    clone.play().catch(e => console.log('Cue play error:', e));
}

// Create a media element source for music
function createMusicSource(audioElement) {
    // We need to clone the audio element for the second source
    const audio = audioElement.cloneNode();
    audio.currentTime = 0;
    
    const source = audioContext.createMediaElementSource(audio);
    const gain = audioContext.createGain();
    
    source.connect(gain);
    gain.connect(audioContext.destination);
    
    return { audio, source, gain };
}

// Start background music with crossfade capability
function startMusic() {
    if (!audioContext) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // Create first music instance
    const music1 = createMusicSource(musicAudio);
    musicSource1 = music1.source;
    musicGain1 = music1.gain;
    musicGain1.gain.value = musicVolume * musicGainMultiplier;
    
    music1.audio.play().catch(e => console.log('Music play error:', e));
    
    // Store reference to the audio element
    musicSource1._audioElement = music1.audio;
    
    musicStartTime = audioContext.currentTime;
    activeSource = 1;
    crossfadeScheduled = false;
    
    console.log('Music started, duration:', musicDuration);
}

// Stop all music
function stopMusic() {
    if (musicSource1 && musicSource1._audioElement) {
        musicSource1._audioElement.pause();
        musicSource1._audioElement = null;
    }
    if (musicSource2 && musicSource2._audioElement) {
        musicSource2._audioElement.pause();
        musicSource2._audioElement = null;
    }
    musicSource1 = null;
    musicSource2 = null;
    musicGain1 = null;
    musicGain2 = null;
    crossfadeScheduled = false;
}

// Check and handle music crossfade
function updateMusicCrossfade() {
    if (!audioContext || !musicSource1) return;
    
    const currentAudio = activeSource === 1 
        ? musicSource1._audioElement 
        : (musicSource2 ? musicSource2._audioElement : null);
    
    if (!currentAudio) return;
    
    const currentTime = currentAudio.currentTime;
    const timeUntilEnd = musicDuration - currentTime;
    
    // Start crossfade when we're CROSSFADE_DURATION seconds from the end
    if (timeUntilEnd <= CROSSFADE_DURATION && timeUntilEnd > 0 && !crossfadeScheduled) {
        crossfadeScheduled = true;
        console.log('Starting crossfade, time until end:', timeUntilEnd);
        
        // Create the next music instance
        const music2 = createMusicSource(musicAudio);
        
        if (activeSource === 1) {
            musicSource2 = music2.source;
            musicGain2 = music2.gain;
            musicGain2.gain.value = 0; // Start silent
            musicSource2._audioElement = music2.audio;
        } else {
            musicSource1 = music2.source;
            musicGain1 = music2.gain;
            musicGain1.gain.value = 0; // Start silent
            musicSource1._audioElement = music2.audio;
        }
        
        // Start the new track
        music2.audio.play().catch(e => console.log('Crossfade play error:', e));
        
        // Get current gain nodes
        const fadeOutGain = activeSource === 1 ? musicGain1 : musicGain2;
        const fadeInGain = activeSource === 1 ? musicGain2 : musicGain1;
        
        // Perform crossfade
        const now = audioContext.currentTime;
        const fadeDuration = timeUntilEnd; // Fade for remaining time
        const effectiveVolume = musicVolume * musicGainMultiplier;
        
        fadeOutGain.gain.setValueAtTime(effectiveVolume, now);
        fadeOutGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
        
        fadeInGain.gain.setValueAtTime(0, now);
        fadeInGain.gain.linearRampToValueAtTime(effectiveVolume, now + fadeDuration);
        
        // Schedule cleanup after crossfade
        setTimeout(() => {
            if (!isSessionActive) return;
            
            // Stop and clean up the old source
            const oldAudio = activeSource === 1 
                ? musicSource1._audioElement 
                : musicSource2._audioElement;
            
            if (oldAudio) {
                oldAudio.pause();
            }
            
            // Swap active source
            activeSource = activeSource === 1 ? 2 : 1;
            crossfadeScheduled = false;
            
            console.log('Crossfade complete, active source:', activeSource);
            
        }, fadeDuration * 1000 + 100);
    }
}

// Update music volume
function updateMusicVolume() {
    musicVolume = musicVolumeSlider.value / 100;
    
    const effectiveVolume = musicVolume * musicGainMultiplier;
    
    if (musicGain1 && activeSource === 1 && !crossfadeScheduled) {
        musicGain1.gain.value = effectiveVolume;
    }
    if (musicGain2 && activeSource === 2 && !crossfadeScheduled) {
        musicGain2.gain.value = effectiveVolume;
    }
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

    // Start background music
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
    updateMusicCrossfade();
    updateAdminInfo();

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
            playCueSound(inhaleAudio, inhaleGainMultiplier);
            break;
            
        case 'exhale':
            breathingCircle.classList.add('exhale');
            breathInstruction.textContent = 'Exhale';
            breathInstruction.classList.add('exhale');
            playCueSound(exhaleAudio, exhaleGainMultiplier);
            break;
            
        case 'hold-in':
        case 'hold-out':
            breathInstruction.textContent = 'Hold';
            break;
    }
}

// Admin Panel Functions
function initAdminPanel() {
    // Toggle panel
    adminToggle.addEventListener('click', () => {
        adminPanel.classList.toggle('open');
    });
    
    // Crossfade duration
    crossfadeSlider.addEventListener('input', () => {
        CROSSFADE_DURATION = parseFloat(crossfadeSlider.value);
        crossfadeValue.textContent = CROSSFADE_DURATION;
    });
    
    // Music gain
    musicGainSlider.addEventListener('input', () => {
        musicGainMultiplier = parseFloat(musicGainSlider.value);
        musicGainValue.textContent = musicGainMultiplier.toFixed(1);
        // Update currently playing music
        updateMusicVolume();
    });
    
    // Inhale gain
    inhaleGainSlider.addEventListener('input', () => {
        inhaleGainMultiplier = parseFloat(inhaleGainSlider.value);
        inhaleGainValue.textContent = inhaleGainMultiplier.toFixed(1);
    });
    
    // Exhale gain
    exhaleGainSlider.addEventListener('input', () => {
        exhaleGainMultiplier = parseFloat(exhaleGainSlider.value);
        exhaleGainValue.textContent = exhaleGainMultiplier.toFixed(1);
    });
}

// Update admin info display
function updateAdminInfo() {
    if (!isSessionActive) {
        musicPositionInfo.textContent = '--';
        activeSourceInfo.textContent = '--';
        return;
    }
    
    const currentAudio = activeSource === 1 
        ? (musicSource1 ? musicSource1._audioElement : null)
        : (musicSource2 ? musicSource2._audioElement : null);
    
    if (currentAudio) {
        musicPositionInfo.textContent = currentAudio.currentTime.toFixed(1) + 's';
    }
    
    musicDurationInfo.textContent = musicDuration.toFixed(1) + 's';
    activeSourceInfo.textContent = activeSource + (crossfadeScheduled ? ' (crossfading)' : '');
}

// Initialize the app
init();
initAdminPanel();
