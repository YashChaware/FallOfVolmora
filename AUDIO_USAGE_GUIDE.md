# Audio Usage Guide - The Fall of Velmora

## 🔊 For Players

### Getting Started
1. **First Time**: Click anywhere on the page to enable audio (required by browsers)
2. **Audio Controls**: Look for the speaker icon (🔊) in the top-right corner
3. **Quick Mute**: Click the speaker icon to instantly mute/unmute all audio

### Volume Controls
1. **Access Panel**: Right-click the speaker icon to open volume controls
2. **Master Volume**: Controls everything (recommended: 70%)
3. **Music Volume**: Background music only (recommended: 60%) 
4. **Sound Effects**: Button clicks, notifications, etc. (recommended: 80%)
5. **Real-time Changes**: Adjustments take effect immediately

### Audio Experience
- **Background Music**: Changes automatically based on game phase
  - Lobby: Calm ambient sounds
  - Day: Discussion atmosphere
  - Voting: Suspenseful tension
  - Night: Dark, mysterious tones
  - Victory/Defeat: Outcome-based themes

- **Sound Effects**: Enhance every game action
  - Role reveals have unique sounds
  - Voting produces click/confirmation sounds
  - Eliminations trigger dramatic effects
  - Special events (explosions, investigations) have distinctive audio

### Settings Persistence
- Your audio preferences are automatically saved
- Settings persist across browser sessions
- No need to readjust each time you play

## 🛠️ For Developers

### Audio System Architecture
```javascript
// Global audio manager instance
window.audioManager

// Key methods for triggering sounds:
audioManager.playRoleReveal(role)      // Role assignment
audioManager.onPhaseChange(phase)      // Game phase transitions  
audioManager.onPlayerElimination()     // Player deaths
audioManager.onSuicideBomberActivation() // Explosion events
audioManager.onProtection()            // Doctor saves
audioManager.onInvestigation()         // Detective actions
audioManager.onVoteClick()             // Vote interactions
audioManager.onVoteConfirm()           // Vote confirmations
audioManager.onGameStart()             // Game initialization
audioManager.onGameEnd(winner)         // Game conclusion
```

### Adding New Audio Events
1. **Add Audio File**: Place MP3/OGG in appropriate `/audio/` folder
2. **Load in AudioManager**: Add to `loadMusic()` or `loadSoundEffects()`
3. **Create Trigger Method**: Add method like `onNewEvent()`
4. **Integrate**: Call the method from game events

### Audio File Requirements
- **Format**: MP3 (primary) + OGG (fallback) recommended
- **Music**: Loop-friendly, 2-5 minute tracks
- **SFX**: Short, punchy effects (0.5-3 seconds)
- **Quality**: 44.1kHz, reasonable bitrate for web
- **Size**: Optimize for fast loading

### Testing Audio
```javascript
// Test individual sounds
audioManager.playSound('explosion');

// Test music transitions
audioManager.playMusic('voting');

// Test role sounds
audioManager.playRoleReveal('mafia');

// Check if audio is initialized
console.log(audioManager.isInitialized);
```

### Browser Compatibility Notes
- **Autoplay Policy**: Audio only starts after user interaction
- **Mobile Safari**: May require user gesture for each new sound
- **Chrome**: Autoplay policy strictest, but well-supported
- **Firefox**: Generally permissive with user-initiated audio

### Performance Optimization
- All audio files are preloaded on initialization
- Smooth fade transitions prevent audio jarring
- Error handling prevents crashes on missing files
- Memory cleanup prevents leaks during long sessions

### Debugging Audio Issues
1. **Check Console**: Look for load errors or warnings
2. **Verify Files**: Ensure audio files exist in correct paths
3. **Test User Interaction**: Make sure user has clicked/interacted
4. **Volume Levels**: Check if audio is muted or volume is zero
5. **Browser DevTools**: Network tab shows audio file loading

## 🎵 Customization Guide

### Replacing Audio Files
1. **Backup Originals**: Save placeholder files before replacing
2. **Match Naming**: Keep exact filename conventions
3. **Test Quality**: Ensure new audio fits game atmosphere
4. **Multiple Formats**: Provide MP3 + OGG for best compatibility
5. **Optimize Size**: Compress appropriately for web delivery

### Recommended Audio Characteristics
- **Lobby Music**: Calm, ambient, non-intrusive
- **Day Music**: Conversational, moderate energy
- **Voting Music**: Tense, suspenseful, building
- **Night Music**: Dark, mysterious, atmospheric
- **Victory**: Triumphant, uplifting
- **Defeat**: Dark, ominous, conclusive

### Volume Guidelines
- **Music**: Should not overpower voice chat
- **SFX**: Noticeable but not startling
- **UI Sounds**: Subtle, non-intrusive
- **Role Reveals**: Distinctive but brief
- **Important Events**: More prominent for emphasis

The audio system is designed to enhance gameplay without being intrusive. Players can always adjust or disable audio based on their preferences! 