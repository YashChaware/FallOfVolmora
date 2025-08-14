// Lobby Management System for The Fall of Velmora

class LobbyManager {
    constructor() {
        this.currentScreen = 'mainMenu';
        this.previousScreen = null;
        this.publicLobbies = [];
        this.searchTimeout = null;
        this.refreshInterval = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
    }

    setupEventListeners() {
        // Main menu navigation
        const createLobbyBtn = document.getElementById('createLobbyBtn');
        const joinLobbyBtn = document.getElementById('joinLobbyBtn');
        
        if (createLobbyBtn) {
            createLobbyBtn.addEventListener('click', () => {
                console.log('Create lobby button clicked');
                this.showCreateLobby();
            });
        } else {
            console.error('Create lobby button not found');
        }
        
        if (joinLobbyBtn) {
            joinLobbyBtn.addEventListener('click', () => {
                console.log('Join lobby button clicked');
                this.showJoinLobby();
            });
        } else {
            console.error('Join lobby button not found');
        }

        // Back navigation
        document.getElementById('backFromCreateLobby').addEventListener('click', () => this.showMainMenu());
        document.getElementById('backFromJoinLobby').addEventListener('click', () => this.showMainMenu());
        document.getElementById('backFromSettings').addEventListener('click', () => this.goBackFromSettings());
        document.getElementById('backFromLobby').addEventListener('click', () => this.leaveLobby());
        
        // Settings button in lobby
        document.getElementById('lobbySettingsBtn').addEventListener('click', () => this.showSettings());

        // Create lobby form
        document.getElementById('confirmCreateLobby').addEventListener('click', () => this.createLobby());
        document.getElementById('cancelCreateLobby').addEventListener('click', () => this.showMainMenu());

        // Join lobby tabs
        document.getElementById('publicLobbiesTab').addEventListener('click', () => this.showPublicLobbies());
        document.getElementById('privateLobbiesTab').addEventListener('click', () => this.showPrivateLobbies());

        // Public lobbies
        document.getElementById('refreshLobbies').addEventListener('click', () => this.refreshPublicLobbies());
        document.getElementById('lobbySearch').addEventListener('input', (e) => this.searchLobbies(e.target.value));
        document.getElementById('createFirstLobby').addEventListener('click', () => this.showCreateLobby());

        // Private lobby
        document.getElementById('joinPrivateLobby').addEventListener('click', () => this.joinPrivateLobby());

        // Settings
        this.setupSettingsListeners();

        // Dynamic max players and mafia count
        document.getElementById('maxPlayersCreate').addEventListener('change', () => this.updateMafiaOptions());
        
        // Bot settings
        document.getElementById('enableBotsCreate').addEventListener('change', (e) => this.toggleBotSettings('Create', e.target.checked));
        document.getElementById('botToggle').addEventListener('change', (e) => this.toggleBotSettings('Lobby', e.target.checked));

        // Invite link copy/share
        const copyBtn = document.getElementById('copyInviteLinkBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyInviteLink());
        }
		const openInviteBtn = document.getElementById('openInviteFriendsBtn');
		if (openInviteBtn) {
			openInviteBtn.addEventListener('click', async () => {
				// Refresh friends before opening
				try {
					const res = await fetch('/api/friends');
					if (res.ok) {
						const data = await res.json();
						if (window.authManager) {
							window.authManager.friends = data.friends || [];
						}
					}
				} catch {}
				if (window.authManager) window.authManager.openInviteFriendsModal();
			});
		}
    }

