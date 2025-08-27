// Game client-side logic for The Fall of Velmora
// 
// SERVER REQUIREMENTS for Play Again feature:
// - Handle 'playAgain' socket event
// - Reset game state while keeping current players
// - Randomly reassign roles to all players 
// - Emit 'gameRestarted' event to trigger new game
//
// SERVER REQUIREMENTS for Return to Lobby feature:
// - Handle 'returnToLobby' socket event
// - Reset all players to lobby state (remove roles, reset game state)
// - Keep all players in the same room with same room code
// - Emit 'returnedToLobby' event with updated room data
// - Allow host to modify settings and start new game
//
// SERVER REQUIREMENTS for Close Game feature:
// - Handle 'closeGame' socket event
// - End current game immediately and return all players to lobby
// - Keep all players in the same room with same room code
// - Emit 'gameClosed' event to all players in room
// - Fallback: uses 'resetGame' if 'closeGame' not implemented
//
// SERVER REQUIREMENTS for Detailed Voting Results:
// - After voting phase ends, emit 'detailedVotingResults' event
// - Include: votes array with {voterName, targetName}, totalVotes, eligibleVoters
// - Include: result object with elimination details
// - Send to all players in room for transparency
//
class VelmoraGame {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.playerId = null;
        this.playerName = null;
        this.playerRole = null;
        this.currentRoomCode = null;
        this.playerColors = new Map(); // Store player colors
        this.usedColors = new Set(); // Track used colors to prevent duplicates
        this.votingResults = null; // Store voting results to display
        this.gameState = {
            phase: 'lobby',
            players: [],
            deadPlayers: [],
            dayCount: 0,
            timeRemaining: 0,
            gameStarted: false,
            roomCode: null,
            hostId: null,
            settings: {
                maxPlayers: 10,
                mafiaCount: 2,
                suicideBomberEnabled: false,
                manipulatorEnabled: false,
                autoPoliceRoles: true
            }
        };
        this.currentScreen = 'lobby';
        this.isConnected = false;
        this.countdownInterval = null; // For game over countdown timer
        this.gameOverInfo = null; // Store game over data for canvas display
        
        // Initialize animated stars
        this.stars = [];
        this.initStars();
        
        // Initialize voting visualization
        this.currentVoteDetails = [];
        
        // Initialize mafia team information
        this.mafiaTeammates = [];
        
        // Initialize audio system
        this.audioInitialized = false;
        
        // Initialize comic system
        this.comicSystem = {
            currentPanel: 0,
            introPanels: [
                {
                    text: "Volmora — a city of brilliance, unity, and secrets buried beneath its cobblestone streets.",
                    class: "panel-1"
                },
                {
                    text: "But one night, the shadows grew longer... and darker.",
                    class: "panel-2"
                },
                {
                    text: "A secret faction, known only as the Mafia, emerged from the depths, sowing fear and confusion.",
                    class: "panel-3"
                },
                {
                    text: "The first murder shattered the city's peace. Trust crumbled. Paranoia spread.",
                    class: "panel-4"
                },
                {
                    text: "Now, every face hides a question: Who can be trusted? Who walks among us as a traitor?",
                    class: "panel-5"
                },
                {
                    text: "Volmora's fate lies in your hands. Unmask the Mafia. Restore the light.",
                    class: "panel-6"
                }
            ],
            victoryEnding: [
                {
                    text: "Through wit, courage, and unity, the citizens of Volmora exposed the Mafia and reclaimed their city.",
                    class: "ending-victory"
                },
                {
                    text: "Volmora rises again — stronger, wiser, and forever vigilant.",
                    class: "ending-victory"
                }
            ],
            defeatEnding: [
                {
                    text: "The Mafia's deception ran deep. One by one, the defenders fell.",
                    class: "ending-defeat"
                },
                {
                    text: "Volmora has fallen. The shadows now rule. Will anyone rise to challenge them again?",
                    class: "ending-defeat"
                }
            ]
        };
        
