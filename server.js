const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const Database = require('./database-mongo');
const BotManager = require('./bot-manager');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// File uploads setup
const uploadsRoot = path.join(__dirname, 'uploads');
const avatarDir = path.join(uploadsRoot, 'avatars');
try { fs.mkdirSync(avatarDir, { recursive: true }); } catch {}
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, avatarDir),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		const filename = `${req.session?.userId || 'anon'}-${Date.now()}${ext}`;
		cb(null, filename);
	}
});
const upload = multer({
	storage,
	limits: { fileSize: 2 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
		const ext = path.extname(file.originalname).toLowerCase();
		if (allowed.includes(ext)) return cb(null, true);
		cb(new Error('Invalid file type'));
	}
});

// Initialize database
const db = new Database();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsRoot));

// Session configuration
app.use(session({
	secret: process.env.SESSION_SECRET || 'velmora-secret-key-change-in-production',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: false, // Set to true in production with HTTPS
		maxAge: 24 * 60 * 60 * 1000 // 24 hours
	}
}));

// Rate limiting
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 5, // limit each IP to 5 requests per windowMs
	message: 'Too many authentication attempts, please try again later.'
});

// Profile update endpoints
app.post('/api/profile/display-name', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const { displayName } = req.body;
		if (!displayName || displayName.trim().length < 3 || displayName.trim().length > 30) {
			return res.status(400).json({ error: 'Display name must be 3-30 characters' });
		}
		await db.updateDisplayName(req.session.userId, displayName.trim());
		res.json({ success: true, displayName: displayName.trim() });
	} catch (error) {
		console.error('Update display name error:', error);
		res.status(500).json({ error: 'Failed to update display name' });
	}
});

app.post('/api/profile/avatar', upload.single('avatar'), async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
		const relativeUrl = `/uploads/avatars/${req.file.filename}`;
		await db.updateAvatarUrl(req.session.userId, relativeUrl);
		res.json({ success: true, avatarUrl: relativeUrl });
	} catch (error) {
		console.error('Update avatar error:', error);
		res.status(400).json({ error: error.message || 'Failed to update avatar' });
	}
});

// Profile updates
app.post('/api/profile/username', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const { username } = req.body;
		if (!username || username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 chars' });
		await db.updateUsername(req.session.userId, username.trim());
		res.json({ success: true, username: username.trim() });
	} catch (e) {
		res.status(400).json({ error: e.message || 'Failed to update username' });
	}
});

app.post('/api/profile/bio', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const { bio } = req.body;
		await db.updateBio(req.session.userId, (bio || '').slice(0, 280));
		res.json({ success: true });
	} catch (e) {
		res.status(500).json({ error: 'Failed to update bio' });
	}
});

app.post('/api/profile/privacy', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const { dmFromFriendsOnly, friendRequestsEnabled } = req.body;
		await db.updatePrivacy(req.session.userId, {
			dm_from_friends_only: !!dmFromFriendsOnly,
			friend_requests_enabled: friendRequestsEnabled !== false
		});
		res.json({ success: true });
	} catch (e) {
		res.status(500).json({ error: 'Failed to update privacy' });
	}
});

// Authentication routes
app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, displayName } = req.body;

        // Validation
        if (!username || !email || !password || !displayName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user already exists
        const existingUser = await db.getUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const existingEmail = await db.getUserByEmail(email);
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Create user
        const user = await db.createUser(username, email, password, displayName);
        req.session.userId = user.id;
        req.session.username = user.username;

        // Fetch full profile for friend code and avatar
        const fullUser = await db.getUserById(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatarUrl: fullUser?.avatar_url || null,
                friendCode: fullUser?.friend_code || null
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
	try {
		const { username, password } = req.body;
		const identifier = username; // can be username or email

		if (!identifier || !password) {
			return res.status(400).json({ error: 'Username/Email and password are required' });
		}

		const user = await db.validateUser(identifier, password);
		if (!user) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		req.session.userId = user.id;
		req.session.username = user.username;

		// Fetch full profile for friend code
		const fullUser = await db.getUserById(user.id);

		res.json({
			success: true,
			user: {
				id: user.id,
				username: user.username,
				displayName: user.displayName,
				email: user.email,
				totalGames: user.totalGames,
				totalWins: user.totalWins,
				mafiaWins: user.mafiaWins,
				civilianWins: user.civilianWins,
				favoriteRole: user.favoriteRole,
				avatarUrl: user.avatarUrl || fullUser?.avatar_url || null,
				friendCode: fullUser?.friend_code || null
			}
		});
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({ error: 'Login failed' });
	}
});

app.post('/api/logout', (req, res) => {
    if (req.session.userId) {
        db.setUserOffline(req.session.userId);
    }
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

app.get('/api/profile', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = await db.getUserById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            email: user.email,
            totalGames: user.total_games,
            totalWins: user.total_wins,
            mafiaWins: user.mafia_wins,
            civilianWins: user.civilian_wins,
            favoriteRole: user.favorite_role,
            createdAt: user.created_at,
            avatarUrl: user.avatar_url || null,
            friendCode: user.friend_code || null
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.get('/api/friends', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const friends = await db.getFriends(req.session.userId);
        const friendRequests = await db.getFriendRequests(req.session.userId);

        res.json({
            friends: friends,
            friendRequests: friendRequests
        });
    } catch (error) {
        console.error('Friends fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch friends' });
    }
});

app.post('/api/friends/add', async (req, res) => {
	try {
		if (!req.session.userId) {
			return res.status(401).json({ error: 'Not authenticated' });
		}

		const { username, friendCode } = req.body;
		if (!username && !friendCode) {
			return res.status(400).json({ error: 'Username or Friend Code is required' });
		}

		let targetUser = null;
		if (friendCode) targetUser = await db.getUserByFriendCode(friendCode.trim());
		if (!targetUser && username) targetUser = await db.getUserByUsername(username.trim());
		if (!targetUser) return res.status(404).json({ error: 'User not found' });
		if (targetUser.friend_requests_enabled === false) {
			return res.status(403).json({ error: 'This user is not accepting friend requests' });
		}

		let result;
		if (friendCode) {
			result = await db.sendFriendRequestByCode(req.session.userId, friendCode.trim());
		} else {
			result = await db.sendFriendRequest(req.session.userId, username.trim());
		}
		res.json({ success: true, friend: result });
	} catch (error) {
		console.error('Add friend error:', error);
		res.status(400).json({ error: error.message });
	}
});

app.post('/api/friends/accept', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { friendId } = req.body;
        if (!friendId) {
            return res.status(400).json({ error: 'Friend ID is required' });
        }

        await db.acceptFriendRequest(req.session.userId, friendId);
        res.json({ success: true });
    } catch (error) {
        console.error('Accept friend error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/friends/deny', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { friendId } = req.body;
        if (!friendId) {
            return res.status(400).json({ error: 'Friend ID is required' });
        }

        await db.denyFriendRequest(req.session.userId, friendId);
        res.json({ success: true });
    } catch (error) {
        console.error('Deny friend error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/friends/:friendId', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { friendId } = req.params;
        		await db.removeFriend(req.session.userId, friendId);
        res.json({ success: true });
    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
});

app.get('/api/game-history', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const history = await db.getUserGameHistory(req.session.userId, 20);
        res.json(history);
    } catch (error) {
        console.error('Game history error:', error);
        res.status(500).json({ error: 'Failed to fetch game history' });
    }
});

// Lobby management endpoints
app.get('/api/lobbies/public', (req, res) => {
    try {
        const search = req.query.search?.toLowerCase() || '';
        const sort = (req.query.sort || 'new').toString(); // new|players_desc|players_asc
        const hideStarted = req.query.hideStarted === 'true';
        let lobbies = Array.from(publicLobbies.values())
            .filter(lobby => {
                const matches = lobby.lobbyName.toLowerCase().includes(search) ||
                                lobby.lobbyDescription.toLowerCase().includes(search);
                const startedOk = hideStarted ? !lobby.gameStarted : true;
                return matches && startedOk;
            })
            .map(lobby => ({
                roomCode: lobby.roomCode,
                lobbyName: lobby.lobbyName,
                lobbyDescription: lobby.lobbyDescription,
                hostName: lobby.hostName,
                hostId: lobby.hostId,
                playerCount: lobby.playerCount,
                maxPlayers: lobby.maxPlayers,
                gameStarted: lobby.gameStarted,
                createdAt: lobby.createdAt,
                mafiaCount: lobby.mafiaCount
            }));
        if (sort === 'players_desc') lobbies.sort((a,b) => b.playerCount - a.playerCount);
        else if (sort === 'players_asc') lobbies.sort((a,b) => a.playerCount - b.playerCount);
        else lobbies.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(lobbies);
    } catch (error) {
        console.error('Public lobbies error:', error);
        res.status(500).json({ error: 'Failed to fetch lobbies' });
    }
});

app.post('/api/lobbies/create', async (req, res) => {
    try {
        const { 
            lobbyName, 
            lobbyDescription, 
            isPublic, 
            maxPlayers, 
            mafiaCount, 
            suicideBomberEnabled, 
            manipulatorEnabled, 
            autoPoliceRoles 
        } = req.body;

        // Validation
        if (!lobbyName || lobbyName.trim().length === 0) {
            return res.status(400).json({ error: 'Lobby name is required' });
        }

        if (lobbyName.length > 30) {
            return res.status(400).json({ error: 'Lobby name must be 30 characters or less' });
        }

        // Validate game settings
        if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
            return res.status(400).json({ error: `Max players must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}` });
        }

        const maxAllowedMafia = getMaxMafiaCount(maxPlayers);
        if (mafiaCount < 1 || mafiaCount > maxAllowedMafia) {
            return res.status(400).json({ error: `Mafia count must be between 1 and ${maxAllowedMafia} for ${maxPlayers} players` });
        }

        if (suicideBomberEnabled && mafiaCount < 3) {
            return res.status(400).json({ error: 'Suicide Bomber requires at least 3 Mafia members' });
        }

        // Generate room code
        const roomCode = generateRoomCode();
        
        // Create lobby info
        const lobbyInfo = {
            lobbyName: lobbyName.trim(),
            lobbyDescription: lobbyDescription?.trim() || '',
            isPublic: isPublic !== false,
            maxPlayers: parseInt(maxPlayers),
            mafiaCount: parseInt(mafiaCount),
            suicideBomberEnabled: !!suicideBomberEnabled,
            manipulatorEnabled: !!manipulatorEnabled,
            autoPoliceRoles: autoPoliceRoles !== false
        };

        res.json({
            success: true,
            roomCode: roomCode,
            lobbyInfo: lobbyInfo
        });
    } catch (error) {
        console.error('Create lobby error:', error);
        res.status(500).json({ error: 'Failed to create lobby' });
    }
});

// Room-based game state
const rooms = new Map();
const userSessions = new Map(); // Track user sessions for authentication

// Lobby management
const publicLobbies = new Map(); // Track public lobbies for browsing

// Bot management
const roomBotManagers = new Map(); // roomCode -> BotManager instance

// Create a new room with initial state
function createRoom(roomCode, hostId, lobbyInfo = null) {
    return {
        roomCode,
        hostId,
        phase: 'lobby', // lobby, day, night, voting, gameOver
        players: new Map(),
        deadPlayers: new Set(),
        votes: new Map(),
        dayCount: 0,
        timeRemaining: 0,
        gameStarted: false,
        timer: null,
        nightActionsUsed: new Set(), // Track night actions used this phase
        protectedPlayers: new Set(), // Track players protected by doctor
        mafiaKillTarget: null, // Store the target for the mafia kill action
        // Lobby information
        lobbyName: lobbyInfo?.lobbyName || 'Untitled Lobby',
        lobbyDescription: lobbyInfo?.lobbyDescription || '',
        isPublic: lobbyInfo?.isPublic !== false, // Default to public
        createdAt: new Date().toISOString(),
        settings: {
            maxPlayers: lobbyInfo?.maxPlayers || 10,
            mafiaCount: lobbyInfo?.mafiaCount || 2,
            // New role toggles
            suicideBomberEnabled: lobbyInfo?.suicideBomberEnabled || false,
            manipulatorEnabled: lobbyInfo?.manipulatorEnabled || false,
            autoPoliceRoles: lobbyInfo?.autoPoliceRoles !== false,
            // Bot settings
            enableBots: lobbyInfo?.enableBots || false,
            botCount: lobbyInfo?.botCount || 1,
            // Host controls
            isLocked: lobbyInfo?.isLocked || false,
            inviteQuota: lobbyInfo?.inviteQuota || 20
        },
        // Host-managed whitelist (user IDs allowed when locked)
        whitelist: new Set(),
        // Invite quota window
        inviteWindowStart: Date.now(),
        invitesSentInWindow: 0,
        // Tutorial metadata
        tutorial: lobbyInfo?.tutorial || { active: false, step: 0, forceRole: null },
        // Win tracking
        winStats: {
            mafiaWins: 0,
            civilianWins: 0,
            totalGames: 0
        }
    };
}

