// Authentication and Social Features Manager for The Fall of Velmora

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.friends = [];
        this.friendRequests = [];
        this.pendingInvitation = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
    }

    setupEventListeners() {
        // Authentication buttons
        document.getElementById('loginBtn').addEventListener('click', () => this.showLoginModal());
        document.getElementById('registerBtn').addEventListener('click', () => this.showRegisterModal());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Modal controls
        document.getElementById('closeAuthModal').addEventListener('click', () => this.hideAuthModal());
        document.getElementById('switchToRegister').addEventListener('click', () => this.switchToRegisterForm());
        document.getElementById('switchToLogin').addEventListener('click', () => this.switchToLoginForm());
        document.getElementById('registerAsGuest').addEventListener('click', () => this.registerAsGuest());

        // Profile and friends
        document.getElementById('profileBtn').addEventListener('click', () => this.showProfileModal());
        document.getElementById('friendsBtn').addEventListener('click', () => this.showFriendsModal());
        document.getElementById('closeProfileModal').addEventListener('click', () => this.hideProfileModal());
        document.getElementById('closeFriendsModal').addEventListener('click', () => this.hideFriendsModal());

        // Forms
        document.getElementById('loginFormElement').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerFormElement').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('addFriendBtn').addEventListener('click', () => this.addFriend());

        // Room invitations
        document.getElementById('acceptInvitationBtn').addEventListener('click', () => this.acceptInvitation());
        document.getElementById('declineInvitationBtn').addEventListener('click', () => this.declineInvitation());

        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/profile');
            if (response.ok) {
                const user = await response.json();
                this.setCurrentUser(user);
                // Authenticate socket if connected
                if (window.game && window.game.socket) {
                    window.game.socket.emit('authenticateSocket', {
                        userId: user.id,
                        username: user.username
                    });
                }
            } else {
                this.setCurrentUser(null);
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.setCurrentUser(null);
        }
    }

    setCurrentUser(user) {
        this.currentUser = user;
        this.isAuthenticated = !!user;
        this.updateUI();
    }

    updateUI() {
        const authButtons = document.getElementById('authButtons');
        const userInfo = document.getElementById('userInfo');
        const usernameDisplay = document.getElementById('usernameDisplay');

        if (this.isAuthenticated) {
            authButtons.style.display = 'none';
            userInfo.style.display = 'flex';
            usernameDisplay.textContent = this.currentUser.displayName || this.currentUser.username;
        } else {
            authButtons.style.display = 'flex';
            userInfo.style.display = 'none';
        }

        // Update hamburger menu when auth state changes
        if (window.hamburgerMenu) {
            window.hamburgerMenu.onAuthStateChange();
        }
    }

    showLoginModal() {
        document.getElementById('authModal').style.display = 'flex';
        this.switchToLoginForm();
    }

    showRegisterModal() {
        document.getElementById('authModal').style.display = 'flex';
        this.switchToRegisterForm();
    }

    hideAuthModal() {
        document.getElementById('authModal').style.display = 'none';
        this.clearForms();
    }

    switchToLoginForm() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    }

    switchToRegisterForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }

    clearForms() {
        document.getElementById('loginFormElement').reset();
        document.getElementById('registerFormElement').reset();
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                this.setCurrentUser(data.user);
                this.hideAuthModal();
                this.showNotification('Login successful!', 'success');
                
                // Authenticate socket if connected
                if (window.game && window.game.socket) {
                    window.game.socket.emit('authenticateSocket', {
                        userId: data.user.id,
                        username: data.user.username
                    });
                }
            } else {
                this.showNotification(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Login failed. Please try again.', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const displayName = document.getElementById('registerDisplayName').value;
        const password = document.getElementById('registerPassword').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, displayName, password }),
            });

            const data = await response.json();

            if (response.ok) {
                this.setCurrentUser(data.user);
                this.hideAuthModal();
                this.showNotification('Account created successfully!', 'success');
                
                // Authenticate socket if connected
                if (window.game && window.game.socket) {
                    window.game.socket.emit('authenticateSocket', {
                        userId: data.user.id,
                        username: data.user.username
                    });
                }
            } else {
                this.showNotification(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showNotification('Registration failed. Please try again.', 'error');
        }
    }

    async logout() {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
            });

            if (response.ok) {
                this.setCurrentUser(null);
                this.showNotification('Logged out successfully', 'success');
                
                // Leave any current room
                if (window.game && window.game.currentRoomCode) {
                    window.game.leaveRoom();
                }
            } else {
                this.showNotification('Logout failed', 'error');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('Logout failed', 'error');
        }
    }

    async showProfileModal() {
        try {
            // Fetch fresh profile data
            const response = await fetch('/api/profile');
            if (response.ok) {
                const profile = await response.json();
                this.updateProfileModal(profile);
                
                // Fetch game history
                const historyResponse = await fetch('/api/game-history');
                if (historyResponse.ok) {
                    const history = await historyResponse.json();
                    this.updateGameHistory(history);
                }
                
                document.getElementById('profileModal').style.display = 'flex';
            } else {
                this.showNotification('Failed to load profile', 'error');
            }
        } catch (error) {
            console.error('Profile modal error:', error);
            this.showNotification('Failed to load profile', 'error');
        }
    }

    updateProfileModal(profile) {
        document.getElementById('profileTotalGames').textContent = profile.totalGames || 0;
        document.getElementById('profileTotalWins').textContent = profile.totalWins || 0;
        document.getElementById('profileMafiaWins').textContent = profile.mafiaWins || 0;
        document.getElementById('profileCivilianWins').textContent = profile.civilianWins || 0;
        
        const winRate = profile.totalGames > 0 ? Math.round((profile.totalWins / profile.totalGames) * 100) : 0;
        document.getElementById('profileWinRate').textContent = `${winRate}%`;
    }

    updateGameHistory(history) {
        const historyContainer = document.getElementById('gameHistory');
        historyContainer.innerHTML = '';

        if (history.length === 0) {
            historyContainer.innerHTML = '<p>No games played yet.</p>';
            return;
        }

        history.forEach(game => {
            const historyItem = document.createElement('div');
            historyItem.className = `history-item ${game.won ? 'won' : 'lost'}`;
            
            const date = new Date(game.started_at).toLocaleDateString();
            const duration = game.ended_at ? 
                Math.round((new Date(game.ended_at) - new Date(game.started_at)) / 60000) : 
                'N/A';
            
            historyItem.innerHTML = `
                <div class="history-header">
                    <strong>${game.won ? '🏆 Won' : '💀 Lost'} as ${game.role}</strong>
                    <span class="history-date">${date}</span>
                </div>
                <div class="history-details">
                    <span>Players: ${game.total_players}</span>
                    <span>Days: ${game.total_days || 'N/A'}</span>
                    <span>Duration: ${duration} min</span>
                    <span>Winner: ${game.winner_team}</span>
                </div>
            `;
            
            historyContainer.appendChild(historyItem);
        });
    }

    hideProfileModal() {
        document.getElementById('profileModal').style.display = 'none';
    }

    async showFriendsModal() {
        try {
            const response = await fetch('/api/friends');
            if (response.ok) {
                const data = await response.json();
                this.friends = data.friends;
                this.friendRequests = data.friendRequests;
                this.updateFriendsModal();
                document.getElementById('friendsModal').style.display = 'flex';
            } else {
                this.showNotification('Failed to load friends', 'error');
            }
        } catch (error) {
            console.error('Friends modal error:', error);
            this.showNotification('Failed to load friends', 'error');
        }
    }

    updateFriendsModal() {
        // Update friend requests
        const requestsSection = document.getElementById('friendRequestsSection');
        const requestsList = document.getElementById('friendRequestsList');
        
        if (this.friendRequests.length > 0) {
            requestsSection.style.display = 'block';
            requestsList.innerHTML = '';
            
            this.friendRequests.forEach(request => {
                const requestItem = document.createElement('div');
                requestItem.className = 'request-item';
                requestItem.innerHTML = `
                    <div class="friend-info">
                        <span class="friend-name">${request.display_name}</span>
                        <span class="friend-status">@${request.username}</span>
                    </div>
                                        <div class="friend-actions">
                        <button class="btn-mini btn-accept" onclick="authManager.acceptFriendRequest('${request.id}')">Accept</button>
                        <button class="btn-mini btn-deny" onclick="authManager.denyFriendRequest('${request.id}')">Deny</button>
                    </div>
                `;
                requestsList.appendChild(requestItem);
            });
        } else {
            requestsSection.style.display = 'none';
        }

        // Update friends list
        const friendsContainer = document.getElementById('friendsContainer');
        friendsContainer.innerHTML = '';

        if (this.friends.length === 0) {
            friendsContainer.innerHTML = '<p>No friends yet. Add some friends to play together!</p>';
            return;
        }

        this.friends.forEach(friend => {
            const friendItem = document.createElement('div');
            friendItem.className = 'friend-item';
            friendItem.innerHTML = `
                <div class="friend-info">
                    <span class="friend-name">${friend.display_name}</span>
                    <span class="friend-status ${friend.is_online ? 'online' : 'offline'}">
                        ${friend.is_online ? '🟢 Online' : '🔴 Offline'}
                    </span>
                </div>
                <div class="friend-actions">
                    						${friend.is_online && window.game && window.game.currentRoomCode ? 
							`<button class=\"btn-mini btn-invite\" onclick=\"authManager.inviteFriend('` + friend.id + `')\">Invite</button>` : 
							''
						}
						<button class=\"btn-mini btn-remove\" onclick=\"authManager.removeFriend('` + friend.id + `')\">Remove</button>
                </div>
            `;
            friendsContainer.appendChild(friendItem);
        });
    }

    hideFriendsModal() {
        document.getElementById('friendsModal').style.display = 'none';
    }

    async addFriend() {
        const username = document.getElementById('addFriendUsername').value.trim();
        if (!username) {
            this.showNotification('Please enter a username', 'error');
            return;
        }

        try {
            const response = await fetch('/api/friends/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username }),
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('Friend request sent!', 'success');
                document.getElementById('addFriendUsername').value = '';
            } else {
                this.showNotification(data.error || 'Failed to send friend request', 'error');
            }
        } catch (error) {
            console.error('Add friend error:', error);
            this.showNotification('Failed to send friend request', 'error');
        }
    }

    async acceptFriendRequest(friendId) {
        try {
            const response = await fetch('/api/friends/accept', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ friendId }),
            });

            if (response.ok) {
                this.showNotification('Friend request accepted!', 'success');
                this.showFriendsModal(); // Refresh the modal
            } else {
                this.showNotification('Failed to accept friend request', 'error');
            }
        } catch (error) {
            console.error('Accept friend error:', error);
            this.showNotification('Failed to accept friend request', 'error');
        }
    }

    async denyFriendRequest(friendId) {
        try {
            const response = await fetch('/api/friends/deny', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ friendId }),
            });

            if (response.ok) {
                this.showNotification('Friend request denied', 'success');
                this.showFriendsModal(); // Refresh the modal
            } else {
                this.showNotification('Failed to deny friend request', 'error');
            }
        } catch (error) {
            console.error('Deny friend error:', error);
            this.showNotification('Failed to deny friend request', 'error');
        }
    }

    async removeFriend(friendId) {
        if (!confirm('Are you sure you want to remove this friend?')) {
            return;
        }

        try {
            const response = await fetch(`/api/friends/${friendId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                this.showNotification('Friend removed', 'success');
                this.showFriendsModal(); // Refresh the modal
            } else {
                this.showNotification('Failed to remove friend', 'error');
            }
        } catch (error) {
            console.error('Remove friend error:', error);
            this.showNotification('Failed to remove friend', 'error');
        }
    }

    inviteFriend(friendId) {
        if (!window.game || !window.game.currentRoomCode) {
            this.showNotification('You must be in a room to invite friends', 'error');
            return;
        }

        window.game.socket.emit('inviteFriend', {
            friendId: friendId,
            roomCode: window.game.currentRoomCode
        });
    }

    showRoomInvitation(invitation) {
        this.pendingInvitation = invitation;
        document.getElementById('inviterName').textContent = invitation.inviterName;
        document.getElementById('invitationRoomCode').textContent = invitation.roomCode;
        document.getElementById('invitationPlayerCount').textContent = 
            `${invitation.playerCount}/${invitation.maxPlayers}`;
        document.getElementById('invitationModal').style.display = 'flex';
    }

    acceptInvitation() {
        if (!this.pendingInvitation) return;

        window.game.socket.emit('respondToInvitation', {
            accept: true,
            roomCode: this.pendingInvitation.roomCode,
            inviterId: this.pendingInvitation.inviterId
        });

        document.getElementById('invitationModal').style.display = 'none';
        this.pendingInvitation = null;
    }

    declineInvitation() {
        if (!this.pendingInvitation) return;

        window.game.socket.emit('respondToInvitation', {
            accept: false,
            roomCode: this.pendingInvitation.roomCode,
            inviterId: this.pendingInvitation.inviterId
        });

        document.getElementById('invitationModal').style.display = 'none';
        this.pendingInvitation = null;
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    // Method to get user data for room creation/joining
    getUserForRoom() {
        if (this.isAuthenticated) {
            return {
                playerName: this.currentUser.displayName || this.currentUser.username,
                displayName: this.currentUser.displayName,
                userId: this.currentUser.id,
                isAuthenticated: true
            };
        }
        return null;
    }

    registerAsGuest() {
        // Generate a random guest name
        const guestName = 'Guest' + Math.floor(Math.random() * 10000);
        
        // Set guest user data (without authentication)
        this.currentUser = {
            username: guestName,
            displayName: guestName,
            isGuest: true
        };
        this.isAuthenticated = false; // Guests are not authenticated
        
        // Hide the modal and show notification
        this.hideAuthModal();
        this.showNotification(`Welcome, ${guestName}! You can now create and join lobbies as a guest.`, 'success');
        
        // If we're in the main menu, we can stay there
        // The lobby system already handles guest users
    }
}

// Initialize the auth manager
const authManager = new AuthManager(); 