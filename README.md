# The Fall of Velmora
*A Cross-Platform Multiplayer Social Deduction Game*

## Overview
The Fall of Velmora is a Mafia-style social deduction game built with HTML5, CSS3, JavaScript, and Node.js with Socket.IO. Players are assigned secret roles and must work together to eliminate the mafia while the mafia attempts to eliminate innocent players under the cover of darkness.

## Features
- **Cross-platform multiplayer** - Play in any modern web browser
- **Real-time gameplay** with Socket.IO
- **Canvas-based UI** with atmospheric day/night visuals
- **Role-based gameplay** - Mafia, Detective, Doctor, and Civilians
- **Lobby system** with dynamic player management
- **Day/night cycle** with timed phases
- **Voting system** for player elimination
- **Responsive design** for desktop and mobile

## Game Roles

### 🔴 Mafia
- **Goal**: Eliminate all innocent players
- **Ability**: Can eliminate one player each night
- **Strategy**: Blend in during day discussions and coordinate with other mafia members

### 🔍 Detective
- **Goal**: Identify and eliminate all mafia members
- **Ability**: Can investigate one player each night to learn their role
- **Strategy**: Use investigation results to guide day phase discussions

### 💚 Doctor
- **Goal**: Keep innocent players alive
- **Ability**: Can protect one player each night from elimination
- **Strategy**: Try to identify and protect key innocent players

### 👥 Civilian
- **Goal**: Identify and vote out all mafia members
- **Ability**: Participate in voting during day phases
- **Strategy**: Listen carefully to discussions and vote wisely

## Game Phases

### 🌅 Day Phase (2 minutes)
- All players discuss and share information
- No eliminations occur during this phase
- Plan for the upcoming voting phase

### 🗳️ Voting Phase (1 minute)  
- Players vote to eliminate a suspected mafia member
- Player with the most votes is eliminated
- All players can participate in voting

### 🌙 Night Phase (1 minute)
- Special roles perform their abilities
- Mafia chooses a target to eliminate
- Detective investigates a player
- Doctor protects a player

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager

### Installation Steps

1. **Clone or download the project files**
   ```bash
   git clone <repository-url>
   cd the-fall-of-velmora
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Open the game**
   - Navigate to `http://localhost:3000` in your web browser
   - Share this URL with other players to join the game

## How to Play

### Joining a Game
1. Open the game URL in your browser
2. Enter your player name (max 20 characters)
3. Click "Join Game"
4. Wait for other players to join (minimum 4 players required)
5. Any player can click "Start Game" once enough players have joined

### During the Game
1. **Role Assignment**: You'll receive your secret role at the start
2. **Day Phase**: Discuss with other players to identify suspicious behavior
3. **Voting Phase**: Vote to eliminate a player you suspect is mafia
4. **Night Phase**: Use special abilities if you have them
5. **Repeat**: Continue until either all mafia are eliminated (innocents win) or mafia equal/outnumber innocents (mafia wins)

### Tips for Success
- **Pay attention** to voting patterns and player behavior
- **Communicate** during day phases to share information
- **Think strategically** about when to reveal information
- **Trust carefully** - anyone could be mafia!

## Technical Architecture

### Backend (`server.js`)
- **Express.js** web server for serving static files
- **Socket.IO** for real-time multiplayer communication
- **Game state management** with phases, timers, and role assignment
- **Vote processing** and win condition checking
- **Player connection handling** with automatic cleanup

### Frontend (`main.js`)
- **Canvas rendering** for game visualization with day/night effects
- **Socket.IO client** for server communication
- **UI state management** for different game screens
- **Event handling** for player interactions
- **Responsive design** with mobile support

### Styling (`style.css`)
- **Dark atmospheric theme** with gradient backgrounds
- **Phase-specific styling** that changes with day/night cycle
- **Modern UI components** with smooth animations
- **Responsive grid layout** for different screen sizes
- **Custom scrollbars** and visual effects

## Game Configuration

You can modify these constants in `server.js` to customize the game:

```javascript
const MIN_PLAYERS = 4;        // Minimum players to start
const MAX_PLAYERS = 10;       // Maximum players allowed
const DAY_DURATION = 120;     // Day phase duration (seconds)
const NIGHT_DURATION = 60;    // Night phase duration (seconds)  
const VOTING_DURATION = 60;   // Voting phase duration (seconds)
```

## Troubleshooting

### Connection Issues
- Ensure the server is running on port 3000
- Check that no firewall is blocking the connection
- Try refreshing the browser if connection is lost

### Game Not Starting
- Verify at least 4 players have joined
- Check the browser console for any JavaScript errors
- Make sure all players are on the same server URL

### Performance Issues
- The game uses HTML5 Canvas for rendering - ensure your browser supports it
- For mobile devices, try landscape orientation for better experience
- Close other browser tabs if experiencing lag

## Browser Compatibility
- **Chrome**: Fully supported
- **Firefox**: Fully supported  
- **Safari**: Fully supported
- **Edge**: Fully supported
- **Mobile browsers**: Supported with responsive design

## Contributing
This is a basic implementation that can be extended with additional features:
- **Chat system** during day phases
- **Spectator mode** for eliminated players
- **Additional roles** (e.g., Vigilante, Mayor)
- **Game statistics** and history
- **Private rooms** with room codes
- **Audio effects** and background music

## License
MIT License - Feel free to modify and distribute as needed.

---

*Built with ❤️ using HTML5, CSS3, JavaScript, Node.js, and Socket.IO* 