// Role definitions
const ROLES = {
    MAFIA: 'mafia',
    DETECTIVE: 'detective',
    CIVILIAN: 'civilian',
    DOCTOR: 'doctor',
    POLICE: 'police',
    CORRUPT_POLICE: 'corrupt_police',
    // New roles
    SUICIDE_BOMBER: 'suicide_bomber',
    MANIPULATOR: 'manipulator',
    WHITE_POLICE: 'white_police',
    BLACK_POLICE: 'black_police',
    GRAY_POLICE: 'gray_police'
};

const ROLE_DESCRIPTIONS = {
    [ROLES.MAFIA]: 'Eliminate civilians and blend in during the day. Work with other mafia members to win.',
    [ROLES.DETECTIVE]: 'Investigate players at night to find the mafia. Help civilians identify threats.',
    [ROLES.CIVILIAN]: 'Vote out the mafia during day phases. Use discussion and deduction to win.',
    [ROLES.DOCTOR]: 'Protect one player each night from elimination. You can protect yourself or others. Your protection works even if you are killed.',
    [ROLES.POLICE]: 'Help investigate and protect innocent players', 
    [ROLES.CORRUPT_POLICE]: 'You are secretly working with the mafia while appearing as police',
    // New role descriptions
    [ROLES.SUICIDE_BOMBER]: '🔥 Mafia role: When discovered and about to be eliminated, choose specific players to kill in your final act of defiance! (Doctor protection applies)',
    [ROLES.MANIPULATOR]: '🧠 Mafia role: Alter votes, spread false information, and redirect suspicion during discussions.',
    [ROLES.WHITE_POLICE]: '🚔 Civilian-aligned Police: Investigate one player per round to reveal their alignment.',
    [ROLES.BLACK_POLICE]: '⚫ Civilian-aligned Police: Eliminate suspects without full proof, but risk killing innocents.',
    [ROLES.GRAY_POLICE]: '🔘 Neutral Police: Choose to secretly support either Mafia or Civilians during the game.'
};

// Game configuration
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 20;
const DAY_DURATION = 120; // 2 minutes
const NIGHT_DURATION = 60; // 1 minute
const VOTING_DURATION = 60; // 1 minute

// Room code generation
function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    // Ensure uniqueness
    if (rooms.has(result)) {
        return generateRoomCode();
    }
    return result;
}

// Get maximum allowed mafia count for given player count
function getMaxMafiaCount(playerCount) {
    if (playerCount >= 15 && playerCount <= 20) return 4;  // 15-20 players: max 4 mafia
    if (playerCount >= 7 && playerCount <= 14) return 3;   // 7-14 players: max 3 mafia
    if (playerCount >= 5 && playerCount <= 6) return 2;    // 5-6 players: max 2 mafia
    if (playerCount >= 4 && playerCount <= 4) return 1;    // 4 players: max 1 mafia
    return 1; // Default fallback
}

// Utility functions
function generateRoles(playerCount, settings) {
    const roles = [];
    const { mafiaCount, suicideBomberEnabled, manipulatorEnabled, autoPoliceRoles } = settings;
    
    let specialMafiaCount = 0;
    let policeCount = 0;
    let detectiveCount = 0;
    let doctorCount = 0;
    
    // Add base mafia members
    let baseMafiaCount = mafiaCount;
    
    // Handle special mafia roles
    if (mafiaCount >= 3 && suicideBomberEnabled) {
        roles.push(ROLES.SUICIDE_BOMBER);
        specialMafiaCount++;
        baseMafiaCount--; // Replace one regular mafia with suicide bomber
    }
    
    if (manipulatorEnabled) {
        roles.push(ROLES.MANIPULATOR);
        specialMafiaCount++;
        baseMafiaCount--; // Replace one regular mafia with manipulator
    }
    
    // Add remaining regular mafia members
    for (let i = 0; i < baseMafiaCount; i++) {
        roles.push(ROLES.MAFIA);
    }
    
    // Add police roles for 10+ players
    if (playerCount >= 10 && autoPoliceRoles) {
        roles.push(ROLES.WHITE_POLICE);
        roles.push(ROLES.BLACK_POLICE);
        roles.push(ROLES.GRAY_POLICE);
        policeCount = 3;
    }
    
    // Add one detective if enough players (minimum 5 players for detective)
    if (playerCount >= 5) {
        roles.push(ROLES.DETECTIVE);
        detectiveCount = 1;
    }
    
    // Add one doctor if 5 or more players
    if (playerCount >= 5) {
        roles.push(ROLES.DOCTOR);
        doctorCount = 1;
    }
    
    // Fill remaining slots with civilians
    while (roles.length < playerCount) {
        roles.push(ROLES.CIVILIAN);
    }
    
    // Shuffle roles randomly for fair distribution
    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    
    const totalMafiaCount = mafiaCount; // Original total mafia count
    const civilianCount = playerCount - totalMafiaCount - detectiveCount - doctorCount - policeCount;
    
    console.log(`Generated roles for ${playerCount} players:`);
    console.log(`- ${totalMafiaCount} Total Mafia (${baseMafiaCount} regular, ${specialMafiaCount} special)`);
    console.log(`- ${detectiveCount} Detective, ${doctorCount} Doctor`);
    console.log(`- ${policeCount} Police (White/Black/Gray)`);
    console.log(`- ${civilianCount} Civilians`);
    
    return roles;
}

// Bot management functions
function createBotManager(roomCode) {
    const botManager = new BotManager();
    roomBotManagers.set(roomCode, botManager);
    return botManager;
}

function getBotManager(roomCode) {
    return roomBotManagers.get(roomCode);
}

function addBotsToRoom(roomCode) {
	const room = rooms.get(roomCode);
	if (!room || !room.settings.enableBots) return;

	const botManager = getBotManager(roomCode) || createBotManager(roomCode);
	const maxPlayers = room.settings.maxPlayers || 10;
	const currentHumans = Array.from(room.players.values()).filter(p => !p.isBot).length;
	const currentBots = Array.from(room.players.values()).filter(p => p.isBot).length;
	const desiredBots = Math.max(0, Math.min(room.settings.botCount || 0, Math.max(0, maxPlayers - currentHumans)));
	
	if (currentBots < desiredBots) {
		const toAdd = desiredBots - currentBots;
		for (let i = 0; i < toAdd; i++) {
			const bot = botManager.createBot();
			room.players.set(bot.id, {
				id: bot.id,
				userId: null,
				name: bot.name,
				role: null,
				alive: true,
				isAuthenticated: false,
				isBot: true
			});
		}
		console.log(`Added ${toAdd} bots to room ${roomCode}`);
		return toAdd;
	}
	
	if (currentBots > desiredBots) {
		let toRemove = currentBots - desiredBots;
		for (const [playerId, player] of room.players) {
			if (toRemove <= 0) break;
			if (player.isBot) {
				room.players.delete(playerId);
				botManager.removeBot(playerId);
				toRemove--;
			}
		}
		console.log(`Trimmed bots to selected count in room ${roomCode}`);
		return 0;
	}
}

function removeBotsFromRoom(roomCode) {
    const room = rooms.get(roomCode);
    const botManager = getBotManager(roomCode);
    
    if (!room || !botManager) return 0;

    let removedCount = 0;
    for (const [playerId, player] of room.players) {
        if (player.isBot) {
            room.players.delete(playerId);
            botManager.removeBot(playerId);
            removedCount++;
        }
    }

    console.log(`Removed ${removedCount} bots from room ${roomCode}`);
    return removedCount;
}

function shouldAddBots(roomCode) {
	const room = rooms.get(roomCode);
	if (!room || !room.settings.enableBots) return false;
	const currentHumans = Array.from(room.players.values()).filter(p => !p.isBot).length;
	const currentBots = Array.from(room.players.values()).filter(p => p.isBot).length;
	const desiredBots = room.settings.botCount || 0;
	const maxPlayers = room.settings.maxPlayers || 10;
	return currentHumans + currentBots < Math.min(maxPlayers, currentHumans + desiredBots) && currentBots < desiredBots;
}

function hasHumanPlayers(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return false;
    
    const humanPlayerCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
    return humanPlayerCount > 0;
}

function scheduleBotVoting(roomCode) {
    const room = rooms.get(roomCode);
    const botManager = getBotManager(roomCode);
    
    if (!room || !botManager || room.phase !== 'day') {
        console.log(`❌ Cannot schedule bot voting: room=${!!room}, botManager=${!!botManager}, phase=${room?.phase}`);
        return;
    }
    
    const alivePlayers = Array.from(room.players.values())
        .filter(p => !room.deadPlayers.has(p.id));
    
    const aliveBots = alivePlayers.filter(p => p.isBot);
    
    console.log(`🤖 Scheduling voting for ${aliveBots.length} bots in room ${roomCode}`);
    
    if (aliveBots.length === 0) {
        console.log(`⚠️ No alive bots found to schedule voting`);
        return;
    }
    
    // Schedule voting for each alive bot
    aliveBots.forEach(bot => {
        const gameState = {
            currentVotes: room.votes,
            phase: room.phase,
            dayCount: room.dayCount
        };
        
        botManager.scheduleBotVote(bot.id, alivePlayers, gameState, (botId, targetId) => {
            // Execute bot vote
            executeBotVote(roomCode, botId, targetId);
        });
    });
}

function executeBotVote(roomCode, botId, targetId) {
    const room = rooms.get(roomCode);
    
    if (!room || room.phase !== 'day' || room.deadPlayers.has(botId)) {
        console.log(`❌ Bot vote rejected: room=${!!room}, phase=${room?.phase}, botDead=${room?.deadPlayers.has(botId)}`);
        return;
    }
    
    // Validate target
    if (room.deadPlayers.has(targetId) || targetId === botId) {
        console.log(`❌ Bot vote invalid target: targetDead=${room.deadPlayers.has(targetId)}, selfVote=${targetId === botId}`);
        return;
    }
    
    // Store the vote
    room.votes.set(botId, targetId);
    const targetPlayer = room.players.get(targetId);
    const botPlayer = room.players.get(botId);
    
    console.log(`✅ Bot vote stored: ${botPlayer?.name} → ${targetPlayer?.name} (Total votes: ${room.votes.size})`);
    
    if (!targetPlayer || !botPlayer) {
        console.log(`❌ Missing player data: bot=${!!botPlayer}, target=${!!targetPlayer}`);
        return;
    }
    
    // Broadcast vote information (same as human votes)
    const voteCounts = new Map();
    const voteDetails = [];
    
    for (const [voter, target] of room.votes) {
        if (!room.deadPlayers.has(voter)) {
            voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
            
            const voterName = room.players.get(voter).name;
            const targetName = room.players.get(target).name;
            voteDetails.push({
                voterName: voterName,
                targetName: targetName,
                voterId: voter,
                targetId: target
            });
        }
    }
    
    io.to(roomCode).emit('voteUpdate', {
        totalVotes: room.votes.size,
        alivePlayers: Array.from(room.players.keys()).filter(id => !room.deadPlayers.has(id)).length,
        voteCounts: Array.from(voteCounts.entries()).map(([playerId, votes]) => ({
            playerName: room.players.get(playerId).name,
            votes: votes
        })),
        voteDetails: voteDetails,
        latestVote: {
            voterName: botPlayer.name,
            targetName: targetPlayer.name,
            isBot: true
        }
    });
    
    // Update bot manager with voting event
    const botManager = getBotManager(roomCode);
    if (botManager) {
        botManager.onGameEvent('voteReceived', {
            voterPlayerId: botId,
            targetPlayerId: targetId,
            phase: room.phase
        });
    }
    
    console.log(`Bot ${botPlayer.name} voted for ${targetPlayer.name} in room ${roomCode}`);
    
    // Check if all alive players have voted (including bots)
    const alivePlayers = Array.from(room.players.keys()).filter(id => !room.deadPlayers.has(id));
    const votersWhoVoted = Array.from(room.votes.keys()).filter(id => !room.deadPlayers.has(id));
    
    if (votersWhoVoted.length === alivePlayers.length) {
        // All alive players have voted, process immediately
        console.log(`🎯 All ${alivePlayers.length} alive players voted in room ${roomCode} - processing votes early (bot triggered)`);
        
        // Clear existing timer
        if (room.timer) {
            clearInterval(room.timer);
            room.timer = null;
        }
        
        // Notify clients that voting ended early
        io.to(roomCode).emit('phaseEnded', {
            reason: 'All players voted',
            message: 'All players have voted! Processing results...'
        });
        
        // Process votes after a brief delay
        setTimeout(() => {
            processVotesAndStartNight(roomCode);
        }, 2000); // 2 second delay to show results
    }
}

