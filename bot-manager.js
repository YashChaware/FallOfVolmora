// Bot Manager for The Fall of Velmora
// Handles AI bot players with intelligent voting behavior

class BotManager {
    constructor() {
        this.bots = new Map(); // botId -> bot data
        this.botNames = [
            'AI Citizen Alpha', 'AI Citizen Beta', 'AI Citizen Gamma', 
            'AI Citizen Delta', 'AI Citizen Epsilon', 'AI Citizen Zeta',
            'AI Citizen Eta', 'AI Citizen Theta', 'AI Citizen Iota',
            'AI Citizen Kappa', 'AI Citizen Lambda', 'AI Citizen Mu'
        ];
        this.usedNames = new Set();
    }

    // Generate a unique bot player
    createBot() {
        const availableNames = this.botNames.filter(name => !this.usedNames.has(name));
        if (availableNames.length === 0) {
            // Fallback if all names are used
            const randomNum = Math.floor(Math.random() * 1000);
            return `AI Player ${randomNum}`;
        }
        
        const name = availableNames[Math.floor(Math.random() * availableNames.length)];
        this.usedNames.add(name);
        
        const bot = {
            id: `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            role: null,
            alive: true,
            isBot: true,
            suspicionLevels: new Map(), // playerId -> suspicion level (0-100)
            votingHistory: new Map(), // track voting patterns
            personality: this.generatePersonality(),
            lastAction: null,
            actionTimer: null
        };
        
        this.bots.set(bot.id, bot);
        return bot;
    }

    // Generate a random personality for bot decision making
    generatePersonality() {
        return {
            aggressiveness: Math.random(), // 0-1: how quickly they vote
            cautiousness: Math.random(), // 0-1: how much they analyze before voting
            followCrowd: Math.random(), // 0-1: tendency to follow majority
            trustLevel: Math.random(), // 0-1: how much they trust other players
            randomness: Math.random() * 0.3 // 0-0.3: random vote chance
        };
    }

    // Remove bot and free up name
    removeBot(botId) {
        const bot = this.bots.get(botId);
        if (bot) {
            this.usedNames.delete(bot.name);
            if (bot.actionTimer) {
                clearTimeout(bot.actionTimer);
            }
            this.bots.delete(botId);
        }
    }

    // Get all bots
    getBots() {
        return Array.from(this.bots.values());
    }

    // Get bot by ID
    getBot(botId) {
        return this.bots.get(botId);
    }

    // Update bot suspicion levels based on game events
    updateSuspicion(botId, targetPlayerId, suspicionChange) {
        const bot = this.bots.get(botId);
        if (!bot) return;

        const currentSuspicion = bot.suspicionLevels.get(targetPlayerId) || 50;
        const newSuspicion = Math.max(0, Math.min(100, currentSuspicion + suspicionChange));
        bot.suspicionLevels.set(targetPlayerId, newSuspicion);
    }

    // Analyze voting patterns and update suspicion
    analyzeVotingPattern(botId, voterPlayerId, targetPlayerId, phase) {
        const bot = this.bots.get(botId);
        if (!bot || voterPlayerId === botId) return;

        // Track voting history
        if (!bot.votingHistory.has(voterPlayerId)) {
            bot.votingHistory.set(voterPlayerId, []);
        }
        bot.votingHistory.get(voterPlayerId).push({ target: targetPlayerId, phase });

        // Analyze suspicious voting patterns
        const history = bot.votingHistory.get(voterPlayerId);
        if (history.length >= 2) {
            const recentVotes = history.slice(-3);
            
            // Suspicious if always voting for different people (scatter voting)
            const uniqueTargets = new Set(recentVotes.map(v => v.target));
            if (uniqueTargets.size === recentVotes.length && recentVotes.length >= 3) {
                this.updateSuspicion(botId, voterPlayerId, 15);
            }

            // Suspicious if voting for known good players repeatedly
            // (This would need game state context)
        }
    }

    // Get bot's voting decision based on AI logic
    getBotVote(botId, availablePlayers, gameState) {
        const bot = this.bots.get(botId);
        if (!bot || !bot.alive) {
            console.log(`❌ Bot ${botId} not found or not alive`);
            return null;
        }

        // Filter out dead players and self (bots can vote for other bots too)
        const validTargets = availablePlayers.filter(p => 
            p.alive !== false && p.id !== botId
        );

        console.log(`🎯 Bot ${bot.name} has ${validTargets.length} valid targets: ${validTargets.map(t => t.name).join(', ')}`);

        if (validTargets.length === 0) {
            console.log(`❌ No valid targets for bot ${bot.name}`);
            return null;
        }

        // Apply personality-based decision making
        const personality = bot.personality;

        // Random vote chance (chaos factor)
        if (Math.random() < personality.randomness) {
            return validTargets[Math.floor(Math.random() * validTargets.length)];
        }

        // Calculate vote weights for each target
        const voteWeights = validTargets.map(target => {
            let weight = 0;
            
            // Base suspicion level
            const suspicion = bot.suspicionLevels.get(target.id) || 50;
            weight += suspicion * 2;

            // Voting history analysis
            const votingHistory = bot.votingHistory.get(target.id) || [];
            if (votingHistory.length > 0) {
                // More suspicious if they've been voting erratically
                weight += votingHistory.length * 10;
            }

            // Follow the crowd tendency
            if (gameState && gameState.currentVotes) {
                const votesAgainstTarget = Array.from(gameState.currentVotes.values())
                    .filter(vote => vote === target.id).length;
                weight += votesAgainstTarget * personality.followCrowd * 30;
            }

            // Prefer voting for players who seem to be acting suspiciously
            // (This could be enhanced with more game context)
            
            // Add some randomness
            weight += (Math.random() - 0.5) * 20;

            return { target, weight };
        });

        // Sort by weight (highest first) and apply cautiousness
        voteWeights.sort((a, b) => b.weight - a.weight);
        
        // Cautious bots might not vote for the most suspicious immediately
        const selectionIndex = Math.floor(personality.cautiousness * Math.min(3, voteWeights.length));
        
        return voteWeights[selectionIndex]?.target || voteWeights[0]?.target;
    }

    // Schedule bot voting with realistic delay
    scheduleBotVote(botId, availablePlayers, gameState, voteCallback) {
        const bot = this.bots.get(botId);
        if (!bot) {
            console.log(`❌ Bot ${botId} not found in bot manager`);
            return;
        }
        
        // Check if bot is alive according to the server's player list
        const serverBot = availablePlayers.find(p => p.id === botId);
        if (!serverBot || serverBot.alive === false) {
            console.log(`❌ Bot ${bot.name} not alive according to server (alive: ${serverBot?.alive})`);
            return;
        }

        // Clear any existing timer
        if (bot.actionTimer) {
            clearTimeout(bot.actionTimer);
        }

        // Calculate delay based on personality (much faster for better gameplay)
        const baseDelay = 2000; // 2 seconds minimum
        const maxDelay = 8000; // 8 seconds maximum
        const personalityDelay = bot.personality.aggressiveness * 0.3 + bot.personality.cautiousness * 0.7;
        const delay = baseDelay + (maxDelay - baseDelay) * personalityDelay;

        console.log(`⏰ Scheduling bot ${bot.name} to vote in ${Math.round(delay/1000)}s`);
        
        bot.actionTimer = setTimeout(() => {
            const target = this.getBotVote(botId, availablePlayers, gameState);
            if (target && voteCallback) {
                console.log(`🤖 Bot ${bot.name} voting for ${target.name}`);
                voteCallback(botId, target.id);
            } else {
                console.log(`❌ Bot ${bot.name} couldn't find valid target to vote for`);
            }
        }, delay);
    }

    // Handle game events that affect bot AI
    onGameEvent(eventType, eventData) {
        switch (eventType) {
            case 'playerEliminated':
                this.handlePlayerEliminated(eventData);
                break;
            case 'dayPhaseStarted':
                this.handleDayPhaseStarted(eventData);
                break;
            case 'voteReceived':
                this.handleVoteReceived(eventData);
                break;
            case 'gameStarted':
                this.handleGameStarted(eventData);
                break;
        }
    }

    handlePlayerEliminated(data) {
        const { eliminatedPlayerId, playerRole } = data;
        
        // Update suspicion levels based on elimination
        for (const bot of this.bots.values()) {
            if (playerRole === 'mafia') {
                // If mafia was eliminated, reduce suspicion of everyone who voted for them
                // (This would need vote tracking from game state)
            } else {
                // If innocent was eliminated, increase suspicion of everyone who voted for them
            }
        }
    }

    handleDayPhaseStarted(data) {
        // Reset action timers for new day phase
        for (const bot of this.bots.values()) {
            if (bot.actionTimer) {
                clearTimeout(bot.actionTimer);
                bot.actionTimer = null;
            }
        }
    }

    handleVoteReceived(data) {
        const { voterPlayerId, targetPlayerId, phase } = data;
        
        // Update all bots' analysis of this voting behavior
        for (const [botId] of this.bots) {
            if (botId !== voterPlayerId) {
                this.analyzeVotingPattern(botId, voterPlayerId, targetPlayerId, phase);
            }
        }
    }

    handleGameStarted(data) {
        // Initialize bot suspicion levels for all players
        const { allPlayers } = data;
        
        for (const bot of this.bots.values()) {
            bot.suspicionLevels.clear();
            bot.votingHistory.clear();
            
            // Initialize neutral suspicion for all other players
            for (const player of allPlayers) {
                if (player.id !== bot.id) {
                    bot.suspicionLevels.set(player.id, 50); // Neutral suspicion
                }
            }
        }
    }

    // Clean up all bots
    cleanup() {
        for (const bot of this.bots.values()) {
            if (bot.actionTimer) {
                clearTimeout(bot.actionTimer);
            }
        }
        this.bots.clear();
        this.usedNames.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BotManager;
}

// Make available globally for browser use
if (typeof window !== 'undefined') {
    window.BotManager = BotManager;
} 