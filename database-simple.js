const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const path = require('path');

class VelmoraDatabase {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.usersFile = path.join(this.dataDir, 'users.json');
        this.friendsFile = path.join(this.dataDir, 'friends.json');
        
        this.users = new Map();
        this.friends = [];
        this.nextUserId = 1;
        
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
        } catch (err) {
            console.error('Error loading data:', err.message);
        }
    }

    async saveData() {
        try {
            const usersArray = Array.from(this.users.values());
            await fs.writeFile(this.usersFile, JSON.stringify(usersArray, null, 2));
            await fs.writeFile(this.friendsFile, JSON.stringify(this.friends, null, 2));
        } catch (err) {
            console.error('Error saving data:', err.message);
        }
    }

    // User management methods
    async createUser(username, email, password, displayName) {
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
            created_at: new Date().toISOString(),
            last_login: null,
            total_games: 0,
            total_wins: 0,
            mafia_wins: 0,
            civilian_wins: 0,
            is_online: false
        };

        this.users.set(user.id, user);
        await this.saveData();
        return { id: user.id, username, email, displayName };
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
            created_at: user.created_at,
            total_games: user.total_games,
            total_wins: user.total_wins,
            mafia_wins: user.mafia_wins,
            civilian_wins: user.civilian_wins,
            is_online: user.is_online
        };
    }

    async validateUser(username, password) {
        const user = Array.from(this.users.values()).find(u => u.username === username);
        if (user && bcrypt.compareSync(password, user.password_hash)) {
            await this.updateLastLogin(user.id);
            return {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                totalGames: user.total_games,
                totalWins: user.total_wins,
                mafiaWins: user.mafia_wins,
                civilianWins: user.civilian_wins
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
        const friend = await this.getUserByUsername(friendUsername);
        if (!friend) {
            throw new Error('User not found');
        }

        if (userId === friend.id) {
            throw new Error('Cannot add yourself as a friend');
        }

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
            created_at: new Date().toISOString()
        };

        this.friends.push(friendRequest);
        await this.saveData();
        return { friendId: friend.id, friendUsername: friend.username, status: 'pending' };
    }

    async acceptFriendRequest(userId, friendId) {
        const requestIndex = this.friends.findIndex(f => 
            f.user_id === friendId && f.friend_id === userId && f.status === 'pending'
        );

        if (requestIndex === -1) {
            throw new Error('Friend request not found');
        }

        this.friends[requestIndex].status = 'accepted';
        this.friends[requestIndex].updated_at = new Date().toISOString();

        // Add reverse relationship
        this.friends.push({
            id: this.friends.length + 1,
            user_id: userId,
            friend_id: friendId,
            status: 'accepted',
            created_at: new Date().toISOString()
        });

        await this.saveData();
    }

    async denyFriendRequest(userId, friendId) {
        const requestIndex = this.friends.findIndex(f => 
            f.user_id === friendId && f.friend_id === userId && f.status === 'pending'
        );

        if (requestIndex === -1) {
            throw new Error('Friend request not found');
        }

        this.friends.splice(requestIndex, 1);
        await this.saveData();
    }

    async getFriends(userId) {
        const friendships = this.friends.filter(f => 
            f.user_id === userId && f.status === 'accepted'
        );

        const friends = [];
        for (const friendship of friendships) {
            const friend = this.users.get(friendship.friend_id);
            if (friend) {
                friends.push({
                    id: friend.id,
                    username: friend.username,
                    display_name: friend.display_name,
                    is_online: friend.is_online
                });
            }
        }
        return friends;
    }

    async getFriendRequests(userId) {
        const requests = this.friends.filter(f => 
            f.friend_id === userId && f.status === 'pending'
        );

        const friendRequests = [];
        for (const request of requests) {
            const requester = this.users.get(request.user_id);
            if (requester) {
                friendRequests.push({
                    id: requester.id,
                    username: requester.username,
                    display_name: requester.display_name,
                    created_at: request.created_at
                });
            }
        }
        return friendRequests;
    }

    async removeFriend(userId, friendId) {
        this.friends = this.friends.filter(f => 
            !((f.user_id === userId && f.friend_id === friendId) ||
              (f.user_id === friendId && f.friend_id === userId))
        );
        await this.saveData();
    }

    // Game statistics methods (simplified)
    async updateUserStats(userId, role, won, teamWon) {
        const user = this.users.get(userId);
        if (user) {
            user.total_games++;
            if (won) user.total_wins++;
            if (teamWon === 'mafia') user.mafia_wins++;
            if (teamWon === 'innocents') user.civilian_wins++;
            await this.saveData();
        }
    }

    async getUserGameHistory(userId, limit = 10) {
        // Simplified - return empty for now
        return [];
    }

    // Session methods (simplified)
    async createGameSession(roomCode, totalPlayers) {
        return 1; // Return mock session ID
    }

    async endGameSession(sessionId, winnerTeam, totalDays, duration) {
        // No-op for simplified version
    }

    async addGameParticipant(sessionId, userId, username, role, survived, won) {
        // No-op for simplified version
    }

    close() {
        // Save data one final time
        return this.saveData();
    }
}

module.exports = VelmoraDatabase; 