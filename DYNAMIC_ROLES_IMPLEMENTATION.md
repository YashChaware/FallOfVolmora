# Dynamic Role Logic Implementation

## Overview
Successfully implemented dynamic role logic based on lobby settings and player count for The Fall of Velmora game.

## New Roles Added

### 🔥 Suicide Bomber (Mafia Role)
- **Availability**: Only when Mafia team has 3 or more members
- **Toggle**: Available in lobby settings when mafiaCount >= 3
- **Alignment**: Mafia only
- **Ability**: When discovered and about to be eliminated, can choose up to 2 specific players to kill in their final act
- **Trigger**: Only activates when the Suicide Bomber is voted out/discovered as Mafia
- **Time Limit**: 30 seconds to select targets or the ability is forfeited
- **Doctor Protection**: If a Doctor has protected a target, that player survives the suicide bombing
- **Description**: "🔥 Mafia role: When discovered and about to be eliminated, choose specific players to kill in your final act of defiance! (Doctor protection applies)"

### 🧠 Manipulator (Mafia Role)
- **Availability**: Always available
- **Toggle**: Always shown in lobby settings
- **Alignment**: Mafia only
- **Ability**: Can alter votes, spread false information, or redirect suspicion during voting or discussion phases
- **Description**: "🧠 Mafia role: Alter votes, spread false information, and redirect suspicion during discussions."

### 🚔 Police Roles (Available if player count ≥ 10)
Automatically added when there are 10 or more players (if auto-police setting is enabled):

#### White Police
- **Alignment**: Civilian-aligned
- **Ability**: Can investigate one player per round to reveal their alignment
- **Description**: "🚔 Civilian-aligned Police: Investigate one player per round to reveal their alignment."

#### Black Police
- **Alignment**: Civilian-aligned  
- **Ability**: Can eliminate suspects without needing full proof, but risks killing innocents
- **Description**: "⚫ Civilian-aligned Police: Eliminate suspects without full proof, but risk killing innocents."

#### Gray Police
- **Alignment**: Neutral role
- **Ability**: Can choose to support either Mafia or Civilians secretly during the game
- **Description**: "🔘 Neutral Police: Choose to secretly support either Mafia or Civilians during the game."

## Lobby Settings Logic

### New Settings Added
1. **Suicide Bomber Toggle**: Only visible when mafiaCount >= 3
2. **Manipulator Toggle**: Always visible
3. **Auto Police Roles Toggle**: Controls whether police roles are auto-added for 10+ players

### UI Implementation
- Added role toggles section in lobby settings
- Dynamic visibility for Suicide Bomber based on Mafia count
- Real-time role preview updates
- Proper styling with checkboxes and descriptions

### Validation
- Prevents enabling Suicide Bomber with < 3 Mafia members
- Updates UI dynamically when player/mafia counts change
- Provides clear error messages for invalid configurations

## Server-Side Implementation

### Role Generation Logic
- **Dynamic Assignment**: Roles are assigned based on player count and enabled settings
- **Special Role Replacement**: Special mafia roles replace regular mafia (not added extra)
- **Police Auto-Assignment**: 3 police roles automatically added for 10+ players
- **Mafia Team Recognition**: All mafia variants (regular, suicide bomber, manipulator) are recognized as team members

### Settings Management
- Extended room settings to include new role toggles
- Server validates role combinations
- Broadcasts setting updates to all players in room

## Client-Side Implementation

### UI Updates
- Added toggle controls with proper styling
- Dynamic role preview with special roles
- Auto-hiding/showing of Suicide Bomber toggle
- Real-time settings synchronization

### Event Handling
- Updated settings handler to include new role toggles
- Proper validation before sending to server
- Toast notifications for setting changes

## Testing Results

Verified with multiple test scenarios:
1. **Small game (6 players, 2 mafia)**: Standard roles only
2. **Medium game (8 players, 3 mafia)**: With special mafia roles
3. **Large game (12 players, 3 mafia)**: With police roles enabled
4. **Large game (12 players, 3 mafia)**: With police roles disabled
5. **Max players (20 players, 4 mafia)**: All features enabled

All tests passed with correct role distribution and counts.

## Files Modified

1. **server.js**: 
   - Added new role definitions and descriptions
   - Updated room settings structure
   - Enhanced generateRoles function with dynamic logic
   - Extended updateRoomSettings handler
   - Updated mafia team detection

2. **main.js**:
   - Added new role settings to game state
   - Updated handleUpdateSettings method
   - Enhanced updateRoomSettings method
   - Added updateSuicideBomberVisibility method
   - Updated updateRolePreview with new role logic
   - Extended roomSettingsUpdated event handler

3. **index.html**:
   - Added role toggle section to lobby settings
   - Added checkboxes for each special role
   - Included proper labeling and descriptions

4. **style.css**:
   - Added styling for role toggles section
   - Styled toggle items and checkboxes
   - Responsive design considerations

## Features Working
✅ Dynamic role assignment based on player count
✅ Lobby settings with role toggles
✅ Suicide Bomber only available with 3+ Mafia
✅ Suicide Bomber activation when discovered/voted out
✅ Target selection modal with 30-second timer
✅ Strategic choice to eliminate up to 2 players or go quietly
✅ Manipulator always available with toggle
✅ Auto Police roles for 10+ players
✅ Real-time role preview
✅ Settings validation and error handling
✅ Mafia team recognition for all variants
✅ UI responsiveness and visual feedback

## New Suicide Bomber Mechanics
- **Conditional Activation**: Only triggers when voted out/discovered
- **Strategic Choice**: Can select up to 2 specific targets or choose none
- **Time Pressure**: 30-second countdown to make decision
- **Interactive UI**: Modal with target selection buttons
- **Doctor Protection**: Protected players survive the bombing (creates strategic depth)
- **Dynamic Messaging**: Different messages for eliminated vs protected targets
- **Dramatic Effect**: Special messaging for suicide bombing results

The implementation is complete and fully functional! 