# AI Bot System for The Fall of Velmora

## Overview
The Fall of Velmora now includes an intelligent AI bot system that automatically fills lobbies when there are fewer than 4 players, ensuring games can always start with the minimum required players.

## Features

### Smart Bot Management
- **Automatic Addition**: Bots are automatically added when lobbies have fewer than 4 players
- **Automatic Removal**: Bots are removed when enough human players join (4 or more)
- **Configurable Count**: Host can set how many bots to add (0-3)
- **Easy Toggle**: Can be enabled/disabled through lobby settings

### Intelligent AI Behavior
- **Voting Intelligence**: Bots use sophisticated algorithms to make voting decisions
- **Personality System**: Each bot has unique personality traits affecting behavior:
  - **Aggressiveness**: How quickly they vote
  - **Cautiousness**: How much they analyze before voting
  - **Follow Crowd**: Tendency to follow majority votes
  - **Trust Level**: How much they trust other players
  - **Randomness**: Small chaos factor for unpredictable behavior

- **Pattern Analysis**: Bots track and analyze voting patterns to identify suspicious behavior
- **Suspicion Tracking**: Maintain suspicion levels for all players (0-100)
- **Realistic Timing**: Vote with human-like delays (2-8 seconds)

### Role Assignment
- **Civilian Only**: Bots are assigned only civilian roles to keep the game balanced
- **Human Priority**: All special roles (Mafia, Detective, Doctor, etc.) go to human players first
- **Automatic Assignment**: No manual intervention needed

## How to Use

### For Lobby Hosts

#### Creating a Lobby with Bots
1. Click "Create Lobby"
2. Scroll down to "AI Bots" section
3. Check "Enable AI Bots (Fill lobby when under 4 players)"
4. Select number of bots (0-3)
5. Create lobby as normal

#### Managing Bot Settings in Lobby
1. Click the settings button (⚙️) in the lobby
2. Scroll to bot settings section
3. Toggle bots on/off
4. Adjust bot count
5. Click "Update Settings"

### Bot Behavior in Game

#### Voting Phase
- Bots will vote during day phases with realistic delays
- Voting decisions based on:
  - Accumulated suspicion levels
  - Voting pattern analysis
  - Crowd following tendencies
  - Individual personality traits

#### Game Events
- Bots update their suspicion levels when players are eliminated
- Track voting history to identify suspicious patterns
- Adapt behavior based on game state

## Technical Implementation

### Architecture
- **BotManager Class**: Handles all bot logic and AI decisions
- **Server Integration**: Seamlessly integrated with existing game server
- **Real-time Updates**: Bots respond to game events in real-time
- **Memory Management**: Automatic cleanup when games end

### Performance
- **Lightweight**: Minimal impact on server performance
- **Scalable**: Can handle multiple lobbies with bots simultaneously
- **Efficient**: Smart timer management prevents memory leaks

## Bot Names
Bots use distinctive names to identify them as AI players:
- AI Citizen Alpha, Beta, Gamma, Delta, Epsilon, Zeta
- AI Citizen Eta, Theta, Iota, Kappa, Lambda, Mu

## Balancing Considerations

### Game Balance
- Bots only receive civilian roles to maintain competitive balance
- Human players get priority for all special roles
- Bot voting is challenging but not overpowered

### User Experience
- Bots ensure games can always start even with low player counts
- Seamless integration - bots behave like additional players
- Clear identification - bot names make them easily recognizable

### Host Management
- **Human Host Priority**: Only human players can become hosts
- **Auto-Lobby Closure**: If all human players leave, the lobby closes automatically
- **Game Start Requirements**: At least 1 human player required to start any game
- **No Bot Hosts**: Bots can never become lobby hosts under any circumstances

## Configuration Options

### Lobby Settings
- **Enable Bots**: Toggle bot system on/off
- **Bot Count**: Set maximum number of bots (0-3)
- **Automatic Management**: Bots added/removed based on human player count

### AI Difficulty
The current implementation provides moderate difficulty:
- Smart enough to provide engaging gameplay
- Not overpowered to maintain human player enjoyment
- Personality variations create diverse bot behaviors

## Future Enhancements

### Potential Improvements
- Difficulty levels (Easy/Medium/Hard)
- Custom bot personalities
- Advanced pattern recognition
- Machine learning adaptation
- Bot chat messages (optional)

### Extensibility
The bot system is designed to be easily extensible:
- Additional AI strategies can be added
- New personality traits can be implemented
- Custom bot behaviors for different game modes

## Troubleshooting

### Common Issues
1. **Bots not appearing**: Check that bot settings are enabled and player count is under 4
2. **Too many bots**: Adjust bot count in lobby settings
3. **Bots not voting**: Ensure game is in day phase and bots are alive
4. **Can't start game**: Ensure at least 1 human player is present
5. **Lobby closed unexpectedly**: This happens when all human players leave

### Debug Information
- Server logs show bot addition/removal events
- Bot voting decisions are logged for debugging
- Bot manager cleanup is automatic

## Conclusion
The AI bot system enhances The Fall of Velmora by ensuring consistent gameplay experiences regardless of player count. The intelligent voting system provides engaging interactions while maintaining game balance through civilian-only role assignment. 