function checkAllNightActionsComplete(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'night') return false;
    
    const alivePlayers = Array.from(room.players.values())
        .filter(p => !room.deadPlayers.has(p.id));
    
    // Check if mafia has made their kill (if there are mafia alive)
    const aliveMafia = alivePlayers.filter(p => 
        p.role === ROLES.MAFIA || p.role === ROLES.SUICIDE_BOMBER || p.role === ROLES.MANIPULATOR
    );
    const mafiaKillMade = room.nightActionsUsed.has('mafia_kill');
    
    // Check if detective has investigated (if there's a detective alive)
    const aliveDetectives = alivePlayers.filter(p => p.role === ROLES.DETECTIVE);
    let detectiveInvestigated = true;
    
    for (const detective of aliveDetectives) {
        const detectiveActionKey = `detective_investigate_${detective.id}`;
        if (!room.nightActionsUsed.has(detectiveActionKey)) {
            detectiveInvestigated = false;
            break;
        }
    }
    
    // Check if doctor has protected (if there's a doctor alive)
    const aliveDoctors = alivePlayers.filter(p => p.role === ROLES.DOCTOR);
    let doctorProtected = true;
    
    for (const doctor of aliveDoctors) {
        const doctorActionKey = `doctor_protect_${doctor.id}`;
        if (!room.nightActionsUsed.has(doctorActionKey)) {
            doctorProtected = false;
            break;
        }
    }
    
    // All actions complete if:
    // 1. Mafia has made their kill (or no mafia alive)
    // 2. All detectives have investigated (or no detectives alive)
    // 3. All doctors have protected (or no doctors alive)
    const allActionsComplete = (aliveMafia.length === 0 || mafiaKillMade) && 
                               (aliveDetectives.length === 0 || detectiveInvestigated) &&
                               (aliveDoctors.length === 0 || doctorProtected);
    
    return allActionsComplete;
}

function endPhaseEarly(roomCode, reason) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Clear the current timer
    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }
    
    // Set time remaining to 0
    room.timeRemaining = 0;
    
    // Notify players
    io.to(roomCode).emit('phaseEnded', { reason });
    
    // Transition to next phase
    if (room.phase === 'night') {
        setTimeout(() => {
            startDayPhase(roomCode);
        }, 2000); // Brief delay to show the message
    }
    
    console.log(`Phase ended early in room ${roomCode}: ${reason}`);
}

function broadcastGameStateToRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const publicGameState = {
        phase: room.phase,
        playerCount: room.players.size,
        players: Array.from(room.players.values()).map(p => ({ id: p.id, userId: p.userId || null, name: p.name, role: p.role, alive: p.alive, isBot: !!p.isBot })),
        alivePlayers: Array.from(room.players.values())
            .filter(p => !room.deadPlayers.has(p.id))
            .map(p => ({ id: p.id, name: p.name, alive: true })),
        deadPlayers: Array.from(room.deadPlayers).map(playerId => {
            const player = room.players.get(playerId);
            return { id: playerId, name: player ? player.name : 'Unknown Player', alive: false };
        }),
        dayCount: room.dayCount,
        timeRemaining: room.timeRemaining,
        gameStarted: room.gameStarted,
        roomCode: roomCode,
        hostId: room.hostId,
        settings: room.settings,
        winStats: room.winStats
    };
    
    io.to(roomCode).emit('gameState', publicGameState);
}

function checkWinCondition(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return null;
    
    const alivePlayers = Array.from(room.players.values())
        .filter(p => !room.deadPlayers.has(p.id));
    
    // Count mafia vs innocent players (include all mafia types)
    const aliveMafia = alivePlayers.filter(p => 
        p.role === ROLES.MAFIA || p.role === ROLES.SUICIDE_BOMBER || p.role === ROLES.MANIPULATOR
    );
    const aliveInnocents = alivePlayers.filter(p => 
        p.role === ROLES.DETECTIVE || p.role === ROLES.CIVILIAN || p.role === ROLES.DOCTOR ||
        p.role === ROLES.WHITE_POLICE || p.role === ROLES.BLACK_POLICE
    );
    
    // Gray Police is neutral and doesn't count for either side in win conditions
    // (They can choose their allegiance during gameplay)
    
    console.log(`Win condition check for room ${roomCode}: ${aliveMafia.length} Mafia, ${aliveInnocents.length} Innocents`);
    
    // Innocents win if all mafia are eliminated
    if (aliveMafia.length === 0) {
        return {
            winner: 'innocents',
            reason: 'All Mafia members have been eliminated!',
            survivors: aliveInnocents.map(p => ({ name: p.name, role: p.role })),
            totalDays: room.dayCount
        };
    }
    
    // Mafia wins if they equal or outnumber innocents
    if (aliveMafia.length >= aliveInnocents.length) {
        return {
            winner: 'mafia',
            reason: `Mafia (${aliveMafia.length}) equal or outnumber innocents (${aliveInnocents.length})!`,
            survivors: aliveMafia.map(p => ({ name: p.name, role: p.role })),
            totalDays: room.dayCount
        };
    }
    
    return null; // Game continues
}

async function endGameWithTracking(roomCode, winCondition) {
    const room = rooms.get(roomCode);
    if (!room || !winCondition) return;
    
    try {
        // Create game session in database
        const sessionId = await db.createGameSession(roomCode, room.players.size);
        const gameStartTime = room.gameStartTime || Date.now();
        const gameDuration = Math.floor((Date.now() - gameStartTime) / 1000); // in seconds
        
        // End the game session
        await db.endGameSession(sessionId, winCondition.winner, winCondition.totalDays, gameDuration);
        
        // Update player statistics
        for (const [playerId, player] of room.players) {
            const survived = !room.deadPlayers.has(playerId);
            let won = false;
            
            // Determine if player won
            if (winCondition.winner === 'mafia') {
                won = (player.role === 'mafia' || player.role === 'suicide_bomber' || player.role === 'manipulator');
            } else if (winCondition.winner === 'innocents') {
                won = !(player.role === 'mafia' || player.role === 'suicide_bomber' || player.role === 'manipulator');
            }
            
            // Add to game participants
            await db.addGameParticipant(sessionId, player.userId, player.name, player.role, survived, won);
            
            // Update user stats if authenticated
            if (player.userId) {
                await db.updateUserStats(player.userId, player.role, won, winCondition.winner);
            }
        }
        
        console.log(`Game statistics saved for room ${roomCode}, session ${sessionId}`);
    } catch (error) {
        console.error('Error saving game statistics:', error);
    }
    
    // Update win statistics
    room.winStats.totalGames++;
    if (winCondition.winner === 'mafia') {
        room.winStats.mafiaWins++;
    } else if (winCondition.winner === 'innocents') {
        room.winStats.civilianWins++;
    }
    
    // Add win stats to the win condition data
    winCondition.winStats = {
        mafiaWins: room.winStats.mafiaWins,
        civilianWins: room.winStats.civilianWins,
        totalGames: room.winStats.totalGames
    };
    
    room.phase = 'gameOver';
    io.to(roomCode).emit('gameOver', winCondition);
    
    // Broadcast updated game state with new win stats
    broadcastGameStateToRoom(roomCode);
    
    console.log(`Game ended in room ${roomCode}: ${winCondition.winner} wins after ${winCondition.totalDays} days`);
    console.log(`Room ${roomCode} stats: Mafia ${room.winStats.mafiaWins} - ${room.winStats.civilianWins} Civilians (${room.winStats.totalGames} total games)`);
}

function startPhaseTimer(roomCode, duration, nextPhase) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.timeRemaining = duration;
    
    if (room.timer) {
        clearInterval(room.timer);
    }
    
    room.timer = setInterval(() => {
        room.timeRemaining--;
        
        if (room.timeRemaining <= 0) {
            clearInterval(room.timer);
            room.timer = null;
            
            if (nextPhase === 'day') {
                startDayPhase(roomCode);
            } else if (nextPhase === 'night') {
                startNightPhase(roomCode);
            } else if (nextPhase === 'processVotesAndNight') {
                processVotesAndStartNight(roomCode);
            }
        }
        
        broadcastGameStateToRoom(roomCode);
    }, 1000);
}

function startDayPhase(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Process night actions before starting day phase
    const gameCanContinue = processNightActions(roomCode);
    if (!gameCanContinue) {
        return; // Game ended during night action processing
    }
    
    room.phase = 'day';
    room.dayCount++;
    room.votes.clear();
    
    const alivePlayers = Array.from(room.players.values())
        .filter(p => !room.deadPlayers.has(p.id));
    
    io.to(roomCode).emit('phaseChange', {
        phase: 'day',
        message: `Day ${room.dayCount} begins! Discuss and vote - ${alivePlayers.length} players deciding fate.`
    });
    
    // Schedule bot voting for day phase
    scheduleBotVoting(roomCode);
    
    // Day phase now includes voting - when timer ends, process votes and go to night
    const isTutorial = room.tutorial?.active === true;
    const dayDuration = isTutorial ? 25 : DAY_DURATION;
    startPhaseTimer(roomCode, dayDuration, 'processVotesAndNight');
    broadcastGameStateToRoom(roomCode);
    console.log(`Day ${room.dayCount} started in room ${roomCode} - ${dayDuration} seconds for discussion and voting`);
}

function processNightActions(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return false;
    
    // Process mafia kill if one was decided
    if (room.mafiaKillTarget) {
        const targetPlayer = room.players.get(room.mafiaKillTarget);
        if (targetPlayer && !room.deadPlayers.has(room.mafiaKillTarget)) {
            
            // Check if target was protected by doctor
            if (room.protectedPlayers && room.protectedPlayers.has(room.mafiaKillTarget)) {
                // Target was protected, kill fails
                
                // Check if doctor saved themselves
                let doctorPlayer = null;
                for (const [playerId, player] of room.players) {
                    if (player.role === ROLES.DOCTOR && !room.deadPlayers.has(playerId)) {
                        doctorPlayer = player;
                        break;
                    }
                }
                
                if (room.mafiaKillTarget === doctorPlayer?.id) {
                    // Doctor saved themselves
                    io.to(roomCode).emit('playerSaved', {
                        playerId: null,
                        playerName: null,
                        message: `No one died tonight. The village is safe... for now.`
                    });
                    console.log(`Doctor ${targetPlayer.name} saved themselves in room ${roomCode}`);
                } else {
                    // Doctor saved someone else
                    io.to(roomCode).emit('playerSaved', {
                        playerId: null,
                        playerName: null,
                        message: `No one died tonight. The village is safe... for now.`
                    });
                    console.log(`${targetPlayer.name} was attacked by Mafia but protected by Doctor in room ${roomCode}`);
                }
            } else {
                // No protection, kill succeeds
                room.deadPlayers.add(room.mafiaKillTarget);
                
                // Check if the killed player was the doctor
                let wasDoctor = targetPlayer.role === ROLES.DOCTOR;
                let doctorProtectedSomeoneElse = false;
                
                if (wasDoctor && room.protectedPlayers && room.protectedPlayers.size > 0) {
                    // Doctor died but protected someone else
                    doctorProtectedSomeoneElse = true;
                    const protectedPlayerId = Array.from(room.protectedPlayers)[0];
                    const protectedPlayer = room.players.get(protectedPlayerId);
                    
                    io.to(roomCode).emit('playerEliminated', {
                        playerId: room.mafiaKillTarget,
                        playerName: targetPlayer.name,
                        phase: 'night',
                        message: `${targetPlayer.name} was eliminated by the Mafia. Someone was protected tonight.`
                    });
                } else {
                    io.to(roomCode).emit('playerEliminated', {
                        playerId: room.mafiaKillTarget,
                        playerName: targetPlayer.name,
                        phase: 'night'
                    });
                }
                
                console.log(`Mafia eliminated ${targetPlayer.name} (${targetPlayer.role}) in room ${roomCode}`);
            }
        }
        
        // Clear the mafia kill target after processing
        room.mafiaKillTarget = null;
    } else {
        // No mafia kill target, check if doctor protected someone anyway
        if (room.protectedPlayers && room.protectedPlayers.size > 0) {
            io.to(roomCode).emit('playerSaved', {
                playerId: null,
                playerName: null,
                message: `The night was peaceful. No one was attacked.`
            });
        }
    }
    
    // Don't check win condition immediately after night actions
    // Let the day phase proceed and check win condition after voting
    return true; // Indicate game continues
}

