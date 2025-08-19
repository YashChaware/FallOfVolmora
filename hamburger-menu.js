// Hamburger Menu Manager for The Fall of Velmora

class HamburgerMenu {
    constructor() {
        this.isOpen = false;
        this.hamburgerBtn = null;
        this.dropdown = null;
        this.init();
    }

    init() {
        this.hamburgerBtn = document.getElementById('hamburgerBtn');
        this.dropdown = document.getElementById('hamburgerDropdown');
        
        if (this.hamburgerBtn && this.dropdown) {
            this.setupEventListeners();
            this.updateMenuForAuthState();
        }
    }

    setupEventListeners() {
        // Toggle menu on hamburger button click
        this.hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.dropdown.contains(e.target) && !this.hamburgerBtn.contains(e.target)) {
                this.close();
            }
        });

        // Menu item click handlers
        this.setupMenuItemListeners();
    }

    setupMenuItemListeners() {
        // Profile
        document.getElementById('profileDropdownBtn').addEventListener('click', () => {
            this.handleProfileClick();
            this.close();
        });

        // Friends
        document.getElementById('friendsDropdownBtn').addEventListener('click', () => {
            this.handleFriendsClick();
            this.close();
        });

        // Settings
        document.getElementById('settingsDropdownBtn').addEventListener('click', () => {
            this.handleSettingsClick();
            this.close();
        });

        // About
        document.getElementById('aboutDropdownBtn').addEventListener('click', () => {
            this.handleAboutClick();
            this.close();
        });

        // Login
        document.getElementById('loginDropdownBtn').addEventListener('click', () => {
            this.handleLoginClick();
            this.close();
        });

        // Register
        document.getElementById('registerDropdownBtn').addEventListener('click', () => {
            this.handleRegisterClick();
            this.close();
        });

        // Logout (standalone section)
        document.getElementById('logoutDropdownBtn').addEventListener('click', () => {
            this.handleLogoutClick();
            this.close();
        });

        // Logout inside auth section when authenticated
        const logoutInAuth = document.getElementById('logoutInAuthDropdownBtn');
        if (logoutInAuth) {
            logoutInAuth.addEventListener('click', () => {
                this.handleLogoutClick();
                this.close();
            });
        }
        // Delete account
        const deleteAccountBtn = document.getElementById('deleteAccountDropdownBtn');
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', async () => {
                const confirmText = prompt("Type DELETE to permanently remove your account. This cannot be undone.");
                if (confirmText !== 'DELETE') return;
                try {
                    const res = await fetch('/api/account', { method: 'DELETE' });
                    if (res.ok) {
                        this.showNotification('Account deleted', 'success');
                        window.location.reload();
                    } else {
                        const data = await res.json();
                        this.showNotification(data.error || 'Failed to delete account', 'error');
                    }
                } catch (e) {
                    this.showNotification('Failed to delete account', 'error');
                }
                this.close();
            });
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        this.hamburgerBtn.classList.add('active');
        this.dropdown.classList.add('show');
        this.updateMenuForAuthState();
        
        // Play button click sound
        if (window.audioManager) {
            window.audioManager.onButtonClick();
        }
    }

    close() {
        this.isOpen = false;
        this.hamburgerBtn.classList.remove('active');
        this.dropdown.classList.remove('show');
    }

    updateMenuForAuthState() {
        const isAuthenticated = window.authManager && window.authManager.isAuthenticated;
        
        // User section
        const userSection = document.getElementById('userSectionDropdown');
        const authSection = document.getElementById('authSectionDropdown');
        const logoutSection = document.getElementById('logoutSectionDropdown');
        const usernameDisplay = document.getElementById('userDisplayNameDropdown');
        const loginItem = document.getElementById('loginDropdownBtn');
        const registerItem = document.getElementById('registerDropdownBtn');
        const logoutInAuth = document.getElementById('logoutInAuthDropdownBtn');
        const deleteAccountBtn = document.getElementById('deleteAccountDropdownBtn');

        if (isAuthenticated) {
            // Show user info; hide standalone logout section
            userSection.style.display = 'block';
            logoutSection.style.display = 'none';
            authSection.style.display = 'block';
            if (loginItem) loginItem.style.display = 'none';
            if (registerItem) registerItem.style.display = 'none';
            if (logoutInAuth) logoutInAuth.style.display = 'block';
            if (deleteAccountBtn) deleteAccountBtn.style.display = 'block';
            
            // Update username display
            const user = window.authManager.currentUser;
            if (user && usernameDisplay) {
                usernameDisplay.textContent = user.displayName || user.username || 'User';
            }
        } else {
            // Show auth options
            userSection.style.display = 'none';
            logoutSection.style.display = 'none';
            authSection.style.display = 'block';
            if (loginItem) loginItem.style.display = 'block';
            if (registerItem) registerItem.style.display = 'block';
            if (logoutInAuth) logoutInAuth.style.display = 'none';
            if (deleteAccountBtn) deleteAccountBtn.style.display = 'none';
        }
    }

    // Menu item handlers
    handleProfileClick() {
        if (window.authManager && window.authManager.isAuthenticated) {
            window.authManager.showProfileModal();
        } else {
            this.showNotification('Please log in to access your profile', 'info');
            window.authManager.showLoginModal();
        }
    }

    handleFriendsClick() {
        if (window.authManager && window.authManager.isAuthenticated) {
            window.authManager.showFriendsModal();
        } else {
            this.showNotification('Please log in to access your friends list', 'info');
            window.authManager.showLoginModal();
        }
    }

    handleSettingsClick() {
        // Settings are now accessible from anywhere
        if (window.lobbyManager) {
            // Use lobby manager's settings screen
            window.lobbyManager.showSettings();
        } else {
            // Fallback: show notification if lobby manager is not available
            this.showNotification('Settings temporarily unavailable', 'warning');
        }
    }

    handleAboutClick() {
        this.showAbout();
    }

    handleLoginClick() {
        if (window.authManager) {
            window.authManager.showLoginModal();
        }
    }

    handleRegisterClick() {
        if (window.authManager) {
            window.authManager.showRegisterModal();
        }
    }

    handleLogoutClick() {
        if (window.authManager) {
            window.authManager.logout();
        }
    }

    showAbout() {
        // Show about information
        const aboutMessage = `
					🎮 The Fall of Volmora v1.0

A multiplayer social deduction game where wit meets strategy.

🌟 Features:
• Public & Private Lobbies
• User Profiles & Friends System
• Dynamic Role Assignment
• Real-time Voice Chat Support
• Cross-platform Compatibility

🎯 How to Play:
• Civilians: Find and eliminate the Mafia
• Mafia: Eliminate Civilians without being caught
• Special Roles: Use unique abilities strategically

🔧 Created with passion for thrilling gameplay and social interaction.

💡 Need help? Check the game rules or ask other players!
        `;
        
        this.showNotification(aboutMessage.trim(), 'info', 8000);
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (window.authManager) {
            window.authManager.showNotification(message, type, duration);
        } else if (window.game) {
            window.game.showToast(message, type);
        } else {
            alert(message);
        }
    }

    // Called from auth manager when authentication state changes
    onAuthStateChange() {
        this.updateMenuForAuthState();
    }
}

// Initialize hamburger menu when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.hamburgerMenu = new HamburgerMenu();
});

// If DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.hamburgerMenu) {
            window.hamburgerMenu = new HamburgerMenu();
        }
    });
} else {
    if (!window.hamburgerMenu) {
        window.hamburgerMenu = new HamburgerMenu();
    }
} 