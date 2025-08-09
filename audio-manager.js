// Audio Manager for The Fall of Velmora
// Handles all audio operations using Howler.js

class AudioManager {
    constructor() {
        this.isInitialized = false;
        this.isMuted = false;
        this.masterVolume = 0.7;
        this.musicVolume = 0.6;
        this.sfxVolume = 0.8;
        
        // Current playing music
        this.currentMusic = null;
        this.currentPhase = null;
        
        // Audio collections
        this.music = {};
        this.sfx = {};
        
        // Load settings from localStorage
        this.loadSettings();
        
        // Initialize audio when user first interacts
        this.setupUserInteractionHandler();
    }

    setupUserInteractionHandler() {
        const enableAudio = () => {
            if (!this.isInitialized) {
                this.initialize();
                document.removeEventListener('click', enableAudio);
                document.removeEventListener('keydown', enableAudio);
            }
        };
        
        document.addEventListener('click', enableAudio);
        document.addEventListener('keydown', enableAudio);
    }

    initialize() {
        this.isInitialized = true;
        
        // Load all audio assets
        this.loadMusic();
        this.loadSoundEffects();
    }

    loadMusic() {
        const musicPath = './audio/music/';
        
        this.music = {
            lobby: new Howl({
                src: [musicPath + 'lobby-ambient.wav', musicPath + 'lobby-ambient.mp3', musicPath + 'lobby-ambient.ogg'],
                loop: true,
                volume: 0,
                preload: true,
                onloaderror: (id, err) => console.warn('Failed to load lobby music:', err)
            }),
            
            day: new Howl({
                src: [musicPath + 'day-discussion.wav', musicPath + 'day-discussion.mp3', musicPath + 'day-discussion.ogg'],
                loop: true,
                volume: 0,
                preload: true,
                onloaderror: (id, err) => console.warn('Failed to load day music:', err)
            }),
            
            voting: new Howl({
                src: [musicPath + 'voting-suspense.wav', musicPath + 'voting-suspense.mp3', musicPath + 'voting-suspense.ogg'],
                loop: true,
                volume: 0,
                preload: true,
                onloaderror: (id, err) => console.warn('Failed to load voting music:', err)
            }),
            
            night: new Howl({
                src: [musicPath + 'night-tension.wav', musicPath + 'night-tension.mp3', musicPath + 'night-tension.ogg'],
                loop: true,
                volume: 0,
                preload: true,
                onloaderror: (id, err) => console.warn('Failed to load night music:', err)
            }),
            
            victory: new Howl({
                src: [musicPath + 'victory-theme.wav', musicPath + 'victory-theme.mp3', musicPath + 'victory-theme.ogg'],
                loop: false,
                volume: 0,
                preload: true,
                onloaderror: (id, err) => console.warn('Failed to load victory music:', err)
            }),
            
            defeat: new Howl({
                src: [musicPath + 'defeat-theme.wav', musicPath + 'defeat-theme.mp3', musicPath + 'defeat-theme.ogg'],
                loop: false,
                volume: 0,
                preload: true,
                onloaderror: (id, err) => console.warn('Failed to load defeat music:', err)
            })
        };
    }