        this.init();
        this.tutorial = {
            active: false,
            step: 0,
            overlay: null,
            sequence: null
        };
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupAudioControls();
        this.connectToServer();
        this.startGameLoop();
        this.initOrientationHelper();
    }

    initOrientationHelper() {
        const overlay = document.getElementById('rotateOverlay');
        const tryBtn = document.getElementById('tryRotateBtn');
        if (tryBtn) {
            tryBtn.onclick = async () => {
                try {
                    if (screen.orientation && screen.orientation.lock) {
                        await screen.orientation.lock('landscape');
                    }
                } catch {}
            };
        }
        const onResize = () => {
            const portrait = window.matchMedia('(orientation: portrait)').matches;
            if (overlay) overlay.style.display = portrait && window.innerWidth < 900 ? 'flex' : 'none';
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        setTimeout(onResize, 0);
    }

    setupAudioControls() {
        const volumePanel = document.getElementById('volumePanel');
        const masterVolume = document.getElementById('masterVolume');
        const musicVolume = document.getElementById('musicVolume');
        const sfxVolume = document.getElementById('sfxVolume');
        const masterVolumeValue = document.getElementById('masterVolumeValue');
        const musicVolumeValue = document.getElementById('musicVolumeValue');
        const sfxVolumeValue = document.getElementById('sfxVolumeValue');

        // Click outside to close panel
        document.addEventListener('click', (e) => {
            if (!document.getElementById('audioControls').contains(e.target)) {
                volumePanel.style.display = 'none';
            }
        });

        // Volume controls
        masterVolume.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            masterVolumeValue.textContent = `${value}%`;
            if (window.audioManager) {
                window.audioManager.setMasterVolume(value / 100);
            }
        });

        musicVolume.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            musicVolumeValue.textContent = `${value}%`;
            if (window.audioManager) {
                window.audioManager.setMusicVolume(value / 100);
            }
        });

        sfxVolume.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            sfxVolumeValue.textContent = `${value}%`;
            if (window.audioManager) {
                window.audioManager.setSfxVolume(value / 100);
            }
        });

        // Load saved settings
        if (window.audioManager) {
            const settings = JSON.parse(localStorage.getItem('velmoraAudioSettings') || '{}');
            if (settings.masterVolume !== undefined) {
                masterVolume.value = Math.round(settings.masterVolume * 100);
                masterVolumeValue.textContent = `${masterVolume.value}%`;
            }
            if (settings.musicVolume !== undefined) {
                musicVolume.value = Math.round(settings.musicVolume * 100);
                musicVolumeValue.textContent = `${musicVolume.value}%`;
            }
            if (settings.sfxVolume !== undefined) {
                sfxVolume.value = Math.round(settings.sfxVolume * 100);
                sfxVolumeValue.textContent = `${sfxVolume.value}%`;
            }

        }
    }

    initStars() {
        // Create 80 slowly moving stars
        const canvasWidth = 800;
        const canvasHeight = 600;
        
        for (let i = 0; i < 80; i++) {
            this.stars.push({
                x: Math.random() * canvasWidth,
                y: Math.random() * canvasHeight,
                size: Math.random() * 1.5 + 0.5,
                speed: Math.random() * 0.15 + 0.05, // Even slower movement
                angle: Math.random() * Math.PI * 2
            });
        }
    }

    updateStars() {
        // Update star positions slowly
        this.stars.forEach(star => {
            star.x += Math.cos(star.angle) * star.speed;
            star.y += Math.sin(star.angle) * star.speed;
            
            // Wrap stars around the screen
            if (star.x > this.canvas.width) star.x = 0;
            if (star.x < 0) star.x = this.canvas.width;
            if (star.y > this.canvas.height) star.y = 0;
            if (star.y < 0) star.y = this.canvas.height;
        });
    }

    setupCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Make canvas responsive
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    setupEventListeners() {
        // Room selection events
        document.getElementById('createRoomBtn').addEventListener('click', () => this.showCreateRoomForm());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.showJoinRoomForm());
        
        // Room action events
        document.getElementById('createRoomButton').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomButton').addEventListener('click', () => this.joinRoom());
        document.getElementById('leaveRoomButton').addEventListener('click', () => this.leaveRoom());
        
        // Input enter key events
        document.getElementById('createPlayerNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });
        document.getElementById('joinPlayerNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        document.getElementById('roomCodeInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        // Game events
        document.getElementById('startGameButton').addEventListener('click', () => this.startGame());
        document.getElementById('updateSettingsButton').addEventListener('click', () => this.handleUpdateSettings());

        // Chat events
        const sendChatBtn = document.getElementById('sendChatButton');
        const chatInput = document.getElementById('chatInput');
        const sendMafiaChatBtn = document.getElementById('sendMafiaChatButton');
        const mafiaInput = document.getElementById('mafiaInput');
        const sendPoliceChatBtn = document.getElementById('sendPoliceChatButton');
        const policeInput = document.getElementById('policeInput');
        
        if (sendChatBtn) {
            sendChatBtn.addEventListener('click', () => this.sendChat());
        }
        
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendChat();
            });
        }

        // Mafia chat events
        if (sendMafiaChatBtn) {
            sendMafiaChatBtn.addEventListener('click', () => this.sendMafiaChat());
        }
        
        if (mafiaInput) {
            mafiaInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMafiaChat();
            });
        }

        // Police chat events
        if (sendPoliceChatBtn) {
            sendPoliceChatBtn.addEventListener('click', () => this.sendPoliceChat());
        }
        
        if (policeInput) {
            policeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendPoliceChat();
            });
        }

        // No more modal events - actions are integrated into the player table
        document.getElementById('returnToLobbyButton').addEventListener('click', () => this.returnToLobby());
        
        // Copy room code button
        document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyRoomCode());
        
        // Close game button (host only)
        document.getElementById('closeGameBtn').addEventListener('click', () => this.closeGame());


        // Canvas click events for player interaction
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // Comic system event listeners
        document.getElementById('nextPanelBtn').addEventListener('click', () => this.nextComicPanel());
        document.getElementById('skipIntroBtn').addEventListener('click', () => this.skipComicIntro());
        document.getElementById('nextEndingPanelBtn').addEventListener('click', () => this.nextEndingPanel());
        document.getElementById('skipEndingBtn').addEventListener('click', () => this.skipComicEnding());
        document.getElementById('playAgainFromEndingBtn').addEventListener('click', () => this.playAgainFromEnding());
        document.getElementById('returnToLobbyFromEndingBtn').addEventListener('click', () => this.returnToLobbyFromEnding());

        
        // Room code input formatting
        document.getElementById('roomCodeInput').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });

        const startTutorialBtn = document.getElementById('startTutorialBtn');
        if (startTutorialBtn) {
            startTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal');
                if (modal) modal.style.display = 'block';
            });
        }
        const closeTutorialModal = document.getElementById('closeTutorialModal');
        if (closeTutorialModal) {
            closeTutorialModal.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal');
                if (modal) modal.style.display = 'none';
            });
        }
        const startCompleteTutorialBtn = document.getElementById('startCompleteTutorialBtn');
        if (startCompleteTutorialBtn) {
            startCompleteTutorialBtn.addEventListener('click', () => {
				const modal = document.getElementById('tutorialModal');
				if (modal) modal.style.display = 'none';
				this.startSandboxSequence(['mafia','doctor','detective','gray_police','manipulator','suicide_bomber','civilian']);
			});
        }
        const startMafiaTutorialBtn = document.getElementById('startMafiaTutorialBtn');
        if (startMafiaTutorialBtn) {
            startMafiaTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal');
                if (modal) modal.style.display = 'none';
                this.startSandboxTutorial('mafia');
            });
        }
        const startDoctorTutorialBtn = document.getElementById('startDoctorTutorialBtn');
        if (startDoctorTutorialBtn) {
            startDoctorTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal');
                if (modal) modal.style.display = 'none';
                this.startSandboxTutorial('doctor');
            });
        }
        const startDetectiveTutorialBtn = document.getElementById('startDetectiveTutorialBtn');
        if (startDetectiveTutorialBtn) {
            startDetectiveTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal');
                if (modal) modal.style.display = 'none';
                this.startSandboxTutorial('detective');
            });
        }
        const startPoliceTutorialBtn = document.getElementById('startPoliceTutorialBtn');
        if (startPoliceTutorialBtn) {
            startPoliceTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal'); if (modal) modal.style.display = 'none';
                this.startSandboxTutorial('white_police');
            });
        }
        const startBlackPoliceTutorialBtn = document.getElementById('startBlackPoliceTutorialBtn');
        if (startBlackPoliceTutorialBtn) {
            startBlackPoliceTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal'); if (modal) modal.style.display = 'none';
                this.startSandboxTutorial('black_police');
            });
        }
        const startManipulatorTutorialBtn = document.getElementById('startManipulatorTutorialBtn');
        if (startManipulatorTutorialBtn) {
            startManipulatorTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal'); if (modal) modal.style.display = 'none';
                this.startSandboxTutorial('manipulator');
            });
        }
        const startCivilianTutorialBtn = document.getElementById('startCivilianTutorialBtn');
        if (startCivilianTutorialBtn) {
            startCivilianTutorialBtn.addEventListener('click', () => {
                const modal = document.getElementById('tutorialModal'); if (modal) modal.style.display = 'none';
                this.startSandboxTutorial('civilian');
            });
        }
        const startSuicideTutorialBtn = document.getElementById('startSuicideTutorialBtn');
        if (startSuicideTutorialBtn) {
            startSuicideTutorialBtn.addEventListener('click', () => { const modal = document.getElementById('tutorialModal'); if (modal) modal.style.display = 'none'; this.startSandboxTutorial('suicide_bomber'); });
        }
        const startGrayTutorialBtn = document.getElementById('startGrayTutorialBtn');
        if (startGrayTutorialBtn) {
            startGrayTutorialBtn.addEventListener('click', () => { const modal = document.getElementById('tutorialModal'); if (modal) modal.style.display = 'none'; this.startSandboxTutorial('gray_police'); });
        }
    }

    showCreateRoomForm() {
        document.getElementById('createRoomBtn').classList.add('active');
        document.getElementById('joinRoomBtn').classList.remove('active');
        document.getElementById('createRoomForm').style.display = 'block';
        document.getElementById('joinRoomForm').style.display = 'none';
    }

    showJoinRoomForm() {
        document.getElementById('createRoomBtn').classList.remove('active');
        document.getElementById('joinRoomBtn').classList.add('active');
        document.getElementById('createRoomForm').style.display = 'none';
        document.getElementById('joinRoomForm').style.display = 'block';
    }

    createRoom() {
        // Check if user is authenticated
        if (window.authManager && window.authManager.isAuthenticated) {
            const userData = window.authManager.getUserForRoom();
            this.socket.emit('createRoom', userData);
        } else {
            // Guest mode - get name from input
            const nameInput = document.getElementById('createPlayerNameInput');
            const name = nameInput.value.trim();
            
            if (!name) {
                this.showToast('Please enter your name', 'error');
                return;
            }

            if (name.length > 20) {
                this.showToast('Name must be 20 characters or less', 'error');
                return;
            }

            this.socket.emit('createRoom', name);
        }
    }

    joinRoom() {
        const roomCodeInput = document.getElementById('roomCodeInput');
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        
        if (!roomCode) {
            this.showToast('Please enter a room code', 'error');
            return;
        }

        if (roomCode.length !== 6) {
            this.showToast('Room code must be 6 characters', 'error');
            return;
        }

        // Reset player colors when joining a new room
        this.resetPlayerColors();

        // Check if user is authenticated
        if (window.authManager && window.authManager.isAuthenticated) {
            const userData = window.authManager.getUserForRoom();
            this.socket.emit('joinRoom', { 
                roomCode, 
                playerName: userData.playerName,
                displayName: userData.displayName,
                userId: userData.userId,
                isAuthenticated: userData.isAuthenticated
            });
        } else {
            // Guest mode - get name from input
            const nameInput = document.getElementById('joinPlayerNameInput');
            const name = nameInput.value.trim();
            
            if (!name) {
                this.showToast('Please enter your name', 'error');
                return;
            }

            if (name.length > 20) {
                this.showToast('Name must be 20 characters or less', 'error');
                return;
            }

            this.socket.emit('joinRoom', { roomCode, playerName: name });
        }
    }

    leaveRoom() {
        if (this.currentRoomCode) {
            // Send leave room event to server
            this.socket.emit('leaveRoom', this.currentRoomCode);
        } else {
            this.showToast('You are not in a room', 'error');
        }
    }

    connectToServer() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.updateConnectionStatus('connected', 'Connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');
            
            // Reset any loading button states on disconnect
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn && playAgainBtn.disabled) {
                playAgainBtn.textContent = '🎮 Play Again';
                playAgainBtn.disabled = false;
            }
        });

        // Authentication socket events
        this.socket.on('socketAuthenticated', (data) => {
            console.log('Socket authenticated:', data);
        });

        // Friend invitation events
        this.socket.on('roomInvitation', (invitation) => {
            if (window.authManager) {
                window.authManager.showRoomInvitation(invitation);
            }
        });

        this.socket.on('invitationSent', (data) => {
            this.showToast(`Invitation sent to ${data.friendName}!`, 'success');
        });

        this.socket.on('invitationResponse', (data) => {
            if (data.accepted) {
                this.showToast(`${data.responderName} accepted your invitation!`, 'success');
            } else {
                this.showToast(`${data.responderName} declined your invitation`, 'info');
            }
        });

        		this.socket.on('autoJoinRoom', (data) => {
			const code = data?.roomCode || '';
			if (!code) return;
			document.getElementById('roomCodeInput').value = code;
			if (window.lobbyManager && typeof window.lobbyManager.joinLobbyByCode === 'function') {
				window.lobbyManager.joinLobbyByCode(code);
			} else {
				this.showJoinRoomForm();
				this.joinRoom();
			}
		});

        this.socket.on('roomCreated', (data) => {
            this.playerId = data.playerId;
            this.playerName = data.playerName;
            this.currentRoomCode = data.roomCode;
            this.currentLobbyInfo = data.lobbyInfo;
            // Inject begin: merge settings from lobbyInfo
            if (data.lobbyInfo) {
                this.gameState.settings = {
                    ...this.gameState.settings,
                    maxPlayers: data.lobbyInfo.maxPlayers ?? this.gameState.settings.maxPlayers,
                    mafiaCount: data.lobbyInfo.mafiaCount ?? this.gameState.settings.mafiaCount,
                    suicideBomberEnabled: data.lobbyInfo.suicideBomberEnabled ?? this.gameState.settings.suicideBomberEnabled,
                    manipulatorEnabled: data.lobbyInfo.manipulatorEnabled ?? this.gameState.settings.manipulatorEnabled,
                    autoPoliceRoles: data.lobbyInfo.autoPoliceRoles ?? this.gameState.settings.autoPoliceRoles,
                    enableBots: data.lobbyInfo.enableBots ?? this.gameState.settings.enableBots,
                    botCount: data.lobbyInfo.botCount ?? this.gameState.settings.botCount
                };
            }
            // Inject end
            
            // Update lobby name display
            if (data.lobbyInfo && data.lobbyInfo.lobbyName) {
                document.getElementById('currentLobbyName').textContent = data.lobbyInfo.lobbyName;
            } else {
                document.getElementById('currentLobbyName').textContent = `Room ${data.roomCode}`;
            }
            
            this.showRoomInfo();
            this.showToast(`Lobby created successfully!`);
            // If tutorial active, go straight into step 1 begin after a brief moment
            if (this.tutorial?.active && this.tutorial.step === 1) {
                setTimeout(() => this.beginTutorialStep(1), 500);
            }
        });

        this.socket.on('roomJoined', (data) => {
            this.playerId = data.playerId;
            this.playerName = data.playerName;
            this.currentRoomCode = data.roomCode;
            this.currentLobbyInfo = data.lobbyInfo;
            // Inject begin: merge settings from lobbyInfo
            if (data.lobbyInfo) {
                this.gameState.settings = {
                    ...this.gameState.settings,
                    maxPlayers: data.lobbyInfo.maxPlayers ?? this.gameState.settings.maxPlayers,
                    mafiaCount: data.lobbyInfo.mafiaCount ?? this.gameState.settings.mafiaCount,
                    suicideBomberEnabled: data.lobbyInfo.suicideBomberEnabled ?? this.gameState.settings.suicideBomberEnabled,
                    manipulatorEnabled: data.lobbyInfo.manipulatorEnabled ?? this.gameState.settings.manipulatorEnabled,
                    autoPoliceRoles: data.lobbyInfo.autoPoliceRoles ?? this.gameState.settings.autoPoliceRoles,
                    enableBots: data.lobbyInfo.enableBots ?? this.gameState.settings.enableBots,
                    botCount: data.lobbyInfo.botCount ?? this.gameState.settings.botCount
                };
            }
            // Inject end
            
            // Update lobby name display
            if (data.lobbyInfo && data.lobbyInfo.lobbyName) {
                document.getElementById('currentLobbyName').textContent = data.lobbyInfo.lobbyName;
            } else {
                document.getElementById('currentLobbyName').textContent = `Room ${data.roomCode}`;
            }
            
            this.showRoomInfo();
            this.showToast(`Joined lobby successfully!`);
        });

        this.socket.on('playerJoined', (data) => {
            this.showToast(`${data.playerName} joined the room`);
        });

        this.socket.on('playerLeft', (data) => {
            this.showToast(`${data.playerName} left the room`);
            // Free up the player's color for reuse
            this.freePlayerColor(data.playerId);
        });

        this.socket.on('gameState', (state) => {
            console.log('Received gameState:', state); // Debug log
            this.updateGameState(state);
        });

        this.socket.on('roleAssigned', (data) => {
            console.log('Role assigned:', data);
            this.playerRole = data.role;
            
            // Play role reveal sound
            if (window.audioManager) {
                window.audioManager.playRoleReveal(data.role);
            }
            
            // Switch directly to game screen (no role popup)
            this.switchToGameScreen();
            
            // Reset play again button if it exists (in case of restart)
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn) {
                playAgainBtn.textContent = '🎮 Play Again';
                playAgainBtn.disabled = false;
            }
            
            // Show success message for new game
            this.showToast('🎮 New game started! Check your role!', 'success');
        });

        this.socket.on('mafiaTeamInfo', (data) => {
            this.mafiaTeammates = data.teammates || [];
            this.showToast(`🔪 ${data.message}`, 'info');
            console.log('Mafia teammates:', this.mafiaTeammates);
        });

        this.socket.on('phaseChange', (data) => {
            // Play phase transition audio
            if (window.audioManager) {
                window.audioManager.onPhaseChange(data.phase);
            }
            
            this.handlePhaseChange(data);
            
            // Clear voting results when phase changes
            if (data.phase !== 'day') {
                this.votingResults = null;
                this.currentVoteDetails = [];
                this.votingVisualizationData = null;
            }
        });

        this.socket.on('playerEliminated', (data) => {
            // Play elimination sound
            if (window.audioManager) {
                window.audioManager.onPlayerElimination();
            }
            
            this.handlePlayerElimination(data);
        });

        this.socket.on('playerSaved', (data) => {
            // Play protection sound
            if (window.audioManager) {
                window.audioManager.onProtection();
            }
            
            this.showToast(`🛡️ ${data.message}`, 'success');
        });

        this.socket.on('gameOver', (data) => {
            // Play game end audio
            if (window.audioManager) {
                window.audioManager.onGameEnd(data.winner);
            }
            
            this.handleGameOver(data);
            // In tutorial mode, advance to next step automatically after a short pause
            if (this.tutorial?.active) {
                setTimeout(() => this.nextTutorialStep(), 1200);
            }
        });

        this.socket.on('gameReset', (message) => {
            console.log('Game reset event received:', message);
            this.showToast(message, 'info');
            
            // Clear chat messages when game resets
            this.clearChatMessages();
            
            // Don't reset play again button here if it's in loading state (play again in progress)
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn && !playAgainBtn.textContent.includes('Starting')) {
                playAgainBtn.textContent = '🎮 Play Again';
                playAgainBtn.disabled = false;
            }
            
            const returnBtn = document.getElementById('returnToLobbyButton');
            if (returnBtn) {
                returnBtn.disabled = false;
                returnBtn.textContent = '🏠 Return Everyone to Lobby';
            }
            
            // Reset close button state
            const closeBtn = document.getElementById('closeGameBtn');
            if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.textContent = '❌';
                closeBtn.title = 'Close Game (Host Only)';
            }
            
            this.performLocalLobbyReturn();
        });

        this.socket.on('lobbyReturned', (data) => {
            this.showToast('🏠 Everyone returned to lobby!', 'success');
            this.performLocalLobbyReturn();
        });

        this.socket.on('returnedToLobby', (data) => {
            this.showToast(`🏠 ${data.message}`, 'success');
            this.performLocalLobbyReturn();
        });

        this.socket.on('newGameStarted', (data) => {
            this.showToast('🎮 New game started! New roles assigned!', 'success');
            // Reset play again button state
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn) {
                playAgainBtn.textContent = '🎮 Play Again';
                playAgainBtn.disabled = false;
            }
        });

        // Handle game restart (when server starts a new game)
        this.socket.on('gameRestarted', (data) => {
            this.showToast('🎮 New game started! Roles have been reassigned!', 'success');
            // Reset play again button state
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn) {
                playAgainBtn.textContent = '🎮 Play Again';
                playAgainBtn.disabled = false;
            }
            // Game state will be updated through normal gameState events
        });

        // Handle successful play again with existing startGame flow
        this.socket.on('gameStarted', (data) => {
            console.log('Game started event received:', data);
            this.showToast('🎮 New game started!', 'success');
            // Reset play again button state
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn) {
                playAgainBtn.textContent = '🎮 Play Again';
                playAgainBtn.disabled = false;
            }
        });

        this.socket.on('returnedToLobby', (roomData) => {
            this.showToast('🏠 Returned to lobby! Host can adjust settings and restart.', 'success');
            
            // Clear chat messages when returning to lobby
            this.clearChatMessages();
            
            // Reset return button state
            const returnBtn = document.getElementById('returnToLobbyButton');
            if (returnBtn) {
                returnBtn.disabled = false;
                returnBtn.textContent = '🏠 Return Everyone to Lobby';
            }
            
            // Update game state with lobby data
            if (roomData) {
                console.log('returnedToLobby roomData:', roomData); // Debug log
                this.gameState = {
                    ...this.gameState,
                    phase: 'lobby',
                    players: roomData.players || [],
                    deadPlayers: [],
                    dayCount: 0,
                    timeRemaining: 0,
                    gameStarted: false,
                    playerCount: roomData.playerCount || roomData.players?.length || 0,
                    hostId: roomData.hostId || this.gameState.hostId,
                    settings: roomData.settings || this.gameState.settings
                };
                console.log('Updated gameState after returnedToLobby:', this.gameState); // Debug log
            }
            
            this.performLocalLobbyReturn();
        });

        this.socket.on('gameClosed', (data) => {
            this.showToast('🛑 Game closed by host. Returning to lobby.', 'info');
            
            // Reset close button state
            const closeBtn = document.getElementById('closeGameBtn');
            if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.textContent = '❌';
                closeBtn.title = 'Close Game (Host Only)';
            }
            
            this.performLocalLobbyReturn();
        });

        this.socket.on('error', (message) => {
            this.showToast(message, 'error');
            
            // Reset button states on error
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn && playAgainBtn.disabled) {
                playAgainBtn.textContent = '🎮 Play Again';
                playAgainBtn.disabled = false;
            }
        });

        this.socket.on('voteConfirmed', (data) => {
            // Play vote confirmation sound
            if (window.audioManager) {
                window.audioManager.onVoteConfirm();
            }
            
            this.showToast(`Vote cast for ${data.targetName}`, 'info');
            this.closeModal('votingModal');
        });

        this.socket.on('voteUpdate', (data) => {
            // Update vote count display in real-time
            this.updateVoteDisplay(data);
        });

        this.socket.on('votingResult', (data) => {
            // Show voting results
            this.handleVotingResult(data);
        });

        this.socket.on('detailedVotingResults', (data) => {
            // Store voting results and show visual indicators
            this.handleDetailedVotingResults(data);
        });

        this.socket.on('hostChanged', (data) => {
            if (data.newHostId === this.playerId) {
                this.showToast('You are now the room host!');
            } else {
                this.showToast(`${data.newHostName} is now the room host`);
            }
        });

        this.socket.on('roomSettingsUpdated', (data) => {
            // Update local settings
            this.gameState.settings = {
                ...this.gameState.settings,
                ...data
            };
            
            // Update UI elements
            this.updateRoomSettingsDisplay();
            
            // Build toast message
            let message = `Room settings updated: ${data.maxPlayers} max players, ${data.mafiaCount} mafia`;
            const specialRoles = [];
            if (data.manipulatorEnabled) specialRoles.push('Manipulator');
            if (data.suicideBomberEnabled) specialRoles.push('Suicide Bomber');
            if (data.autoPoliceRoles && data.maxPlayers >= 10) specialRoles.push('Police Roles');
            
            if (specialRoles.length > 0) {
                message += `, Special: ${specialRoles.join(', ')}`;
            }
            
            if (data.enableBots) {
                message += `, Bots: ${data.botCount} max`;
            }
            
            this.showToast(message);
        });

        this.socket.on('suicideBomberActivation', (data) => {
            this.showSuicideBomberTargetSelection(data);
        });

        this.socket.on('suicideBomberResult', (data) => {
            // Play explosion sound for suicide bomber
            if (window.audioManager) {
                window.audioManager.onSuicideBomberActivation();
            }
            
            this.showToast(data.message, 'warning');
        });

        this.socket.on('investigationResult', (data) => {
            // Play investigation sound
            if (window.audioManager) {
                window.audioManager.onInvestigation();
            }
            
            const result = data.result === 'suspicious' ? 'SUSPICIOUS (Likely Mafia)' : 'INNOCENT';
            const message = `🔍 Investigation Result: ${data.targetName} appears ${result}`;
            
            // Show as both toast and alert for better visibility
            this.showToast(message, 'info');
            
            // Also show a modal with the investigation result
            this.showInvestigationResultModal(data.targetName, result);
        });

        this.socket.on('actionConfirmed', (data) => {
            if (data.action === 'kill') {
                this.showToast(`🔪 ${data.message}`, 'warning');
            } else {
                this.showToast(`✅ ${data.message}`, 'success');
            }
            // Action successful - modal already closed
        });

        this.socket.on('mafiaNotification', (data) => {
            this.showToast(`🔪 ${data.message}`, 'info');
        });

        this.socket.on('chatMessage', (data) => {
            this.addChatMessage(data.playerName, data.message, data.playerName === this.playerName);
        });

        this.socket.on('mafiaChatMessage', (data) => {
            this.addMafiaChatMessage(data.playerName, data.message, data.playerName === this.playerName);
        });

        this.socket.on('phaseEnded', (data) => {
            this.showToast(`⏰ Phase ended early: ${data.reason}`, 'info');
        });

        this.socket.on('roomLeft', (data) => {
            this.showToast(`✅ ${data.message}`, 'success');
            
            // Clear chat messages when leaving room
            this.clearChatMessages();
            
            // Reset client state
            this.currentRoomCode = null;
            this.playerId = null;
            this.playerName = null;
            this.playerRole = null;
            this.currentScreen = 'lobby';
            this.votingResults = null;
            this.currentVoteDetails = [];
            this.votingVisualizationData = null;
            this.mafiaTeammates = [];
            
            // Reset game state
            this.gameState = {
                phase: 'lobby',
                players: [],
                deadPlayers: [],
                dayCount: 0,
                timeRemaining: 0,
                gameStarted: false,
                roomCode: null,
                hostId: null,
                settings: {
                    maxPlayers: 10,
                    mafiaCount: 2
                }
            };
            
            // Show lobby selection screen
            this.hideRoomInfo();
            
            // Reset body classes
            document.body.classList.remove('in-game');
            document.body.className = '';
            
            // Navigate to main menu and hide any room UI
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('gameOverScreen').style.display = 'none';
            document.getElementById('lobbyScreen').style.display = 'none';
            const mainMenu = document.getElementById('mainMenuScreen');
            if (mainMenu) mainMenu.style.display = 'block';
            if (window.lobbyManager && typeof window.lobbyManager.showMainMenu === 'function') {
                window.lobbyManager.showMainMenu();
            }
        });

        this.socket.on('gameStarting', (data) => {
            this.showGameStartNotification(data);
            // Comic intro removed - game flows directly to game screen
        });

        // Police chat inbound
        this.socket.on('policeChatMessage', (data) => {
            this.addPoliceChatMessage(data.playerName, data.message, data.playerName === this.playerName);
        });

        // Inform detective/police of team presence (names but hidden colors)
        this.socket.on('policeTeamInfo', (data) => {
            const names = (data?.members || []).map(m => m.name).join(', ');
            if (names) this.showToast(`🚔 Police present: ${names} (colors hidden)`, 'info');
        });

        // Prompt gray police to choose alignment
        this.socket.on('policeAlignmentChoice', () => {
            this.showPoliceAlignmentChoice();
        });
    }

    showRoomInfo() {
        // Switch to lobby screen
        if (window.lobbyManager) {
            window.lobbyManager.showScreen('lobbyScreen');
        }
        
        document.getElementById('roomSelection').style.display = 'none';
        document.getElementById('roomInfo').style.display = 'block';
        document.getElementById('currentRoomCode').textContent = this.currentRoomCode;
        document.getElementById('roomCodeDisplay').textContent = `Room: ${this.currentRoomCode}`;
        document.getElementById('roomCodeDisplay').style.display = 'inline';
        
        // Update lobby name if available
        if (this.currentLobbyInfo && this.currentLobbyInfo.lobbyName) {
            document.getElementById('currentLobbyName').textContent = this.currentLobbyInfo.lobbyName;
        } else {
            // Fallback to room code if no lobby name available
            document.getElementById('currentLobbyName').textContent = `Room ${this.currentRoomCode}`;
        }
        
        this.updateWinStats();
        
        // Hide canvas in lobby
        const canvas = document.getElementById('gameCanvas');
        if (canvas) canvas.style.display = 'none';
    }

    updateWinStats() {
        const winStats = this.gameState.winStats || { mafiaWins: 0, civilianWins: 0, totalGames: 0 };
        
        const mafiaElement = document.getElementById('mafiaWinCount');
        const civilianElement = document.getElementById('civilianWinCount');
        const totalElement = document.getElementById('totalGameCount');
        
        if (mafiaElement) mafiaElement.textContent = winStats.mafiaWins;
        if (civilianElement) civilianElement.textContent = winStats.civilianWins;
        if (totalElement) totalElement.textContent = winStats.totalGames;
        
        console.log('Win stats updated:', winStats);
    }

    hideRoomInfo() {
        document.getElementById('roomSelection').style.display = 'block';
        document.getElementById('roomInfo').style.display = 'none';
        document.getElementById('roomCodeDisplay').style.display = 'none';
        
        // Clear inputs
        document.getElementById('createPlayerNameInput').value = '';
        document.getElementById('joinPlayerNameInput').value = '';
        document.getElementById('roomCodeInput').value = '';
    }

    startGame() {
        // Clear any previous game over information
        this.gameOverInfo = null;
        
        // Reset player colors for the new game to ensure uniqueness
        this.resetPlayerColors();
        
        // Play button click sound
        if (window.audioManager) {
            window.audioManager.onButtonClick();
        }
        
        if (this.currentRoomCode) {
            this.socket.emit('startGame', this.currentRoomCode);
            
            // Play game start sound and begin lobby music
            if (window.audioManager) {
                window.audioManager.onGameStart();
            }
        }
    }

    playAgain() {
        console.log('Play Again clicked', { roomCode: this.currentRoomCode, isHost: this.isHost() });
        
        if (this.currentRoomCode && this.isHost()) {
            // Show loading state
            const playAgainBtn = document.getElementById('resetGameButton');
            if (playAgainBtn) {
                playAgainBtn.textContent = '🔄 Starting New Game...';
                playAgainBtn.disabled = true;
            }
            
            this.showToast('🎮 Starting a new game!', 'info');
            
            // Use a more direct approach - first return to lobby, then start game
            console.log('Play Again: First returning to lobby...');
            
            // Step 1: Return to lobby state (but keep everyone in room)
            this.socket.emit('resetGame', this.currentRoomCode);
            
            // Step 2: After a brief delay, start a new game
            setTimeout(() => {
                console.log('Play Again: Now starting new game...');
                
                // Make sure we have the minimum players to start
                if (this.gameState.playerCount >= 4) {
                    this.socket.emit('startGame', this.currentRoomCode);
                } else {
                    this.showToast('❌ Need at least 4 players to start a new game!', 'error');
                    const btn = document.getElementById('resetGameButton');
                    if (btn) {
                        btn.textContent = '🎮 Play Again';
                        btn.disabled = false;
                    }
                }
            }, 1500);
            
        } else {
            console.log('Play Again failed:', { hasRoomCode: !!this.currentRoomCode, isHost: this.isHost() });
            this.showToast('❌ Only the host can start a new game!', 'error');
        }
    }

    resetGame() {
        if (this.currentRoomCode && this.isHost()) {
            this.socket.emit('resetGame', this.currentRoomCode);
        }
    }

    closeGame() {
        if (!this.isHost()) {
            this.showToast('❌ Only the host can close the game!', 'error');
            return;
        }

        // Show confirmation dialog
        const confirmClose = confirm(
            '⚠️ Are you sure you want to close the game?\n\n' +
            'This will end the current game and return everyone to the lobby.\n' +
            'This action cannot be undone.'
        );

        if (confirmClose) {
            console.log('Host closing game:', this.currentRoomCode);
            
            // Disable the close button temporarily
            const closeBtn = document.getElementById('closeGameBtn');
            if (closeBtn) {
                closeBtn.disabled = true;
                closeBtn.textContent = '🔄';
                closeBtn.title = 'Closing game...';
            }
            
            this.showToast('🛑 Host is closing the game...', 'info');
            
            // Emit close game event to server
            this.socket.emit('closeGame', this.currentRoomCode);
            
            // Fallback: use resetGame if server doesn't handle closeGame
            setTimeout(() => {
                if (this.currentScreen !== 'lobby') {
                    console.log('CloseGame fallback: using resetGame');
                    this.socket.emit('resetGame', this.currentRoomCode);
                }
                
                // Re-enable button
                if (closeBtn) {
                    closeBtn.disabled = false;
                    closeBtn.textContent = '❌';
                    closeBtn.title = 'Close Game (Host Only)';
                }
            }, 2000);
        }
    }

    updateRoomSettings(maxPlayers, mafiaCount, suicideBomberEnabled, manipulatorEnabled, autoPoliceRoles, enableBots, botCount) {
        if (this.currentRoomCode) {
            this.socket.emit('updateRoomSettings', {
                roomCode: this.currentRoomCode,
                maxPlayers: parseInt(maxPlayers),
                mafiaCount: parseInt(mafiaCount),
                suicideBomberEnabled: suicideBomberEnabled,
                manipulatorEnabled: manipulatorEnabled,
                autoPoliceRoles: autoPoliceRoles,
                enableBots: enableBots,
                botCount: parseInt(botCount)
            });
        }
    }

    handleUpdateSettings() {
        const maxPlayersInput = document.getElementById('maxPlayersInput');
        const mafiaCountInput = document.getElementById('mafiaCountInput');
        const suicideBomberToggle = document.getElementById('suicideBomberToggle');
        const manipulatorToggle = document.getElementById('manipulatorToggle');
        const autoPoliceToggle = document.getElementById('autoPoliceToggle');
        const botToggle = document.getElementById('botToggle');
        const botCountLobby = document.getElementById('botCountLobby');
        
        const maxPlayers = parseInt(maxPlayersInput.value);
        const mafiaCount = parseInt(mafiaCountInput.value);
        const suicideBomberEnabled = suicideBomberToggle?.checked || false;
        const manipulatorEnabled = manipulatorToggle?.checked || false;
        const autoPoliceRoles = autoPoliceToggle?.checked || true;
        const enableBots = botToggle?.checked || false;
        const botCount = botCountLobby ? parseInt(botCountLobby.value) : 1;
        
        if (maxPlayers < 4 || maxPlayers > 20) {
            this.showToast('Max players must be between 4 and 20', 'error');
            return;
        }
        
        const maxAllowedMafia = this.getMaxMafiaCount(maxPlayers);
        if (mafiaCount < 1 || mafiaCount > maxAllowedMafia) {
            this.showToast(`Mafia count must be between 1 and ${maxAllowedMafia} for ${maxPlayers} players`, 'error');
            return;
        }
        
        if (suicideBomberEnabled && mafiaCount < 3) {
            this.showToast('Suicide Bomber requires at least 3 Mafia members', 'error');
            return;
        }
        
        this.updateRoomSettings(maxPlayers, mafiaCount, suicideBomberEnabled, manipulatorEnabled, autoPoliceRoles, enableBots, botCount);
    }

    updateGameState(state) {
        this.gameState = state;
        
        // Store all player names for dead player lookup
        if (!this.allPlayerNames) {
            this.allPlayerNames = {};
        }
        
        // Store alive player names
        if (state.alivePlayers) {
            state.alivePlayers.forEach(player => {
                this.allPlayerNames[player.id] = player.name;
            });
        }
        
        // Store dead player names
        if (state.deadPlayers) {
            state.deadPlayers.forEach(player => {
                this.allPlayerNames[player.id] = player.name;
            });
        }
        
        this.updateUI();
        this.updateWinStats();
        
        if (state.gameStarted && this.currentScreen === 'lobby') {
            this.switchToGameScreen();
        }
    }

    updateUI() {
        // Update phase indicator
        const phaseIndicator = document.getElementById('phaseIndicator');
        if (phaseIndicator) {
            phaseIndicator.textContent = this.gameState.phase;
            phaseIndicator.className = `phase-indicator ${this.gameState.phase}`;
        }

        // Update timer with visual urgency
        const timer = document.getElementById('timer');
        if (timer) {
            if (this.gameState.timeRemaining > 0) {
                const minutes = Math.floor(this.gameState.timeRemaining / 60);
                const seconds = this.gameState.timeRemaining % 60;
                timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Add urgency styling for last 30 seconds
                if (this.gameState.timeRemaining <= 30) {
                    timer.classList.add('urgent');
                } else {
                    timer.classList.remove('urgent');
                }
            } else {
                timer.textContent = '--:--';
                timer.classList.remove('urgent');
            }
        }

        // Update day counter
        const dayCounter = document.getElementById('dayCounter');
        if (dayCounter) {
            if (this.gameState.dayCount > 0) {
                dayCounter.textContent = `Day ${this.gameState.dayCount}`;
            } else {
                dayCounter.textContent = 'Day 0';
            }
        }

        // Update room code displays
        const roomCodeDisplays = document.querySelectorAll('#roomCodeDisplay');
        roomCodeDisplays.forEach(display => {
            if (this.currentRoomCode) {
                display.textContent = this.currentRoomCode;
            }
        });

        // Update compact mobile lobby bar
        const mobileBar = document.getElementById('mobileLobbyBar');
        if (mobileBar) {
            const playerCount = this.gameState.playerCount || (this.gameState.players ? this.gameState.players.length : 0) || 0;
            const maxPlayers = this.gameState.settings?.maxPlayers || 10;
            if (this.currentScreen === 'lobby') {
                mobileBar.style.display = 'flex';
                mobileBar.textContent = `Room ${this.currentRoomCode || ''} · ${playerCount}/${maxPlayers} players`;
            } else {
                mobileBar.style.display = 'none';
            }
        }

        // Update role display
        this.updateRoleDisplay();

        // Update body class for phase-specific styling
        document.body.className = `${this.gameState.phase}-phase`;

        // Update player lists
        this.updatePlayerLists();

        // Update start game button visibility (only for host with human players)
        const startButton = document.getElementById('startGameButton');
        const humanPlayerCount = this.gameState.players ? 
            this.gameState.players.filter(p => !p.isBot).length : 0;
        
        if (startButton && this.gameState.playerCount >= 4 && this.isHost() && humanPlayerCount > 0) {
            startButton.style.display = 'block';
        } else if (startButton) {
            startButton.style.display = 'none';
        }

        // Update close game button visibility (only for host during game)
        const closeButton = document.getElementById('closeGameBtn');
        if (closeButton) {
            if (this.isHost() && this.gameState.gameStarted && this.currentScreen === 'game') {
                closeButton.style.display = 'inline-block';
            } else {
                closeButton.style.display = 'none';
            }
        }

        // Update minimum players text
        const minPlayersText = document.getElementById('min-players-text') || 
                               document.querySelector('.min-players-text');
        if (minPlayersText) {
            const humanPlayerCount = this.gameState.players ? this.gameState.players.filter(p => !p.isBot).length : 0;
            if (humanPlayerCount === 0 && this.gameState.playerCount > 0) {
                minPlayersText.textContent = 'At least 1 human player required to start';
                minPlayersText.style.color = '#ff6b6b';
            } else if (this.gameState.playerCount < 4) {
                minPlayersText.textContent = 'Minimum 4 players required to start';
                minPlayersText.style.color = '#ffa726';
            } else {
                minPlayersText.textContent = 'Ready to start!';
                minPlayersText.style.color = '#4caf50';
            }
        }

        // Update player count in lobby
        const playerCountSpan = document.getElementById('playerCount');
        if (playerCountSpan) {
            playerCountSpan.textContent = `${this.gameState.playerCount}/${this.gameState.settings.maxPlayers}`;
        }

        // Update room settings display
        this.updateRoomSettingsDisplay();

        // Mobile compact settings: show for host on mobile and bind Apply
        const mobileSettings = document.getElementById('mobileLobbySettings');
        if (mobileSettings) {
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile && this.isHost() && this.currentScreen === 'lobby') {
                mobileSettings.classList.add('show');
                const mp = document.getElementById('maxPlayersMobile');
                const mc = document.getElementById('mafiaCountMobile');
                const eb = document.getElementById('enableBotsMobile');
                const bc = document.getElementById('botCountMobile');
                if (mp) mp.value = this.gameState.settings.maxPlayers;
                if (mc) mc.value = this.gameState.settings.mafiaCount;
                if (eb) eb.checked = !!this.gameState.settings.enableBots;
                if (bc) bc.value = this.gameState.settings.botCount || 0;
                const applyBtn = document.getElementById('applyMobileSettingsBtn');
                if (applyBtn && !applyBtn._bound) {
                    applyBtn._bound = true;
                    applyBtn.addEventListener('click', () => {
                        const maxPlayers = parseInt(mp.value);
                        const mafiaCount = parseInt(mc.value);
                        const enableBots = !!eb.checked;
                        const botCount = parseInt(bc.value);
                        this.updateRoomSettings(maxPlayers, mafiaCount, this.gameState.settings.suicideBomberEnabled, this.gameState.settings.manipulatorEnabled, this.gameState.settings.autoPoliceRoles, enableBots, botCount);
                    });
                }
                // Update compact role preview
                const mrp = document.getElementById('mobileRolePreview');
                if (mrp) {
                    mrp.textContent = `Preview: ${this.gameState.settings.mafiaCount} Mafia, Detective, Doctor, Civilians`; // simple summary
                }
            } else {
                mobileSettings.classList.remove('show');
            }
        }

        // Update mobile phase bar
        this.updateMobilePhaseBar();
    }

    updatePlayerLists() {
        // Update lobby player list
        const lobbyList = document.getElementById('lobbyPlayerList');
        console.log('updatePlayerLists called. gameState.players:', this.gameState.players, 'playerCount:', this.gameState.playerCount); // Debug log
        
        if (lobbyList && this.gameState.players) {
            lobbyList.innerHTML = '';
            this.gameState.players.forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.className = `player-item ${player.alive ? 'alive' : 'dead'}`;
                
                // Add special styling for current player and host
                if (player.id === this.playerId) {
                    playerDiv.classList.add('current-player');
                }
                if (player.id === this.gameState.hostId) {
                    playerDiv.classList.add('host-player');
                }
                
                let playerText = player.name;
                if (player.id === this.gameState.hostId) {
                    playerText += ' 👑';
                }
                if (player.id === this.playerId) {
                    playerText += ' (You)';
                }
                
                playerDiv.textContent = playerText;
                // Attach metadata for delegation
                playerDiv.setAttribute('data-id', player.id);
                if (player.userId) playerDiv.setAttribute('data-user-id', player.userId);
                playerDiv.setAttribute('data-name', player.name);
                if (player.isBot) playerDiv.setAttribute('data-bot', '1');
                
                if (player.alive) {
                    playerDiv.style.cursor = 'pointer';
                    playerDiv.setAttribute('role', 'button');
                    playerDiv.tabIndex = 0;
                    playerDiv.title = player.isBot ? 'Bot' : 'View profile';
                } else {
                    playerDiv.style.cursor = 'default';
                    playerDiv.title = '';
                    playerDiv.removeAttribute('role');
                    playerDiv.tabIndex = -1;
                }
                
                lobbyList.appendChild(playerDiv);
            });
            
            // Event delegation (bind once)
            if (!lobbyList._profileClickBound) {
                lobbyList._profileClickBound = true;
                lobbyList.addEventListener('click', (ev) => {
                    const item = ev.target.closest('.player-item');
                    if (!item || !lobbyList.contains(item)) return;
                    if (!item.classList.contains('alive')) return;
                    const isBot = item.getAttribute('data-bot') === '1';
                    if (isBot) { this.showToast('🤖 This is a bot and has no identity.', 'info'); return; }
                    const userId = item.getAttribute('data-user-id');
                    const name = item.getAttribute('data-name') || item.textContent;
                    if (!userId) { this.showToast('Profile unavailable for this player', 'error'); return; }
                    this.openPlayerProfile({ id: item.getAttribute('data-id'), userId, name });
                });
                // Keyboard accessibility (Enter/Space)
                lobbyList.addEventListener('keydown', (ev) => {
                    if (ev.key !== 'Enter' && ev.key !== ' ') return;
                    const item = ev.target.closest('.player-item');
                    if (!item || !lobbyList.contains(item)) return;
                    if (!item.classList.contains('alive')) return;
                    ev.preventDefault();
                    const isBot = item.getAttribute('data-bot') === '1';
                    if (isBot) { this.showToast('🤖 This is a bot and has no identity.', 'info'); return; }
                    const userId = item.getAttribute('data-user-id');
                    const name = item.getAttribute('data-name') || item.textContent;
                    if (!userId) { this.showToast('Profile unavailable for this player', 'error'); return; }
                    this.openPlayerProfile({ id: item.getAttribute('data-id'), userId, name });
                });
            }
        } else {
            console.log('updatePlayerLists: lobbyList or gameState.players not available'); // Debug log
        }

        // Canvas will handle player rendering now
        // No need for updatePlayerTable anymore
    }

    updatePlayerTable() {
        const playerSeats = document.getElementById('playerSeats');
        const phaseInstructions = document.getElementById('phaseInstructions');
        const instructionText = document.getElementById('instructionText');
        
        if (!playerSeats) return;
        
        playerSeats.innerHTML = '';
        
        // Update phase instructions
        if (phaseInstructions && instructionText) {
            let instruction = '';
            let showInstructions = false;
            
            if (this.gameState.phase === 'day' && !this.isDead()) {
                instruction = '💬 Day Phase: Click on players around the table to vote for elimination';
                showInstructions = true;
            } else if (this.gameState.phase === 'night' && !this.isDead()) {
                if (this.playerRole === 'mafia') {
                    instruction = '🔪 Night Phase: Click on players to eliminate them';
                    showInstructions = true;
                } else if (this.playerRole === 'detective') {
                    instruction = '🔍 Night Phase: Click on players to investigate them';
                    showInstructions = true;
                } else if (this.playerRole === 'doctor') {
                    instruction = '💚 Night Phase: Click on players to protect them (including yourself!)';
                    showInstructions = true;
                } else {
                    instruction = '😴 Night Phase: Wait for other players to complete their actions';
                    showInstructions = true;
                }
            }
            
            instructionText.textContent = instruction;
            phaseInstructions.style.display = showInstructions ? 'block' : 'none';
        }
        
        // Combine alive and dead players
        const allPlayers = [];
        if (this.gameState.alivePlayers) {
            allPlayers.push(...this.gameState.alivePlayers.map(p => ({...p, alive: true})));
        }
        if (this.gameState.deadPlayers) {
            allPlayers.push(...this.gameState.deadPlayers.map(p => ({...p, alive: false})));
        }
        
        // Position players around the circular table
        this.positionPlayersAroundTable(allPlayers, playerSeats);
        
        // Update table atmosphere based on phase
        this.updateTableAtmosphere();
    }

    positionPlayersAroundTable(players, container) {
        const totalPlayers = players.length;
        if (totalPlayers === 0) return;
        
        // Table radius (distance from center to player seats)
        const tableRadius = 180;
        const centerX = 200; // Half of container width (400px)
        const centerY = 200; // Half of container height (400px)
        
        players.forEach((player, index) => {
            // Calculate angle for this player position
            const angle = (index / totalPlayers) * 2 * Math.PI - Math.PI / 2; // Start from top
            
            // Calculate position
            const x = centerX + tableRadius * Math.cos(angle) - 30; // -30 to center the 60px seat
            const y = centerY + tableRadius * Math.sin(angle) - 30; // -30 to center the 60px seat
            
            // Create player seat
            const seat = document.createElement('div');
            seat.className = `player-seat ${player.alive ? 'alive' : 'dead'}`;
            if (player.id === this.playerId) {
                seat.classList.add('current-player');
            }
            
            // Check if player has available actions
            if (this.hasAvailableAction(player)) {
                seat.classList.add('action-available');
            }
            
            seat.style.left = `${x}px`;
            seat.style.top = `${y}px`;
            seat.onclick = () => this.handlePlayerClick(player);
            
            // Create player avatar
            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            
            // Player name
            const name = document.createElement('div');
            name.className = 'player-name';
            if (!player.alive) {
                name.textContent = 'KILLED';
            } else if (player.id === this.playerId) {
                name.textContent = 'You';
            } else {
                name.textContent = player.name;
            }
            avatar.appendChild(name);
            
            // Status icon (only show red cross for dead players)
            if (!player.alive) {
                const statusIcon = document.createElement('div');
                statusIcon.className = 'player-status-icon dead';
                statusIcon.textContent = '✗';
                avatar.appendChild(statusIcon);
            }
            
            seat.appendChild(avatar);
            container.appendChild(seat);
        });
    }

    hasAvailableAction(targetPlayer) {
        if (this.isDead()) return false;
        
        // Day phase voting
        if (this.gameState.phase === 'day' && targetPlayer.alive && targetPlayer.id !== this.playerId) {
            return true;
        }
        
        // Night phase actions
        if (this.gameState.phase === 'night' && targetPlayer.alive) {
            if (this.playerRole === 'mafia' && !this.mafiaTeammates.some(mate => mate.id === targetPlayer.id) && targetPlayer.id !== this.playerId) {
                return true;
            } else if (this.playerRole === 'detective' && targetPlayer.id !== this.playerId) {
                return true;
            } else if (this.playerRole === 'doctor') {
                // Doctor can protect anyone including themselves
                return true;
            }
        }
        
        return false;
    }

    updateTableAtmosphere() {
        const tableLogo = document.querySelector('.table-logo');
        const tableText = document.querySelector('.table-text');
        const tablePhase = document.getElementById('tablePhase');
        const tableTimer = document.getElementById('tableTimer');
        
        if (!tableLogo || !tableText) return;
        
        // Update center symbol and text based on game phase
        if (this.gameState.phase === 'day') {
            tableLogo.textContent = '☀️';
            tableText.textContent = 'Day Phase';
            tableLogo.style.color = '#ffd700';
            if (tablePhase) tablePhase.textContent = 'Day';
        } else if (this.gameState.phase === 'night') {
            tableLogo.textContent = '🌙';
            tableText.textContent = 'Night Phase';
            tableLogo.style.color = '#4a90e2';
            if (tablePhase) tablePhase.textContent = 'Night';
        } else {
            tableLogo.textContent = '🏛️';
            tableText.textContent = 'Velmora';
            tableLogo.style.color = '#ffd700';
            if (tablePhase) tablePhase.textContent = 'Lobby';
        }
        
        // Update table timer
        if (tableTimer) {
            const timer = document.getElementById('timer');
            if (timer) {
                tableTimer.textContent = timer.textContent;
            }
        }
    }

    // Removed addPlayerActions function - actions are now shown through visual indicators on the round table

    copyRoomCode() {
        if (!this.currentRoomCode) {
            this.showToast('No room code to copy', 'error');
            return;
        }
        
        // Copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(this.currentRoomCode).then(() => {
                this.showCopySuccess();
            }).catch(() => {
                this.fallbackCopyTextToClipboard(this.currentRoomCode);
            });
        } else {
            this.fallbackCopyTextToClipboard(this.currentRoomCode);
        }
    }
    
    fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.position = 'fixed';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                this.showCopySuccess();
            } else {
                this.showToast('Failed to copy room code', 'error');
            }
        } catch (err) {
            this.showToast('Failed to copy room code', 'error');
        }
        
        document.body.removeChild(textArea);
    }
    
    showCopySuccess() {
        const copyBtn = document.getElementById('copyCodeBtn');
        if (copyBtn) {
            // Visual feedback on button
            copyBtn.classList.add('copied');
            copyBtn.textContent = '✓';
            
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.textContent = '📋';
            }, 2000);
        }
        
        this.showToast(`Room code ${this.currentRoomCode} copied to clipboard!`, 'success');
    }



    updateActionButtons() {
        // Action buttons are now integrated into the player table
        // This function is kept for compatibility but no longer used
        // All actions are handled directly in the player table
    }

    // Modal functions removed - actions are now integrated into the player table

    		handlePlayerClick(targetPlayer) {
			// In lobby (waiting) state, ignore canvas clicks; profiles open via the lobby list only
			const inLobby = this.gameState && (this.gameState.phase === 'lobby' || this.gameState.gameStarted === false);
			if (inLobby) {
				return;
			}
			// Don't show actions if current player is dead
			if (this.isDead()) return;
			
			// Create action modal based on current phase and role
			this.showPlayerActionModal(targetPlayer);
		}

    openPlayerProfile(targetPlayer) {
        if (!targetPlayer) return;
        // If there is a profile modal in auth manager, use it
        if (window.authManager && typeof window.authManager.showProfileModal === 'function') {
            window.authManager.showProfileModal(targetPlayer.userId || null, targetPlayer.name);
            return;
        }
        // Fallback: simple profile prompt
        const info = `Player: ${targetPlayer.name}\n${targetPlayer.userId ? 'User ID: ' + targetPlayer.userId : 'Guest player'}`;
        alert(info);
    }

    showPlayerActionModal(targetPlayer) {
        // Remove any existing action modal
        const existingModal = document.getElementById('playerActionModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create new modal
        const modal = document.createElement('div');
        modal.id = 'playerActionModal';
        modal.className = 'modal';
        modal.style.display = 'flex';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        const title = document.createElement('h3');
        title.textContent = `Actions for ${targetPlayer.name}`;
        modalContent.appendChild(title);
        
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'player-actions-container';
        
        // Add available actions based on phase and role
        let hasActions = false;
        
        // Day phase voting
        if (this.gameState.phase === 'day' && targetPlayer.alive && targetPlayer.id !== this.playerId) {
            const voteBtn = document.createElement('button');
            voteBtn.className = 'action-option-btn vote-btn';
            voteBtn.textContent = '🗳️ Vote to Eliminate';
            voteBtn.onclick = () => {
                this.vote(targetPlayer.id);
                this.closePlayerActionModal();
            };
            actionsContainer.appendChild(voteBtn);
            hasActions = true;
        }
        
        // Night phase actions
        if (this.gameState.phase === 'night' && targetPlayer.alive) {
            if (this.playerRole === 'mafia' && !this.mafiaTeammates.some(mate => mate.id === targetPlayer.id) && targetPlayer.id !== this.playerId) {
                const killBtn = document.createElement('button');
                killBtn.className = 'action-option-btn kill-btn';
                killBtn.textContent = '🔪 Eliminate Player';
                killBtn.onclick = () => {
                    this.nightAction('kill', targetPlayer.id);
                    this.closePlayerActionModal();
                };
                actionsContainer.appendChild(killBtn);
                hasActions = true;
            }
            
            if (this.playerRole === 'detective' && targetPlayer.id !== this.playerId) {
                const investigateBtn = document.createElement('button');
                investigateBtn.className = 'action-option-btn investigate-btn';
                investigateBtn.textContent = '🔍 Investigate Player';
                investigateBtn.onclick = () => {
                    this.nightAction('investigate', targetPlayer.id);
                    this.closePlayerActionModal();
                };
                actionsContainer.appendChild(investigateBtn);
                hasActions = true;
            }
            
            if (this.playerRole === 'doctor') {
                // Doctor can protect anyone including themselves
                const protectBtn = document.createElement('button');
                protectBtn.className = 'action-option-btn protect-btn';
                protectBtn.textContent = targetPlayer.id === this.playerId ? '💚 Protect Yourself' : '💚 Protect Player';
                protectBtn.onclick = () => {
                    this.nightAction('protect', targetPlayer.id);
                    this.closePlayerActionModal();
                };
                actionsContainer.appendChild(protectBtn);
                hasActions = true;
            }
        }
        
        if (!hasActions) {
            const noActionsText = document.createElement('p');
            noActionsText.textContent = 'No actions available for this player.';
            noActionsText.style.color = '#a0aec0';
            noActionsText.style.fontStyle = 'italic';
            actionsContainer.appendChild(noActionsText);
        }
        
        modalContent.appendChild(actionsContainer);
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Cancel';
        closeBtn.className = 'cancel-btn';
        closeBtn.onclick = () => this.closePlayerActionModal();
        modalContent.appendChild(closeBtn);
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Close modal when clicking outside
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.closePlayerActionModal();
            }
        };
    }

    closePlayerActionModal() {
        const modal = document.getElementById('playerActionModal');
        if (modal) {
            modal.remove();
        }
    }

    vote(targetId) {
        // Play vote click sound
        if (window.audioManager) {
            window.audioManager.onVoteClick();
        }
        
        this.socket.emit('vote', { 
            roomCode: this.currentRoomCode, 
            targetPlayerId: targetId 
        });
        
        // Update table to show vote was cast
        this.updatePlayerTable();
    }

    nightAction(action, targetId) {
        this.socket.emit('nightAction', { 
            roomCode: this.currentRoomCode, 
            action, 
            target: targetId 
        });
        
        // Update table to show action was taken
        this.updatePlayerTable();
    }

    showInvestigationResultModal(targetName, result) {
        // Create investigation result modal
        const modal = document.createElement('div');
        modal.className = 'modal investigation-result-modal';
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        modal.style.zIndex = '1000';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';

        const content = document.createElement('div');
        content.style.backgroundColor = '#1a1a1a';
        content.style.padding = '30px';
        content.style.borderRadius = '15px';
        content.style.border = '2px solid #4ecdc4';
        content.style.textAlign = 'center';
        content.style.maxWidth = '400px';
        content.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';

        const title = document.createElement('h2');
        title.textContent = '🔍 Investigation Complete';
        title.style.color = '#4ecdc4';
        title.style.marginBottom = '20px';
        title.style.fontSize = '24px';

        const resultText = document.createElement('p');
        resultText.innerHTML = `<strong>${targetName}</strong> appears to be:<br/><span style="font-size: 20px; color: ${result === 'INNOCENT' ? '#4ecdc4' : '#e74c3c'};">${result}</span>`;
        resultText.style.color = '#ffffff';
        resultText.style.marginBottom = '25px';
        resultText.style.fontSize = '16px';
        resultText.style.lineHeight = '1.5';

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Got it!';
        closeButton.style.backgroundColor = '#4ecdc4';
        closeButton.style.color = '#1a1a1a';
        closeButton.style.border = 'none';
        closeButton.style.padding = '10px 20px';
        closeButton.style.borderRadius = '5px';
        closeButton.style.fontSize = '16px';
        closeButton.style.fontWeight = 'bold';
        closeButton.style.cursor = 'pointer';

        closeButton.onclick = () => {
            document.body.removeChild(modal);
        };

        // Auto-close after 10 seconds
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        }, 10000);

        content.appendChild(title);
        content.appendChild(resultText);
        content.appendChild(closeButton);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    showSuicideBomberTargetSelection(data) {
        const modal = document.getElementById('suicideBomberModal');
        const message = document.getElementById('suicideBomberMessage');
        const targetsContainer = document.getElementById('suicideBomberTargets');
        const confirmBtn = document.getElementById('confirmSuicideBomberTargets');
        const skipBtn = document.getElementById('skipSuicideBomberTargets');
        const timerDisplay = document.getElementById('suicideBomberTimer');
        
        if (!modal || !targetsContainer) return;
        
        // Set message
        if (message) {
            message.textContent = data.message;
        }
        
        // Clear and populate targets
        targetsContainer.innerHTML = '';
        const selectedTargets = new Set();
        
        data.availableTargets.forEach(target => {
            const targetBtn = document.createElement('button');
            targetBtn.className = 'target-btn';
            targetBtn.textContent = target.name;
            targetBtn.dataset.targetId = target.id;
            
            targetBtn.addEventListener('click', () => {
                if (selectedTargets.has(target.id)) {
                    // Deselect
                    selectedTargets.delete(target.id);
                    targetBtn.classList.remove('selected');
                } else if (selectedTargets.size < 2) {
                    // Select (max 2)
                    selectedTargets.add(target.id);
                    targetBtn.classList.add('selected');
                } else {
                    this.showToast('You can only select up to 2 targets!', 'warning');
                }
            });
            
            targetsContainer.appendChild(targetBtn);
        });
        
        // Setup timer countdown
        let timeLeft = 30;
        const countdown = setInterval(() => {
            timeLeft--;
            if (timerDisplay) {
                timerDisplay.textContent = `${timeLeft} seconds remaining`;
            }
            
            if (timeLeft <= 0) {
                clearInterval(countdown);
                // Auto-skip if time runs out
                this.sendSuicideBomberTargets([]);
                modal.style.display = 'none';
            }
        }, 1000);
        
        // Setup event handlers
        confirmBtn.onclick = () => {
            clearInterval(countdown);
            this.sendSuicideBomberTargets(Array.from(selectedTargets));
            modal.style.display = 'none';
        };
        
        skipBtn.onclick = () => {
            clearInterval(countdown);
            this.sendSuicideBomberTargets([]);
            modal.style.display = 'none';
        };
        
        // Show modal
        modal.style.display = 'flex';
        
        // Store countdown for cleanup
        this.suicideBomberCountdown = countdown;
    }

    sendSuicideBomberTargets(selectedTargets) {
        if (this.currentRoomCode) {
            this.socket.emit('suicideBomberTargets', {
                roomCode: this.currentRoomCode,
                selectedTargets: selectedTargets
            });
        }
        
        // Cleanup countdown if it exists
        if (this.suicideBomberCountdown) {
            clearInterval(this.suicideBomberCountdown);
            this.suicideBomberCountdown = null;
        }
    }

    switchToGameScreen() {
        this.currentScreen = 'game';
        document.getElementById('lobbyScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'grid';
        
        // Mark body as in-game for responsive CSS
        document.body.classList.add('in-game');
        
        // Ensure canvas is visible in game
        const canvas = document.getElementById('gameCanvas');
        if (canvas) canvas.style.display = 'block';
        
        // Clear any lingering game over information
        this.gameOverInfo = null;
        
        // Wait for layout to settle before resizing canvas
        setTimeout(() => {
            this.resizeCanvas();
        }, 100);
        
        // Update role display in game UI
        this.updateRoleDisplay();
        
        // Add a welcome message to chat
        setTimeout(() => {
            this.addChatMessage('System', 'Chat is ready! Type a message to communicate with other players.', false);
        }, 1000);
    }

    updateRoleDisplay() {
        const roleDisplay = document.getElementById('currentRoleDisplay');
        if (roleDisplay) {
            if (this.playerRole && this.gameState.gameStarted) {
                const roleEmojis = {
                    'mafia': '🔪',
                    'detective': '🔍', 
                    'civilian': '👥',
                    'doctor': '💚'
                };
                const emoji = roleEmojis[this.playerRole] || '🎭';
                const roleName = this.playerRole.charAt(0).toUpperCase() + this.playerRole.slice(1);
                roleDisplay.innerHTML = `${emoji} ${roleName}`;
                roleDisplay.className = `current-role role-${this.playerRole}`;
            } else if (this.gameState.phase === 'lobby' || !this.gameState.gameStarted) {
                roleDisplay.textContent = 'In Lobby';
                roleDisplay.className = 'current-role';
            } else {
                roleDisplay.textContent = 'Waiting...';
                roleDisplay.className = 'current-role';
            }
        }

        // Show/hide mafia chat for mafia players
        const mafiaChatPanel = document.getElementById('mafiaChatPanel');
        if (mafiaChatPanel) {
            if (this.playerRole === 'mafia') {
                mafiaChatPanel.style.display = 'block';
            } else {
                mafiaChatPanel.style.display = 'none';
            }
        }
        
        // Update room code display
        const roomCodeDisplay = document.getElementById('roomCodeDisplay');
        if (roomCodeDisplay && this.currentRoomCode) {
            roomCodeDisplay.textContent = this.currentRoomCode;
        }
        
        // Update phase display
        const phaseDisplay = document.getElementById('phaseDisplay');
        if (phaseDisplay && this.gameState.phase) {
            phaseDisplay.textContent = this.gameState.phase;
        }

        // Also refresh mobile bar when role changes
        this.updateMobilePhaseBar();

        // Show/hide police chat for detective and any police (white/black/gray)
        const policeChatPanel = document.getElementById('policeChatPanel');
        if (policeChatPanel) {
            if (this.playerRole === 'detective' || this.playerRole === 'white_police' || this.playerRole === 'black_police' || this.playerRole === 'gray_police') {
                policeChatPanel.style.display = 'block';
            } else {
                policeChatPanel.style.display = 'none';
            }
        }
    }

    showRoleInfo(role, description) {
        const roleInfo = document.getElementById('roleInfo');
        const roleSpan = document.getElementById('playerRole');
        const descSpan = document.getElementById('roleDescription');
        
        // Format role name with proper capitalization
        const roleName = role.charAt(0).toUpperCase() + role.slice(1);
        roleSpan.textContent = roleName;
        descSpan.textContent = ''; // Remove description display
        
        // Add role-specific styling
        roleInfo.className = `role-info role-${role}`;
        roleInfo.style.display = 'block';
        
        // Remove any existing button first
        const existingBtn = document.getElementById('roleConfirmButton');
        if (existingBtn) {
            existingBtn.remove();
        }
        
        // Create new dismiss button
        const dismissBtn = document.createElement('button');
        dismissBtn.id = 'roleConfirmButton';
        dismissBtn.textContent = 'I Understand My Role';
        dismissBtn.className = 'role-confirm-btn';
        dismissBtn.onclick = () => {
            console.log('Role confirm button clicked');
            this.confirmRole();
        };
        roleInfo.appendChild(dismissBtn);
        
        console.log('Role confirmation button created and attached');
        
        // Show dramatic role reveal toast
        const roleEmojis = {
            'mafia': '🔪',
            'detective': '🔍', 
            'civilian': '👥'
        };
        const emoji = roleEmojis[role] || '🎭';
        this.showToast(`🎭 You are ${emoji} ${roleName}! Read your role carefully.`, 'info');
        
        // Auto-hide after 8 seconds
        this.roleTimeout = setTimeout(() => {
            if (roleInfo.style.display !== 'none') {
                this.confirmRole();
            }
        }, 8000);
    }

    showGameStartNotification(data) {
        // Create or show game start overlay
        let startOverlay = document.getElementById('gameStartOverlay');
        if (!startOverlay) {
            startOverlay = document.createElement('div');
            startOverlay.id = 'gameStartOverlay';
            startOverlay.className = 'game-start-overlay';
            document.body.appendChild(startOverlay);
        }
        
        startOverlay.innerHTML = `
            <div class="game-start-content">
                <h2>🎮 Game Starting!</h2>
                <div class="game-start-details">
                    <div class="stat-item">
                        <span class="stat-number">${data.playerCount}</span>
                        <span class="stat-label">Players</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${data.mafiaCount}</span>
                        <span class="stat-label">Mafia</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${data.playerCount - data.mafiaCount}</span>
                        <span class="stat-label">Innocents</span>
                    </div>
                </div>
                <p class="start-message">The night begins... Roles are being assigned...</p>
                <div class="loading-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        
        startOverlay.style.display = 'flex';
        
        // Hide after 4 seconds (before roles are assigned)
        setTimeout(() => {
            startOverlay.style.display = 'none';
        }, 4000);
    }

    confirmRole() {
        console.log('confirmRole() called');
        const roleInfo = document.getElementById('roleInfo');
        
        if (roleInfo) {
            roleInfo.style.display = 'none';
            console.log('Role info hidden');
        }
        
        if (this.roleTimeout) {
            clearTimeout(this.roleTimeout);
            this.roleTimeout = null;
            console.log('Role timeout cleared');
        }
        
        // Remove the button
        const confirmBtn = document.getElementById('roleConfirmButton');
        if (confirmBtn) {
            confirmBtn.remove();
            console.log('Role confirm button removed');
        }
        
        this.showToast('✅ Role confirmed! Game is starting...', 'success');
    }

    handlePhaseChange(data) {
        // Show phase change message
        this.showToast(data.message, 'info');
        
        // Update background and styling based on phase
        document.body.className = `${data.phase}-phase`;
        
        // Ensure game screen is visible
        if (this.currentScreen !== 'game') {
            this.switchToGameScreen();
        }
        
        // Play phase-specific actions
        if (data.phase === 'day') {
            this.handleDayPhaseStart();
        } else if (data.phase === 'night') {
            this.handleNightPhaseStart();
        }
    }

    handleDayPhaseStart() {
        this.showToast('☀️ Day Phase: Time for discussion and voting!', 'info');
        
        // Hide role info during day
        const roleInfo = document.getElementById('roleInfo');
        if (roleInfo) {
            roleInfo.style.display = 'none';
        }
        
        // Show voting instructions after a brief delay
        setTimeout(() => {
            this.showToast('💭 Discuss, then cast your vote using the "Cast Vote" button', 'info');
        }, 2000);
    }

    handleNightPhaseStart() {
        this.showToast('🌙 Night Phase: Special roles, time to act!', 'info');
        
        // Additional guidance for first night (without showing role popup)
        if (this.playerRole && this.playerRole !== 'civilian') {
            if (this.gameState.dayCount === 0) {
                setTimeout(() => {
                    if (this.playerRole === 'mafia') {
                        this.showToast('🔪 First Night: Choose a player to eliminate. Then the day begins.', 'info');
                    } else if (this.playerRole === 'detective') {
                        this.showToast('🔍 First Night: Investigate a player to learn their role.', 'info');
                    }
                }, 2000);
            }
        } else {
            this.showToast('💤 You are a Civilian - Rest while others act during the night', 'info');
        }
    }

    updateVoteDisplay(data) {
        // Show real-time vote count updates with detailed voting information
        if (data.latestVote) {
            this.showToast(`🗳️ ${data.latestVote.voterName} voted for ${data.latestVote.targetName}`, 'vote');
        }
        
        // Display detailed voting breakdown if votes exist
        if (data.voteDetails && data.voteDetails.length > 0) {
            let voteBreakdown = '📊 Current Votes:\n';
            
            // Group votes by target
            const votesByTarget = new Map();
            data.voteDetails.forEach(vote => {
                if (!votesByTarget.has(vote.targetName)) {
                    votesByTarget.set(vote.targetName, []);
                }
                votesByTarget.get(vote.targetName).push(vote.voterName);
            });
            
            // Create readable breakdown
            const targetBreakdowns = [];
            for (const [targetName, voters] of votesByTarget) {
                targetBreakdowns.push(`${targetName}: ${voters.join(', ')} (${voters.length})`);
            }
            
            if (targetBreakdowns.length > 0) {
                // Show detailed breakdown in toast after a brief delay
                setTimeout(() => {
                    this.showToast(`📊 Detailed Votes: ${targetBreakdowns.join(' | ')}`, 'vote');
                }, 1000);
            }
        } else if (data.totalVotes > 0) {
            this.showToast(`Votes cast: ${data.totalVotes}/${data.alivePlayers}`, 'vote');
        }
        
        // Store vote details for canvas rendering
        this.currentVoteDetails = data.voteDetails || [];
        
        // Update canvas to show voting visualization
        this.updateVotingVisualization(data);
    }

    updateVotingVisualization(data) {
        // This method handles dynamic visual updates for voting
        // The actual visualization is handled in the canvas rendering methods
        // Force a canvas update to show new voting information
        if (this.currentScreen === 'game') {
            // Canvas will automatically update through the game loop
            // Store voting data for immediate access during rendering
            this.votingVisualizationData = {
                voteCounts: data.voteCounts || [],
                voteDetails: data.voteDetails || [],
                totalVotes: data.totalVotes || 0,
                alivePlayers: data.alivePlayers || 0
            };
        }
    }

    handleVotingResult(data) {
        if (data.type === 'elimination') {
            this.showToast(`🔻 ${data.eliminatedPlayer.name} was eliminated!`, 'error');
        } else if (data.type === 'suicideBomberDiscovered') {
            this.showToast(`💥 ${data.eliminatedPlayer.name} was discovered as a Suicide Bomber!`, 'warning');
        } else if (data.type === 'tie') {
            this.showToast('🤝 Voting ended in a tie - no elimination!', 'info');
        } else if (data.type === 'noVotes') {
            this.showToast('😴 No votes were cast - no elimination!', 'info');
        }
        
        // Show detailed voting breakdown
        if (data.voteCounts && data.voteCounts.length > 0) {
            const breakdown = data.voteCounts
                .map(vote => `${vote.playerName}: ${vote.votes} vote${vote.votes > 1 ? 's' : ''}`)
                .join(' | ');
            setTimeout(() => {
                this.showToast(`📊 Vote breakdown: ${breakdown}`, 'info');
            }, 2000);
        }
    }

    handleDetailedVotingResults(data) {
        console.log('Handling detailed voting results:', data);
        
        // Store voting results to display on canvas
        this.votingResults = data;
        
        // Show voting results for 10 seconds, then clear
        setTimeout(() => {
            this.votingResults = null;
        }, 10000);
        
        // Show summary in toast
        if (data.result) {
            if (data.result.type === 'elimination') {
                this.showToast(`🔻 ${data.result.eliminatedPlayer.name} eliminated with ${data.result.eliminatedPlayer.votes} vote(s). Check colored dots to see who voted for whom!`, 'info');
            } else {
                this.showToast(`🤝 No elimination. Check colored dots to see voting patterns!`, 'info');
            }
        }
    }

    getPlayerColor(playerId, playerName) {
        // Generate unique color for each player
        if (!this.playerColors.has(playerId)) {
            // Extended color palette with more distinct colors
            const colors = [
                '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
                '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
                '#F8C471', '#82E0AA', '#F1948A', '#D7BDE2', '#AED6F1',
                '#A9DFBF', '#F9E79F', '#D2B4DE', '#85C1E9', '#F8D7DA',
                '#D1ECF1', '#D4EDDA', '#FFF3CD', '#F8D7DA', '#E2E3E5',
                '#FFB3BA', '#BAFFB4', '#B3D9FF', '#FFFFB3', '#FFD1DC',
                '#E6E6FA', '#F0FFF0', '#FFF8DC', '#FFE4E1', '#F5F5DC'
            ];
            
            // Find first available color that hasn't been used
            let selectedColor = null;
            
            // Try colors in order until we find an unused one
            for (const color of colors) {
                if (!this.usedColors.has(color)) {
                    selectedColor = color;
                    break;
                }
            }
            
            // If all predefined colors are used, generate a new unique color
            if (!selectedColor) {
                selectedColor = this.generateUniqueColor();
            }
            
            // Mark color as used and assign to player
            this.usedColors.add(selectedColor);
            this.playerColors.set(playerId, selectedColor);
        }
        
        return this.playerColors.get(playerId);
    }

    generateUniqueColor() {
        // Generate a random bright color that's not already used
        let attempts = 0;
        let color;
        
        do {
            // Generate random RGB values ensuring bright, saturated colors
            const hue = Math.floor(Math.random() * 360);
            const saturation = 60 + Math.floor(Math.random() * 40); // 60-100%
            const lightness = 50 + Math.floor(Math.random() * 30);  // 50-80%
            
            color = this.hslToHex(hue, saturation, lightness);
            attempts++;
            
            // Prevent infinite loop - after 100 attempts, just use the color
            if (attempts > 100) break;
            
        } while (this.usedColors.has(color));
        
        return color;
    }

    hslToHex(h, s, l) {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    freePlayerColor(playerId) {
        // Free up a player's color when they leave
        if (this.playerColors.has(playerId)) {
            const color = this.playerColors.get(playerId);
            this.usedColors.delete(color);
            this.playerColors.delete(playerId);
        }
    }

    resetPlayerColors() {
        // Reset all player colors (useful for new games)
        this.playerColors.clear();
        this.usedColors.clear();
    }

    handlePlayerElimination(data) {
        // Use custom message if provided, otherwise use default format without revealing role
        const message = data.message || `${data.playerName} was eliminated!`;
        this.showToast(message, 'error');
    }

    handleGameOver(data) {
        console.log('Game Over:', data);
        this.gameState.gameStarted = false;
        this.gameState.gamePhase = 'ended';
        
        // Update win stats if provided
        if (data.winStats) {
            this.gameState.winStats = data.winStats;
            this.updateWinStats();
        }
        
        // Show the game over modal overlay (includes countdown and auto-return)
        this.showGameOverScreen(data.winner, data.message, data.survivors, data.winStats);
    }

    returnToLobby() {
        console.log('Return to Lobby clicked', { roomCode: this.currentRoomCode, currentScreen: this.currentScreen });
        
        if (this.currentRoomCode) {
            // Clear countdown timer when manually returning
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
            
            // Disable button to prevent multiple clicks
            const returnBtn = document.getElementById('returnToLobbyButton');
            if (returnBtn) {
                returnBtn.disabled = true;
                returnBtn.textContent = '🔄 Returning to Lobby...';
            }
            
            // Try server-side implementation first
            console.log('Emitting returnToLobby event...');
            this.socket.emit('returnToLobby', this.currentRoomCode);
            this.showToast('🏠 Returning everyone to lobby...', 'info');
            
            // Fallback: Use resetGame if server doesn't handle returnToLobby
            setTimeout(() => {
                // If we're still not in lobby after 2 seconds, use fallback
                if (this.currentScreen !== 'lobby') {
                    console.log('ReturnToLobby fallback: using resetGame');
                    this.showToast('🏠 Using fallback: resetting game...', 'info');
                    this.socket.emit('resetGame', this.currentRoomCode);
                }
                
                // Re-enable button
                if (returnBtn) {
                    returnBtn.disabled = false;
                    returnBtn.textContent = '🏠 Return Everyone to Lobby';
                }
            }, 2000);
        } else {
            console.log('Return to Lobby: no room code, doing local return');
            // If no room code, do local lobby return
            this.performLocalLobbyReturn();
        }
    }

    performLocalLobbyReturn() {
        this.currentScreen = 'lobby';
        this.playerRole = null;
        this.mafiaTeammates = [];
        this.gameOverInfo = null; // Clear game over information
        this.currentWinner = null; // Clear winner information
        
        // Clear countdown timer
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        
        // Clear chat messages when returning to lobby
        this.clearChatMessages();
        
        // Reset game state but keep room info and win stats
        this.gameState = {
            phase: 'lobby',
            players: this.gameState.players || [],
            deadPlayers: [],
            dayCount: 0,
            timeRemaining: 0,
            gameStarted: false,
            roomCode: this.currentRoomCode,
            hostId: this.gameState.hostId,
            settings: this.gameState.settings || {
                maxPlayers: 10,
                mafiaCount: 2
            },
            playerCount: this.gameState.players?.length || this.gameState.playerCount || 0,
            winStats: this.gameState.winStats || { mafiaWins: 0, civilianWins: 0, totalGames: 0 }
        };
        
        document.getElementById('gameScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('lobbyScreen').style.display = 'block';
        
        // Keep room info visible since we're staying in the room
        if (this.currentRoomCode) {
            this.showRoomInfo();
        }
        
        // Reset role display
        this.updateRoleDisplay();
        
        // Update win stats
        this.updateWinStats();
        
        document.body.classList.remove('in-game');
        document.body.className = '';
        this.updateUI();
    }

    sendChat() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (message) {
            // Send chat message to server
            this.socket.emit('chatMessage', {
                roomCode: this.currentRoomCode,
                message: message,
                playerName: this.playerName
            });
            chatInput.value = '';
        }
    }

    sendMafiaChat() {
        const mafiaInput = document.getElementById('mafiaInput');
        const message = mafiaInput.value.trim();
        
        if (message) {
            // Send mafia chat message to server
            this.socket.emit('mafiaChatMessage', {
                roomCode: this.currentRoomCode,
                message: message,
                playerName: this.playerName
            });
            mafiaInput.value = '';
        }
    }

    addChatMessage(playerName, message, isOwn = false) {
        const chatMessages = document.getElementById('chatMessages');
        
        if (!chatMessages) {
            console.error('chatMessages element not found!');
            return;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = isOwn ? 'chat-message own' : 'chat-message';
        
        // Add timestamp
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        messageDiv.innerHTML = `<span class="message-time">${time}</span> <strong>${playerName}:</strong> ${message}`;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addMafiaChatMessage(playerName, message, isOwn = false) {
        const mafiaMessages = document.getElementById('mafiaMessages');
        if (!mafiaMessages) return; // Mafia chat only visible to mafia
        
        const messageDiv = document.createElement('div');
        messageDiv.className = isOwn ? 'mafia-message own' : 'mafia-message';
        
        // Add timestamp
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        messageDiv.innerHTML = `<span class="message-time">${time}</span> <strong>🔪 ${playerName}:</strong> ${message}`;
        
        mafiaMessages.appendChild(messageDiv);
        mafiaMessages.scrollTop = mafiaMessages.scrollHeight;
    }

    getPlayerName(playerId) {
        // First check alive players
        const alivePlayer = this.gameState.alivePlayers.find(p => p.id === playerId);
        if (alivePlayer) return alivePlayer.name;
        
        // Then check if we have stored player names from when they were alive
        // If deadPlayers contains objects with names, use those
        if (this.gameState.deadPlayers && Array.isArray(this.gameState.deadPlayers)) {
            const deadPlayer = this.gameState.deadPlayers.find(p => p.id === playerId);
            if (deadPlayer && deadPlayer.name) return deadPlayer.name;
        }
        
        // Fallback to stored player names if available
        if (this.allPlayerNames && this.allPlayerNames[playerId]) {
            return this.allPlayerNames[playerId];
        }
        
        return 'Unknown Player';
    }

    isHost() {
        return this.playerId === this.gameState.hostId;
    }

    getMaxMafiaCount(playerCount) {
        if (playerCount >= 15 && playerCount <= 20) return 4;  // 15-20 players: max 4 mafia
        if (playerCount >= 7 && playerCount <= 14) return 3;   // 7-14 players: max 3 mafia
        if (playerCount >= 5 && playerCount <= 6) return 2;    // 5-6 players: max 2 mafia
        if (playerCount >= 4 && playerCount <= 4) return 1;    // 4 players: max 1 mafia
        return 1; // Default fallback
    }

    updateRoomSettingsDisplay() {
        const maxPlayersInput = document.getElementById('maxPlayersInput');
        const mafiaCountInput = document.getElementById('mafiaCountInput');
        const suicideBomberToggle = document.getElementById('suicideBomberToggle');
        const manipulatorToggle = document.getElementById('manipulatorToggle');
        const autoPoliceToggle = document.getElementById('autoPoliceToggle');
        const suicideBomberContainer = document.getElementById('suicideBomberToggleContainer');
        const roomSettingsSection = document.getElementById('roomSettingsSection');
        
        if (maxPlayersInput) {
            maxPlayersInput.value = this.gameState.settings.maxPlayers;
            
            // Update mafia count max when max players changes
            maxPlayersInput.addEventListener('input', () => {
                this.updateMafiaCountLimits();
                this.updateSuicideBomberVisibility();
                this.updateRolePreview();
            });
        }
        
        if (mafiaCountInput) {
            mafiaCountInput.value = this.gameState.settings.mafiaCount;
            
            // Update role preview when mafia count changes
            mafiaCountInput.addEventListener('input', () => {
                this.updateSuicideBomberVisibility();
                this.updateRolePreview();
            });
        }
        
        // Update role toggles
        if (suicideBomberToggle) {
            suicideBomberToggle.checked = this.gameState.settings.suicideBomberEnabled || false;
            suicideBomberToggle.addEventListener('change', () => {
                this.updateRolePreview();
            });
        }
        
        if (manipulatorToggle) {
            manipulatorToggle.checked = this.gameState.settings.manipulatorEnabled || false;
            manipulatorToggle.addEventListener('change', () => {
                this.updateRolePreview();
            });
        }
        
        if (autoPoliceToggle) {
            autoPoliceToggle.checked = this.gameState.settings.autoPoliceRoles !== false; // Default true
            autoPoliceToggle.addEventListener('change', () => {
                this.updateRolePreview();
            });
        }
        
        // Update bot settings
        const botToggle = document.getElementById('botToggle');
        const botCountLobby = document.getElementById('botCountLobby');
        const botSettingsLobby = document.getElementById('botSettingsLobby');
        
        if (botToggle) {
            const enableBots = (this.gameState.settings && ('enableBots' in this.gameState.settings))
                ? this.gameState.settings.enableBots
                : (this.currentLobbyInfo && ('enableBots' in this.currentLobbyInfo))
                    ? this.currentLobbyInfo.enableBots
                    : false;
            botToggle.checked = !!enableBots;
            botToggle.addEventListener('change', (e) => {
                if (botSettingsLobby) {
                    botSettingsLobby.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }
        
        if (botCountLobby) {
            const botCount = (this.gameState.settings && ('botCount' in this.gameState.settings))
                ? this.gameState.settings.botCount
                : (this.currentLobbyInfo && ('botCount' in this.currentLobbyInfo))
                    ? this.currentLobbyInfo.botCount
                    : 1;
            botCountLobby.value = botCount;
        }
        
        // Set initial bot settings visibility
        if (botSettingsLobby) {
            botSettingsLobby.style.display = (this.gameState.settings.enableBots) ? 'block' : 'none';
        }
        
        // Show settings only to host
        if (roomSettingsSection) {
            roomSettingsSection.style.display = this.isHost() ? 'block' : 'none';
        }
        
        // Update mafia count limits initially
        this.updateMafiaCountLimits();
        
        // Update suicide bomber visibility
        this.updateSuicideBomberVisibility();
        
        // Update role preview initially
        this.updateRolePreview();
    }

    updateSuicideBomberVisibility() {
        const mafiaCountInput = document.getElementById('mafiaCountInput');
        const suicideBomberContainer = document.getElementById('suicideBomberToggleContainer');
        const suicideBomberToggle = document.getElementById('suicideBomberToggle');
        
        if (mafiaCountInput && suicideBomberContainer) {
            const mafiaCount = parseInt(mafiaCountInput.value) || 0;
            const shouldShow = mafiaCount >= 3;
            
            suicideBomberContainer.style.display = shouldShow ? 'block' : 'none';
            
            // If hiding and currently enabled, disable it
            if (!shouldShow && suicideBomberToggle) {
                suicideBomberToggle.checked = false;
            }
        }
    }

    updateMafiaCountLimits() {
        const maxPlayersInput = document.getElementById('maxPlayersInput');
        const mafiaCountInput = document.getElementById('mafiaCountInput');
        const mafiaLabel = document.querySelector('label[for="mafiaCountInput"]');
        
        if (maxPlayersInput && mafiaCountInput) {
            const maxPlayers = parseInt(maxPlayersInput.value) || 10;
            const maxMafia = this.getMaxMafiaCount(maxPlayers);
            
            mafiaCountInput.max = maxMafia;
            
            // Update label to show limits
            if (mafiaLabel) {
                mafiaLabel.textContent = `Mafia Count (1-${maxMafia}):`;
            }
            
            // Adjust current value if it exceeds the new limit
            if (parseInt(mafiaCountInput.value) > maxMafia) {
                mafiaCountInput.value = maxMafia;
            }
            
            // Update role preview
            this.updateRolePreview();
        }
    }

    updateRolePreview() {
        const maxPlayersInput = document.getElementById('maxPlayersInput');
        const mafiaCountInput = document.getElementById('mafiaCountInput');
        const suicideBomberToggle = document.getElementById('suicideBomberToggle');
        const manipulatorToggle = document.getElementById('manipulatorToggle');
        const autoPoliceToggle = document.getElementById('autoPoliceToggle');
        const rolePreview = document.getElementById('rolePreview');
        
        if (maxPlayersInput && mafiaCountInput && rolePreview) {
            const maxPlayers = parseInt(maxPlayersInput.value) || 10;
            const mafiaCount = parseInt(mafiaCountInput.value) || 2;
            const suicideBomberEnabled = suicideBomberToggle?.checked || false;
            const manipulatorEnabled = manipulatorToggle?.checked || false;
            const autoPoliceRoles = autoPoliceToggle?.checked !== false; // Default true
            
            let roleText = '';
            let totalMafia = mafiaCount;
            let totalOtherRoles = 0;
            
            // Count special mafia roles
            let specialMafiaCount = 0;
            if (mafiaCount >= 3 && suicideBomberEnabled) specialMafiaCount++;
            if (manipulatorEnabled) specialMafiaCount++;
            
            const regularMafia = mafiaCount - specialMafiaCount;
            
            // Build mafia description
            if (regularMafia > 0) {
                roleText += `${regularMafia} Mafia`;
            }
            
            if (manipulatorEnabled) {
                if (roleText) roleText += ', ';
                roleText += '1 Manipulator';
            }
            
            if (mafiaCount >= 3 && suicideBomberEnabled) {
                if (roleText) roleText += ', ';
                roleText += '1 Suicide Bomber';
            }
            
            // Add police roles for 10+ players
            if (maxPlayers >= 10 && autoPoliceRoles) {
                roleText += ', 3 Police (W/B/G)';
                totalOtherRoles += 3;
            }
            
            // Add detective if enough players
            if (maxPlayers >= 5) {
                roleText += ', 1 Detective';
                totalOtherRoles += 1;
            }
            
            // Add doctor if enough players (5 or more)
            if (maxPlayers >= 5) {
                roleText += ', 1 Doctor';
                totalOtherRoles += 1;
            }
            
            // Calculate civilians (total - all other roles)
            const civilians = maxPlayers - totalMafia - totalOtherRoles;
            
            if (civilians > 0) {
                roleText += `, ${civilians} Civilian${civilians > 1 ? 's' : ''}`;
            }
            
            rolePreview.textContent = roleText;
        }
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // Check if click is on a player
        if (this.playerPositions) {
            for (let playerPos of this.playerPositions) {
                const distance = Math.sqrt(
                    Math.pow(x - playerPos.x, 2) + Math.pow(y - playerPos.y, 2)
                );
                
                if (distance <= playerPos.radius) {
                    this.handlePlayerClick(playerPos.player);
                    return;
                }
            }
        }
    }

    updateConnectionStatus(status, text) {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        statusIndicator.className = `status-indicator ${status}`;
        statusText.textContent = text;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        
        // Play notification sound for important messages
        if (window.audioManager && (type === 'warning' || type === 'error' || type === 'success')) {
            window.audioManager.onNotification();
        }
        
        // Remove any existing toast type classes
        toast.className = 'toast';
        
        // Add vote-specific styling for vote notifications
        if (type === 'vote') {
            toast.classList.add('vote-toast');
        }
        
        toastMessage.textContent = message;
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
            // Reset toast class for next use
            toast.className = 'toast';
        }, 3000);
    }

    // Game loop for canvas rendering
    isDead() {
        return this.gameState.deadPlayers.includes(this.playerId);
    }

    startGameLoop() {
        const gameLoop = () => {
            this.render();
            requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }

    // Add mobile detection helper
    isMobile() {
        try {
            return window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches;
        } catch {
            return window.innerWidth <= 768;
        }
    }

    render() {
        if (!this.ctx) return;
        
        // Update animated elements
        this.updateStars();
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render based on current screen and game state
        if (this.currentScreen === 'game') {
            this.renderGameScene();
        } else {
            this.renderLobbyScene();
        }
    }

    renderLobbyScene() {
        const scaleFactor = this.isMobile() ? 0.5 : 1.0;
        this.ctx.save();
        if (scaleFactor !== 1) {
            this.ctx.translate(this.canvas.width * (1 - scaleFactor) / 2, this.canvas.height * (1 - scaleFactor) / 2);
            this.ctx.scale(scaleFactor, scaleFactor);
        }
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Draw title
        this.ctx.fillStyle = '#4ecdc4';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('The Fall of Volmora', centerX, centerY - 100);
        
        this.ctx.fillStyle = '#a0aec0';
        this.ctx.font = '24px Arial';
        
        // Draw game over info if game just ended
        if (this.gameOverInfo) {
            this.drawGameOverInfo(centerX, centerY);
        }
        
        // Draw room info if in a room
        if (this.currentRoomCode) {
            this.ctx.fillStyle = '#4ecdc4';
            this.ctx.font = 'bold 32px Arial';
            const roomY = this.gameOverInfo ? centerY + 180 : centerY + 50;
            this.ctx.fillText(`Room: ${this.currentRoomCode}`, centerX, roomY);
        }
        
        // Draw atmospheric effects
        this.drawStars();

        // For mobile, show a compact stats panel in lobby too
        if (this.isMobile()) {
            this.drawLobbyStatsPanel();
        }
        
        this.ctx.restore();
    }

    // Compact stats panel for lobby on mobile
    drawLobbyStatsPanel() {
        const panelWidth = Math.min(this.canvas.width * 0.9, 560);
        const panelHeight = 90;
        const panelX = (this.canvas.width - panelWidth) / 2;
        const panelY = this.canvas.height - panelHeight - 20;
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.strokeStyle = '#4ecdc4';
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Left side: Phase / Day
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillStyle = '#ffd700';
        this.ctx.textAlign = 'left';
        const phaseText = this.gameState.phase ? `Phase: ${this.gameState.phase.toUpperCase()}` : 'Phase: LOBBY';
        this.ctx.fillText(phaseText, panelX + 16, panelY + 26);
        if (this.gameState.dayCount > 0) {
            this.ctx.fillText(`Day: ${this.gameState.dayCount}`, panelX + 16, panelY + 46);
        }
        
        // Right side: Time and counts
        this.ctx.textAlign = 'right';
        // Time (if present)
        if (this.gameState.timeRemaining > 0) {
            const minutes = Math.floor(this.gameState.timeRemaining / 60);
            const seconds = this.gameState.timeRemaining % 60;
            const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillStyle = this.gameState.timeRemaining <= 30 ? '#e53e3e' : '#4ecdc4';
            this.ctx.fillText(`Time: ${timeText}`, panelX + panelWidth - 16, panelY + 30);
        }
        
        // Alive/Dead
        let alivePlayers = 0;
        let deadPlayers = 0;
        if (Array.isArray(this.gameState.alivePlayers)) alivePlayers = this.gameState.alivePlayers.length;
        if (Array.isArray(this.gameState.deadPlayers)) deadPlayers = this.gameState.deadPlayers.length;
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = '#a0aec0';
        this.ctx.fillText(`Alive: ${alivePlayers} | Dead: ${deadPlayers}`, panelX + panelWidth - 16, panelY + 54);
    }

    drawGameOverInfo(centerX, centerY) {
        const info = this.gameOverInfo;
        
        // Draw winner announcement
        if (info.winner === 'mafia') {
            this.ctx.fillStyle = '#dc3545';
            this.ctx.font = 'bold 36px Arial';
            this.ctx.fillText('💀 Mafia Victory!', centerX, centerY - 20);
        } else if (info.winner === 'innocents') {
            this.ctx.fillStyle = '#28a745';
            this.ctx.font = 'bold 36px Arial';
            this.ctx.fillText('🏆 Innocent Victory!', centerX, centerY - 20);
        }
        
        // Draw reason message
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '20px Arial';
        this.ctx.fillText(info.message, centerX, centerY + 20);
        
        // Draw survivors
        if (info.survivors && info.survivors.length > 0) {
            this.ctx.fillStyle = '#ffd700';
            this.ctx.font = 'bold 18px Arial';
            this.ctx.fillText('🏅 Survivors:', centerX, centerY + 60);
            
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.font = '16px Arial';
            info.survivors.forEach((survivor, index) => {
                this.ctx.fillText(`${survivor.name} (${survivor.role})`, centerX, centerY + 85 + (index * 20));
            });
        }
        
        // Draw win statistics if available
        if (info.winStats) {
            const statsY = centerY + 120 + (info.survivors ? info.survivors.length * 20 : 0);
            
            this.ctx.fillStyle = '#a0aec0';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText('📊 Room Statistics', centerX, statsY);
            
            this.ctx.font = '14px Arial';
            this.ctx.fillStyle = '#ff6b6b';
            this.ctx.fillText(`💀 Mafia: ${info.winStats.mafiaWins}`, centerX - 80, statsY + 25);
            
            this.ctx.fillStyle = '#51cf66';
            this.ctx.fillText(`🏆 Civilians: ${info.winStats.civilianWins}`, centerX + 80, statsY + 25);
            
            this.ctx.fillStyle = '#ffd700';
            this.ctx.fillText(`🎮 Total: ${info.winStats.totalGames}`, centerX, statsY + 50);
        }
        
        // Draw auto-return countdown
        this.ctx.fillStyle = '#a0aec0';
        this.ctx.font = '14px Arial';
        this.ctx.fillText('⏰ Returning to lobby in 10 seconds...', centerX, centerY + 160);
    }

    renderGameScene() {
        // Draw background based on game phase
        this.drawGameBackground();
        
        // Draw game stats panel
        this.drawGameStatsPanel();
        
        // Draw the round table
        this.drawRoundTable();
        
        // Draw players around the table
        this.drawPlayersAroundTable();
        
        // Draw phase-specific effects (sun/moon/stars)
        if (this.gameState.phase === 'night') {
            this.drawNightEffects();
        } else if (this.gameState.phase === 'day') {
            this.drawDayEffects();
        }
    }

    drawGameBackground() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        if (this.gameState.phase === 'night') {
            // Night background
            const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(this.canvas.width, this.canvas.height));
            gradient.addColorStop(0, '#1a202c');
            gradient.addColorStop(1, '#000428');
            this.ctx.fillStyle = gradient;
        } else {
            // Day background
            const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(this.canvas.width, this.canvas.height));
            gradient.addColorStop(0, '#ffd89b');
            gradient.addColorStop(1, '#19547b');
            this.ctx.fillStyle = gradient;
        }
        
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawPlayerCircle() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(this.canvas.width, this.canvas.height) * 0.3;
        
        const totalPlayers = this.gameState.alivePlayers.length + this.gameState.deadPlayers.length;
        if (totalPlayers === 0) return;
        
        const angleStep = (2 * Math.PI) / totalPlayers;
        let currentIndex = 0;
        
        // Draw alive players
        this.gameState.alivePlayers.forEach(player => {
            const angle = currentIndex * angleStep - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            this.drawPlayer(x, y, player.name, true, player.id === this.playerId);
            currentIndex++;
        });
        
        // Draw dead players
        this.gameState.deadPlayers.forEach(playerId => {
            const angle = currentIndex * angleStep - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            const playerName = this.getPlayerName(playerId);
            this.drawPlayer(x, y, playerName, false, false);
            currentIndex++;
        });
    }

    drawPlayer(x, y, name, isAlive, isCurrentPlayer) {
        const iconSize = 35;
        
        // Set colors based on player state
        let bodyColor, borderColor, lineWidth;
        if (isCurrentPlayer) {
            bodyColor = '#4ecdc4';
            borderColor = '#45b7d1';
            lineWidth = 4;
        } else if (isAlive) {
            bodyColor = '#4a5568';
            borderColor = '#e2e8f0';
            lineWidth = 2;
        } else {
            bodyColor = '#2d3748';
            borderColor = '#e53e3e';
            lineWidth = 2;
        }
        
        // Draw profile icon background (head + shoulders silhouette)
        this.ctx.fillStyle = bodyColor;
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = lineWidth;
        
        // Draw head (circle)
        this.ctx.beginPath();
        this.ctx.arc(x, y - 8, 12, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw shoulders/body (rounded rectangle)
        this.ctx.beginPath();
        const shoulderWidth = 24;
        const shoulderHeight = 16;
        const radius = 8;
        
        // Create rounded rectangle for shoulders
        this.ctx.moveTo(x - shoulderWidth/2 + radius, y + 5);
        this.ctx.arcTo(x + shoulderWidth/2, y + 5, x + shoulderWidth/2, y + 5 + radius, radius);
        this.ctx.arcTo(x + shoulderWidth/2, y + 5 + shoulderHeight, x + shoulderWidth/2 - radius, y + 5 + shoulderHeight, radius);
        this.ctx.arcTo(x - shoulderWidth/2, y + 5 + shoulderHeight, x - shoulderWidth/2, y + 5 + shoulderHeight - radius, radius);
        this.ctx.arcTo(x - shoulderWidth/2, y + 5, x - shoulderWidth/2 + radius, y + 5, radius);
        this.ctx.closePath();
        
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw simple face features if alive
        if (isAlive) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.globalAlpha = 0.8;
            
            // Eyes
            this.ctx.beginPath();
            this.ctx.arc(x - 4, y - 10, 1.5, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(x + 4, y - 10, 1.5, 0, 2 * Math.PI);
            this.ctx.fill();
            
            this.ctx.globalAlpha = 1.0;
        }
        
        // Draw X for dead players
        if (!isAlive) {
            this.ctx.strokeStyle = '#e53e3e';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(x - 15, y - 15);
            this.ctx.lineTo(x + 15, y + 15);
            this.ctx.moveTo(x + 15, y - 15);
            this.ctx.lineTo(x - 15, y + 15);
            this.ctx.stroke();
        }
        
        // Draw player name
        this.ctx.fillStyle = isAlive ? '#e2e8f0' : '#a0aec0';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(name, x, y + iconSize + 10);
    }

    drawNightEffects() {
        // Draw stars
        this.drawStars();
        
        // Draw moon
        this.ctx.fillStyle = '#f7fafc';
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width - 80, 80, 30, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    drawDayEffects() {
        // Draw sun
        this.ctx.fillStyle = '#ffd700';
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width - 80, 80, 35, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw sun rays
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const startX = this.canvas.width - 80 + Math.cos(angle) * 45;
            const startY = 80 + Math.sin(angle) * 45;
            const endX = this.canvas.width - 80 + Math.cos(angle) * 60;
            const endY = 80 + Math.sin(angle) * 60;
            
            this.ctx.beginPath();
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }
    }

    drawStars() {
        this.ctx.fillStyle = '#f7fafc';
        this.stars.forEach(star => {
            // Add a subtle twinkle effect (slower)
            const alpha = 0.4 + Math.sin(Date.now() * 0.0005 + star.x * 0.005) * 0.3;
            this.ctx.globalAlpha = alpha;
            
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, 2 * Math.PI);
            this.ctx.fill();
        });
        
        // Reset alpha
        this.ctx.globalAlpha = 1.0;
    }

	// Simple device helper
	getIsMobile() {
		return (typeof window !== 'undefined') && (window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches));
	}

	// Compute table center Y with slight extra offset on mobile to prevent overlap with stats
	getTableCenterY() {
		const isMobile = this.getIsMobile();
		// Default was 0.58; move further down on mobile for more breathing room
		return this.canvas.height * (isMobile ? 0.66 : 0.58);
	}

    drawRoundTable() {
			const centerX = this.canvas.width / 2;
			const centerY = this.getTableCenterY(); // Slightly lower on mobile to avoid overlapping stats
			const tableRadius = Math.min(this.canvas.width, this.canvas.height) * 0.18; // Slightly smaller table for small screens
        
        // Draw table outer ring
        this.ctx.fillStyle = '#5D4037';
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, tableRadius + 8, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw table surface with wood gradient
        const tableGradient = this.ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, tableRadius
        );
        tableGradient.addColorStop(0, '#A0522D');
        tableGradient.addColorStop(0.5, '#8B4513');
        tableGradient.addColorStop(1, '#654321');
        
        this.ctx.fillStyle = tableGradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, tableRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw center logo/symbol based on phase (reduced size for compactness)
        const phaseEmojiFont = (this.getIsMobile && this.getIsMobile()) ? 'bold 12px Arial' : 'bold 14px Arial';
        this.ctx.font = phaseEmojiFont;
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffd700';
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        if (this.gameState.phase === 'day') {
            this.ctx.fillText('☀️', centerX, centerY - 20);
        } else if (this.gameState.phase === 'night') {
            this.ctx.fillText('🌙', centerX, centerY - 20);
        } else {
            this.ctx.fillText('🏛️', centerX, centerY - 20);
        }
        
        // Draw center text
        this.ctx.font = (this.getIsMobile && this.getIsMobile()) ? 'bold 18px Arial' : 'bold 20px Arial';
        this.ctx.fillStyle = '#ffd700';
        this.ctx.fillText('Volmora', centerX, centerY + 20);
        
        // Draw phase info
        this.ctx.font = (this.getIsMobile && this.getIsMobile()) ? 'bold 12px Arial' : 'bold 14px Arial';
        this.ctx.fillStyle = '#4ecdc4';
        if (this.gameState.phase) {
            this.ctx.fillText(this.gameState.phase.toUpperCase(), centerX, centerY + 40);
        }
        
        // Draw timer
        if (this.gameState.timeRemaining > 0) {
            const minutes = Math.floor(this.gameState.timeRemaining / 60);
            const seconds = this.gameState.timeRemaining % 60;
            const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            this.ctx.font = (this.getIsMobile && this.getIsMobile()) ? 'bold 14px Arial' : 'bold 16px Arial';
            this.ctx.fillStyle = this.gameState.timeRemaining <= 30 ? '#e53e3e' : '#4ecdc4';
            this.ctx.fillText(timeText, centerX, centerY + 60);
        }
        
        // Reset shadow
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
    }

    drawPlayersAroundTable() {
        // Combine alive and dead players
        const allPlayers = [];
        if (this.gameState.alivePlayers) {
            allPlayers.push(...this.gameState.alivePlayers.map(p => ({...p, alive: true})));
        }
        if (this.gameState.deadPlayers) {
            allPlayers.push(...this.gameState.deadPlayers.map(p => ({...p, alive: false})));
        }
        
        if (allPlayers.length === 0) return;
        
        const centerX = this.canvas.width / 2;
			const centerY = this.getTableCenterY(); // Keep in sync with table Y
			const isMobile = this.getIsMobile();
			const tableRadius = Math.min(this.canvas.width, this.canvas.height) * 0.18;
			const playerRadius = Math.min(this.canvas.width, this.canvas.height) * (isMobile ? 0.20 : 0.22); // Slightly tighter on mobile
			const seatSize = Math.max(28, Math.min(42, Math.min(this.canvas.width, this.canvas.height) * 0.05));
        
        // Store player positions for click detection
        this.playerPositions = [];
        
        allPlayers.forEach((player, index) => {
            const angle = (index / allPlayers.length) * 2 * Math.PI - Math.PI / 2; // Start from top
            const x = centerX + playerRadius * Math.cos(angle);
            const y = centerY + playerRadius * Math.sin(angle);
            
            // Store position for click detection
            this.playerPositions.push({
                player: player,
                x: x,
                y: y,
                radius: seatSize / 2
            });
            
            // Get player's unique color
            const playerColor = this.getPlayerColor(player.id, player.name);
            
            // Draw player seat background with player's color
            this.ctx.fillStyle = player.alive ? playerColor : '#666666';
            this.ctx.beginPath();
            this.ctx.arc(x, y, seatSize / 2, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Draw player border
            this.ctx.strokeStyle = player.alive ? 
                (player.id === this.playerId ? '#ffd700' : '#ffffff') : 
                '#e53e3e';
            this.ctx.lineWidth = player.id === this.playerId ? 4 : 2;
            this.ctx.beginPath();
            this.ctx.arc(x, y, seatSize / 2, 0, 2 * Math.PI);
            this.ctx.stroke();
            
            // Draw player name with role indicators for mafia
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = player.id === this.playerId ? '#2d3748' : '#ffffff';
            let displayName = player.id === this.playerId ? 'You' : player.name;
            
            // Show role for mafia members (so they can identify each other)
            if (this.playerRole === 'mafia' && this.mafiaTeammates.some(mate => mate.id === player.id)) {
                displayName += ' 🔪';
            }
            
            this.ctx.fillText(displayName, x, y + 3);

            // Ensure seats remain inside canvas; clamp Y
            if (y + seatSize / 2 > this.canvas.height - 2) {
                this.playerPositions[this.playerPositions.length - 1].y = this.canvas.height - 2 - seatSize / 2;
            }
            
            // Draw status indicator
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillStyle = player.alive ? '#ffffff' : '#e53e3e';
            this.ctx.fillText(player.alive ? '●' : '✗', x + 20, y - 20);
            
            // Draw voting results if available
            if (this.votingResults && this.votingResults.votes && player.alive) {
                this.drawVoterIcons(x, y, player, seatSize);
            }
            
            // Draw action availability glow for all roles
            if (this.hasAvailableAction(player)) {
                this.ctx.shadowColor = '#4ecdc4';
                this.ctx.shadowBlur = 15;
                this.ctx.strokeStyle = '#4ecdc4';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(x, y, seatSize / 2 + 5, 0, 2 * Math.PI);
                this.ctx.stroke();
                this.ctx.shadowColor = 'transparent';
                this.ctx.shadowBlur = 0;
            }
            
            // Special mafia glow for mafia members (to identify each other)
            if (this.playerRole === 'mafia' && this.mafiaTeammates.some(mate => mate.id === player.id)) {
                this.ctx.shadowColor = '#e53e3e';
                this.ctx.shadowBlur = 10;
                this.ctx.strokeStyle = '#e53e3e';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(x, y, seatSize / 2 + 8, 0, 2 * Math.PI);
                this.ctx.stroke();
                this.ctx.shadowColor = 'transparent';
                this.ctx.shadowBlur = 0;
            }
        });
        
        // Draw voting arrows/connections during day phase
        if (this.gameState.phase === 'day' && this.currentVoteDetails && this.currentVoteDetails.length > 0) {
            this.drawVotingConnections(allPlayers, centerX, centerY, playerRadius);
        }
    }

    drawVotingConnections(allPlayers, centerX, centerY, playerRadius) {
        // Draw arrows from voters to their targets
        this.currentVoteDetails.forEach(vote => {
            const voterPlayer = allPlayers.find(p => p.name === vote.voterName);
            const targetPlayer = allPlayers.find(p => p.name === vote.targetName);
            
            if (!voterPlayer || !targetPlayer) return;
            
            // Find positions
            const voterIndex = allPlayers.findIndex(p => p.name === vote.voterName);
            const targetIndex = allPlayers.findIndex(p => p.name === vote.targetName);
            
            if (voterIndex === -1 || targetIndex === -1) return;
            
            // Calculate positions
            const voterAngle = (voterIndex / allPlayers.length) * 2 * Math.PI - Math.PI / 2;
            const targetAngle = (targetIndex / allPlayers.length) * 2 * Math.PI - Math.PI / 2;
            
            const voterX = centerX + playerRadius * Math.cos(voterAngle);
            const voterY = centerY + playerRadius * Math.sin(voterAngle);
            const targetX = centerX + playerRadius * Math.cos(targetAngle);
            const targetY = centerY + playerRadius * Math.sin(targetAngle);
            
            // Get voter's unique color for the arrow
            const voterColor = this.getPlayerColor(vote.voterId, vote.voterName);
            
            // Draw curved arrow from voter to target
            this.drawVotingArrow(voterX, voterY, targetX, targetY, voterColor, vote.voterName);
        });
    }

    drawVotingArrow(fromX, fromY, toX, toY, color, voterName) {
        // Calculate midpoint for curved arrow
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        
        // Calculate perpendicular offset for curve
        const dx = toX - fromX;
        const dy = toY - fromY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length < 10) return; // Don't draw if too close
        
        // Create curve control point (perpendicular to line)
        const curvature = 0.3; // How much to curve
        const controlX = midX - dy * curvature;
        const controlY = midY + dx * curvature;
        
        // Draw curved line
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.globalAlpha = 0.8;
        
        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        this.ctx.quadraticCurveTo(controlX, controlY, toX, toY);
        this.ctx.stroke();
        
        // Draw arrowhead at target
        const arrowSize = 8;
        const angle = Math.atan2(toY - controlY, toX - controlX);
        
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(toX - arrowSize * Math.cos(angle - 0.5), toY - arrowSize * Math.sin(angle - 0.5));
        this.ctx.lineTo(toX - arrowSize * Math.cos(angle + 0.5), toY - arrowSize * Math.sin(angle + 0.5));
        this.ctx.closePath();
        this.ctx.fill();
        
        // Draw voter label on the arrow
        const labelX = controlX;
        const labelY = controlY - 10;
        
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${voterName}`, labelX, labelY);
        
        // Reset alpha
        this.ctx.globalAlpha = 1.0;
    }

    drawVoterIcons(playerX, playerY, targetPlayer, seatSize) {
        // Find all votes for this player
        const votesForPlayer = this.votingResults.votes.filter(vote => 
            vote.targetName === targetPlayer.name
        );
        
        if (votesForPlayer.length === 0) return;
        
        // Draw small colored circles below the player showing who voted for them
        const iconSize = 8;
        const spacing = 12;
        const startX = playerX - (votesForPlayer.length * spacing) / 2 + spacing / 2;
        const iconY = playerY + seatSize / 2 + 15;
        
        votesForPlayer.forEach((vote, index) => {
            const voterPlayer = this.getAllPlayers().find(p => p.name === vote.voterName);
            if (!voterPlayer) return;
            
            const voterColor = this.getPlayerColor(voterPlayer.id, voterPlayer.name);
            const iconX = startX + (index * spacing);
            
            // Draw voter icon
            this.ctx.fillStyle = voterColor;
            this.ctx.beginPath();
            this.ctx.arc(iconX, iconY, iconSize / 2, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Draw white border for visibility
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(iconX, iconY, iconSize / 2, 0, 2 * Math.PI);
            this.ctx.stroke();
        });
    }

    getAllPlayers() {
        const allPlayers = [];
        if (this.gameState.alivePlayers) {
            allPlayers.push(...this.gameState.alivePlayers.map(p => ({...p, alive: true})));
        }
        if (this.gameState.deadPlayers) {
            allPlayers.push(...this.gameState.deadPlayers.map(p => ({...p, alive: false})));
        }
        return allPlayers;
    }

    drawGameStatsPanel() {
        // Draw game info panel at top of canvas
        const panelWidth = Math.min(this.canvas.width * 0.8, 600);
        const isMobile = this.getIsMobile && this.getIsMobile();
        // Reduce height to roughly half of previous compact size
        const panelHeight = isMobile ? 44 : 52;
         const panelX = (this.canvas.width - panelWidth) / 2;
         const panelY = 20;
         
         // Draw panel background
         this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
         this.ctx.strokeStyle = '#4ecdc4';
         this.ctx.lineWidth = 2;
         this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
         this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
         
         // Draw role info
         if (this.playerRole) {
             const roleEmojis = {
                 'mafia': '🔪',
                 'detective': '🔍', 
                 'civilian': '👥',
                 'doctor': '💚'
             };
             const emoji = roleEmojis[this.playerRole] || '🎭';
             const roleName = this.playerRole.charAt(0).toUpperCase() + this.playerRole.slice(1);
             
             this.ctx.font = 'bold 14px Arial';
             this.ctx.fillStyle = '#4ecdc4';
             this.ctx.textAlign = 'left';
             this.ctx.fillText(`${emoji} Role: ${roleName}`, panelX + 16, panelY + 18);
         }
         
         // Draw game phase and day info
         this.ctx.font = 'bold 12px Arial';
         this.ctx.fillStyle = '#ffd700';
         if (this.gameState.phase) {
             this.ctx.fillText(`Phase: ${this.gameState.phase.toUpperCase()}`, panelX + 16, panelY + 34);
         }
         
         if (this.gameState.dayCount > 0) {
             this.ctx.fillText(`Day: ${this.gameState.dayCount}`, panelX + 180, panelY + 34);
         }
         
         // Draw timer
         if (this.gameState.timeRemaining > 0) {
             const minutes = Math.floor(this.gameState.timeRemaining / 60);
             const seconds = this.gameState.timeRemaining % 60;
             const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
             
             this.ctx.font = 'bold 16px Arial';
             this.ctx.fillStyle = this.gameState.timeRemaining <= 30 ? '#e53e3e' : '#4ecdc4';
             this.ctx.textAlign = 'right';
             this.ctx.fillText(`Time: ${timeText}`, panelX + panelWidth - 16, panelY + 28);
         }
         
         // Draw player counts
         let alivePlayers = 0;
         let deadPlayers = 0;
         if (this.gameState.alivePlayers) alivePlayers = this.gameState.alivePlayers.length;
         if (this.gameState.deadPlayers) deadPlayers = this.gameState.deadPlayers.length;
         
         this.ctx.font = '11px Arial';
         this.ctx.fillStyle = '#a0aec0';
         this.ctx.textAlign = 'right';
         this.ctx.fillText(`Alive: ${alivePlayers} | Dead: ${deadPlayers}`, panelX + panelWidth - 16, panelY + 44);
         
         // Draw instructions based on role and phase (omit in compact mode)
         let instruction = '';
         if (this.gameState.phase === 'day' && !this.isDead()) {
             instruction = '💬 Click players to vote for elimination';
         } else if (this.gameState.phase === 'night' && !this.isDead()) {
             if (this.playerRole === 'mafia') {
                 instruction = '🔪 Choose a player to eliminate (processed at dawn)';
             } else if (this.playerRole === 'detective') {
                 instruction = '🔍 Click players to investigate them';
             } else if (this.playerRole === 'doctor') {
                 instruction = '💚 Click players to protect them (including yourself!)';
             } else {
                 instruction = '😴 Wait for other players to complete their actions';
             }
         } else if (this.isDead()) {
             instruction = '👻 You are dead - watch the game unfold';
         }
         
         // Skip drawing instruction line to keep panel ultra-compact
         
         // Draw dynamic voting information during day phase
         if (this.gameState.phase === 'day' && this.votingVisualizationData && this.votingVisualizationData.voteDetails.length > 0) {
             this.drawVotingStatus(panelX, panelY, panelWidth, panelHeight);
         }
     }

    drawVotingStatus(panelX, panelY, panelWidth, panelHeight) {
        // Compact voting panel that avoids overlapping the table/players
        const isMobile = this.getIsMobile();
        const centerY = this.getTableCenterY();
        const baseRadius = Math.min(this.canvas.width, this.canvas.height);
        const playerRadius = baseRadius * (isMobile ? 0.20 : 0.22);
        const seatSize = Math.max(28, Math.min(42, baseRadius * 0.05));
        const playersTop = centerY - playerRadius - (seatSize / 2);
        const playersBottom = centerY + playerRadius + (seatSize / 2);
        const margin = 8;

        // Base sizing (will shrink dynamically if needed)
        let votingPanelHeight = isMobile ? 44 : 54;
        const minPanelHeight = isMobile ? 32 : 40;
        const widthFactor = isMobile ? 0.85 : 1.0;
        const maxWidth = isMobile ? 380 : panelWidth;
        const compactWidth = Math.min(this.canvas.width * widthFactor, maxWidth);
        const votingPanelX = isMobile ? (this.canvas.width - compactWidth) / 2 : panelX;

        // Preferred Y placement
        let votingPanelY = isMobile ? (this.canvas.height - votingPanelHeight - 12) : (panelY + panelHeight + 10);

        // Desktop: avoid overlapping the top edge of players
        if (!isMobile) {
            const overlapDown = votingPanelY + votingPanelHeight > (playersTop - margin);
            if (overlapDown) {
                // Try shrinking to fit the gap
                const available = Math.max(0, (playersTop - margin) - votingPanelY);
                votingPanelHeight = Math.max(minPanelHeight, Math.min(votingPanelHeight, Math.floor(available)));
                // If still overlapping (no room), fallback to bottom position above chat
                if (votingPanelY + votingPanelHeight > (playersTop - margin)) {
                    votingPanelY = this.canvas.height - votingPanelHeight - 12;
                }
            }
        } else {
            // Mobile: avoid overlapping the bottom edge of players
            const overlapUp = votingPanelY < (playersBottom + margin);
            if (overlapUp) {
                // Try shrinking first
                const available = Math.max(0, this.canvas.height - 12 - (playersBottom + margin));
                votingPanelHeight = Math.max(minPanelHeight, Math.min(votingPanelHeight, Math.floor(available)));
                votingPanelY = this.canvas.height - votingPanelHeight - 12;
                // If still overlapping (no room at bottom), fallback under top panel
                if (votingPanelY < (playersBottom + margin)) {
                    votingPanelY = panelY + panelHeight + 10;
                }
            }
        }

        // Draw background
        this.ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(votingPanelX, votingPanelY, compactWidth, votingPanelHeight);
        this.ctx.strokeRect(votingPanelX, votingPanelY, compactWidth, votingPanelHeight);

        // Typography scaled to height
        const titleFont = votingPanelHeight <= 36 ? (isMobile ? 'bold 11px Arial' : 'bold 12px Arial') : (isMobile ? 'bold 12px Arial' : 'bold 14px Arial');
        const metaFont = votingPanelHeight <= 36 ? (isMobile ? '10px Arial' : '11px Arial') : (isMobile ? '11px Arial' : '12px Arial');

        // Title and progress
        this.ctx.font = titleFont;
        this.ctx.fillStyle = '#ffd700';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('🗳️ Voting', votingPanelX + 12, votingPanelY + (isMobile ? 16 : 18));

        const votesProgress = `${this.votingVisualizationData.totalVotes}/${this.votingVisualizationData.alivePlayers}`;
        this.ctx.font = metaFont;
        this.ctx.fillStyle = '#4ecdc4';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(votesProgress, votingPanelX + compactWidth - 12, votingPanelY + (isMobile ? 16 : 18));

        // Single-line compact summary
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#e0e0e0';
        const centerTextY = votingPanelY + Math.max( Math.floor(votingPanelHeight - 8), 16 );
        if (this.votingVisualizationData.voteDetails.length > 0) {
            const votesByTarget = new Map();
            this.votingVisualizationData.voteDetails.forEach(vote => {
                if (!votesByTarget.has(vote.targetName)) votesByTarget.set(vote.targetName, 0);
                votesByTarget.set(vote.targetName, votesByTarget.get(vote.targetName) + 1);
            });
            let leader = null;
            votesByTarget.forEach((count, name) => {
                if (!leader || count > leader.count) leader = { name, count };
            });
            const summary = leader ? `Lead: ${leader.name} (${leader.count})` : 'No votes cast yet';
            this.ctx.font = titleFont;
            this.ctx.fillText(summary, votingPanelX + compactWidth / 2, centerTextY);
        } else {
            this.ctx.font = titleFont;
            this.ctx.fillText('No votes cast yet', votingPanelX + compactWidth / 2, centerTextY);
        }
    }

    drawGameUI() {
        // Draw phase indicator on canvas
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, 10, 250, 80);
        
        this.ctx.fillStyle = '#4ecdc4';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Phase: ${this.gameState.phase}`, 20, 30);
        this.ctx.fillText(`Room: ${this.currentRoomCode}`, 20, 50);
        
        if (this.gameState.timeRemaining > 0) {
            const minutes = Math.floor(this.gameState.timeRemaining / 60);
            const seconds = this.gameState.timeRemaining % 60;
            this.ctx.fillText(`Time: ${minutes}:${seconds.toString().padStart(2, '0')}`, 20, 70);
        }
    }

    clearChatMessages() {
        // Clear public chat messages
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        
        // Clear mafia chat messages
        const mafiaMessages = document.getElementById('mafiaMessages');
        if (mafiaMessages) {
            mafiaMessages.innerHTML = '';
        }

        // Clear police chat messages
        const policeMessages = document.getElementById('policeMessages');
        if (policeMessages) {
            policeMessages.innerHTML = '';
        }
    }

    // Comic System Methods
    startComicIntro() {
        this.comicSystem.currentPanel = 0;
        this.currentScreen = 'comic-intro';
        
        // Hide lobby screen and show comic intro
        document.getElementById('lobbyScreen').style.display = 'none';
        document.getElementById('comicIntroScreen').style.display = 'block';
        
        this.displayComicPanel();
    }

    displayComicPanel() {
        const panel = this.comicSystem.introPanels[this.comicSystem.currentPanel];
        const comicPanel = document.getElementById('comicPanel');
        const panelText = document.getElementById('panelText');
        const panelCounter = document.getElementById('panelCounter');
        const nextBtn = document.getElementById('nextPanelBtn');
        const panelImage = comicPanel.querySelector('.panel-image');
        
        // Update panel class for styling
        comicPanel.className = `comic-panel active ${panel.class}`;
        
        // Add visual elements to the panel
        this.addPanelVisuals(panelImage, this.comicSystem.currentPanel + 1);
        
        // Update text with typewriter effect
        this.typewriterEffect(panelText, panel.text);
        
        // Update counter
        panelCounter.textContent = `${this.comicSystem.currentPanel + 1} / ${this.comicSystem.introPanels.length}`;
        
        // Update button text for last panel
        if (this.comicSystem.currentPanel === this.comicSystem.introPanels.length - 1) {
            nextBtn.textContent = 'Begin Game →';
        } else {
            nextBtn.textContent = 'Next →';
        }
    }

    addPanelVisuals(panelImage, panelNumber) {
        // Clear existing visuals
        const existingOverlay = panelImage.querySelector('.panel-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // Create overlay for visual elements
        const overlay = document.createElement('div');
        overlay.className = 'panel-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
            pointer-events: none;
        `;
        
        let visualContent = '';
        
        switch(panelNumber) {
            case 1: // Peaceful city
                visualContent = `
                    <div style="text-align: center; color: #ffd700;">
                        <div style="font-size: 4rem; margin-bottom: 10px;">🏛️</div>
                        <div style="font-size: 2rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">🌅</div>
                    </div>
                `;
                break;
            case 2: // Shadows growing
                visualContent = `
                    <div style="text-align: center; color: #666;">
                        <div style="font-size: 4rem; margin-bottom: 10px; animation: shadowPulse 2s ease-in-out infinite;">👤</div>
                        <div style="font-size: 2rem;">🌑</div>
                    </div>
                `;
                break;
            case 3: // Secret faction
                visualContent = `
                    <div style="text-align: center; color: #e53e3e;">
                        <div style="font-size: 3rem; margin-bottom: 10px;">🔪</div>
                        <div style="font-size: 2rem; margin: 0 10px; display: flex; justify-content: center; gap: 15px;">
                            <span style="animation: fadeInOut 2s ease-in-out infinite;">👤</span>
                            <span style="animation: fadeInOut 2s ease-in-out infinite 0.5s;">👤</span>
                            <span style="animation: fadeInOut 2s ease-in-out infinite 1s;">👤</span>
                        </div>
                    </div>
                `;
                break;
            case 4: // First murder
                visualContent = `
                    <div style="text-align: center; color: #cc0000;">
                        <div style="font-size: 4rem; margin-bottom: 10px; animation: shakeEffect 1s ease-in-out infinite;">⚰️</div>
                        <div style="font-size: 2rem;">😱😨😰</div>
                    </div>
                `;
                break;
            case 5: // Paranoia spreads
                visualContent = `
                    <div style="text-align: center; color: #4a5568;">
                        <div style="font-size: 3rem; margin-bottom: 10px;">👁️</div>
                        <div style="font-size: 2rem; display: flex; justify-content: center; gap: 20px;">
                            <span style="animation: suspiciousLook 3s ease-in-out infinite;">🤔</span>
                            <span style="animation: suspiciousLook 3s ease-in-out infinite 1s;">😒</span>
                            <span style="animation: suspiciousLook 3s ease-in-out infinite 2s;">🤨</span>
                        </div>
                    </div>
                `;
                break;
            case 6: // Call to action
                visualContent = `
                    <div style="text-align: center; color: #4ecdc4;">
                        <div style="font-size: 4rem; margin-bottom: 10px; animation: heroGlow 2s ease-in-out infinite alternate;">⚔️</div>
                        <div style="font-size: 2rem;">🛡️✊🏽🔍</div>
                    </div>
                `;
                break;
        }
        
        overlay.innerHTML = visualContent;
        panelImage.appendChild(overlay);
        
        // Add the animations CSS if not already added
        if (!document.getElementById('comicAnimations')) {
            const style = document.createElement('style');
            style.id = 'comicAnimations';
            style.textContent = `
                @keyframes shadowPulse {
                    0%, 100% { opacity: 0.7; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.1); }
                }
                @keyframes fadeInOut {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 1; }
                }
                @keyframes shakeEffect {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                @keyframes suspiciousLook {
                    0%, 100% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.2); opacity: 1; }
                }
                @keyframes heroGlow {
                    0% { filter: drop-shadow(0 0 10px #4ecdc4); }
                    100% { filter: drop-shadow(0 0 20px #4ecdc4); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    nextComicPanel() {
        if (this.comicSystem.currentPanel < this.comicSystem.introPanels.length - 1) {
            this.comicSystem.currentPanel++;
            this.displayComicPanel();
        } else {
            this.skipComicIntro();
        }
    }

    skipComicIntro() {
        // Transition from comic to game screen (since game has started)
        document.getElementById('comicIntroScreen').style.display = 'none';
        
        // Check if we should go to game screen or lobby
        if (this.gameState.gameStarted) {
            document.getElementById('gameScreen').style.display = 'grid';
            this.currentScreen = 'game';
            this.switchToGameScreen();
            
            // Role info popup removed - players start directly in game
        } else {
            document.getElementById('lobbyScreen').style.display = 'block';
            this.currentScreen = 'lobby';
        }
    }

    typewriterEffect(element, text, speed = 30) {
        element.textContent = '';
        let i = 0;
        
        const typeInterval = setInterval(() => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(typeInterval);
            }
        }, speed);
    }

    // Ending Comic System Methods
    startComicEnding(winner) {
        this.comicSystem.currentPanel = 0;
        this.comicSystem.currentEnding = winner === 'mafia' ? 'defeatEnding' : 'victoryEnding';
        this.currentScreen = 'comic-ending';
        
        // Hide game over screen and show comic ending
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('comicEndingScreen').style.display = 'block';
        
        // Update ending titles
        if (winner === 'mafia') {
            document.getElementById('endingTitle').textContent = 'The Darkness Prevails';
            document.getElementById('endingSubtitle').textContent = 'Volmora Has Fallen';
        } else {
            document.getElementById('endingTitle').textContent = 'Dawn Breaks Over Volmora';
            document.getElementById('endingSubtitle').textContent = 'Light Triumphs Over Shadow';
        }
        
        this.displayEndingPanel();
    }

    displayEndingPanel() {
        const panels = this.comicSystem[this.comicSystem.currentEnding];
        const panel = panels[this.comicSystem.currentPanel];
        const comicPanel = document.getElementById('endingComicPanel');
        const panelText = document.getElementById('endingPanelText');
        const panelCounter = document.getElementById('endingPanelCounter');
        const nextBtn = document.getElementById('nextEndingPanelBtn');
        const panelImage = comicPanel.querySelector('.panel-image');
        
        // Update panel class for styling
        comicPanel.className = `comic-panel active ${panel.class}`;
        
        // Add visual elements to the ending panel
        this.addEndingPanelVisuals(panelImage, this.comicSystem.currentEnding, this.comicSystem.currentPanel + 1);
        
        // Update text with typewriter effect
        this.typewriterEffect(panelText, panel.text);
        
        // Update counter
        panelCounter.textContent = `${this.comicSystem.currentPanel + 1} / ${panels.length}`;
        
        // Update button text for last panel
        if (this.comicSystem.currentPanel === panels.length - 1) {
            nextBtn.textContent = 'Continue →';
            nextBtn.style.display = 'none'; // Hide next button on last panel
            document.querySelector('.ending-actions').style.display = 'flex'; // Show action buttons
        } else {
            nextBtn.textContent = 'Next →';
            nextBtn.style.display = 'inline-block';
            document.querySelector('.ending-actions').style.display = 'none';
        }
    }

    addEndingPanelVisuals(panelImage, endingType, panelNumber) {
        // Clear existing visuals
        const existingOverlay = panelImage.querySelector('.panel-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // Create overlay for visual elements
        const overlay = document.createElement('div');
        overlay.className = 'panel-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
            pointer-events: none;
        `;
        
        let visualContent = '';
        
        if (endingType === 'victoryEnding') {
            switch(panelNumber) {
                case 1: // Citizens triumph
                    visualContent = `
                        <div style="text-align: center; color: #4ecdc4;">
                            <div style="font-size: 4rem; margin-bottom: 10px; animation: heroGlow 2s ease-in-out infinite alternate;">🏆</div>
                            <div style="font-size: 2rem;">👥✊🏽🎉</div>
                        </div>
                    `;
                    break;
                case 2: // City rises again
                    visualContent = `
                        <div style="text-align: center; color: #ffd700;">
                            <div style="font-size: 4rem; margin-bottom: 10px;">🏛️</div>
                            <div style="font-size: 2rem; animation: fadeInOut 3s ease-in-out infinite;">🌅✨🕊️</div>
                        </div>
                    `;
                    break;
            }
        } else if (endingType === 'defeatEnding') {
            switch(panelNumber) {
                case 1: // Mafia victory
                    visualContent = `
                        <div style="text-align: center; color: #e53e3e;">
                            <div style="font-size: 4rem; margin-bottom: 10px; animation: shadowPulse 2s ease-in-out infinite;">👑</div>
                            <div style="font-size: 2rem;">🔪👤👤</div>
                        </div>
                    `;
                    break;
                case 2: // City fallen
                    visualContent = `
                        <div style="text-align: center; color: #666;">
                            <div style="font-size: 4rem; margin-bottom: 10px; animation: shakeEffect 3s ease-in-out infinite;">🏴</div>
                            <div style="font-size: 2rem;">😰😨😔</div>
                        </div>
                    `;
                    break;
            }
        }
        
        overlay.innerHTML = visualContent;
        panelImage.appendChild(overlay);
    }

    nextEndingPanel() {
        const panels = this.comicSystem[this.comicSystem.currentEnding];
        if (this.comicSystem.currentPanel < panels.length - 1) {
            this.comicSystem.currentPanel++;
            this.displayEndingPanel();
        }
    }

    skipComicEnding() {
        this.showGameOverScreen();
    }

    playAgainFromEnding() {
        if (this.isHost()) {
            this.playAgain();
        } else {
            this.showToast('❌ Only the host can start a new game!', 'error');
        }
    }

    returnToLobbyFromEnding() {
        if (this.isHost()) {
            this.returnToLobby();
        } else {
            this.showToast('❌ Only the host can return everyone to lobby!', 'error');
        }
    }

    showGameOverScreen(winner, message, survivors, winStats) {
        // Return to traditional game over screen
        document.getElementById('comicEndingScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'block';
        this.currentScreen = 'game-over';
        
        // Store winner information for countdown message
        this.currentWinner = winner;
        
        // Update game over content
        const gameOverTitle = document.getElementById('gameOverTitle');
        const gameOverMessage = document.getElementById('gameOverMessage');
        
        if (winner && message) {
            // Set title based on winner
            if (winner === 'mafia') {
                gameOverTitle.textContent = '💀 Mafiyas Win';
                gameOverTitle.style.color = '#dc3545';
            } else if (winner === 'innocents') {
                gameOverTitle.textContent = '🏆 Civilians Win';
                gameOverTitle.style.color = '#28a745';
            } else {
                gameOverTitle.textContent = 'Game Over';
                gameOverTitle.style.color = '#333';
            }
            
            // Set message
            let fullMessage = message;
            if (survivors && survivors.length > 0) {
                fullMessage += `\n\n🏅 Survivors:\n`;
                survivors.forEach(survivor => {
                    fullMessage += `• ${survivor.name} (${survivor.role})\n`;
                });
            }
            
            // Add win statistics if available
            if (winStats) {
                fullMessage += `\n\n📊 Room Statistics:\n`;
                fullMessage += `💀 Mafia Wins: ${winStats.mafiaWins}\n`;
                fullMessage += `🏆 Civilian Wins: ${winStats.civilianWins}\n`;
                fullMessage += `🎮 Total Games: ${winStats.totalGames}`;
            }
            
            gameOverMessage.textContent = fullMessage;
            gameOverMessage.style.whiteSpace = 'pre-line';
        } else {
            // Fallback when winner or message is not provided
            if (winner === 'mafia') {
                gameOverTitle.textContent = '💀 Mafiyas Win';
                gameOverTitle.style.color = '#dc3545';
                gameOverMessage.textContent = 'The Mafia has taken control of Volmora!';
            } else if (winner === 'innocents') {
                gameOverTitle.textContent = '🏆 Civilians Win';
                gameOverTitle.style.color = '#28a745';
                gameOverMessage.textContent = 'The Civilians have saved Volmora!';
            } else {
                gameOverTitle.textContent = 'Game Over';
                gameOverTitle.style.color = '#333';
                gameOverMessage.textContent = 'The game has ended.';
            }
        }
        
        // Play game end audio
        if (window.audioManager) {
            window.audioManager.onGameEnd(winner);
        }
        
        // Start countdown timer
        this.startCountdownTimer();
    }

    startCountdownTimer() {
        let timeLeft = 10;
        const timerElement = document.getElementById('countdownTimer');
        const countdownMessageElement = document.getElementById('countdownMessage');
        
        // Clear any existing countdown
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        // Set appropriate countdown message based on winner
        let countdownText = '⏰ Returning to lobby in ';
        if (this.currentWinner === 'mafia') {
            countdownText = '💀 Mafia Win - Returning to lobby in ';
        } else if (this.currentWinner === 'innocents') {
            countdownText = '🏆 Civilian Win - Returning to lobby in ';
        }
        
        // Update timer display
        const updateTimer = () => {
            if (timerElement) {
                timerElement.textContent = timeLeft;
            }
            
            if (countdownMessageElement) {
                countdownMessageElement.innerHTML = `${countdownText}<span id="countdownTimer">${timeLeft}</span> seconds...`;
            }
            
            if (timeLeft <= 0) {
                clearInterval(this.countdownInterval);
                if (this.currentScreen === 'game-over') {
                    this.returnToLobby();
                }
                return;
            }
            
            timeLeft--;
        };
        
        // Update immediately and then every second
        updateTimer();
        this.countdownInterval = setInterval(updateTimer, 1000);
    }

    createTutorialOverlay() {
        if (this.tutorial.overlay) return this.tutorial.overlay;
        const overlay = document.createElement('div');
        overlay.id = 'tutorialOverlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.7)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        const card = document.createElement('div');
        card.style.maxWidth = '600px';
        card.style.margin = '16px';
        card.style.background = 'rgba(20,20,30,0.95)';
        card.style.border = '1px solid #4ecdc4';
        card.style.borderRadius = '12px';
        card.style.padding = '16px';
        card.innerHTML = `
            <h3 style="margin-bottom:8px;color:#4ecdc4;">Tutorial</h3>
            <div id="tutorialText" style="line-height:1.4;margin-bottom:12px;"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
                <button id="tutorialPrev" class="btn-secondary">Back</button>
                <button id="tutorialNext" class="btn-primary">Next</button>
            </div>`;
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        this.tutorial.overlay = overlay;
        return overlay;
    }

    showTutorial(text, { nextText = 'Next', prevVisible = false, onNext = null, onPrev = null, showOk = false } = {}) {
        const overlay = this.createTutorialOverlay();
        overlay.style.display = 'flex';
        document.getElementById('tutorialText').innerHTML = text;
        const prev = document.getElementById('tutorialPrev');
        prev.style.display = prevVisible ? 'inline-block' : 'none';
        const next = document.getElementById('tutorialNext');
        next.style.display = 'inline-block';
        next.textContent = nextText;
        next.onclick = () => onNext && onNext();
        prev.onclick = () => onPrev && onPrev();
        
    }

    hideTutorial() {
        if (this.tutorial.overlay) this.tutorial.overlay.style.display = 'none';
    }

    async startTutorial() {
        this.tutorial.active = true;
        this.tutorial.step = 1;
        // Create a private room with bots enabled and small size
        const name = window.authManager?.getDisplayName?.() || 'You';
        const lobbyInfo = {
            lobbyName: 'Tutorial',
            lobbyDescription: 'Learn the roles with bots',
            isPublic: false,
            maxPlayers: 5,
            mafiaCount: 1,
            enableBots: true,
            botCount: 4,
            tutorial: { active: true, step: 1 }
        };
        this.socket.emit('createRoom', { playerName: name, lobbyInfo });
        this.showTutorial('Step 1: Mafia — eliminate civilians at night and blend in during the day. You will play as Mafia in this round. Press Next to begin.', {
            nextText: 'Start as Mafia',
            onNext: () => this.beginTutorialStep(1)
        });
    }

    beginTutorialStep(step) {
        if (!this.currentRoomCode) return;
        const forceRole = step === 1 ? 'mafia' : step === 2 ? 'doctor' : step === 3 ? 'detective' : 'white_police';
        this.socket.emit('setTutorialStep', { roomCode: this.currentRoomCode, step, forceRole });
        // Auto-start game
        this.socket.emit('startGame', this.currentRoomCode);
        // Guide text for each step
        const guide = step === 1
            ? 'As Mafia, you will see your role. During night, choose a target. During day, discuss and avoid suspicion.'
            : step === 2
            ? 'As Doctor, you can protect a player at night. Save yourself or an ally to block a kill.'
            : step === 3
            ? 'As Detective, investigate one player at night to learn their alignment.'
            : 'As Police, coordinate with town roles and help maintain order.';
        this.showTutorial(guide, { prevVisible: step > 1, nextText: 'Skip to End', onNext: () => this.finishTutorial(), onPrev: () => this.prevTutorialStep() });
    }

    nextTutorialStep() {
        if (this.tutorial.step < 4) {
            this.tutorial.step += 1;
            this.socket.emit('returnToLobby', this.currentRoomCode);
            setTimeout(() => this.beginTutorialStep(this.tutorial.step), 500);
        } else {
            this.finishTutorial();
        }
    }

    prevTutorialStep() {
        if (this.tutorial.step > 1) {
            this.tutorial.step -= 1;
            this.socket.emit('returnToLobby', this.currentRoomCode);
            setTimeout(() => this.beginTutorialStep(this.tutorial.step), 500);
        }
    }

    finishTutorial() {
        this.hideTutorial();
        this.showToast('Tutorial complete! You are ready to play.', 'success');
        this.tutorial.active = false;
        // Return to main menu or lobby
        if (this.currentRoomCode) this.socket.emit('returnToLobby', this.currentRoomCode);
    }

    startRoleTutorial(role) {
        const modal = document.getElementById('tutorialModal');
        if (modal) modal.style.display = 'none';
        this.tutorial.active = true;
        this.tutorial.step = ['mafia','doctor','detective','white_police','suicide_bomber'].indexOf(role) + 1 || 1;
        const name = window.authManager?.getDisplayName?.() || 'You';
        const lobbyInfo = {
            lobbyName: `Tutorial: ${role}`,
            lobbyDescription: 'Role-focused tutorial with bots',
            isPublic: false,
            maxPlayers: 5,
            mafiaCount: 3,
            enableBots: true,
            botCount: 4,
            tutorial: { active: true, step: role }
        };
        this.socket.emit('createRoom', { playerName: name, lobbyInfo });
        const labelMap = { mafia: 'Mafia', doctor: 'Doctor', detective: 'Detective', white_police: 'Police', suicide_bomber: 'Suicide Bomber' };
        const label = labelMap[role] || 'Role';
        this.showTutorial(`You chose the ${label} tutorial. Press Start to begin.`, {
            nextText: 'Start',
            onNext: () => this.beginTutorialStep(this.tutorial.step)
        });
    }

    startGrayPoliceTutorial() {
        // replaced by sandbox version; keep as no-op
    }

    promptGrayAlignment() {
        // replaced by sandbox version; keep as no-op
    }

    beginGrayAlignment() {
        // replaced by sandbox version; keep as no-op
    }

    startSandboxTutorial(role, onFinish = null) {
        this.tutorial.active = true;
        this.tutorial.step = role;
        this.sandbox = {
            role,
            players: [
                { id: 'you', name: 'You', role: role, alive: true },
                { id: 'bot1', name: 'AI Alpha', role: 'civilian', alive: true },
                { id: 'bot2', name: 'AI Beta', role: role === 'detective' || role === 'black_police' || role === 'manipulator' || role === 'suicide_bomber' ? 'mafia' : 'civilian', alive: true },
                { id: 'bot3', name: 'AI Gamma', role: 'civilian', alive: true }
            ],
            stage: 0,
            onFinish
        };
        // Do NOT open game window; keep user on main menu and show overlay only
        document.getElementById('lobbyScreen').style.display = 'block';
        document.getElementById('gameScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        this.currentScreen = 'lobby';
        this.showSandboxIntro();
    }

    showSandboxIntro() {
        const role = this.sandbox.role;
        const introMap = {
            mafia: 'Mafia: Eliminate at night and blend in during the day. Doctor protection can prevent your kill.',
            doctor: 'Doctor: Protect one player at night. Your protection blocks kills for that night.',
            detective: 'Detective: Investigate at night to learn if someone is Mafia or Civilian.',
            white_police: 'White Police: Support town with coordination and safe voting.',
            black_police: 'Black Police: Secretly support Mafia; you can coordinate covertly.',
            gray_police: 'Gray Police: Choose your allegiance (Mafia or Town) at the start.',
            suicide_bomber: 'Suicide Bomber: When about to be eliminated, you die and may take others with you, unless they are protected.',
            manipulator: 'Manipulator: Influence outcome by redirecting votes.',
            civilian: 'Civilian: Discuss, deduce, and vote wisely with limited information.'
        };
        this.showTutorial(introMap[role] || 'Tutorial', { nextText: 'Start', prevVisible: false, onNext: () => this.renderSandbox() });
    }

    renderSandbox() {
        const { role, players, stage = 0 } = this.sandbox;
        const text = document.getElementById('tutorialText');
        const others = players.filter(p => p.id !== 'you');
        const statusLines = others.map(p => `${p.name} — ${p.alive ? 'Alive' : 'Eliminated'}`).join('<br>');
        let title = 'Action';
        let buttons = '';
        if (role === 'mafia') {
            title = stage === 0 ? 'Night Action: Choose a target' : 'Night Action: Make a kill';
            buttons = stage === 0
                ? others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target\" data-id=\"${p.id}\">Kill ${p.name}</button>`).join(' ')
                : others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target2\" data-id=\"${p.id}\">Kill ${p.name}</button>`).join(' ');
        } else if (role === 'doctor') {
            title = 'Night Action: Choose someone to protect';
            buttons = others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target\" data-id=\"${p.id}\">Protect ${p.name}</button>`).join(' ');
        } else if (role === 'detective') {
            title = stage === 0 ? 'Investigate: Choose a target' : 'Investigate: Confirm another target';
            buttons = stage === 0
                ? others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target\" data-id=\"${p.id}\">Investigate ${p.name}</button>`).join(' ')
                : others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target2\" data-id=\"${p.id}\">Investigate ${p.name}</button>`).join(' ');
        } else if (role === 'white_police') {
            title = 'Day Coordination: Identify a safe vote. (Example only — no real elimination.)';
            buttons = others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target\" data-id=\"${p.id}\">Mark ${p.name} as suspicious</button>`).join(' ');
        } else if (role === 'black_police') {
            title = 'Covert Support: Identify the mafia ally and send a silent signal.';
            buttons = `<button class=\"btn-secondary sandbox-target\" data-id=\"bot2\">Signal AI Beta (Mafia)</button>`;
        } else if (role === 'gray_police') {
            title = stage === 0 ? 'Choose Allegiance' : 'Choose Allegiance Again';
            buttons = stage === 0
                ? `<button class=\"btn-secondary sandbox-target\" data-id=\"choose_black\">Support Black (Mafia)</button>`
                : `<button class=\"btn-secondary sandbox-target2\" data-id=\"choose_white\">Support White (Town)</button>`;
        } else if (role === 'suicide_bomber') {
            title = 'When you are about to be eliminated, simulate trigger';
            buttons = `<button class=\"btn-secondary sandbox-target\" data-id=\"trigger\">Simulate Elimination</button>`;
        } else if (role === 'manipulator') {
            title = 'Vote Manipulation: Choose who to redirect a vote to (demo only).';
            buttons = others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target\" data-id=\"${p.id}\">Redirect vote to ${p.name}</button>`).join(' ');
        } else if (role === 'civilian') {
            title = 'Voting Basics: Mark a suspect (demo only)';
            buttons = others.filter(p => p.alive).map(p => `<button class=\"btn-secondary sandbox-target\" data-id=\"${p.id}\">Vote ${p.name}</button>`).join(' ');
        }
        text.innerHTML = `
            <strong>${title}</strong><br><br>
            ${statusLines}<br><br>
            <div id=\"sandboxButtons\">${buttons}</div>
        `;
        const next = document.getElementById('tutorialNext'); if (next) next.style.display = 'none';
        const prev = document.getElementById('tutorialPrev'); if (prev) prev.style.display = 'none';
        Array.from(document.querySelectorAll('.sandbox-target')).forEach(btn => { btn.onclick = () => this.handleSandboxAction(btn.getAttribute('data-id')); });
        Array.from(document.querySelectorAll('.sandbox-target2')).forEach(btn => { btn.onclick = () => this.handleSandboxActionSecond(btn.getAttribute('data-id')); });
    }

    handleSandboxActionSecond(targetId) {
        const { role, players } = this.sandbox;
        const target = players.find(p => p.id === targetId);
        if (role === 'mafia') {
            this.showTutorial(`${target?.name || 'Target'} was eliminated.`, { nextText: 'OK', onNext: () => this.finishSandbox() });
        } else if (role === 'detective') {
            this.showTutorial(`Investigation result: ${target?.name || 'Target'} is Civilian.`, { nextText: 'OK', onNext: () => this.finishSandbox() });
        } else if (role === 'gray_police') {
            this.showTutorial('You chose to support White (Town). Coordinate and help the town win.', { nextText: 'OK', onNext: () => this.finishSandbox() });
        }
    }

    handleSandboxAction(targetId) {
        const { role, players, stage = 0 } = this.sandbox;
        const target = players.find(p => p.id === targetId);
        if (role === 'mafia') {
            this.showTutorial(`You attempted to eliminate ${target?.name || 'someone'}. If protected by the Doctor, the kill will be blocked.`, { nextText: 'Continue', onNext: () => { this.sandbox.stage = 1; this.renderSandbox(); } });
        } else if (role === 'doctor') {
            this.showTutorial(`You protected ${target?.name || 'someone'}. If attacked tonight, your protection would save them.`, { nextText: 'OK', onNext: () => this.finishSandbox() });
        } else if (role === 'detective') {
            // First investigation scripted to Mafia
            this.showTutorial(`Investigation result: ${target?.name || 'Target'} is Mafia.`, { nextText: 'Continue', onNext: () => { this.sandbox.stage = 1; this.renderSandbox(); } });
        } else if (role === 'white_police') {
            this.showTutorial(`You marked ${target?.name || 'someone'} as suspicious. Coordinate and avoid rushing votes.`, { nextText: 'OK', onNext: () => this.finishSandbox() });
        } else if (role === 'black_police') {
            this.showTutorial(`You signaled your mafia ally (AI Beta). In real games, you can see mafia info and coordinate covertly.`, { nextText: 'OK', onNext: () => this.finishSandbox() });
        } else if (role === 'gray_police') {
            if (targetId === 'choose_black') {
                this.showTutorial('You chose to support Black (Mafia). You can observe mafia coordination covertly.', { nextText: 'Continue', onNext: () => { this.sandbox.stage = 1; this.renderSandbox(); } });
            } else if (targetId === 'choose_white') {
                this.showTutorial('You chose to support White (Town). Coordinate and help the town win.', { nextText: 'OK', onNext: () => this.finishSandbox() });
            }
        } else if (role === 'suicide_bomber') {
            if (targetId === 'trigger') {
                this.showTutorial('You triggered your final act. You die. The Doctor protected your target, so they survive.', { nextText: 'OK', onNext: () => this.finishSandbox() });
            }
        } else if (role === 'manipulator') {
            this.showTutorial(`You redirected the vote to ${target?.name || 'someone'}. In real games, this affects tallying.`, { nextText: 'OK', onNext: () => this.finishSandbox() });
        } else if (role === 'civilian') {
            this.showTutorial(`You voted ${target?.name || 'someone'}. In real games, majority decides and discussion matters.`, { nextText: 'OK', onNext: () => this.finishSandbox() });
        }
    }

    finishSandbox() {
        this.hideTutorial();
        // Stop here for tutorials: do not navigate or sequence unless explicitly running a sequence
        if (this.tutorial.sequence && this.tutorial.sequence.length > 0) {
            this._advanceSandboxSequence();
        }
    }

	startSandboxSequence(sequence) {
		if (!Array.isArray(sequence) || sequence.length === 0) { this.finishTutorial(); return; }
		this.tutorial.sequence = sequence.slice();
		this._advanceSandboxSequence();
	}

	_advanceSandboxSequence() {
		const seq = this.tutorial.sequence || [];
		if (seq.length === 0) { this.tutorial.sequence = null; this.finishTutorial(); return; }
		const current = seq.shift();
		this.tutorial.sequence = seq;
		this.startSandboxTutorial(current, () => this._advanceSandboxSequence());
	}

    updateMobilePhaseBar() {
        const bar = document.getElementById('mobilePhaseBar');
        if (!bar) return;
        // Only show on small screens
        const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile) {
            bar.style.display = 'none';
            return;
        }
        // Compose compact info
        const phase = this.gameState?.phase || 'Lobby';
        const timerEl = document.getElementById('timer');
        const timerText = timerEl ? timerEl.textContent : '--:--';
        let roleText = '';
        if (this.playerRole && this.gameState?.gameStarted) {
            const roleName = this.playerRole.charAt(0).toUpperCase() + this.playerRole.slice(1);
            roleText = ` • ${roleName}`;
        }
        let hint = '';
        if (!this.isDead()) {
            if (phase === 'day') hint = ' • Vote during day';
            else if (phase === 'night') {
                if (this.playerRole === 'mafia') hint = ' • Choose a target';
                else if (this.playerRole === 'detective') hint = ' • Investigate a player';
                else if (this.playerRole === 'doctor') hint = ' • Protect someone';
            }
        } else {
            hint = ' • You are eliminated';
        }
        bar.textContent = `${phase.toUpperCase()} • ${timerText}${roleText}${hint}`;
        bar.style.display = 'block';
    }

    sendPoliceChat() {
        const input = document.getElementById('policeInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text || text.length > 200) return;
        if (this.currentRoomCode) {
            this.socket.emit('policeChatMessage', { roomCode: this.currentRoomCode, message: text, playerName: this.playerName });
            input.value = '';
        }
    }

    addPoliceChatMessage(playerName, message, own) {
        const list = document.getElementById('policeMessages');
        if (!list) return;
        const div = document.createElement('div');
        div.className = own ? 'chat-message own' : 'chat-message';
        div.innerHTML = `<strong>${playerName}</strong>: ${this.escapeHtml(message)}`;
        list.appendChild(div);
        list.scrollTop = list.scrollHeight;
    }

    showPoliceAlignmentChoice() {
        // Simple inline modal using existing modal styles
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        const content = document.createElement('div');
        content.className = 'modal-content';
        const title = document.createElement('h3');
        title.textContent = 'Choose Police Alignment';
        const desc = document.createElement('p');
        desc.textContent = 'You currently appear as Gray Police. Choose to align with White (Town) or Black (Mafia).';
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '0.5rem';
        actions.style.justifyContent = 'center';
        const whiteBtn = document.createElement('button');
        whiteBtn.className = 'btn-primary';
        whiteBtn.textContent = 'Become White Police';
        const blackBtn = document.createElement('button');
        blackBtn.className = 'btn-secondary';
        blackBtn.textContent = 'Become Black Police';
        whiteBtn.onclick = () => { this.choosePoliceAlignment('white'); document.body.removeChild(modal); };
        blackBtn.onclick = () => { this.choosePoliceAlignment('black'); document.body.removeChild(modal); };
        actions.appendChild(whiteBtn);
        actions.appendChild(blackBtn);
        content.appendChild(title);
        content.appendChild(desc);
        content.appendChild(actions);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    choosePoliceAlignment(alignment) {
        if (!this.currentRoomCode) return;
        this.socket.emit('choosePoliceAlignment', { roomCode: this.currentRoomCode, alignment });
    }
}

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new VelmoraGame();
    // Game will start with lobby screen, comic intro will play when game starts
});