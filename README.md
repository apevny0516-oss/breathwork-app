# Breathwork App

A simple, beautiful web-based breathwork app with guided breathing exercises and audio cues.

## Features

- **Visual Breathing Guide** - An animated circle that expands and contracts to guide your breathing
- **Audio Cues** - Inhale and exhale voice prompts at each breath transition
- **Background Music** - Calming ambient music during your session
- **Session Timer** - Choose from 1 to 30-minute sessions
- **Volume Controls** - Separate controls for music and voice cues

## Breathing Patterns

### Buteyko Breathing
- 5.5 seconds inhale
- 5.5 seconds exhale

This pattern is based on the Buteyko method, designed to optimize oxygen and CO2 balance in the body.

## Usage

1. Open `index.html` in a web browser
2. Select your session duration
3. Adjust volume levels to your preference
4. Click "Start Session"
5. Follow the breathing circle - inhale as it expands, exhale as it contracts

## Technical Details

- Pure HTML, CSS, and JavaScript (no frameworks)
- Uses Web Audio API for instant audio playback
- `requestAnimationFrame` for smooth, drift-free timing
- Responsive design works on desktop and mobile

## Audio Files

Place your audio files in the `Audio/` folder:
- `inhale.mp3` - Voice cue for inhale
- `exhale.mp3` - Voice cue for exhale
- `music1.mp3` - Background music

## License

MIT