    loadSoundEffects() {
        const sfxPath = './audio/sfx/';
        
        this.sfx = {
            // Role reveals
            roleMafia: new Howl({
                src: [sfxPath + 'role-mafia.wav', sfxPath + 'role-mafia.mp3', sfxPath + 'role-mafia.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            roleCivilian: new Howl({
                src: [sfxPath + 'role-civilian.wav', sfxPath + 'role-civilian.mp3', sfxPath + 'role-civilian.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            rolePolice: new Howl({
                src: [sfxPath + 'role-police.wav', sfxPath + 'role-police.mp3', sfxPath + 'role-police.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            roleDetective: new Howl({
                src: [sfxPath + 'role-detective.wav', sfxPath + 'role-detective.mp3', sfxPath + 'role-detective.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            roleDoctor: new Howl({
                src: [sfxPath + 'role-doctor.wav', sfxPath + 'role-doctor.mp3', sfxPath + 'role-doctor.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            roleSuicideBomber: new Howl({
                src: [sfxPath + 'role-suicide-bomber.wav', sfxPath + 'role-suicide-bomber.mp3', sfxPath + 'role-suicide-bomber.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            roleManipulator: new Howl({
                src: [sfxPath + 'role-manipulator.wav', sfxPath + 'role-manipulator.mp3', sfxPath + 'role-manipulator.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            // Game events
            murder: new Howl({
                src: [sfxPath + 'murder-event.wav', sfxPath + 'murder-event.mp3', sfxPath + 'murder-event.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            explosion: new Howl({
                src: [sfxPath + 'explosion.wav', sfxPath + 'explosion.mp3', sfxPath + 'explosion.ogg'],
                volume: this.sfxVolume * 1.2, // Slightly louder for impact
                preload: true
            }),
            
            protection: new Howl({
                src: [sfxPath + 'protection.wav', sfxPath + 'protection.mp3', sfxPath + 'protection.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            investigation: new Howl({
                src: [sfxPath + 'investigation.wav', sfxPath + 'investigation.mp3', sfxPath + 'investigation.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            // UI sounds
            voteClick: new Howl({
                src: [sfxPath + 'vote-click.wav', sfxPath + 'vote-click.mp3', sfxPath + 'vote-click.ogg'],
                volume: this.sfxVolume * 0.6,
                preload: true
            }),
            
            voteConfirm: new Howl({
                src: [sfxPath + 'vote-confirm.wav', sfxPath + 'vote-confirm.mp3', sfxPath + 'vote-confirm.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            buttonClick: new Howl({
                src: [sfxPath + 'button-click.wav', sfxPath + 'button-click.mp3', sfxPath + 'button-click.ogg'],
                volume: this.sfxVolume * 0.4,
                preload: true
            }),
            
            notification: new Howl({
                src: [sfxPath + 'notification.wav', sfxPath + 'notification.mp3', sfxPath + 'notification.ogg'],
                volume: this.sfxVolume * 0.7,
                preload: true
            }),
            
            // Phase transitions
            phaseTransition: new Howl({
                src: [sfxPath + 'phase-transition.wav', sfxPath + 'phase-transition.mp3', sfxPath + 'phase-transition.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            gameStart: new Howl({
                src: [sfxPath + 'game-start.wav', sfxPath + 'game-start.mp3', sfxPath + 'game-start.ogg'],
                volume: this.sfxVolume,
                preload: true
            }),
            
            gameEnd: new Howl({
                src: [sfxPath + 'game-end.wav', sfxPath + 'game-end.mp3', sfxPath + 'game-end.ogg'],
                volume: this.sfxVolume,
                preload: true
            })
        };
    }

    // Music control methods
    playMusic(phase, immediate = false) {
        if (!this.isInitialized || this.isMuted) return;
        
        const targetMusic = this.music[phase];
        if (!targetMusic) {
            console.warn(`No music found for phase: ${phase}`);
            return;
        }

        // Don't restart the same music
        if (this.currentPhase === phase && this.currentMusic && this.currentMusic.playing()) {
            return;
        }

        const fadeDuration = immediate ? 0 : 2000; // 2 second fade
        const targetVolume = this.musicVolume * this.masterVolume;

        // Fade out current music
        if (this.currentMusic && this.currentMusic.playing()) {
            this.currentMusic.fade(this.currentMusic.volume(), 0, fadeDuration);
            setTimeout(() => {
                if (this.currentMusic) {
                    this.currentMusic.stop();
                }
            }, fadeDuration);
        }

        // Fade in new music
        setTimeout(() => {
            this.currentMusic = targetMusic;
            this.currentPhase = phase;
            
            if (targetMusic.state() === 'loaded') {
                targetMusic.volume(0);
                targetMusic.play();
                targetMusic.fade(0, targetVolume, fadeDuration);
            } else {
                // Wait for loading if not ready
                targetMusic.once('load', () => {
                    targetMusic.volume(0);
                    targetMusic.play();
                    targetMusic.fade(0, targetVolume, fadeDuration);
                });
            }
        }, immediate ? 0 : fadeDuration / 2);
    }

    stopMusic(immediate = false) {
        if (!this.currentMusic) return;
        
        if (immediate) {
            this.currentMusic.stop();
            this.currentMusic = null;
            this.currentPhase = null;
        } else {
            this.currentMusic.fade(this.currentMusic.volume(), 0, 1000);
            setTimeout(() => {
                if (this.currentMusic) {
                    this.currentMusic.stop();
                    this.currentMusic = null;
                    this.currentPhase = null;
                }
            }, 1000);
        }
    }

    // Sound effect methods
    playSound(soundName, volume = 1.0) {
        if (!this.isInitialized || this.isMuted) return;
        
        const sound = this.sfx[soundName];
        if (!sound) {
            console.warn(`Sound effect not found: ${soundName}`);
            return;
        }

        const finalVolume = this.sfxVolume * this.masterVolume * volume;
        
        if (sound.state() === 'loaded') {
            sound.volume(finalVolume);
            sound.play();
        } else {
            sound.once('load', () => {
                sound.volume(finalVolume);
                sound.play();
            });
        }
    }

    // Role-specific sound methods
    playRoleReveal(role) {
        const roleMap = {
            'mafia': 'roleMafia',
            'suicide_bomber': 'roleSuicideBomber',
            'manipulator': 'roleManipulator',
            'civilian': 'roleCivilian',
            'detective': 'roleDetective',
            'doctor': 'roleDoctor',
            'police': 'rolePolice',
            'white_police': 'rolePolice',
            'black_police': 'rolePolice',
            'gray_police': 'rolePolice',
            'corrupt_police': 'roleMafia' // Use mafia sound for corrupt police
        };

        const soundName = roleMap[role] || 'roleCivilian';
        this.playSound(soundName);
    }

    // Volume control methods
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
        this.saveSettings();
    }

    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.updateMusicVolume();
        this.saveSettings();
    }

    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.updateSfxVolumes();
        this.saveSettings();
    }

    updateAllVolumes() {
        this.updateMusicVolume();
        this.updateSfxVolumes();
    }

    updateMusicVolume() {
        if (this.currentMusic && this.currentMusic.playing()) {
            this.currentMusic.volume(this.musicVolume * this.masterVolume);
        }
    }

    updateSfxVolumes() {
        Object.values(this.sfx).forEach(sound => {
            sound.volume(this.sfxVolume * this.masterVolume);
        });
    }

    // Mute/unmute
    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted) {
            Howler.mute(true);
        } else {
            Howler.mute(false);
        }
        
        this.saveSettings();
        return this.isMuted;
    }

    // Settings persistence
    saveSettings() {
        const settings = {
            masterVolume: this.masterVolume,
            musicVolume: this.musicVolume,
            sfxVolume: this.sfxVolume,
            isMuted: this.isMuted
        };
        localStorage.setItem('velmoraAudioSettings', JSON.stringify(settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('velmoraAudioSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.masterVolume = settings.masterVolume || 0.7;
                this.musicVolume = settings.musicVolume || 0.6;
                this.sfxVolume = settings.sfxVolume || 0.8;
                this.isMuted = settings.isMuted || false;
                
                if (this.isMuted) {
                    Howler.mute(true);
                }
            } catch (e) {
                console.warn('Failed to load audio settings:', e);
            }
        }
    }

    // Game event handlers
    onGameStart() {
        this.playSound('gameStart');
        this.playMusic('lobby');
    }

    onPhaseChange(phase) {
        this.playSound('phaseTransition');
        
        setTimeout(() => {
            switch (phase) {
                case 'lobby':
                    this.playMusic('lobby');
                    break;
                case 'day':
                    this.playMusic('day');
                    break;
                case 'voting':
                    this.playMusic('voting');
                    break;
                case 'night':
                    this.playMusic('night');
                    break;
                default:
                    console.warn(`Unknown phase for music: ${phase}`);
            }
        }, 500); // Small delay after transition sound
    }

    onGameEnd(winner) {
        this.playSound('gameEnd');
        
        setTimeout(() => {
            if (winner === 'civilians' || winner === 'town') {
                this.playMusic('victory');
            } else {
                this.playMusic('defeat');
            }
        }, 1000);
    }

    onPlayerElimination() {
        this.playSound('murder');
    }

    onSuicideBomberActivation() {
        this.playSound('explosion');
    }

    onProtection() {
        this.playSound('protection');
    }

    onInvestigation() {
        this.playSound('investigation');
    }

    onVoteClick() {
        this.playSound('voteClick');
    }

    onVoteConfirm() {
        this.playSound('voteConfirm');
    }

    onButtonClick() {
        this.playSound('buttonClick');
    }

    onNotification() {
        this.playSound('notification');
    }

    // Cleanup
    destroy() {
        this.stopMusic(true);
        Object.values(this.music).forEach(music => music.unload());
        Object.values(this.sfx).forEach(sound => sound.unload());
        this.music = {};
        this.sfx = {};
        this.isInitialized = false;
    }
}

// Create global instance
window.audioManager = new AudioManager(); 