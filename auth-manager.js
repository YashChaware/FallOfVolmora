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
        this.handleResetDeepLink();
    }

    setupEventListeners() {
        // Authentication buttons
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.addEventListener('click', () => this.showLoginModal());
        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn) registerBtn.addEventListener('click', () => this.showRegisterModal());
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
        
        // Modal controls
        const closeAuth = document.getElementById('closeAuthModal');
        if (closeAuth) closeAuth.addEventListener('click', () => this.hideAuthModal());
        const toRegister = document.getElementById('switchToRegister');
        if (toRegister) toRegister.addEventListener('click', () => this.switchToRegisterForm());
        const toLogin = document.getElementById('switchToLogin');
        if (toLogin) toLogin.addEventListener('click', () => this.switchToLoginForm());
        const asGuest = document.getElementById('registerAsGuest');
        if (asGuest) asGuest.addEventListener('click', () => this.registerAsGuest());
        
        // Profile and friends
        const profileBtn = document.getElementById('profileBtn');
        if (profileBtn) profileBtn.addEventListener('click', () => this.showProfileModal());
        const friendsBtn = document.getElementById('friendsBtn');
        if (friendsBtn) friendsBtn.addEventListener('click', () => this.showFriendsModal());
        const closeProfile = document.getElementById('closeProfileModal');
        if (closeProfile) closeProfile.addEventListener('click', () => this.hideProfileModal());
        const closeFriends = document.getElementById('closeFriendsModal');
        if (closeFriends) closeFriends.addEventListener('click', () => this.hideFriendsModal());
        
        // Forms
        const loginForm = document.getElementById('loginFormElement');
        if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        const registerForm = document.getElementById('registerFormElement');
        if (registerForm) registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        const addFriendBtn = document.getElementById('addFriendBtn');
        if (addFriendBtn) addFriendBtn.addEventListener('click', () => this.addFriend());
        const addByCodeBtn = document.getElementById('addFriendByCodeBtn');
        if (addByCodeBtn) addByCodeBtn.addEventListener('click', () => this.addFriendByCode());
        
        // Room invitations
        const acceptInvitationBtn = document.getElementById('acceptInvitationBtn');
        if (acceptInvitationBtn) acceptInvitationBtn.addEventListener('click', () => this.acceptInvitation());
        const declineInvitationBtn = document.getElementById('declineInvitationBtn');
        if (declineInvitationBtn) declineInvitationBtn.addEventListener('click', () => this.declineInvitation());
        
        // Delete account (from hamburger)
        const deleteAccountBtn = document.getElementById('deleteAccountDropdownBtn');
        if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', () => this.deleteAccount());
        
        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('modal')) {
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
			userInfo.style.display = 'none';
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
        // Adjust placeholder
        const userInput = document.getElementById('loginUsername');
        if (userInput) userInput.placeholder = 'Username or Email';
        // Add Forgot Password link if not present
        let forgot = document.getElementById('forgotPasswordLink');
        if (!forgot) {
            forgot = document.createElement('div');
            forgot.id = 'forgotPasswordLink';
            forgot.style.marginTop = '8px';
            forgot.innerHTML = '<a href="#" id="forgotPasswordBtn">Forgot password?</a>';
            document.getElementById('loginFormElement').appendChild(forgot);
            document.getElementById('forgotPasswordBtn').onclick = (e) => { e.preventDefault(); this.openForgotPasswordModal(); };
        }
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

    async showProfileModal(otherUserId = null, fallbackName = '') {
        try {
            let profile;
            if (otherUserId) {
                const res = await fetch(`/api/profile/${otherUserId}/public`);
                if (!res.ok) { this.showNotification('Failed to load profile', 'error'); return; }
                profile = await res.json();
                // Normalize field names to what updateProfileModal expects
                profile.displayName = profile.displayName || profile.display_name || fallbackName;
                profile.username = profile.username || '';
                profile.avatarUrl = profile.avatarUrl || profile.avatar_url || null;
                profile.totalGames = profile.totalGames ?? profile.total_games ?? 0;
                profile.totalWins = profile.totalWins ?? profile.total_wins ?? 0;
                profile.mafiaWins = profile.mafiaWins ?? profile.mafia_wins ?? 0;
                profile.civilianWins = profile.civilianWins ?? profile.civilian_wins ?? 0;
                profile.mafiaGames = profile.mafiaGames ?? profile.mafia_games ?? 0;
                profile.civilianGames = profile.civilianGames ?? profile.civilian_games ?? 0;
            } else {
                // Fetch own profile
                const response = await fetch('/api/profile');
                if (!response.ok) { this.showNotification('Failed to load profile', 'error'); return; }
                profile = await response.json();
            }
            this.updateProfileModal(profile);
            // Wire edit actions (will mostly be ignored for other users)
            this.setupProfileEditHandlers();
            // Only load game history for self
            if (!otherUserId) {
                const historyResponse = await fetch('/api/game-history');
                if (historyResponse.ok) {
                    const history = await historyResponse.json();
                    this.updateGameHistory(history);
                }
            }
            document.getElementById('profileModal').style.display = 'flex';
        } catch (error) {
            console.error('Profile modal error:', error);
            this.showNotification('Failed to load profile', 'error');
        }
    }

    setupProfileEditHandlers() {
        const modal = document.getElementById('profileModal');
        const editBtn = modal ? modal.querySelector('#profileEditBtn') : null;
        const nameEditBtn = modal ? modal.querySelector('#displayNameEditBtn') : null;
        const avatarEditBtn = modal ? modal.querySelector('#avatarEditBtn') : null;
        const nameInput = modal ? modal.querySelector('#displayNameInput') : null;
        const avatarInput = modal ? modal.querySelector('#avatarFileInput') : null;

        if (editBtn) {
            editBtn.onclick = () => {
                modal.querySelectorAll('.profile-edit-controls').forEach(el => el.style.display = 'flex');
            };
        }
        if (nameEditBtn && nameInput) {
            nameEditBtn.onclick = async () => {
                const newName = nameInput.value.trim();
                if (newName.length < 3 || newName.length > 30) {
                    this.showNotification('Display name must be 3-30 characters', 'error');
                    return;
                }
                try {
                    const res = await fetch('/api/profile/display-name', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ displayName: newName })
                    });
                    if (res.ok) {
                        this.currentUser.displayName = newName;
                        this.showNotification('Display name updated', 'success');
                        this.showProfileModal();
                    } else {
                        const data = await res.json();
                        this.showNotification(data.error || 'Failed to update name', 'error');
                    }
                } catch (e) {
                    this.showNotification('Failed to update name', 'error');
                }
            };
        }
        if (avatarEditBtn && avatarInput) {
            avatarEditBtn.onclick = async () => {
                if (!avatarInput.files || avatarInput.files.length === 0) {
                    this.showNotification('Select an image to upload', 'error');
                    return;
                }
                const formData = new FormData();
                formData.append('avatar', avatarInput.files[0]);
                try {
                    const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
                    if (res.ok) {
                        const data = await res.json();
                        this.currentUser.avatarUrl = data.avatarUrl;
                        this.showNotification('Avatar updated', 'success');
                        this.showProfileModal();
                    } else {
                        const data = await res.json();
                        this.showNotification(data.error || 'Failed to update avatar', 'error');
                    }
                } catch (e) {
                    this.showNotification('Failed to update avatar', 'error');
                }
            };
        }
    }

    updateProfileModal(profile) {
        // Clear previous header if any
        const modal = document.getElementById('profileModal');
        const content = modal ? modal.querySelector('.profile-content') : null;
        const existingHeader = content ? content.querySelector('.profile-header') : null;
        if (existingHeader) existingHeader.remove();
        
        // Header with edit controls plus bio and privacy toggles
        const headerHtml = `
            <div class="profile-header" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                <div style="position:relative;">
                    <img id="profileAvatarImg" src="${profile.avatarUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.displayName || profile.username)}" alt="Avatar" style="width:56px; height:56px; border-radius:50%; object-fit:cover;">
                    <div class="profile-edit-controls" style="display:none; gap:6px; margin-top:6px;">
                        <input type="file" id="avatarFileInput" accept="image/png,image/jpeg,image/webp">
                        <button id="avatarEditBtn" class="btn-mini">Upload</button>
                    </div>
                </div>
                <div>
                    <div><strong id="profileDisplayNameText">${profile.displayName || ''}</strong> <span style="color:#888">(@${profile.username})</span></div>
                    <div class="profile-edit-controls" style="display:none; gap:6px; margin-top:6px;">
                        <input type="text" id="displayNameInput" value="${profile.displayName || ''}" maxlength="30" style="width:200px;">
                        <button id="displayNameEditBtn" class="btn-mini">Save</button>
                        <input type="text" id="usernameInput" value="${profile.username || ''}" maxlength="20" style="width:180px;" placeholder="Username">
                        <button id="usernameEditBtn" class="btn-mini">Save</button>
                    </div>
                    <div style="font-size:12px; color:#666;">Friend Code: ${profile.friendCode || '—'}</div>
                </div>
                <button id="profileEditBtn" class="btn-mini" style="margin-left:auto;">Edit Profile</button>
            </div>
            <div class="profile-extra" style="margin-bottom:12px;">
                <label style="display:block; margin-bottom:6px;">Bio</label>
                <textarea id="bioInput" rows="2" style="width:100%; resize:vertical;">${profile.bio || ''}</textarea>
                <div style="display:flex; gap:16px; align-items:center; margin-top:8px;">
                    <label><input type="checkbox" id="dmFriendsOnlyToggle" ${profile.dmFromFriendsOnly !== false ? 'checked' : ''}> DMs from friends only</label>
                    <label><input type="checkbox" id="friendReqEnabledToggle" ${profile.friendRequestsEnabled !== false ? 'checked' : ''}> Allow friend requests</label>
                    <button id="savePrivacyBtn" class="btn-mini">Save</button>
                </div>
            </div>
        `;
        if (content) content.insertAdjacentHTML('afterbegin', headerHtml);
        
        // Wire extra save
        const savePrivacyBtn = document.getElementById('savePrivacyBtn');
        if (savePrivacyBtn) {
            savePrivacyBtn.onclick = async () => {
                try {
                    const bio = (document.getElementById('bioInput')?.value || '').slice(0, 280);
                    await fetch('/api/profile/bio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bio }) });
                    const dmFriendsOnly = !!document.getElementById('dmFriendsOnlyToggle')?.checked;
                    const friendRequestsEnabled = !!document.getElementById('friendReqEnabledToggle')?.checked;
                    await fetch('/api/profile/privacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dmFromFriendsOnly: dmFriendsOnly, friendRequestsEnabled }) });
                    this.showNotification('Profile updated', 'success');
                } catch {
                    this.showNotification('Failed to update profile', 'error');
                }
            };
        }
        
        const usernameBtn = document.getElementById('usernameEditBtn');
        if (usernameBtn) {
            usernameBtn.onclick = async () => {
                const val = document.getElementById('usernameInput')?.value.trim();
                if (!val || val.length < 3 || val.length > 20) {
                    this.showNotification('Username must be 3-20 chars', 'error');
                    return;
                }
                try {
                    const res = await fetch('/api/profile/username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: val }) });
                    if (res.ok) this.showNotification('Username updated', 'success'); else this.showNotification('Failed to update username', 'error');
                } catch {}
            };
        }
        
        // Stats
        document.getElementById('profileTotalGames').textContent = profile.totalGames || 0;
        document.getElementById('profileTotalWins').textContent = profile.totalWins || 0;
        document.getElementById('profileMafiaWins').textContent = profile.mafiaWins || 0;
        document.getElementById('profileCivilianWins').textContent = profile.civilianWins || 0;
        
        const overallWinRate = profile.totalGames > 0 ? Math.round((profile.totalWins / profile.totalGames) * 100) : 0;
        document.getElementById('profileWinRate').textContent = `${overallWinRate}%`;
        
        const mafiaGames = profile.mafiaGames || profile.mafia_games || 0;
        const civilianGames = profile.civilianGames || profile.civilian_games || 0;
        const mafiaRate = mafiaGames > 0 ? Math.round((profile.mafiaWins / mafiaGames) * 100) : 0;
        const civilianRate = civilianGames > 0 ? Math.round((profile.civilianWins / civilianGames) * 100) : 0;
        const stats = modal ? modal.querySelector('.profile-stats') : null;
        if (stats && !stats.querySelector('.detailed-rates')) {
            const rates = document.createElement('div');
            rates.className = 'detailed-rates';
            rates.innerHTML = `
                <div class="stat-item"><span class="stat-label">Mafia Win Rate:</span><span class="stat-value">${mafiaRate}%</span></div>
                <div class="stat-item"><span class="stat-label">Civilian Win Rate:</span><span class="stat-value">${civilianRate}%</span></div>
            `;
            stats.appendChild(rates);
        }
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
            // Fetch fresh friends
            const response = await fetch('/api/friends');
            if (response.ok) {
                const data = await response.json();
                this.friends = data.friends;
                this.friendRequests = data.friendRequests;
                this.updateFriendsModal();
                // Show own friend code
                if (this.currentUser && this.currentUser.friend_code) {
                    document.getElementById('yourFriendCode').textContent = `Your Friend Code: ${this.currentUser.friend_code}`;
                    const copyBtn = document.getElementById('copyMyFriendCodeBtn');
                    if (copyBtn) {
                        copyBtn.onclick = async () => {
                            try { await navigator.clipboard.writeText(this.currentUser.friend_code); this.showNotification('Friend Code copied', 'success'); } catch {}
                        };
                    }
                }
                // Wire search
                const searchInput = document.getElementById('friendSearchInput');
                const resultsBox = document.getElementById('friendSearchResults');
                if (searchInput && resultsBox) {
                    let t = null;
                    searchInput.oninput = () => {
                        clearTimeout(t);
                        const q = searchInput.value.trim();
                        if (!q) { resultsBox.style.display = 'none'; resultsBox.innerHTML=''; return; }
                        t = setTimeout(async () => {
                            try {
                                const res = await fetch('/api/users/search?q=' + encodeURIComponent(q));
                                if (!res.ok) return;
                                const users = await res.json();
                                resultsBox.innerHTML = users.map(u => `<div class=\"search-item\" style=\"padding:6px; cursor:pointer;\" data-id=\"${u.id}\">${u.display_name}</div>`).join('') || '<div style="padding:6px;">No users found</div>';
                                resultsBox.style.display = 'block';
                                resultsBox.querySelectorAll('.search-item').forEach(el => {
                                    el.onclick = () => {
                                        const id = el.getAttribute('data-id');
                                        // Send friend request by id via profile endpoint
                                        fetch('/api/profile/' + id + '/friend-request', { method: 'POST' }).then(async r => {
                                            if (r.ok) this.showNotification('Friend request sent', 'success');
                                            else { const d = await r.json(); this.showNotification(d.error || 'Failed to send request', 'error'); }
                                        });
                                        resultsBox.style.display = 'none';
                                    };
                                });
                            } catch {}
                        }, 300);
                    };
                }
                document.getElementById('friendsModal').style.display = 'flex';
            } else {
                this.showNotification('Failed to load friends', 'error');
            }
        } catch (error) {
            console.error('Friends modal error:', error);
            this.showNotification('Failed to load friends', 'error');
        }
    }

    // Add friend by code
    async addFriendByCode() {
        const friendCode = document.getElementById('addFriendCode').value.trim().toUpperCase();
        if (!friendCode) {
            this.showNotification('Please enter a friend code', 'error');
            return;
        }
        try {
            const response = await fetch('/api/friends/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friendCode })
            });
            const data = await response.json();
            if (response.ok) {
                this.showNotification('Friend request sent!', 'success');
                document.getElementById('addFriendCode').value = '';
            } else {
                this.showNotification(data.error || 'Failed to send friend request', 'error');
            }
        } catch (error) {
            console.error('Add friend code error:', error);
            this.showNotification('Failed to send friend request', 'error');
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

        // Group friends
        const onlineFriends = this.friends.filter(f => f.is_online);
        const offlineFriends = this.friends.filter(f => !f.is_online);

        const friendsContainer = document.getElementById('friendsContainer');
        friendsContainer.innerHTML = '';

        const renderGroup = (title, list) => {
            const section = document.createElement('div');
            section.className = 'friends-group';
            section.innerHTML = `<h4 style="margin:8px 0;">${title} (${list.length})</h4>`;
            if (title === 'Online Friends' && list.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'empty-state';
                empty.textContent = 'No friends online';
                section.appendChild(empty);
            }
            list.forEach(friend => {
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
                        <button class="btn-mini" onclick="authManager.openDirectMessage('${friend.id}', '${friend.display_name.replace(/'/g, "\'")}')">Message</button>
                        ${friend.is_online && window.game && window.game.currentRoomCode ? 
                            `<button class="btn-mini btn-invite" onclick="authManager.inviteFriend('${friend.id}')">Invite</button>` : 
                            ''
                        }
                        <button class="btn-mini btn-remove" onclick="authManager.removeFriend('${friend.id}')">Remove</button>
                    </div>
                `;
                section.appendChild(friendItem);
            });
            friendsContainer.appendChild(section);
        };

        renderGroup('Online Friends', onlineFriends);
        renderGroup('Offline Friends', offlineFriends);
    }

    isInPrivateLobby() {
        if (!window.game || !window.game.currentRoomCode) return false;
        // If we have lobby info, use its isPublic flag; default to private if not known
        const info = window.game.currentLobbyInfo;
        return info ? info.isPublic === false : true;
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

	openInviteFriendsModal() {
		if (!this.isAuthenticated) {
			this.showNotification('Log in to invite friends', 'error');
			return;
		}
		const modal = document.getElementById('inviteFriendsModal');
		const list = document.getElementById('inviteFriendsList');
		const slotsInfo = document.getElementById('inviteSlotsInfo');
		const online = (this.friends || []).filter(f => f.is_online);
		list.innerHTML = '';
		// Compute available slots = maxPlayers - current players
		let availableSlots = 0;
		if (window.game && window.game.gameState) {
			const gs = window.game.gameState;
			const current = gs.playerCount || (gs.players ? gs.players.length : 0) || 0;
			const max = gs.settings?.maxPlayers || 10;
			availableSlots = Math.max(0, max - current);
		}
		slotsInfo.textContent = availableSlots > 0 ? `Available invite slots: ${availableSlots}` : 'Lobby is full. You cannot invite more players.';
		if (online.length === 0) {
			list.innerHTML = '<p>No friends online</p>';
		} else {
			online.forEach(friend => {
				const row = document.createElement('label');
				row.style.display = 'flex';
				row.style.alignItems = 'center';
				row.style.gap = '8px';
				row.style.padding = '6px 2px';
				row.innerHTML = `
					<input type="checkbox" class="invite-checkbox" value="${friend.id}">
					<span>${friend.display_name}</span>
				`;
				list.appendChild(row);
			});
		}
		// Enforce selection limit
		list.addEventListener('change', (e) => {
			if (e.target && e.target.classList.contains('invite-checkbox')) {
				const selected = Array.from(list.querySelectorAll('.invite-checkbox:checked'));
				if (availableSlots > 0 && selected.length > availableSlots) {
					e.target.checked = false;
					this.showNotification(`You can select up to ${availableSlots} friend(s)`, 'error');
				}
			}
		});
		modal.style.display = 'flex';
		// Wire buttons
		document.getElementById('closeInviteFriendsModal').onclick = () => modal.style.display = 'none';
		document.getElementById('cancelInviteFriendsBtn').onclick = () => modal.style.display = 'none';
		document.getElementById('sendInvitesBtn').onclick = () => this.sendSelectedInvites(availableSlots);
	}

	sendSelectedInvites(availableSlots = 0) {
		if (!window.game || !window.game.currentRoomCode) {
			this.showNotification('Create or join a lobby first', 'error');
			return;
		}
		const modal = document.getElementById('inviteFriendsModal');
		const list = document.getElementById('inviteFriendsList');
		const selected = Array.from(list.querySelectorAll('.invite-checkbox:checked')).map(cb => cb.value);
		if (selected.length === 0) {
			this.showNotification('Select at least one friend', 'error');
			return;
		}
		if (availableSlots > 0 && selected.length > availableSlots) {
			this.showNotification(`You can invite only ${availableSlots} friend(s)`, 'error');
			return;
		}
		selected.forEach(friendId => {
			window.game.socket.emit('inviteFriend', {
				friendId: friendId,
				roomCode: window.game.currentRoomCode
			});
		});
		this.showNotification('Invites sent!', 'success');
		modal.style.display = 'none';
	}

	// Open DM panel with a friend
	openDirectMessage(friendId, friendName) {
		// Create DM modal if not exists
		let modal = document.getElementById('dmModal');
		if (!modal) {
			modal = document.createElement('div');
			modal.id = 'dmModal';
			modal.className = 'modal';
			modal.innerHTML = `
				<div class="modal-content" style="max-width:520px;">
					<span class="close" id="closeDmModal">&times;</span>
					<h3 id="dmTitle">Direct Message</h3>
					<div id="dmMessages" style="max-height:300px; overflow:auto; border:1px solid #333; padding:8px; border-radius:6px; margin-bottom:8px;"></div>
					<div style="display:flex; gap:8px;">
						<input id="dmInput" type="text" placeholder="Type a message… Use emojis 😀 or :smile:" style="flex:1;">
						<button id="dmSendBtn" class="btn-primary">Send</button>
					</div>
				</div>
			`;
			document.body.appendChild(modal);
			// Close handlers
			document.getElementById('closeDmModal').onclick = () => modal.style.display = 'none';
		}
		// Title
		document.getElementById('dmTitle').textContent = `Direct Message with ${friendName}`;
		modal.style.display = 'flex';
		// Load history
		this.loadDmHistory(friendId);
		// Wire send
		const send = () => this.sendDm(friendId);
		document.getElementById('dmSendBtn').onclick = send;
		document.getElementById('dmInput').onkeypress = (e) => { if (e.key === 'Enter') send(); };
		// Listen realtime
		if (window.game && window.game.socket) {
			if (!this._dmListenerBound) {
				window.game.socket.on('dmMessage', (msg) => {
					// Append only if from this friend or sent by me to this friend
					const currentId = this._currentDmUserId;
					if (!currentId) return;
					if (msg.fromUserId === currentId || (this.currentUser && msg.fromUserId === this.currentUser.id)) {
						this.appendDmMessage(msg.fromUserId === this.currentUser.id ? 'You' : friendName, msg.text);
					}
				});
				this._dmListenerBound = true;
			}
			this._currentDmUserId = friendId;
		}
	}

	async loadDmHistory(friendId) {
		try {
			const res = await fetch(`/api/dm/${friendId}`);
			if (!res.ok) return;
			const msgs = await res.json();
			const box = document.getElementById('dmMessages');
			box.innerHTML = '';
			msgs.forEach(m => {
				const author = (this.currentUser && m.fromUserId === this.currentUser.id) ? 'You' : 'Friend';
				this.appendDmMessage(author, m.text);
			});
			box.scrollTop = box.scrollHeight;
		} catch {}
	}

	appendDmMessage(author, text) {
		const box = document.getElementById('dmMessages');
		const div = document.createElement('div');
		div.className = 'dm-message';
		div.innerHTML = `<strong>${author}:</strong> ${this.renderEmojis(text)}`;
		box.appendChild(div);
		box.scrollTop = box.scrollHeight;
	}

	renderEmojis(text) {
		// Basic emoji alias replacement
		const aliases = {
			':smile:': '😄', ':laughing:': '😆', ':thumbsup:': '👍', ':heart:': '❤️', ':fire:': '🔥', ':clap:': '👏'
		};
		return (text || '').replace(/:(smile|laughing|thumbsup|heart|fire|clap):/g, (m) => aliases[m] || m);
	}

	async sendDm(friendId) {
		const input = document.getElementById('dmInput');
		let text = input.value.trim();
		if (!text) return;
		if (text.length > 1000) {
			this.showNotification('Message too long', 'error');
			return;
		}
		try {
			// Send via socket for realtime
			if (window.game && window.game.socket) {
				window.game.socket.emit('dmMessage', { toUserId: friendId, text });
			}
			// Persist via API
			await fetch(`/api/dm/${friendId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text })
			});
			// Optimistic append
			this.appendDmMessage('You', text);
			input.value = '';
		} catch (e) {
			this.showNotification('Failed to send', 'error');
		}
	}

	openForgotPasswordModal() {
		let modal = document.getElementById('forgotModal');
		if (!modal) {
			modal = document.createElement('div');
			modal.id = 'forgotModal';
			modal.className = 'modal';
			modal.innerHTML = `
				<div class="modal-content" style="max-width:420px;">
					<span class="close" id="closeForgotModal">&times;</span>
					<h3>Forgot Password</h3>
					<div class="form-group"><input id="forgotEmail" type="email" placeholder="Your email"></div>
					<div class="form-actions"><button id="sendResetBtn" class="btn-primary">Send reset link</button></div>
					<div id="resetLinkInfo" class="help-text" style="margin-top:8px;"></div>
				</div>
			`;
			document.body.appendChild(modal);
			document.getElementById('closeForgotModal').onclick = () => modal.style.display = 'none';
			document.getElementById('sendResetBtn').onclick = async () => {
				const email = (document.getElementById('forgotEmail').value || '').trim();
				if (!email) { this.showNotification('Enter your email', 'error'); return; }
				try {
					const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email }) });
					const data = await res.json();
					if (res.ok) {
						document.getElementById('resetLinkInfo').innerHTML = data.resetLink ? `Reset link: <a href="${data.resetLink}">${data.resetLink}</a>` : 'If your email exists, you will receive a reset link.';
						this.showNotification('If the email exists, a reset link was generated.', 'success');
					} else {
						this.showNotification(data.error || 'Failed to send reset link', 'error');
					}
				} catch (e) {
					this.showNotification('Failed to send reset link', 'error');
				}
			};
		}
		modal.style.display = 'flex';
	}

	openResetPasswordModal(tokenFromUrl = '') {
		let modal = document.getElementById('resetModal');
		if (!modal) {
			modal = document.createElement('div');
			modal.id = 'resetModal';
			modal.className = 'modal';
			modal.innerHTML = `
				<div class="modal-content" style="max-width:420px;">
					<span class="close" id="closeResetModal">&times;</span>
					<h3>Reset Password</h3>
					<div class="form-group"><input id="resetToken" type="text" placeholder="Reset token"></div>
					<div class="form-group"><input id="resetNewPassword" type="password" placeholder="New password (min 6)"></div>
					<div class="form-actions"><button id="applyResetBtn" class="btn-primary">Reset Password</button></div>
				</div>
			`;
			document.body.appendChild(modal);
			document.getElementById('closeResetModal').onclick = () => modal.style.display = 'none';
			document.getElementById('applyResetBtn').onclick = async () => {
				const token = (document.getElementById('resetToken').value || '').trim();
				const password = (document.getElementById('resetNewPassword').value || '').trim();
				if (!token || !password) { this.showNotification('Enter token and new password', 'error'); return; }
				try {
					const res = await fetch('/api/auth/reset-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, password }) });
					const data = await res.json();
					if (res.ok) {
						this.showNotification('Password reset successful. Please log in.', 'success');
						modal.style.display = 'none';
						this.showLoginModal();
					} else {
						this.showNotification(data.error || 'Reset failed', 'error');
					}
				} catch (e) {
					this.showNotification('Reset failed', 'error');
				}
			};
		}
		modal.style.display = 'flex';
		if (tokenFromUrl) document.getElementById('resetToken').value = tokenFromUrl;
	}

	handleResetDeepLink() {
		try {
			const params = new URLSearchParams(window.location.search);
			const action = params.get('action');
			const token = params.get('token');
			if (action === 'reset' && token) {
				this.openResetPasswordModal(token);
			}
		} catch {}
	}

	async deleteAccount() {
		if (!this.isAuthenticated) { this.showNotification('Log in first', 'error'); return; }
		// Confirm by typing DELETE
		let modal = document.getElementById('deleteAccountModal');
		if (!modal) {
			modal = document.createElement('div');
			modal.id = 'deleteAccountModal';
			modal.className = 'modal';
			modal.innerHTML = `
				<div class="modal-content" style="max-width:420px;">
					<span class="close" id="closeDeleteModal">&times;</span>
					<h3>Delete Account</h3>
					<p>Type <strong>DELETE</strong> to confirm. This action is irreversible.</p>
					<div class="form-group"><input id="deleteConfirmInput" placeholder="Type DELETE"></div>
					<div class="form-actions"><button id="confirmDeleteBtn" class="btn-primary">Delete</button></div>
				</div>
			`;
			document.body.appendChild(modal);
			document.getElementById('closeDeleteModal').onclick = () => modal.style.display = 'none';
			document.getElementById('confirmDeleteBtn').onclick = async () => {
				const val = (document.getElementById('deleteConfirmInput').value || '').trim();
				if (val !== 'DELETE') { this.showNotification('Please type DELETE to confirm', 'error'); return; }
				try {
					const res = await fetch('/api/account', { method:'DELETE' });
					if (res.ok) {
						this.setCurrentUser(null);
						modal.style.display = 'none';
						this.showNotification('Account deleted', 'success');
					} else {
						const data = await res.json().catch(()=>({}));
						this.showNotification(data.error || 'Delete failed', 'error');
					}
				} catch (e) {
					this.showNotification('Delete failed', 'error');
				}
			};
		}
		modal.style.display = 'flex';
	}
}

// Initialize the auth manager
const authManager = new AuthManager();
window.authManager = authManager;