function startNightPhase(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.phase = 'night';
    room.votes.clear();
    room.nightActionsUsed.clear(); // Reset night actions for new night
    room.protectedPlayers = new Set(); // Clear doctor protections from previous night
    room.mafiaKillTarget = null; // Clear mafia kill target for new night
    
    // Determine if this is the first night or a regular night
    const isFirstNight = room.dayCount === 0;
    
    // Only check win condition after the first night (not at game start)
    if (!isFirstNight) {
        const winCondition = checkWinCondition(roomCode);
        if (winCondition) {
            endGameWithTracking(roomCode, winCondition);
            return;
        }
    }
    const nightMessage = isFirstNight 
        ? '🌙 The game begins under cover of darkness. Special roles, make your first moves!'
        : `🌙 Night ${room.dayCount} falls on Volmora. Special roles, make your moves!`;
    
    io.to(roomCode).emit('phaseChange', {
        phase: 'night',
        message: nightMessage
    });
    
    const isTutorial = room.tutorial?.active === true;
    const nightDuration = isTutorial ? 20 : NIGHT_DURATION;
    startPhaseTimer(roomCode, nightDuration, 'day');
    broadcastGameStateToRoom(roomCode);
    
    const nightLabel = isFirstNight ? 'Night 0 (First Night)' : `Night ${room.dayCount}`;
    console.log(`${nightLabel} started in room ${roomCode} - ${nightDuration} seconds for actions`);
}

// Voting phase has been integrated into the day phase
// This function is no longer used

function processVotes(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return { eliminated: null, maxVotes: 0, tie: false };
    
    const voteCounts = new Map();
    const voteDetails = new Map(); // Track who voted for whom
    
    console.log(`📊 Processing votes for room ${roomCode}:`);
    console.log(`  Total votes stored: ${room.votes.size}`);
    console.log(`  Dead players: ${Array.from(room.deadPlayers).map(id => room.players.get(id)?.name).join(', ')}`);
    console.log(`  All votes in Map:`, Array.from(room.votes.entries()).map(([voter, target]) => 
        `${room.players.get(voter)?.name}(${room.players.get(voter)?.isBot ? 'bot' : 'human'}) → ${room.players.get(target)?.name}`).join(', '));
    
    // Count votes from alive players only
    for (const [voter, target] of room.votes) {
        const voterPlayer = room.players.get(voter);
        const targetPlayer = room.players.get(target);
        const isVoterDead = room.deadPlayers.has(voter);
        
        console.log(`  Vote: ${voterPlayer?.name} → ${targetPlayer?.name} (voter dead: ${isVoterDead}, voter is bot: ${voterPlayer?.isBot})`);
        
        if (!room.deadPlayers.has(voter)) {
            voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
            if (!voteDetails.has(target)) {
                voteDetails.set(target, []);
            }
            const voterName = room.players.get(voter).name;
            voteDetails.get(target).push(voterName);
            console.log(`    ✅ Vote counted: ${voterName} → ${targetPlayer?.name}`);
        } else {
            console.log(`    ❌ Vote rejected: ${voterPlayer?.name} is dead`);
        }
    }
    
    console.log(`📈 Final vote counts:`, Array.from(voteCounts.entries()).map(([target, votes]) => 
        `${room.players.get(target)?.name}: ${votes}`).join(', '));
    
    let maxVotes = 0;
    let eliminated = null;
    let tieCount = 0;
    
    // Find player(s) with most votes
    for (const [target, votes] of voteCounts) {
        if (votes > maxVotes) {
            maxVotes = votes;
            eliminated = target;
            tieCount = 1;
        } else if (votes === maxVotes && votes > 0) {
            tieCount++;
            eliminated = null; // Clear elimination due to tie
        }
    }
    
    const result = {
        eliminated: eliminated,
        maxVotes: maxVotes,
        tie: tieCount > 1 && maxVotes > 0,
        voteCounts: voteCounts,
        voteDetails: voteDetails
    };
    
    // Handle elimination or tie
    if (result.tie) {
        io.to(roomCode).emit('votingResult', {
            type: 'tie',
            message: `Voting resulted in a tie! No one was eliminated.`,
            voteCounts: Array.from(voteCounts.entries()).map(([playerId, votes]) => ({
                playerName: room.players.get(playerId).name,
                votes: votes
            }))
        });
        console.log(`Voting tie in room ${roomCode} - no elimination`);
    } else if (eliminated && maxVotes > 0) {
        const eliminatedPlayer = room.players.get(eliminated);
        
        // Check if eliminated player is a Suicide Bomber
        if (eliminatedPlayer.role === ROLES.SUICIDE_BOMBER) {
            // Don't eliminate immediately - give Suicide Bomber a chance to activate ability
            io.to(eliminated).emit('suicideBomberActivation', {
                message: `💥 You've been discovered! Choose up to 2 players to eliminate with you!`,
                availableTargets: Array.from(room.players.entries())
                    .filter(([id, player]) => id !== eliminated && !room.deadPlayers.has(id))
                    .map(([id, player]) => ({ id, name: player.name }))
            });
            
            io.to(roomCode).emit('votingResult', {
                type: 'suicideBomberDiscovered',
                message: `${eliminatedPlayer.name} was discovered! They have 30 seconds to make their final choice...`,
                eliminatedPlayer: {
                    name: eliminatedPlayer.name
                },
                voteCounts: Array.from(voteCounts.entries()).map(([playerId, votes]) => ({
                    playerName: room.players.get(playerId).name,
                    votes: votes
                }))
            });
            
            // Set timer for suicide bomber decision (30 seconds)
            room.suicideBomberTimer = setTimeout(() => {
                // Time's up - proceed with normal elimination
                completeSuicideBomberElimination(roomCode, eliminated, [], maxVotes);
            }, 30000);
            
            console.log(`${eliminatedPlayer.name} (Suicide Bomber) discovered in room ${roomCode} - awaiting target selection`);
        } else {
            // Normal elimination
            room.deadPlayers.add(eliminated);
            
            io.to(roomCode).emit('playerEliminated', {
                playerId: eliminated,
                playerName: eliminatedPlayer.name,
                phase: 'day',
                votes: maxVotes
            });
            
            io.to(roomCode).emit('votingResult', {
                type: 'elimination',
                message: `${eliminatedPlayer.name} was eliminated with ${maxVotes} vote(s)!`,
                eliminatedPlayer: {
                    name: eliminatedPlayer.name
                },
                voteCounts: Array.from(voteCounts.entries()).map(([playerId, votes]) => ({
                    playerName: room.players.get(playerId).name,
                    votes: votes
                }))
            });
            
            console.log(`${eliminatedPlayer.name} eliminated in room ${roomCode} with ${maxVotes} votes`);
        }
    } else {
        io.to(roomCode).emit('votingResult', {
            type: 'noVotes',
            message: 'No votes were cast. No one was eliminated.',
            voteCounts: []
        });
        console.log(`No votes cast in room ${roomCode}`);
    }
    
    return result;
}

function completeSuicideBomberElimination(roomCode, suicideBomberId, selectedTargets, originalVotes) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const suicideBomber = room.players.get(suicideBomberId);
    
    // Clear the timer if it exists
    if (room.suicideBomberTimer) {
        clearTimeout(room.suicideBomberTimer);
        room.suicideBomberTimer = null;
    }
    
    // Eliminate the suicide bomber
    room.deadPlayers.add(suicideBomberId);
    
    // Eliminate selected targets (checking for Doctor protection)
    const eliminatedTargets = [];
    const protectedTargets = [];
    
    for (const targetId of selectedTargets) {
        if (!room.deadPlayers.has(targetId)) {
            const targetPlayer = room.players.get(targetId);
            
            // Check if target was protected by doctor
            if (room.protectedPlayers && room.protectedPlayers.has(targetId)) {
                // Target was protected, they survive the bombing
                protectedTargets.push(targetPlayer.name);
                console.log(`${targetPlayer.name} was targeted by Suicide Bomber but protected by Doctor in room ${roomCode}`);
            } else {
                // No protection, target is eliminated
                room.deadPlayers.add(targetId);
                eliminatedTargets.push(targetPlayer.name);
            }
        }
    }
    
    // Send elimination notification
    io.to(roomCode).emit('playerEliminated', {
        playerId: suicideBomberId,
        playerName: suicideBomber.name,
        phase: 'day',
        votes: originalVotes,
        suicideBomberTargets: eliminatedTargets,
        protectedTargets: protectedTargets
    });
    
    // Send special message about the suicide bombing
    let message = `💥 ${suicideBomber.name}`;
    
    if (eliminatedTargets.length > 0 && protectedTargets.length > 0) {
        message += ` went out with a bang, taking ${eliminatedTargets.join(' and ')} with them! 🛡️ However, ${protectedTargets.join(' and ')} were protected by the Doctor!`;
    } else if (eliminatedTargets.length > 0) {
        message += ` went out with a bang, taking ${eliminatedTargets.join(' and ')} with them!`;
    } else if (protectedTargets.length > 0) {
        message += ` tried to take ${protectedTargets.join(' and ')} with them, but the Doctor's protection saved them! 🛡️`;
    } else {
        message += ` chose not to take anyone with them...`;
    }
    
    io.to(roomCode).emit('suicideBomberResult', {
        bomberName: suicideBomber.name,
        targetsEliminated: eliminatedTargets,
        targetsProtected: protectedTargets,
        message: message
    });
    
    let logMessage = `Suicide Bomber ${suicideBomber.name} eliminated in room ${roomCode}`;
    if (eliminatedTargets.length > 0) {
        logMessage += `, eliminated ${eliminatedTargets.length} targets: ${eliminatedTargets.join(', ')}`;
    }
    if (protectedTargets.length > 0) {
        logMessage += `, ${protectedTargets.length} targets protected: ${protectedTargets.join(', ')}`;
    }
    console.log(logMessage);
}

function processVotesAndStartNight(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    console.log(`Processing votes for room ${roomCode}...`);
    
    // Process votes and get result
    const voteResult = processVotes(roomCode);
    
    // Check win condition after potential elimination
    const winCondition = checkWinCondition(roomCode);
    if (winCondition) {
        endGameWithTracking(roomCode, winCondition);
        return;
    }

    // Transition to night phase after a brief delay to show voting results
    setTimeout(() => {
        startNightPhase(roomCode);
    }, 3000); // 3 second delay to show voting results
}

function resetGameState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Reset game state but keep players and room settings
    room.phase = 'lobby';
    room.gameStarted = false;
    room.dayCount = 0;
    room.deadPlayers.clear();
    room.votes.clear();
    room.nightActionsUsed.clear();
    room.protectedPlayers = new Set();
    room.mafiaKillTarget = null; // Clear mafia kill target
    room.timeRemaining = 0;
    
    // Clear timers
    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }
    
    // Reset player roles
    for (const [playerId, player] of room.players) {
        player.role = null;
        player.alive = true;
    }
    
    console.log(`Game state reset for room ${roomCode}`);
    broadcastGameStateToRoom(roomCode);
}

function updatePublicLobby(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.isPublic) return;
    
    const hostPlayer = room.players.get(room.hostId);
    if (!hostPlayer) return;
    
    publicLobbies.set(roomCode, {
        roomCode: roomCode,
        lobbyName: room.lobbyName,
        lobbyDescription: room.lobbyDescription,
        hostName: hostPlayer.name,
        hostId: room.hostId,
        playerCount: room.players.size,
        maxPlayers: room.settings.maxPlayers,
        gameStarted: room.gameStarted,
        createdAt: room.createdAt,
        mafiaCount: room.settings.mafiaCount
    });
}

function cleanupRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (room && room.timer) {
        clearInterval(room.timer);
    }
    
    // Cleanup bot manager
    const botManager = roomBotManagers.get(roomCode);
    if (botManager) {
        botManager.cleanup();
        roomBotManagers.delete(roomCode);
    }
    
    rooms.delete(roomCode);
    publicLobbies.delete(roomCode); // Also remove from public lobbies
}