    setupSettingsListeners() {
        // Audio settings
        const masterVolume = document.getElementById('masterVolumeSettings');
        const musicVolume = document.getElementById('musicVolumeSettings');
        const sfxVolume = document.getElementById('sfxVolumeSettings');

        masterVolume.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('masterVolumeSettingsValue').textContent = `${value}%`;
            if (window.audioManager) {
                window.audioManager.setMasterVolume(value / 100);
            }
            this.saveSettings();
        });

        musicVolume.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('musicVolumeSettingsValue').textContent = `${value}%`;
            if (window.audioManager) {
                window.audioManager.setMusicVolume(value / 100);
            }
            this.saveSettings();
        });

        sfxVolume.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('sfxVolumeSettingsValue').textContent = `${value}%`;
            if (window.audioManager) {
                window.audioManager.setSfxVolume(value / 100);
            }
            this.saveSettings();
        });

        // Game preferences
        const checkboxes = ['showRoleAnimations', 'enableNotifications', 'skipIntroComic', 'reduceMotion'];
        checkboxes.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.saveSettings());
        });

        // UI Scale
        document.getElementById('uiScale').addEventListener('change', (e) => {
            document.body.style.fontSize = `${parseFloat(e.target.value)}rem`;
            this.saveSettings();
        });
    }

    // Screen Navigation
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });

        // Track previous screen (unless we're going to settings or returning from settings)
        if (screenId !== 'settingsScreen' && this.currentScreen !== 'settingsScreen') {
            this.previousScreen = this.currentScreen;
        }

        // Show target screen
        document.getElementById(screenId).style.display = 'block';
        this.currentScreen = screenId;
    }

    showMainMenu() {
        this.showScreen('mainMenuScreen');
        this.stopRefreshInterval();
    }

    showCreateLobby() {
        this.showScreen('createLobbyScreen');
        this.updateMafiaOptions();
        this.updateGuestNameField();
    }

    showJoinLobby() {
        this.showScreen('joinLobbyScreen');
        this.showPublicLobbies();
    }

    showSettings() {
        this.showScreen('settingsScreen');
    }

    goBackFromSettings() {
        // Return to the previous screen, or main menu if no previous screen
        if (this.previousScreen && this.previousScreen !== 'settingsScreen') {
            if (this.previousScreen === 'lobbyScreen') {
                // If returning to lobby, ensure we display the lobby screen properly
                this.showScreen('lobbyScreen');
            } else {
                this.showScreen(this.previousScreen);
            }
        } else {
            this.showMainMenu();
        }
    }



    // Lobby Creation
    async createLobby() {
        try {
            const lobbyName = document.getElementById('lobbyName').value.trim();
            const lobbyDescription = document.getElementById('lobbyDescription').value.trim();
            const lobbyType = document.querySelector('input[name="lobbyType"]:checked').value;
            const maxPlayers = parseInt(document.getElementById('maxPlayersCreate').value);
            const mafiaCount = parseInt(document.getElementById('mafiaCountCreate').value);
            const suicideBomberEnabled = document.getElementById('suicideBomberCreate').checked;
            const manipulatorEnabled = document.getElementById('manipulatorCreate').checked;
            const autoPoliceRoles = document.getElementById('autoPoliceCreate').checked;
            const enableBots = document.getElementById('enableBotsCreate').checked;
            const botCount = parseInt(document.getElementById('botCountCreate').value);

            if (!lobbyName) {
                this.showNotification('Please enter a lobby name', 'error');
                return;
            }

            // Create lobby info object
            const lobbyInfo = {
                lobbyName,
                lobbyDescription,
                isPublic: lobbyType === 'public',
                maxPlayers,
                mafiaCount,
                suicideBomberEnabled,
                manipulatorEnabled,
                autoPoliceRoles,
                enableBots,
                botCount
            };

            // Check if user is authenticated or guest
            let playerName;
            if (window.authManager && window.authManager.isAuthenticated) {
                // Authenticated user - use API
                const response = await fetch('/api/lobbies/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(lobbyInfo),
                });

                const data = await response.json();

                if (response.ok) {
                    // Join the created lobby
                    this.joinLobbyByCode(data.roomCode, data.lobbyInfo);
                } else {
                    this.showNotification(data.error || 'Failed to create lobby', 'error');
                }
            } else {
                // Guest user or no auth - directly create room via socket
                const guestPlayerNameInput = document.getElementById('guestPlayerName');
                playerName = guestPlayerNameInput.value.trim();
                
                if (!playerName) {
                    this.showNotification('Please enter your name in the Game Settings section', 'error');
                    return;
                }

                // Generate room code and create room directly
                const roomCode = this.generateRoomCode();
                
                // Debug: Check game and socket connection
                console.log('Game object:', window.game);
                console.log('Socket object:', window.game?.socket);
                console.log('Socket connected:', window.game?.socket?.connected);
                
                if (window.game && window.game.socket && window.game.socket.connected) {
                    window.game.socket.emit('createRoom', {
                        roomCode: roomCode,
                        playerName: playerName,
                        lobbyInfo: lobbyInfo
                    });
                    this.showNotification('Creating lobby...', 'info');
                } else if (window.game && window.game.socket) {
                    this.showNotification('Game connection not ready. Please wait a moment and try again.', 'error');
                } else {
                    this.showNotification('Game connection not available. Please refresh the page.', 'error');
                }
            }
        } catch (error) {
            console.error('Create lobby error:', error);
            this.showNotification('Failed to create lobby', 'error');
        }
    }

    updateMafiaOptions() {
        const maxPlayers = parseInt(document.getElementById('maxPlayersCreate').value);
        const mafiaSelect = document.getElementById('mafiaCountCreate');
        const maxMafia = this.getMaxMafiaCount(maxPlayers);
        
        // Update mafia options
        mafiaSelect.innerHTML = '';
        for (let i = 1; i <= maxMafia; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i} Mafia`;
            if (i === Math.min(2, maxMafia)) option.selected = true;
            mafiaSelect.appendChild(option);
        }

        // Update suicide bomber availability
        const suicideBomberCheckbox = document.getElementById('suicideBomberCreate');
        const currentMafia = parseInt(mafiaSelect.value);
        if (currentMafia < 3) {
            suicideBomberCheckbox.checked = false;
            suicideBomberCheckbox.disabled = true;
            suicideBomberCheckbox.parentElement.style.opacity = '0.5';
        } else {
            suicideBomberCheckbox.disabled = false;
            suicideBomberCheckbox.parentElement.style.opacity = '1';
        }
    }

    toggleBotSettings(context, enabled) {
        const settingsDiv = document.getElementById(`botSettings${context}`);
        if (settingsDiv) {
            settingsDiv.style.display = enabled ? 'block' : 'none';
        }
    }

    updateGuestNameField() {
        const guestNameGroup = document.getElementById('guestNameGroup');
        const guestPlayerName = document.getElementById('guestPlayerName');
        
        // Show name field for guests or unauthenticated users
        const isAuthenticated = window.authManager && window.authManager.isAuthenticated;
        
        if (!isAuthenticated) {
            guestNameGroup.style.display = 'block';
            
            // Pre-fill with guest name if available
            if (window.authManager && window.authManager.currentUser && window.authManager.currentUser.isGuest) {
                guestPlayerName.value = window.authManager.currentUser.displayName;
            } else {
                guestPlayerName.value = '';
            }
        } else {
            guestNameGroup.style.display = 'none';
        }
    }

    getMaxMafiaCount(playerCount) {
        if (playerCount >= 15) return 4;
        if (playerCount >= 7) return 3;
        if (playerCount >= 5) return 2;
        return 1;
    }

    // Public Lobbies
    showPublicLobbies() {
        document.getElementById('publicLobbiesTab').classList.add('active');
        document.getElementById('privateLobbiesTab').classList.remove('active');
        document.getElementById('publicLobbiesContent').style.display = 'block';
        document.getElementById('privateLobbiesContent').style.display = 'none';
        
        this.refreshPublicLobbies();
        this.startRefreshInterval();
    }

    showPrivateLobbies() {
        document.getElementById('publicLobbiesTab').classList.remove('active');
        document.getElementById('privateLobbiesTab').classList.add('active');
        document.getElementById('publicLobbiesContent').style.display = 'none';
        document.getElementById('privateLobbiesContent').style.display = 'block';
        
        this.stopRefreshInterval();
    }

    async refreshPublicLobbies() {
        try {
            const search = document.getElementById('lobbySearch').value.trim();
            const response = await fetch(`/api/lobbies/public?search=${encodeURIComponent(search)}`);
            
            if (response.ok) {
                this.publicLobbies = await response.json();
                this.displayPublicLobbies();
            } else {
                console.error('Failed to fetch public lobbies');
            }
        } catch (error) {
            console.error('Refresh lobbies error:', error);
        }
    }

    displayPublicLobbies() {
        const lobbiesList = document.getElementById('publicLobbiesList');
        const lobbyCount = document.getElementById('lobbyCount');
        
        lobbyCount.textContent = this.publicLobbies.length;

        if (this.publicLobbies.length === 0) {
            lobbiesList.innerHTML = `
                <div class="no-lobbies">
                    <p>No public lobbies available</p>
                    <button class="btn-primary" id="createFirstLobby">Create the first lobby!</button>
                </div>
            `;
            // Re-attach event listener
            document.getElementById('createFirstLobby').addEventListener('click', () => this.showCreateLobby());
            return;
        }

        lobbiesList.innerHTML = '';
        this.publicLobbies.forEach(lobby => {
            const lobbyElement = this.createLobbyElement(lobby);
            lobbiesList.appendChild(lobbyElement);
        });
    }

    createLobbyElement(lobby) {
        const div = document.createElement('div');
        div.className = 'lobby-item';
        div.onclick = () => this.joinPublicLobby(lobby.roomCode);
        
        const gameStatus = lobby.gameStarted ? '🎮 In Game' : '⏰ Waiting';
        const playerStatus = `${lobby.playerCount}/${lobby.maxPlayers}`;
        
        div.innerHTML = `
            <div class="lobby-header">
                <h4 class="lobby-name">${this.escapeHtml(lobby.lobbyName)}</h4>
                <span class="lobby-type">🌐 Public</span>
            </div>
            ${lobby.lobbyDescription ? `<p class="lobby-description">${this.escapeHtml(lobby.lobbyDescription)}</p>` : ''}
            <div class="lobby-details">
                <div class="lobby-players">
                    <span>👥 ${playerStatus}</span>
                    <span>⚔️ ${lobby.mafiaCount} Mafia</span>
                </div>
                <div class="lobby-status">
                    <span>${gameStatus}</span>
                    <span class="lobby-host">Host: ${this.escapeHtml(lobby.hostName)}</span>
                </div>
            </div>
        `;
        
        return div;
    }

    searchLobbies(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.refreshPublicLobbies();
        }, 300);
    }

    startRefreshInterval() {
        this.stopRefreshInterval();
        this.refreshInterval = setInterval(() => {
            this.refreshPublicLobbies();
        }, 5000); // Refresh every 5 seconds
    }

    stopRefreshInterval() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    // Join Lobby Functions
    async joinPublicLobby(roomCode) {
        this.joinLobbyByCode(roomCode);
    }

    async joinPrivateLobby() {
        const roomCode = document.getElementById('privateLobbyCode').value.trim().toUpperCase();
        
        if (!roomCode) {
            this.showNotification('Please enter a lobby code', 'error');
            return;
        }

        if (roomCode.length !== 6) {
            this.showNotification('Lobby code must be 6 characters', 'error');
            return;
        }

        this.joinLobbyByCode(roomCode);
    }

    joinLobbyByCode(roomCode, lobbyInfo = null) {
        // Use existing game logic to join room
        if (window.game) {
            if (lobbyInfo) {
                // Store lobby info for display
                window.game.currentLobbyInfo = lobbyInfo;
            }
            
            // Set room code and join
            document.getElementById('roomCodeInput').value = roomCode;
            window.game.currentRoomCode = roomCode;
            
            // If authenticated, use auth data, otherwise prompt for name
            if (window.authManager && window.authManager.isAuthenticated) {
                window.game.joinRoom();
            } else {
                // Prompt for guest name
                const name = prompt('Enter your name to join:');
                if (name && name.trim()) {
                    document.getElementById('joinPlayerNameInput').value = name.trim();
                    window.game.joinRoom();
                } else {
                    this.showNotification('Name is required to join', 'error');
                }
            }
        }
    }

    leaveLobby() {
        if (window.game && window.game.currentRoomCode) {
            window.game.leaveRoom();
        }
        this.showMainMenu();
    }

    // Settings Management
    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('velmoraSettings') || '{}');
            
            // Audio settings
            if (settings.masterVolume !== undefined) {
                document.getElementById('masterVolumeSettings').value = settings.masterVolume;
                document.getElementById('masterVolumeSettingsValue').textContent = `${settings.masterVolume}%`;
            }
            if (settings.musicVolume !== undefined) {
                document.getElementById('musicVolumeSettings').value = settings.musicVolume;
                document.getElementById('musicVolumeSettingsValue').textContent = `${settings.musicVolume}%`;
            }
            if (settings.sfxVolume !== undefined) {
                document.getElementById('sfxVolumeSettings').value = settings.sfxVolume;
                document.getElementById('sfxVolumeSettingsValue').textContent = `${settings.sfxVolume}%`;
            }

            // Game preferences
            if (settings.showRoleAnimations !== undefined) {
                document.getElementById('showRoleAnimations').checked = settings.showRoleAnimations;
            }
            if (settings.enableNotifications !== undefined) {
                document.getElementById('enableNotifications').checked = settings.enableNotifications;
            }
            if (settings.skipIntroComic !== undefined) {
                document.getElementById('skipIntroComic').checked = settings.skipIntroComic;
            }
            if (settings.reduceMotion !== undefined) {
                document.getElementById('reduceMotion').checked = settings.reduceMotion;
            }

            // UI Scale
            if (settings.uiScale !== undefined) {
                document.getElementById('uiScale').value = settings.uiScale;
                document.body.style.fontSize = `${settings.uiScale}rem`;
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    saveSettings() {
        try {
            const settings = {
                masterVolume: parseInt(document.getElementById('masterVolumeSettings').value),
                musicVolume: parseInt(document.getElementById('musicVolumeSettings').value),
                sfxVolume: parseInt(document.getElementById('sfxVolumeSettings').value),
                showRoleAnimations: document.getElementById('showRoleAnimations').checked,
                enableNotifications: document.getElementById('enableNotifications').checked,
                skipIntroComic: document.getElementById('skipIntroComic').checked,
                reduceMotion: document.getElementById('reduceMotion').checked,
                uiScale: parseFloat(document.getElementById('uiScale').value)
            };

            localStorage.setItem('velmoraSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    // Utility Functions
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    showNotification(message, type = 'info') {
        if (window.authManager) {
            window.authManager.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    getInviteLink() {
        const roomCodeSpan = document.getElementById('currentRoomCode');
        const roomCode = roomCodeSpan ? roomCodeSpan.textContent.trim() : window.game?.currentRoomCode;
        if (!roomCode) return '';
        const origin = window.location.origin;
        // Deep link with accept parameter to auto-open join flow when visited
        return `${origin}/?action=join&room=${encodeURIComponent(roomCode)}`;
    }

    async copyInviteLink() {
        const link = this.getInviteLink();
        if (!link) {
            this.showNotification('No active room to share', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(link);
            this.showNotification('Invite link copied! Share it anywhere.', 'success');
        } catch (e) {
            this.showNotification(link, 'info');
        }
    }

    // Handle deep link on load
    maybeHandleDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const room = params.get('room');
        const token = params.get('token');
        if (action === 'join' && room) {
            // If authenticated, auto-join; else prompt name and join
            document.getElementById('privateLobbyCode').value = room.toUpperCase();
            this.joinPrivateLobby();
            // Clear params to avoid re-trigger
            history.replaceState({}, document.title, window.location.pathname);
		}
		if (action === 'reset' && token && window.authManager) {
			window.authManager.openResetPasswordModal(token);
			// do not clear token immediately so user can retry
		}
    }
}

// Initialize the lobby manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (!window.lobbyManager) {
        window.lobbyManager = new LobbyManager();
        window.lobbyManager.maybeHandleDeepLink();
        console.log('Lobby manager initialized');
    }
});

// Fallback if DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.lobbyManager) {
            window.lobbyManager = new LobbyManager();
            console.log('Lobby manager initialized (fallback)');
        }
    });
} else {
    if (!window.lobbyManager) {
        window.lobbyManager = new LobbyManager();
        console.log('Lobby manager initialized (immediate)');
    }
} 