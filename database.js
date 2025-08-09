const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const path = require('path');

class VelmoraDatabase {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.usersFile = path.join(this.dataDir, 'users.json');
        this.friendsFile = path.join(this.dataDir, 'friends.json');
        this.sessionsFile = path.join(this.dataDir, 'sessions.json');
        this.participantsFile = path.join(this.dataDir, 'participants.json');
        
        this.users = new Map();
        this.friends = [];
        this.sessions = [];
        this.participants = [];
        this.nextUserId = 1;
        this.nextSessionId = 1;
        
        this.init();
    }

    async init() {
        try {
            // Create data directory if it doesn't exist
            try {
                await fs.mkdir(this.dataDir, { recursive: true });
            } catch (err) {
                // Directory might already exist
            }
            
            await this.loadData();
            console.log('Database initialized successfully.');
        } catch (err) {
            console.error('Error initializing database:', err.message);
        }
    }

    async loadData() {
        try {
            // Load users
            try {
                const usersData = await fs.readFile(this.usersFile, 'utf8');
                const usersArray = JSON.parse(usersData);
                this.users = new Map(usersArray.map(user => [user.id, user]));
                this.nextUserId = Math.max(...Array.from(this.users.keys()), 0) + 1;
            } catch (err) {
                // File doesn't exist, start with empty data
                this.users = new Map();
                this.nextUserId = 1;
            }

            // Load friends
            try {
                const friendsData = await fs.readFile(this.friendsFile, 'utf8');
                this.friends = JSON.parse(friendsData);
            } catch (err) {
                this.friends = [];
            }

            // Load sessions
            try {
                const sessionsData = await fs.readFile(this.sessionsFile, 'utf8');
                this.sessions = JSON.parse(sessionsData);
                this.nextSessionId = Math.max(...this.sessions.map(s => s.id), 0) + 1;
            } catch (err) {
                this.sessions = [];
                this.nextSessionId = 1;
            }

            // Load participants
            try {
                const participantsData = await fs.readFile(this.participantsFile, 'utf8');
                this.participants = JSON.parse(participantsData);
            } catch (err) {
                this.participants = [];
            }
        } catch (err) {
            console.error('Error loading data:', err.message);
        }
    }

    async saveData() {
        try {
            // Save users
            const usersArray = Array.from(this.users.values());
            await fs.writeFile(this.usersFile, JSON.stringify(usersArray, null, 2));

            // Save friends
            await fs.writeFile(this.friendsFile, JSON.stringify(this.friends, null, 2));

            // Save sessions
            await fs.writeFile(this.sessionsFile, JSON.stringify(this.sessions, null, 2));

            // Save participants
            await fs.writeFile(this.participantsFile, JSON.stringify(this.participants, null, 2));
        } catch (err) {
            console.error('Error saving data:', err.message);
        }
    }

    // User management methods
    async createUser(username, email, password, displayName) {
        try {
            // Check if user already exists
            const existingUser = Array.from(this.users.values()).find(u => 
                u.username === username || u.email === email
            );
            if (existingUser) {
                throw new Error(existingUser.username === username ? 'Username already exists' : 'Email already exists');
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            const user = {
                id: this.nextUserId++,
                username,
                email,
                password_hash: hashedPassword,
                display_name: displayName,
                avatar_url: null,
                created_at: new Date().toISOString(),
                last_login: null,
                total_games: 0,
                total_wins: 0,
                mafia_wins: 0,
                civilian_wins: 0,
                favorite_role: null,
                is_online: false
            };

            this.users.set(user.id, user);
            await this.saveData();
            return { id: user.id, username, email, displayName };
        } catch (err) {
            throw err;
        }
    }

    async getUserByUsername(username) {
        return Array.from(this.users.values()).find(u => u.username === username);
    }

    async getUserByEmail(email) {
        return Array.from(this.users.values()).find(u => u.email === email);
    }

    async getUserById(id) {
        const user = this.users.get(id);
        if (!user) return null;
        
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            created_at: user.created_at,
            total_games: user.total_games,
            total_wins: user.total_wins,
            mafia_wins: user.mafia_wins,
            civilian_wins: user.civilian_wins,
            favorite_role: user.favorite_role,
            is_online: user.is_online
        };
    }

    async validateUser(username, password) {
        const user = Array.from(this.users.values()).find(u => u.username === username);
        if (user && bcrypt.compareSync(password, user.password_hash)) {
            // Update last login
            await this.updateLastLogin(user.id);
            return {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                avatarUrl: user.avatar_url,
                totalGames: user.total_games,
                totalWins: user.total_wins,
                mafiaWins: user.mafia_wins,
                civilianWins: user.civilian_wins,
                favoriteRole: user.favorite_role
            };
        }
        return null;
    }

    async updateLastLogin(userId) {
        const user = this.users.get(userId);
        if (user) {
            user.last_login = new Date().toISOString();
            user.is_online = true;
            await this.saveData();
        }
    }

    async setUserOffline(userId) {
        const user = this.users.get(userId);
        if (user) {
            user.is_online = false;
            await this.saveData();
        }
    }

    // Friends system methods
    async sendFriendRequest(userId, friendUsername) {
        try {
            const friend = await this.getUserByUsername(friendUsername);
            if (!friend) {
                throw new Error('User not found');
            }

            if (userId === friend.id) {
                throw new Error('Cannot add yourself as a friend');
            }

            // Check if friendship already exists
            const existingFriendship = this.friends.find(f => 
                (f.user_id === userId && f.friend_id === friend.id) ||
                (f.user_id === friend.id && f.friend_id === userId)
            );

            if (existingFriendship) {
                throw new Error('Friend request already exists');
            }

            const friendRequest = {
                id: this.friends.length + 1,
                user_id: userId,
                friend_id: friend.id,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            this.friends.push(friendRequest);
            await this.saveData();
            return { friendId: friend.id, friendUsername: friend.username, status: 'pending' };
        } catch (error) {
            throw error;
        }
    }

    async acceptFriendRequest(userId, friendId) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Update the existing request to accepted
                this.db.run(
                    'UPDATE friends SET status = "accepted", updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND friend_id = ? AND status = "pending"',
                    [friendId, userId],
                    function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        if (this.changes === 0) {
                            reject(new Error('Friend request not found'));
                            return;
                        }
                    }
                );

                // Create the reverse relationship
                const stmt = this.db.prepare(`
                    INSERT OR IGNORE INTO friends (user_id, friend_id, status)
                    VALUES (?, ?, 'accepted')
                `);
                
                stmt.run([userId, friendId], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
                stmt.finalize();
            });
        });
    }

    async denyFriendRequest(userId, friendId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = "pending"',
                [friendId, userId],
                function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('Friend request not found'));
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async getFriends(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_online, f.status
                FROM friends f
                JOIN users u ON f.friend_id = u.id
                WHERE f.user_id = ? AND f.status = 'accepted'
                ORDER BY u.display_name
            `, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getFriendRequests(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT u.id, u.username, u.display_name, u.avatar_url, f.created_at
                FROM friends f
                JOIN users u ON f.user_id = u.id
                WHERE f.friend_id = ? AND f.status = 'pending'
                ORDER BY f.created_at DESC
            `, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async removeFriend(userId, friendId) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('DELETE FROM friends WHERE user_id = ? AND friend_id = ?', [userId, friendId]);
                this.db.run('DELETE FROM friends WHERE user_id = ? AND friend_id = ?', [friendId, userId], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    // Game statistics methods
    async updateUserStats(userId, role, won, teamWon) {
        return new Promise((resolve, reject) => {
            let updateQuery = 'UPDATE users SET total_games = total_games + 1';
            let params = [];

            if (won) {
                updateQuery += ', total_wins = total_wins + 1';
            }

            if (teamWon === 'mafia') {
                updateQuery += ', mafia_wins = mafia_wins + 1';
            } else if (teamWon === 'innocents') {
                updateQuery += ', civilian_wins = civilian_wins + 1';
            }

            updateQuery += ' WHERE id = ?';
            params.push(userId);

            this.db.run(updateQuery, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async createGameSession(roomCode, totalPlayers) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO game_sessions (room_code, total_players)
                VALUES (?, ?)
            `);
            
            stmt.run([roomCode, totalPlayers], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    async endGameSession(sessionId, winnerTeam, totalDays, duration) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE game_sessions SET ended_at = CURRENT_TIMESTAMP, winner_team = ?, total_days = ?, game_duration = ? WHERE id = ?',
                [winnerTeam, totalDays, duration, sessionId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async addGameParticipant(sessionId, userId, username, role, survived, won) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO game_participants (game_session_id, user_id, username, role, survived, won)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([sessionId, userId, username, role, survived, won], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    async getUserGameHistory(userId, limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT gs.room_code, gs.started_at, gs.ended_at, gs.winner_team, gs.total_players, gs.total_days,
                       gp.role, gp.survived, gp.won
                FROM game_sessions gs
                JOIN game_participants gp ON gs.id = gp.game_session_id
                WHERE gp.user_id = ?
                ORDER BY gs.started_at DESC
                LIMIT ?
            `, [userId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed.');
                }
                resolve();
            });
        });
    }
}

module.exports = VelmoraDatabase; 