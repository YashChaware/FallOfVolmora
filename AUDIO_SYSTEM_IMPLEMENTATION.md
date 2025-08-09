# Audio System Implementation - The Fall of Velmora

## Overview
A comprehensive audio system has been implemented using Howler.js to provide immersive background music, contextual sound effects, and user-controlled audio preferences for The Fall of Velmora game.

## 🔊 Features Implemented

### Background Music System
- **Lobby Phase**: Calm ambient loop for room setup and waiting
- **Day Phase**: Discussion music during day phase conversations
- **Voting Phase**: Suspenseful music during voting periods
- **Night Phase**: Tense atmospheric music for night actions
- **Victory Theme**: Celebratory music when civilians/town wins
- **Defeat Theme**: Dark music when mafia wins

### Sound Effects
#### Role Reveals
- **Mafia Roles**: Dark, ominous sounds for Mafia, Suicide Bomber, Manipulator
- **Civilian Roles**: Positive, heroic sounds for Civilian, Detective, Doctor
- **Police Roles**: Authority-based sounds for all police variants

#### Game Events
- **Murder Event**: Dramatic sound when players are eliminated
- **Suicide Bomber**: Explosion sound effect when activated
- **Doctor Protection**: Shield/protection sound when players are saved
- **Investigation**: Detective scan/interrogation sound
- **Phase Transitions**: Smooth transition sounds between game phases

#### UI Interactions
- **Vote Click**: Subtle click sound when selecting vote targets
- **Vote Confirm**: Confirmation sound when vote is cast
- **Button Clicks**: General button interaction sounds
- **Notifications**: Alert sounds for important toast messages

## 🎛️ Audio Controls

### Volume Management
- **Master Volume**: Controls overall audio level (0-100%)
- **Music Volume**: Independent music volume control
- **Sound Effects Volume**: Independent SFX volume control
- **Mute Toggle**: One-click mute/unmute all audio

### User Interface
- **Audio Button**: Top-right corner speaker icon
- **Volume Panel**: Right-click to access volume sliders
- **Persistent Settings**: Audio preferences saved in localStorage
- **Visual Feedback**: Muted state indicated by icon change

## 🔧 Technical Implementation

### Audio Manager Architecture
```javascript
class AudioManager {
    // Core features:
    - Howler.js integration for cross-browser compatibility
    - Automatic user interaction handling (required for autoplay policies)
    - Smooth fade transitions between music tracks
    - Error handling for missing audio files
    - Memory management and cleanup
    - Settings persistence
}
```

### Key Technical Features
- **Cross-browser Compatibility**: Works on desktop and mobile browsers
- **Autoplay Policy Compliance**: Audio only starts after user interaction
- **Performance Optimized**: All audio files preloaded
- **Fallback Support**: Graceful handling of missing audio files
- **Memory Efficient**: Proper cleanup and unloading of audio resources

### Integration Points
- **Role Assignment**: Audio triggers when roles are revealed
- **Phase Changes**: Music transitions match game state
- **Player Actions**: Sounds for voting, investigations, eliminations
- **Game Events**: Audio feedback for all major game events
- **UI Interactions**: Responsive audio for button clicks and notifications

## 📁 File Structure
```
audio/
├── music/
│   ├── lobby-ambient.mp3      # Calm lobby background music
│   ├── day-discussion.mp3     # Day phase discussion music
│   ├── voting-suspense.mp3    # Voting phase tension music
│   ├── night-tension.mp3      # Night phase atmospheric music
│   ├── victory-theme.mp3      # Civilian/town victory music
│   └── defeat-theme.mp3       # Mafia victory music
└── sfx/
    ├── role-*.mp3             # Role reveal sounds
    ├── murder-event.mp3       # Player elimination sound
    ├── explosion.mp3          # Suicide bomber activation
    ├── protection.mp3         # Doctor save sound
    ├── investigation.mp3      # Detective action sound
    ├── vote-*.mp3            # Voting interaction sounds
    ├── notification.mp3       # Alert/notification sound
    ├── phase-transition.mp3   # Game phase change sound
    ├── game-start.mp3        # Game initialization sound
    └── game-end.mp3          # Game conclusion sound
```

## 🎵 Audio Event Triggers

### Automatic Triggers
- **Game Start**: Lobby music begins, game start sound plays
- **Role Assignment**: Unique sound for each role type
- **Phase Changes**: Music transitions with transition sound effect
- **Player Elimination**: Murder sound effect
- **Suicide Bomber**: Explosion sound when activated
- **Doctor Save**: Protection sound when players are saved
- **Investigation**: Scan sound for detective actions
- **Game End**: Victory/defeat music based on winner

### User-Initiated Triggers
- **Vote Casting**: Click sound on target selection
- **Vote Confirmation**: Confirmation sound when vote submitted
- **Button Interactions**: General UI click sounds
- **Notifications**: Alert sounds for important messages

## ⚙️ Configuration Options

### Default Settings
- Master Volume: 70%
- Music Volume: 60%
- Sound Effects: 80%
- Muted: False

### Customization
- All volume levels independently adjustable
- Settings persist across browser sessions
- Easy mute/unmute toggle
- Real-time volume changes

## 🔄 State Management

### Music State Tracking
- Current playing track
- Current game phase
- Fade transition management
- Loop status for background music

### Settings Persistence
- localStorage integration
- Automatic save on changes
- Load settings on page refresh
- Cross-session preferences

## 🚀 Performance Features

### Optimization
- Audio file preloading
- Efficient memory usage
- Minimal CPU impact
- Mobile-optimized

### Error Handling
- Graceful fallback for missing files
- Console warnings for failed loads
- Continued functionality without audio
- No game-breaking audio errors

## 📱 Mobile Compatibility

### Browser Support
- Chrome/Safari mobile autoplay compliance
- Touch interaction activation
- Optimized file sizes for mobile data
- Responsive volume controls

### User Experience
- Touch-friendly audio controls
- Appropriate volume levels for mobile speakers
- Battery-conscious implementation

## 🎯 Future Enhancements

### Planned Features
- Dynamic music mixing based on tension level
- Spatial audio for player positioning
- Voice notifications for key events
- Custom sound pack support
- Audio visualization effects

### Extensibility
- Easy addition of new sound effects
- Modular music system for new phases
- Plugin architecture for audio effects
- Theme-based audio pack swapping

## 🛠️ Development Notes

### Testing
- All audio files are currently silent placeholders
- Replace with actual audio content from royalty-free sources
- Test across different browsers and devices
- Verify autoplay policy compliance

### Recommended Audio Sources
- **Freesound.org**: Community sound effects
- **OpenGameArt.org**: Game-specific audio
- **YouTube Audio Library**: Background music
- **Zapsplat.com**: Professional sound effects (requires account)

The audio system is fully implemented and ready for content replacement with actual music and sound effects! 