// Share session with socket.io
io.use((socket, next) => {
    const sessionStore = socket.request.session;
    socket.userId = sessionStore?.userId;
    socket.username = sessionStore?.username;
    next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id, socket.userId ? `(User: ${socket.username})` : '(Guest)');
    
    // Store socket with user mapping
    if (socket.userId) {
        userSessions.set(socket.userId, socket.id);
    }
    
    socket.on('authenticateSocket', async (sessionData) => {
        try {
            if (sessionData && sessionData.userId) {
                socket.userId = sessionData.userId;
                socket.username = sessionData.username;
                userSessions.set(socket.userId, socket.id);
                
                // Update user online status
                await db.updateLastLogin(socket.userId);
                
                				socket.emit('socketAuthenticated', {
					userId: socket.userId,
					username: socket.username
				});
				
				console.log(`Socket authenticated for user: ${socket.username}`);
				// Propagate userId into any existing room player entry for this socket
				for (const [code, room] of rooms) {
					if (room.players && room.players.has(socket.id)) {
						const player = room.players.get(socket.id);
						player.userId = socket.userId;
						player.isAuthenticated = true;
						room.players.set(socket.id, player);
						broadcastGameStateToRoom(code);
						break;
					}
				}
            }
        } catch (error) {
            console.error('Socket authentication error:', error);
        }
    });
    
    socket.on('createRoom', async (data) => {
        let playerName, userId = null, lobbyInfo = null;
        
        if (typeof data === 'string') {
            // Guest mode - just player name
            playerName = data;
        } else {
            // Authenticated mode or lobby creation
            playerName = data.playerName || data.displayName;
            userId = socket.userId;
            lobbyInfo = data.lobbyInfo;
        }
        
        if (!playerName || playerName.trim().length === 0) {
            socket.emit('error', 'Please enter your name');
            return;
        }
        
        if (playerName.length > 20) {
            socket.emit('error', 'Name must be 20 characters or less');
            return;
        }
        
        const roomCode = data.roomCode || generateRoomCode();
        const room = createRoom(roomCode, socket.id, lobbyInfo);
        
        // Tutorial rooms are always private and have bots to fill
        if (room.tutorial?.enabled) {
            room.isPublic = false;
            room.settings.enableBots = true;
            // Pre-add bots to reach at least 5 players total (host + 4 bots)
            const botManager = getBotManager(roomCode) || createBotManager(roomCode);
            while (room.players.size < 5) {
                const bot = botManager.createBot();
                room.players.set(bot.id, {
                    id: bot.id,
                    userId: null,
                    name: bot.name,
                    role: null,
                    alive: true,
                    isAuthenticated: false,
                    isBot: true
                });
            }
        }
        
        rooms.set(roomCode, room);
        
        const player = {
            id: socket.id,
            userId: userId, // Store database user ID
            name: playerName.trim(),
            role: null,
            alive: true,
            isAuthenticated: !!userId
        };
        
        room.players.set(socket.id, player);
        socket.join(roomCode);
        
        // Check if we should add bots to reach minimum players
        if (!room.tutorial?.enabled && shouldAddBots(roomCode)) {
            addBotsToRoom(roomCode);
        }
        
        // Add to public lobbies if it's public
        if (room.isPublic) {
            publicLobbies.set(roomCode, {
                roomCode: roomCode,
                lobbyName: room.lobbyName,
                lobbyDescription: room.lobbyDescription,
                hostName: player.name,
                hostId: socket.id,
                playerCount: room.players.size,
                maxPlayers: room.settings.maxPlayers,
                gameStarted: room.gameStarted,
                createdAt: room.createdAt,
                mafiaCount: room.settings.mafiaCount
            });
        }
        
        socket.emit('roomCreated', {
            roomCode: roomCode,
            playerId: socket.id,
            playerName: player.name,
            isAuthenticated: player.isAuthenticated,
            lobbyInfo: lobbyInfo
        });
    
        // If tutorial, hint client to auto-start
        if (room.tutorial?.enabled) {
            io.to(socket.id).emit('tutorialInfo', {
                step: room.tutorial.step,
                message: 'Tutorial room created. The game will auto-start to teach your role.'
            });
        }
        
        broadcastGameStateToRoom(roomCode);
        updatePublicLobby(roomCode);
        console.log(`Room ${roomCode} created by ${playerName}${userId ? ` (ID: ${userId})` : ' (Guest)'} - Lobby: ${room.lobbyName}`);
    });
    
    socket.on('joinRoom', (data) => {
        let roomCode, playerName, userId = null;
        
        if (typeof data === 'object' && data.roomCode) {
            // New format with authentication support
            roomCode = data.roomCode;
            playerName = data.playerName || data.displayName;
            userId = socket.userId;
        } else {
            // Legacy format or guest mode
            roomCode = data.roomCode || data;
            playerName = data.playerName;
        }
        
        if (!playerName || playerName.trim().length === 0) {
            socket.emit('error', 'Please enter your name');
            return;
        }
        
        if (playerName.length > 20) {
            socket.emit('error', 'Name must be 20 characters or less');
            return;
        }
        
        if (!roomCode || roomCode.trim().length === 0) {
            socket.emit('error', 'Please enter a room code');
            return;
        }
        
        const room = rooms.get(roomCode.toUpperCase());
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        // Enforce lock/whitelist
        if (room.settings.isLocked) {
            if (!userId || !room.whitelist.has(userId)) {
                socket.emit('error', 'Room is locked');
                return;
            }
        }
        
        // Free up space by removing bots if the lobby is full and game not started
        if (!room.gameStarted && room.players.size >= room.settings.maxPlayers) {
            const botManager = getBotManager(roomCode) || null;
            let needed = room.players.size - room.settings.maxPlayers + 1; // slots to free for this join
            for (const [pid, p] of room.players) {
                if (needed <= 0) break;
                if (p.isBot) {
                    room.players.delete(pid);
                    if (botManager) botManager.removeBot(pid);
                    needed--;
                }
            }
        }
        
        if (room.players.size >= room.settings.maxPlayers) {
            socket.emit('error', 'Room is full');
            return;
        }
        
        if (room.gameStarted) {
            socket.emit('error', 'Game already in progress');
            return;
        }
        
        const player = {
            id: socket.id,
            userId: userId, // Store database user ID
            name: playerName.trim(),
            role: null,
            alive: true,
            isAuthenticated: !!userId
        };
        
        room.players.set(socket.id, player);
        socket.join(roomCode);
        
        socket.emit('roomJoined', {
            roomCode: roomCode,
            playerId: socket.id,
            playerName: player.name,
            isAuthenticated: player.isAuthenticated,
            lobbyInfo: {
                lobbyName: room.lobbyName || 'Untitled Lobby',
                description: room.description || '',
                isPublic: room.isPublic || false,
                hostName: room.hostName || 'Unknown'
            }
        });
        
        socket.to(roomCode).emit('playerJoined', {
            playerId: socket.id,
            playerName: player.name,
            isAuthenticated: player.isAuthenticated
        });
        
        // Check if we should remove bots (if we now have enough human players)
        const humanPlayerCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
        if (humanPlayerCount >= 4 && room.settings.enableBots) {
            removeBotsFromRoom(roomCode);
        } else if (shouldAddBots(roomCode)) {
            // Or add bots if we still need them (only if human players present)
            addBotsToRoom(roomCode);
        }
        
        // If this was the first human player to join a bot-only room, ensure they become host
        if (humanPlayerCount === 1 && room.players.size > 1) {
            const currentHost = room.players.get(room.hostId);
            if (currentHost && currentHost.isBot) {
                // Transfer host from bot to human player
                room.hostId = socket.id;
                socket.to(roomCode).emit('hostChanged', {
                    newHostId: socket.id,
                    newHostName: player.name
                });
                console.log(`Host transferred from bot to human player ${player.name} in room ${roomCode}`);
            }
        }
        
        broadcastGameStateToRoom(roomCode);
        updatePublicLobby(roomCode);
        console.log(`${playerName} joined room ${roomCode}${userId ? ` (ID: ${userId})` : ' (Guest)'}`);
    });
    
    socket.on('startGame', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (!room.players.has(socket.id)) {
            socket.emit('error', 'You are not in this room');
            return;
        }
        
        if (socket.id !== room.hostId) {
            socket.emit('error', 'Only the room host can start the game');
            return;
        }
        
        if (room.players.size < MIN_PLAYERS) {
            socket.emit('error', `Need at least ${MIN_PLAYERS} players to start`);
            return;
        }
        
        // Ensure there's at least 1 human player
        const humanPlayerCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
        if (humanPlayerCount === 0) {
            socket.emit('error', 'Cannot start game with only bots');
            return;
        }
        
        if (room.gameStarted) {
            socket.emit('error', 'Game already started');
            return;
        }
        
        // Validate mafia count against total player count (roles generated normally, but bots get civilians)
        const currentPlayerCount = room.players.size;
        const maxAllowedMafia = getMaxMafiaCount(currentPlayerCount);
        
        if (room.settings.mafiaCount > maxAllowedMafia && !room.tutorial?.enabled) {
            socket.emit('error', `Cannot start game: ${room.settings.mafiaCount} Mafia is too many for ${currentPlayerCount} players. Maximum allowed: ${maxAllowedMafia}`);
            return;
        }
        
        console.log(`✅ Mafia validation passed: ${room.settings.mafiaCount} mafia for ${currentPlayerCount} total players (${humanPlayerCount} humans, ${currentPlayerCount - humanPlayerCount} bots)`);
        
        // Generate roles for all players normally
        const allRoles = generateRoles(room.players.size, room.settings);
        
        // Tutorial forced role assignment overrides normal distribution
        const isTutorial = room.tutorial?.active === true;
        const forcedRole = room.tutorial?.forceRole;
        
        // Remove civilian roles equal to number of bots (so bots don't take special roles)
        const botCount = Array.from(room.players.values()).filter(p => p.isBot).length;
        const roles = [];
        let civiliansRemoved = 0;
        
        for (const role of allRoles) {
            if (role === ROLES.CIVILIAN && civiliansRemoved < botCount) {
                civiliansRemoved++; // Skip this civilian role (bot will get it)
            } else {
                roles.push(role); // Keep this role for humans
            }
        }
        
        // Send game start announcement to all players
        io.to(roomCode).emit('gameStarting', {
            message: `🎮 Game is starting! ${room.players.size} players, ${room.settings.mafiaCount} mafia members. The night begins... Roles are being assigned.`,
            playerCount: room.players.size,
            mafiaCount: room.settings.mafiaCount
        });
        
        // Brief delay before role assignment for dramatic effect
        setTimeout(() => {
            const mafiaMembers = [];
            
            if (room.tutorial?.active || room.tutorial?.enabled) {
                // Assign tutorial roles
                const hostId = room.hostId;
                const bots = Array.from(room.players.entries()).filter(([id, p]) => p.isBot);
                const humans = Array.from(room.players.entries()).filter(([id, p]) => !p.isBot);
                // Reset all roles
                for (const [pid, player] of room.players) {
                    player.role = ROLES.CIVILIAN;
                }
                
                // Ensure at least one mafia bot when needed
                const ensureMafiaBot = () => {
                    const mafiaBot = bots[0]?.[0];
                    if (mafiaBot) {
                        room.players.get(mafiaBot).role = ROLES.MAFIA;
                        mafiaMembers.push({ id: mafiaBot, name: room.players.get(mafiaBot).name, role: ROLES.MAFIA });
                    }
                };
                
                switch (room.tutorial.step) {
                    case 'mafia':
                        if (humans[0]) {
                            const [hid, hplayer] = humans[0];
                            hplayer.role = ROLES.MAFIA;
                            mafiaMembers.push({ id: hid, name: hplayer.name, role: ROLES.MAFIA });
                            io.to(hid).emit('roleAssigned', { role: ROLES.MAFIA, description: ROLE_DESCRIPTIONS[ROLES.MAFIA] });
                            io.to(hid).emit('tutorialInfo', { step: 'mafia', message: 'You are Mafia. Learn how to eliminate at night and blend in during the day.' });
                        }
                        break;
                    case 'doctor':
                        ensureMafiaBot();
                        if (humans[0]) {
                            const [hid, hplayer] = humans[0];
                            hplayer.role = ROLES.DOCTOR;
                            io.to(hid).emit('roleAssigned', { role: ROLES.DOCTOR, description: ROLE_DESCRIPTIONS[ROLES.DOCTOR] });
                            io.to(hid).emit('tutorialInfo', { step: 'doctor', message: 'You are the Doctor. At night, protect a player from being killed.' });
                        }
                        break;
                    case 'detective':
                        ensureMafiaBot();
                        if (humans[0]) {
                            const [hid, hplayer] = humans[0];
                            hplayer.role = ROLES.DETECTIVE;
                            io.to(hid).emit('roleAssigned', { role: ROLES.DETECTIVE, description: ROLE_DESCRIPTIONS[ROLES.DETECTIVE] });
                            io.to(hid).emit('tutorialInfo', { step: 'detective', message: 'You are the Detective. Investigate a player at night to learn their alignment.' });
                        }
                        break;
                    case 'police':
                        ensureMafiaBot();
                        if (humans[0]) {
                            const [hid, hplayer] = humans[0];
                            hplayer.role = ROLES.WHITE_POLICE;
                            io.to(hid).emit('roleAssigned', { role: ROLES.WHITE_POLICE, description: ROLE_DESCRIPTIONS[ROLES.WHITE_POLICE] });
                            io.to(hid).emit('tutorialInfo', { step: 'police', message: 'You are Police. Coordinate and use your unique win conditions wisely.' });
                        }
                        break;
                    case 'gray_police':
                        // Let client choose alignment; keep as civilian placeholder for now
                        if (humans[0]) {
                            const [hid, hplayer] = humans[0];
                            hplayer.role = ROLES.CIVILIAN;
                            io.to(hid).emit('tutorialInfo', { step: 'gray_police', message: 'Choose your allegiance: Black (Mafia) or White (Town).' });
                        }
                        break;
                    case 'suicide_bomber':
                        // Ensure another mafia-aligned entity exists for context
                        ensureMafiaBot();
                        if (humans[0]) {
                            const [hid, hplayer] = humans[0];
                            hplayer.role = ROLES.SUICIDE_BOMBER;
                            mafiaMembers.push({ id: hid, name: hplayer.name, role: ROLES.SUICIDE_BOMBER });
                            io.to(hid).emit('roleAssigned', { role: ROLES.SUICIDE_BOMBER, description: ROLE_DESCRIPTIONS[ROLES.SUICIDE_BOMBER] });
                            io.to(hid).emit('tutorialInfo', { step: 'suicide_bomber', message: 'You are the Suicide Bomber. If discovered and about to be eliminated, choose who to take down with you. Doctor protection applies.' });
                        }
                        break;
                }
                
                // Notify mafia team if applicable
                if (mafiaMembers.length > 1) {
                    // Identify black police to also receive visibility
                    const blackPoliceIds = Array.from(room.players.entries())
                        .filter(([id, p]) => p.role === ROLES.BLACK_POLICE)
                        .map(([id]) => id);
                    mafiaMembers.forEach(mafiaPlayer => {
                        const teammates = mafiaMembers.filter(member => member.id !== mafiaPlayer.id);
                        // Send to mafia members
                        io.to(mafiaPlayer.id).emit('mafiaTeamInfo', {
                            teammates: teammates,
                            message: `Your mafia teammates: ${teammates.map(t => t.name).join(', ')}`
                        });
                        // Also inform black police, but as observers (no teammates list shown to players directly)
                        for (const bpId of blackPoliceIds) {
                            io.to(bpId).emit('mafiaTeamInfo', {
                                teammates: teammates,
                                message: `Mafia members present: ${teammates.map(t => t.name).join(', ')}`
                            });
                        }
                    });
                }
                
                room.gameStarted = true;
                room.gameStartTime = Date.now();
                const botManager = getBotManager(roomCode);
                if (botManager) {
                    const allPlayers = Array.from(room.players.values());
                    botManager.onGameEvent('gameStarted', { allPlayers });
                }
                
                // Continue normal flow (start night phase etc.)
                // ... existing code continues below ...
            } else {
                // Non-tutorial existing assignment flow
                const botPlayers = Array.from(room.players.entries()).filter(([id, player]) => player.isBot);
                for (const [playerId, player] of botPlayers) {
                    player.role = ROLES.CIVILIAN;
                    console.log(`🤖 Bot ${player.name} assigned role: ${player.role} (pre-assigned)`);
                }
                const humanPlayers = Array.from(room.players.entries()).filter(([id, player]) => !player.isBot);
                let roleIndex = 0;
                for (const [playerId, player] of humanPlayers) {
                    player.role = roles[roleIndex++];
                    console.log(`👤 Human ${player.name} assigned role: ${player.role}`);
                    if (player.role === ROLES.MAFIA || player.role === ROLES.SUICIDE_BOMBER || player.role === ROLES.MANIPULATOR) {
                        mafiaMembers.push({ id: playerId, name: player.name, role: player.role });
                    }
                    io.to(playerId).emit('roleAssigned', {
                        role: player.role,
                        description: ROLE_DESCRIPTIONS[player.role]
                    });
                }
                if (mafiaMembers.length > 1) {
                    mafiaMembers.forEach(mafiaPlayer => {
                        const teammates = mafiaMembers.filter(member => member.id !== mafiaPlayer.id);
                        io.to(mafiaPlayer.id).emit('mafiaTeamInfo', {
                            teammates: teammates,
                            message: `Your mafia teammates: ${teammates.map(t => t.name).join(', ')}`
                        });
                    });
                }
                room.gameStarted = true;
                room.gameStartTime = Date.now();
                const botManager = getBotManager(roomCode);
                if (botManager) {
                    const allPlayers = Array.from(room.players.values());
                    botManager.onGameEvent('gameStarted', { allPlayers });
                }
            }
            
            // Start initial phase after a brief delay for players to read role
            setTimeout(() => {
                const roomNow = rooms.get(roomCode);
                if (!roomNow) return;
                if (roomNow.tutorial?.active || roomNow.tutorial?.enabled) {
                    const step = roomNow.tutorial?.step;
                    const startAtNight = step === 1 || step === 'mafia' || step === 2 || step === 'doctor' || step === 3 || step === 'detective';
                    if (startAtNight) startNightPhase(roomCode); else startDayPhase(roomCode);
                } else {
                    startNightPhase(roomCode);
                }
            }, 1500);
        }, 1200);
    });
    
    socket.on('updateRoomSettings', (data) => {
        const { roomCode, maxPlayers, mafiaCount, suicideBomberEnabled, manipulatorEnabled, autoPoliceRoles, enableBots, botCount, isLocked, inviteQuota } = data;
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (socket.id !== room.hostId) {
            socket.emit('error', 'Only the host can change room settings');
            return;
        }
        
        if (room.gameStarted) {
            socket.emit('error', 'Cannot change settings after game has started');
            return;
        }
        
        // Validate settings
        if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
            socket.emit('error', `Player limit must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
            return;
        }
        
        const maxAllowedMafia = getMaxMafiaCount(maxPlayers);
        if (mafiaCount < 1 || mafiaCount > maxAllowedMafia) {
            socket.emit('error', `Mafia count must be between 1 and ${maxAllowedMafia} for ${maxPlayers} players`);
            return;
        }
        
        // Check if current player count exceeds new limit
        if (room.players.size > maxPlayers) {
            socket.emit('error', 'Cannot set limit below current player count');
            return;
        }
        
        // Validate role settings
        if (suicideBomberEnabled && mafiaCount < 3) {
            socket.emit('error', 'Suicide Bomber requires at least 3 Mafia members');
            return;
        }
        
        // Update settings
        room.settings.maxPlayers = maxPlayers;
        room.settings.mafiaCount = mafiaCount;
        room.settings.suicideBomberEnabled = suicideBomberEnabled !== undefined ? suicideBomberEnabled : room.settings.suicideBomberEnabled;
        room.settings.manipulatorEnabled = manipulatorEnabled !== undefined ? manipulatorEnabled : room.settings.manipulatorEnabled;
        room.settings.autoPoliceRoles = autoPoliceRoles !== undefined ? autoPoliceRoles : room.settings.autoPoliceRoles;
        room.settings.enableBots = enableBots !== undefined ? enableBots : room.settings.enableBots;
        room.settings.botCount = botCount !== undefined ? botCount : room.settings.botCount;
        room.settings.isLocked = isLocked !== undefined ? !!isLocked : room.settings.isLocked;
        if (inviteQuota !== undefined) {
            const q = Math.max(0, Math.min(parseInt(inviteQuota), 200));
            room.settings.inviteQuota = isNaN(q) ? room.settings.inviteQuota : q;
        }
        
        // Handle bot settings changes
        if (enableBots !== undefined || botCount !== undefined) {
            const humanPlayerCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
            
            if (!room.settings.enableBots) {
                // Bots disabled - remove all bots
                removeBotsFromRoom(roomCode);
            } else if (shouldAddBots(roomCode)) {
                // Remove existing bots and add new ones based on settings
                removeBotsFromRoom(roomCode);
                addBotsToRoom(roomCode);
            } else if (humanPlayerCount >= 4) {
                // Enough human players - remove bots
                removeBotsFromRoom(roomCode);
            }
        }
        
        // Broadcast updated settings to all players in room
        io.to(roomCode).emit('roomSettingsUpdated', {
            maxPlayers: room.settings.maxPlayers,
            mafiaCount: room.settings.mafiaCount,
            suicideBomberEnabled: room.settings.suicideBomberEnabled,
            manipulatorEnabled: room.settings.manipulatorEnabled,
            autoPoliceRoles: room.settings.autoPoliceRoles,
            enableBots: room.settings.enableBots,
            botCount: room.settings.botCount,
            isLocked: room.settings.isLocked,
            inviteQuota: room.settings.inviteQuota
        });
        
        broadcastGameStateToRoom(roomCode);
        console.log(`Room ${roomCode} settings updated: locked=${room.settings.isLocked}, invites quota=${room.settings.inviteQuota}`);
    });

    socket.on('updateWhitelist', (data) => {
        const { roomCode, action, userId } = data;
        const room = rooms.get(roomCode);
        if (!room) { socket.emit('error', 'Room not found'); return; }
        if (socket.id !== room.hostId) { socket.emit('error', 'Only host can modify whitelist'); return; }
        if (action === 'add' && userId) room.whitelist.add(userId);
        if (action === 'remove' && userId) room.whitelist.delete(userId);
        // Acknowledge
        socket.emit('whitelistUpdated', { whitelist: Array.from(room.whitelist) });
    });

    socket.on('vote', (data) => {
        const { roomCode, targetPlayerId } = data;
        const room = rooms.get(roomCode);
        
        if (!room || !room.players.has(socket.id)) {
            return;
        }
        
        if (!room.gameStarted || room.deadPlayers.has(socket.id)) {
            return;
        }
        
        if (room.phase !== 'day') {
            socket.emit('error', 'Voting is only allowed during day phase');
            return;
        }
        
        if (room.deadPlayers.has(targetPlayerId)) {
            socket.emit('error', 'Cannot vote for dead player');
            return;
        }
        
        if (targetPlayerId === socket.id) {
            socket.emit('error', 'Cannot vote for yourself');
            return;
        }
        
        // Store the vote
        room.votes.set(socket.id, targetPlayerId);
        const targetPlayer = room.players.get(targetPlayerId);
        const voterPlayer = room.players.get(socket.id);
        
        socket.emit('voteConfirmed', { 
            target: targetPlayerId,
            targetName: targetPlayer.name
        });
        
        // Broadcast detailed vote information to all players (dynamically visible)
        const voteCounts = new Map();
        const voteDetails = []; // Array of individual votes with voter and target names
        
        for (const [voter, target] of room.votes) {
            if (!room.deadPlayers.has(voter)) {
                voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
                
                // Add individual vote details for transparency
                const voterName = room.players.get(voter).name;
                const targetName = room.players.get(target).name;
                voteDetails.push({
                    voterName: voterName,
                    targetName: targetName,
                    voterId: voter,
                    targetId: target
                });
            }
        }
        
        io.to(roomCode).emit('voteUpdate', {
            totalVotes: room.votes.size,
            alivePlayers: Array.from(room.players.keys()).filter(id => !room.deadPlayers.has(id)).length,
            voteCounts: Array.from(voteCounts.entries()).map(([playerId, votes]) => ({
                playerName: room.players.get(playerId).name,
                votes: votes
            })),
            voteDetails: voteDetails, // Include detailed vote information
            latestVote: {
                voterName: voterPlayer.name,
                targetName: targetPlayer.name
            }
        });
        
        console.log(`${room.players.get(socket.id).name} voted for ${targetPlayer.name} in room ${roomCode}`);
        
        // Check if all alive players have voted
        const alivePlayers = Array.from(room.players.keys()).filter(id => !room.deadPlayers.has(id));
        const votersWhoVoted = Array.from(room.votes.keys()).filter(id => !room.deadPlayers.has(id));
        
        if (votersWhoVoted.length === alivePlayers.length) {
            // All alive players have voted, process immediately
            console.log(`All ${alivePlayers.length} alive players voted in room ${roomCode} - processing votes early`);
            
            // Clear existing timer
            if (room.timer) {
                clearInterval(room.timer);
                room.timer = null;
            }
            
            // Notify clients that voting ended early
            io.to(roomCode).emit('phaseEnded', {
                reason: 'All players voted',
                message: 'All players have voted! Processing results...'
            });
            
            // Process votes after a brief delay
            setTimeout(() => {
                processVotesAndStartNight(roomCode);
            }, 2000);
        }
    });
    
    socket.on('suicideBomberTargets', (data) => {
        const { roomCode, selectedTargets } = data;
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        const player = room.players.get(socket.id);
        if (!player || player.role !== ROLES.SUICIDE_BOMBER) {
            socket.emit('error', 'Only Suicide Bombers can use this action');
            return;
        }
        
        if (room.deadPlayers.has(socket.id)) {
            socket.emit('error', 'Dead players cannot take actions');
            return;
        }
        
        // Validate selected targets (max 2, alive players only)
        const validTargets = selectedTargets.filter(targetId => {
            return targetId !== socket.id && // Can't target self
                   !room.deadPlayers.has(targetId) && // Target must be alive
                   room.players.has(targetId); // Target must exist
        }).slice(0, 2); // Maximum 2 targets
        
        // Get original vote count for this suicide bomber (they were eliminated)
        let originalVotes = 0;
        for (const [voter, target] of room.votes) {
            if (target === socket.id && !room.deadPlayers.has(voter)) {
                originalVotes++;
            }
        }
        
        // Complete the suicide bomber elimination with selected targets
        completeSuicideBomberElimination(roomCode, socket.id, validTargets, originalVotes);
        
        console.log(`Suicide Bomber ${player.name} selected targets: ${validTargets.join(', ')} in room ${roomCode}`);
    });
    
    socket.on('nightAction', (data) => {
        const { roomCode, action, target } = data;
        const room = rooms.get(roomCode);
        
        if (!room || !room.players.has(socket.id)) {
            return;
        }
        
        if (!room.gameStarted || room.deadPlayers.has(socket.id)) {
            return;
        }
        
        if (room.phase !== 'night') {
            return;
        }
        
        const player = room.players.get(socket.id);
        
        // Prevent players from targeting themselves
        if (target === socket.id) {
            socket.emit('error', 'You cannot target yourself');
            return;
        }
        
        // Mafia can eliminate players (only one kill per night, any mafia member can do it)
        if ((player.role === ROLES.MAFIA || player.role === ROLES.SUICIDE_BOMBER || player.role === ROLES.MANIPULATOR) && action === 'kill') {
            // Check if a mafia kill has already been made this night
            if (room.nightActionsUsed.has('mafia_kill')) {
                socket.emit('error', 'The Mafia has already made a kill this night');
                return;
            }
            
            // Check if target is already dead
            if (room.deadPlayers.has(target)) {
                socket.emit('error', 'This player is already dead');
                return;
            }
            
            // Check if target is also mafia (mafia cannot kill other mafia)
            const targetPlayer = room.players.get(target);
            if (targetPlayer.role === ROLES.MAFIA || targetPlayer.role === ROLES.SUICIDE_BOMBER || targetPlayer.role === ROLES.MANIPULATOR) {
                socket.emit('error', 'You cannot eliminate a fellow mafia member');
                return;
            }
            
            // Mark that mafia kill has been used this night and store the target
            room.nightActionsUsed.add('mafia_kill');
            room.mafiaKillTarget = target; // Store kill decision for later processing
            
            // Notify the mafia player that their kill decision was recorded
            socket.emit('actionConfirmed', {
                action: 'kill',
                targetName: targetPlayer.name,
                message: `You have chosen to eliminate ${targetPlayer.name}. The kill will be processed at dawn.`
            });
            
            // Notify other mafia members about the kill decision
            Array.from(room.players.entries()).forEach(([playerId, roomPlayer]) => {
                if ((roomPlayer.role === ROLES.MAFIA || roomPlayer.role === ROLES.SUICIDE_BOMBER || roomPlayer.role === ROLES.MANIPULATOR) && 
                    playerId !== socket.id && !room.deadPlayers.has(playerId)) {
                    io.to(playerId).emit('mafiaNotification', {
                        message: `${player.name} has chosen to eliminate ${targetPlayer.name}`
                    });
                }
            });
            
            console.log(`${player.name} (${player.role}) chose to eliminate ${targetPlayer.name} in room ${roomCode}`);
            
            // Check if all night actions are complete
            if (checkAllNightActionsComplete(roomCode)) {
                endPhaseEarly(roomCode, 'All night actions completed');
                return;
            }
        }
        
        // Detective can investigate (only one investigation per night)
        if (player.role === ROLES.DETECTIVE && action === 'investigate') {
            // Check if detective has already investigated this night
            const detectiveActionKey = `detective_investigate_${socket.id}`;
            if (room.nightActionsUsed.has(detectiveActionKey)) {
                socket.emit('error', 'You have already investigated someone this night');
                return;
            }
            
            // Check if target is dead
            if (room.deadPlayers.has(target)) {
                socket.emit('error', 'You cannot investigate a dead player');
                return;
            }
            
            // Mark that this detective has investigated this night
            room.nightActionsUsed.add(detectiveActionKey);
            
            const targetPlayer = room.players.get(target);
            let investigationResult = 'innocent';
            
            // Detective learns if target is mafia or not
            if (targetPlayer.role === ROLES.MAFIA) {
                investigationResult = 'suspicious';
            }
            
            socket.emit('investigationResult', {
                targetName: targetPlayer.name,
                result: investigationResult
            });
            
            socket.emit('actionConfirmed', {
                message: `Investigation completed on ${targetPlayer.name}`
            });
            
            console.log(`${player.name} (Detective) investigated ${targetPlayer.name}: ${investigationResult} in room ${roomCode}`);
            
            // Check if all night actions are complete
            if (checkAllNightActionsComplete(roomCode)) {
                endPhaseEarly(roomCode, 'All night actions completed');
                return;
            }
        }
        
        // Doctor can protect players (only one protection per night)
        if (player.role === ROLES.DOCTOR && action === 'protect') {
            // Check if doctor has already protected this night
            const doctorActionKey = `doctor_protect_${socket.id}`;
            if (room.nightActionsUsed.has(doctorActionKey)) {
                socket.emit('error', 'You have already protected someone this night');
                return;
            }
            
            // Check if target is dead
            if (room.deadPlayers.has(target)) {
                socket.emit('error', 'You cannot protect a dead player');
                return;
            }
            
            // Mark that this doctor has protected this night
            room.nightActionsUsed.add(doctorActionKey);
            
            // Store the protection for this night
            if (!room.protectedPlayers) {
                room.protectedPlayers = new Set();
            }
            room.protectedPlayers.add(target);
            
            const targetPlayer = room.players.get(target);
            
            socket.emit('actionConfirmed', {
                message: `You have protected ${targetPlayer.name}`
            });
            
            console.log(`${player.name} (Doctor) protected ${targetPlayer.name} in room ${roomCode}`);
            
            // Check if all night actions are complete
            if (checkAllNightActionsComplete(roomCode)) {
                endPhaseEarly(roomCode, 'All night actions completed');
                return;
            }
        }
    });
    
    socket.on('resetGame', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        // Only host can reset the game
        if (socket.id !== room.hostId) {
            socket.emit('error', 'Only the host can reset the game');
            return;
        }
        
        // Can only reset when game is over
        if (room.phase !== 'gameOver') {
            socket.emit('error', 'Game can only be reset when it\'s over');
            return;
        }
        
        resetGameState(roomCode);
        io.to(roomCode).emit('gameReset', 'Game has been reset by the host. Ready for a new game!');
        console.log(`Game reset by host in room ${roomCode}`);
    });

    socket.on('returnToLobby', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        // Only host can return everyone to lobby, or allow if game is over
        if (socket.id !== room.hostId && room.phase !== 'gameOver') {
            socket.emit('error', 'Only the host can return everyone to lobby');
            return;
        }
        
        // Reset game state and return everyone to lobby
        resetGameState(roomCode);
        
        // Send return to lobby event with current room data
        const updatedRoom = rooms.get(roomCode);
        io.to(roomCode).emit('returnedToLobby', {
            message: 'Everyone has been returned to the lobby.',
            resetBy: updatedRoom.players.get(socket.id)?.name || 'Host',
            playerCount: updatedRoom.players.size,
            players: Array.from(updatedRoom.players.values()).map(p => ({ id: p.id, name: p.name, role: p.role, alive: p.alive })),
            hostId: updatedRoom.hostId,
            settings: updatedRoom.settings
        });
        
        // Force a fresh game state broadcast after reset
        setTimeout(() => {
            broadcastGameStateToRoom(roomCode);
        }, 100);
        console.log(`All players returned to lobby in room ${roomCode} by ${room.players.get(socket.id)?.name || 'Host'}`);
    });

    // Chat message handler
    socket.on('chatMessage', (data) => {
        const { roomCode, message, playerName } = data;
        const room = rooms.get(roomCode);
        
        if (!room || !room.players.has(socket.id)) {
            return;
        }

        // Validate message
        if (!message || message.trim().length === 0 || message.length > 200) {
            return;
        }

        // Broadcast message to all players in the room
        io.to(roomCode).emit('chatMessage', {
            playerName: playerName,
            message: message.trim()
        });

        console.log(`Chat in room ${roomCode} - ${playerName}: ${message.trim()}`);
    });

    // Mafia chat message handler (only for mafia members)
    socket.on('mafiaChatMessage', (data) => {
        const { roomCode, message, playerName } = data;
        const room = rooms.get(roomCode);
        
        if (!room || !room.players.has(socket.id)) {
            return;
        }

        const player = room.players.get(socket.id);
        
        // Only mafia members and black police can send mafia chat
        if (player.role !== ROLES.MAFIA && player.role !== ROLES.BLACK_POLICE && player.role !== ROLES.SUICIDE_BOMBER && player.role !== ROLES.MANIPULATOR) {
            socket.emit('error', 'Only Mafia members can use this chat');
            return;
        }

        // Validate message
        if (!message || message.trim().length === 0 || message.length > 200) {
            return;
        }

        // Broadcast to mafia-aligned participants (mafia, suicide_bomber, manipulator) and black police observers
        for (const [playerId, roomPlayer] of room.players) {
            if (roomPlayer.role === ROLES.MAFIA || roomPlayer.role === ROLES.SUICIDE_BOMBER || roomPlayer.role === ROLES.MANIPULATOR || roomPlayer.role === ROLES.BLACK_POLICE) {
                io.to(playerId).emit('mafiaChatMessage', {
                    playerName: playerName,
                    message: message.trim()
                });
            }
        }

        console.log(`Mafia chat in room ${roomCode} - ${playerName}: ${message.trim()}`);
    });

    // Handle players leaving rooms voluntarily
    socket.on('leaveRoom', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room || !room.players.has(socket.id)) {
            socket.emit('error', 'You are not in this room');
            return;
        }

        const player = room.players.get(socket.id);
        console.log(`${player.name} is leaving room ${roomCode}`);

        // Remove player from room
        room.players.delete(socket.id);
        room.deadPlayers.delete(socket.id);
        room.votes.delete(socket.id);
        
        // Leave the socket room
        socket.leave(roomCode);

        // Notify other players in the room
        socket.to(roomCode).emit('playerLeft', {
            playerId: socket.id,
            playerName: player.name
        });

        // Notify the leaving player that they successfully left
        socket.emit('roomLeft', {
            message: `You have left room ${roomCode}`,
            roomCode: roomCode
        });

        // Handle host transfer if the host left
        if (socket.id === room.hostId && room.players.size > 0) {
            // Find the next human player to transfer host to (never transfer to bots)
            const humanPlayers = Array.from(room.players.entries()).filter(([id, player]) => !player.isBot);
            
            if (humanPlayers.length > 0) {
                // Transfer host to first human player
                const [newHostId, newHost] = humanPlayers[0];
                room.hostId = newHostId;
                io.to(roomCode).emit('hostChanged', {
                    newHostId: newHostId,
                    newHostName: newHost.name
                });
                console.log(`Host transferred to ${newHost.name} in room ${roomCode}`);
                             } else {
                     // No human players left - close the lobby (prevent bot from becoming host)
                     console.log(`🤖 PROTECTION: No human players left in room ${roomCode} - closing lobby to prevent bot host`);
                     cleanupRoom(roomCode);
                     return; // Exit early since room is being cleaned up
                 }
        }

        // Clean up empty rooms or reset game if not enough players
        if (room.players.size === 0) {
            cleanupRoom(roomCode);
            console.log(`Room ${roomCode} deleted - no players left`);
        } else if (room.players.size < MIN_PLAYERS && room.gameStarted) {
            room.phase = 'lobby';
            room.gameStarted = false;
            room.dayCount = 0;
            room.deadPlayers.clear();
            room.votes.clear();

            if (room.timer) {
                clearInterval(room.timer);
                room.timer = null;
            }

            io.to(roomCode).emit('gameReset', 'Not enough players, returning to lobby');
        }

        // Update game state for remaining players
        if (room.players.size > 0) {
            broadcastGameStateToRoom(roomCode);
            updatePublicLobby(roomCode);
        }
    });
    
    // Friend invitation system
    socket.on('inviteFriend', async (data) => {
        try {
            const { friendId, roomCode } = data;
            
            if (!socket.userId) {
                socket.emit('error', 'You must be logged in to invite friends');
                return;
            }
            
            const room = rooms.get(roomCode);
            if (!room) {
                socket.emit('error', 'Room not found');
                return;
            }
            
            if (!room.players.has(socket.id)) {
                socket.emit('error', 'You must be in the room to invite friends');
                return;
            }
            
            if (room.gameStarted) {
                socket.emit('error', 'Cannot invite friends after game has started');
                return;
            }
            
            // Check if friend is online
            const friendSocketId = userSessions.get(friendId);
            if (!friendSocketId) {
                socket.emit('error', 'Friend is not online');
                return;
            }
            
            const friendSocket = io.sockets.sockets.get(friendSocketId);
            if (!friendSocket) {
                socket.emit('error', 'Friend is not available');
                return;
            }
            
            // Get friend and inviter info
            const friend = await db.getUserById(friendId);
            const inviter = await db.getUserById(socket.userId);
            
            if (!friend || !inviter) {
                socket.emit('error', 'User information not found');
                return;
            }
            
            // Send invitation to friend
            friendSocket.emit('roomInvitation', {
                roomCode: roomCode,
                inviterName: inviter.display_name,
                inviterId: socket.userId,
                playerCount: room.players.size,
                maxPlayers: room.settings.maxPlayers
            });
            
            socket.emit('invitationSent', {
                friendName: friend.display_name,
                roomCode: roomCode
            });
            
            console.log(`${inviter.display_name} invited ${friend.display_name} to room ${roomCode}`);
            
        } catch (error) {
            console.error('Friend invitation error:', error);
            socket.emit('error', 'Failed to send invitation');
        }
    });
    
    socket.on('respondToInvitation', (data) => {
        const { accept, roomCode, inviterId } = data;
        
        if (!socket.userId) {
            socket.emit('error', 'You must be logged in to respond to invitations');
            return;
        }
        
        const inviterSocketId = userSessions.get(inviterId);
        if (inviterSocketId) {
            const inviterSocket = io.sockets.sockets.get(inviterSocketId);
            if (inviterSocket) {
                inviterSocket.emit('invitationResponse', {
                    accepted: accept,
                    responderName: socket.username,
                    roomCode: roomCode
                });
            }
        }
        
        if (accept) {
            // Auto-join the room if accepted
            socket.emit('autoJoinRoom', { roomCode: roomCode });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // Clean up user session mapping
        if (socket.userId) {
            userSessions.delete(socket.userId);
            // Set user offline in database
            db.setUserOffline(socket.userId).catch(err => 
                console.error('Error setting user offline:', err)
            );
        }
        
        // Find which room the player was in
        let playerRoom = null;
        for (const [roomCode, room] of rooms) {
            if (room.players.has(socket.id)) {
                playerRoom = { roomCode, room };
                break;
            }
        }
        
        if (playerRoom) {
            const { roomCode, room } = playerRoom;
            const player = room.players.get(socket.id);
            
            room.players.delete(socket.id);
            room.deadPlayers.delete(socket.id);
            room.votes.delete(socket.id);
            
            socket.to(roomCode).emit('playerLeft', {
                playerId: socket.id,
                playerName: player.name
            });
            
            // Handle host transfer if the host left
            if (socket.id === room.hostId && room.players.size > 0) {
                // Find the next human player to transfer host to (never transfer to bots)
                const humanPlayers = Array.from(room.players.entries()).filter(([id, player]) => !player.isBot);
                
                if (humanPlayers.length > 0) {
                    // Transfer host to first human player
                    const [newHostId, newHost] = humanPlayers[0];
                    room.hostId = newHostId;
                    io.to(roomCode).emit('hostChanged', {
                        newHostId: newHostId,
                        newHostName: newHost.name
                    });
                    console.log(`Host transferred to ${newHost.name} in room ${roomCode}`);
                } else {
                    // No human players left - close the lobby (prevent bot from becoming host)
                    console.log(`🤖 PROTECTION: No human players left in room ${roomCode} - closing lobby to prevent bot host`);
                    cleanupRoom(roomCode);
                    return; // Exit early since room is being cleaned up
                }
            }
            
            // Clean up empty rooms or reset game if not enough players
            if (room.players.size === 0) {
                cleanupRoom(roomCode);
                console.log(`Room ${roomCode} deleted - no players left`);
            } else if (room.players.size < MIN_PLAYERS && room.gameStarted) {
                room.phase = 'lobby';
                room.gameStarted = false;
                room.dayCount = 0;
                room.deadPlayers.clear();
                room.votes.clear();
                
                if (room.timer) {
                    clearInterval(room.timer);
                    room.timer = null;
                }
                
                io.to(roomCode).emit('gameReset', 'Not enough players, returning to lobby');
            }
            
            // Check if we should add bots after a player leaves
            if (room.players.size > 0) {
                if (hasHumanPlayers(roomCode)) {
                    // Only manage bots if there are still human players
                    if (shouldAddBots(roomCode)) {
                        addBotsToRoom(roomCode);
                    }
                    
                    broadcastGameStateToRoom(roomCode);
                    updatePublicLobby(roomCode);
                                 } else {
                     // No human players left - close the lobby (prevent bot from becoming host)
                     console.log(`🤖 PROTECTION: No human players left in room ${roomCode} after disconnect - closing lobby to prevent bot host`);
                     cleanupRoom(roomCode);
                 }
            }
        }
    });

    // Direct Messages API
    socket.on('dmMessage', async (data) => {
        try {
            const fromUserId = socket.userId;
            const { toUserId, text } = data;
            if (!fromUserId || !toUserId || !text || text.length > 1000) return;
            const canDM = await db.areFriends(fromUserId, toUserId);
            if (!canDM) return;
            const msg = await db.createDirectMessage(fromUserId, toUserId, text);
            const recipientSocketId = userSessions.get(toUserId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('dmMessage', { fromUserId, text: msg.text, createdAt: msg.createdAt });
            }
            // Echo back to sender UI
            socket.emit('dmMessage', { fromUserId, text: msg.text, createdAt: msg.createdAt });
        } catch (e) {
            console.error('dmMessage error:', e);
        }
    });

    

    socket.on('setTutorialStep', (data) => {
        const { roomCode, step, forceRole } = data || {};
        const room = rooms.get(roomCode);
        if (!room) { socket.emit('error', 'Room not found'); return; }
        if (socket.id !== room.hostId) { socket.emit('error', 'Only host can change tutorial step'); return; }
        room.tutorial = room.tutorial || { active: false, step: 0, forceRole: null };
        room.tutorial.active = true;
        room.tutorial.step = step || room.tutorial.step;
        // Default role per step if not explicitly provided
        const stepRoleMap = { 1: ROLES.MAFIA, 2: ROLES.DOCTOR, 3: ROLES.DETECTIVE, 4: ROLES.WHITE_POLICE };
        room.tutorial.forceRole = forceRole || stepRoleMap[room.tutorial.step] || ROLES.CIVILIAN;
        socket.emit('tutorialStepSet', { tutorial: room.tutorial });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`The Fall of Volmora server running on port ${PORT}`);
}); 

// Direct Messages API routes
app.get('/api/dm/:otherUserId', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const { otherUserId } = req.params;
		const canDM = await db.areFriends(req.session.userId, otherUserId);
		if (!canDM) return res.status(403).json({ error: 'You can only message friends' });
		const { before, limit } = req.query;
		const msgs = await db.getDirectMessagesBetween(req.session.userId, otherUserId, Math.min(parseInt(limit) || 50, 100), before);
		res.json(msgs);
	} catch (e) {
		console.error('DM fetch error:', e);
		res.status(500).json({ error: 'Failed to fetch messages' });
	}
});

app.post('/api/dm/:otherUserId', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const { otherUserId } = req.params;
		const { text } = req.body;
		if (!text || text.trim().length === 0 || text.length > 1000) {
			return res.status(400).json({ error: 'Invalid message' });
		}
		const canDM = await db.areFriends(req.session.userId, otherUserId);
		if (!canDM) return res.status(403).json({ error: 'You can only message friends' });
		const msg = await db.createDirectMessage(req.session.userId, otherUserId, text);
		// Emit to recipient if online
		const recipientSocketId = userSessions.get(otherUserId);
		if (recipientSocketId) {
			io.to(recipientSocketId).emit('dmMessage', { fromUserId: msg.fromUserId, text: msg.text, createdAt: msg.createdAt });
		}
		res.json({ success: true, message: msg });
	} catch (e) {
		console.error('DM send error:', e);
		res.status(500).json({ error: 'Failed to send message' });
	}
});

// Friend request via profile
app.post('/api/profile/:otherUserId/friend-request', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const { otherUserId } = req.params;
		const other = await db.getUserById(otherUserId);
		if (!other) return res.status(404).json({ error: 'User not found' });
		const result = await db.sendFriendRequest(req.session.userId, other.username);
		res.json({ success: true, friend: result });
	} catch (error) {
		console.error('Profile friend request error:', error);
		res.status(400).json({ error: error.message });
	}
});

app.delete('/api/account', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const userId = req.session.userId;
		// Remove user, friends where user is either side, DMs
		await Promise.all([
			db.User.findByIdAndDelete(userId),
			db.Friend.deleteMany({ $or: [{ user_id: userId }, { friend_id: userId }] }),
			db.DirectMessage.deleteMany({ $or: [{ from_user_id: userId }, { to_user_id: userId }] })
		]);
		// Destroy session
		req.session.destroy(() => res.json({ success: true }));
	} catch (e) {
		console.error('Delete account error:', e);
		res.status(500).json({ error: 'Failed to delete account' });
	}
});

// Forgot password: create reset token (to be delivered via your channel)
app.post('/api/auth/forgot-password', async (req, res) => {
	try {
		const { email } = req.body;
		if (!email) return res.status(400).json({ error: 'Email is required' });
		const user = await db.getUserByEmail(email);
		if (!user) return res.json({ success: true }); // do not reveal user existence
		// Create token
		const token = crypto.randomBytes(24).toString('hex');
		const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
		await db.User.findByIdAndUpdate(user._id, { reset_token: token, reset_expires: expires });
		// Return reset link for now (in production, email it)
		const baseUrl = req.headers.origin || `${req.protocol}://${req.get('host')}`;
		const link = `${baseUrl}/?action=reset&token=${token}`;
		res.json({ success: true, resetLink: link });
	} catch (e) {
		console.error('Forgot password error:', e);
		res.status(500).json({ error: 'Request failed' });
	}
});

// Reset password: verify token and set new password
app.post('/api/auth/reset-password', async (req, res) => {
	try {
		const { token, password } = req.body;
		if (!token || !password || password.length < 6) {
			return res.status(400).json({ error: 'Invalid request' });
		}
		const user = await db.User.findOne({ reset_token: token }).lean();
		if (!user) return res.status(400).json({ error: 'Invalid token' });
		if (!user.reset_expires || new Date(user.reset_expires) < new Date()) {
			return res.status(400).json({ error: 'Token expired' });
		}
		// Update password and clear token
		const hash = require('bcryptjs').hashSync(password, 10);
		await db.User.findByIdAndUpdate(user._id, { password_hash: hash, reset_token: null, reset_expires: null });
		res.json({ success: true });
	} catch (e) {
		console.error('Reset password error:', e);
		res.status(500).json({ error: 'Reset failed' });
	}
});

// User search for friend suggestions
app.get('/api/users/search', async (req, res) => {
	try {
		if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
		const q = (req.query.q || '').toString();
		const results = await db.searchUsers(q, req.session.userId, 10);
		res.json(results);
	} catch (e) {
		res.status(500).json({ error: 'Search failed' });
	}
});

// Public profile view by user id
app.get('/api/profile/:userId/public', async (req, res) => {
	try {
		const { userId } = req.params;
		if (!userId) return res.status(400).json({ error: 'Missing user id' });
		const user = await db.getUserById(userId);
		if (!user) return res.status(404).json({ error: 'User not found' });
		// Return a safe, public subset
		res.json({
			id: user.id,
			username: user.username,
			displayName: user.display_name || user.displayName,
			avatarUrl: user.avatar_url || null,
			totalGames: user.total_games || 0,
			totalWins: user.total_wins || 0,
			mafiaWins: user.mafia_wins || 0,
			civilianWins: user.civilian_wins || 0,
			mafiaGames: user.mafia_games || 0,
			civilianGames: user.civilian_games || 0
		});
	} catch (e) {
		res.status(500).json({ error: 'Failed to fetch profile' });
	}
});