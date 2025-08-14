const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

class VelmoraDatabase {
	constructor() {
		this.connected = false;
		this.connectionPromise = this.init();
	}

	async init() {
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			console.error('MONGODB_URI is not set. Please set it to your MongoDB Atlas connection string.');
			throw new Error('Missing MONGODB_URI');
		}

		if (this.connected) return;

		await mongoose.connect(mongoUri, {
			serverSelectionTimeoutMS: 15000
		});

		// Schemas
		const userSchema = new mongoose.Schema({
			username: { type: String, required: true, unique: true, index: true },
			email: { type: String, required: true, unique: true, index: true },
			password_hash: { type: String, required: true },
			display_name: { type: String, required: true },
			avatar_url: { type: String, default: null },
			bio: { type: String, default: '' },
			favorite_role: { type: String, default: null },
			created_at: { type: Date, default: Date.now },
			last_login: { type: Date, default: null },
			total_games: { type: Number, default: 0 },
			total_wins: { type: Number, default: 0 },
			mafia_wins: { type: Number, default: 0 },
			civilian_wins: { type: Number, default: 0 },
			mafia_games: { type: Number, default: 0 },
			civilian_games: { type: Number, default: 0 },
			is_online: { type: Boolean, default: false },
			friend_code: { type: String, required: true, unique: true, index: true },
			reset_token: { type: String, default: null, index: true },
			reset_expires: { type: Date, default: null },
			// Privacy
			dm_from_friends_only: { type: Boolean, default: true },
			friend_requests_enabled: { type: Boolean, default: true }
		});

		const friendSchema = new mongoose.Schema({
			user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
			friend_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
			status: { type: String, enum: ['pending', 'accepted'], required: true, index: true },
			created_at: { type: Date, default: Date.now },
			updated_at: { type: Date, default: Date.now }
		}, { indexes: [{ user_id: 1, friend_id: 1, unique: true }] });

		friendSchema.index({ user_id: 1, friend_id: 1 }, { unique: true });

		const gameSessionSchema = new mongoose.Schema({
			room_code: { type: String, required: true, index: true },
			started_at: { type: Date, default: Date.now },
			ended_at: { type: Date, default: null },
			winner_team: { type: String, default: null },
			total_players: { type: Number, required: true },
			total_days: { type: Number, default: null },
			game_duration: { type: Number, default: null }
		});

		const gameParticipantSchema = new mongoose.Schema({
			game_session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession', required: true, index: true },
			user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
			username: { type: String, required: true },
			role: { type: String, required: true },
			survived: { type: Boolean, required: true },
			won: { type: Boolean, required: true }
		});

		const directMessageSchema = new mongoose.Schema({
			from_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
			to_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
			text: { type: String, required: true },
			created_at: { type: Date, default: Date.now, index: true },
			read_at: { type: Date, default: null }
		});

		this.User = mongoose.model('User', userSchema);
		this.Friend = mongoose.model('Friend', friendSchema);
		this.GameSession = mongoose.model('GameSession', gameSessionSchema);
		this.GameParticipant = mongoose.model('GameParticipant', gameParticipantSchema);
		this.DirectMessage = mongoose.model('DirectMessage', directMessageSchema);

		this.connected = true;
		console.log('Connected to MongoDB Atlas');
	}

	// Ensure connection ready
	async ensureReady() {
		if (!this.connected) {
			await this.connectionPromise;
		}
	}

	// Internal helper to generate a unique friend code
	async generateUniqueFriendCode() {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		const length = 8;
		let code = '';
		let exists = true;
		while (exists) {
			code = '';
			for (let i = 0; i < length; i++) {
				code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
			}
			exists = !!(await this.User.findOne({ friend_code: code }).lean());
		}
		return code;
	}

	// User management methods
	async createUser(username, email, password, displayName) {
		await this.ensureReady();

		const existingUsername = await this.User.findOne({ username }).lean();
		if (existingUsername) throw new Error('Username already exists');
		const existingEmail = await this.User.findOne({ email }).lean();
		if (existingEmail) throw new Error('Email already exists');

		const hashedPassword = bcrypt.hashSync(password, 10);
		const friendCode = await this.generateUniqueFriendCode();
		const user = await this.User.create({
			username,
			email,
			password_hash: hashedPassword,
			display_name: displayName,
			friend_code: friendCode
		});

		return { id: user._id.toString(), username, email, displayName };
	}

	async getUserByUsername(username) {
		await this.ensureReady();
		return this.User.findOne({ username }).lean();
	}

	async getUserByEmail(email) {
		await this.ensureReady();
		return this.User.findOne({ email }).lean();
	}

	async getUserByFriendCode(friendCode) {
		await this.ensureReady();
		return this.User.findOne({ friend_code: friendCode }).lean();
	}

	async getUserById(id) {
		await this.ensureReady();
		const user = await this.User.findById(id).lean();
		if (!user) return null;
		return {
			id: user._id.toString(),
			username: user.username,
			email: user.email,
			display_name: user.display_name,
			avatar_url: user.avatar_url || null,
			bio: user.bio || '',
			created_at: user.created_at,
			total_games: user.total_games,
			total_wins: user.total_wins,
			mafia_wins: user.mafia_wins,
			civilian_wins: user.civilian_wins,
			mafia_games: user.mafia_games,
			civilian_games: user.civilian_games,
			favorite_role: user.favorite_role || null,
			is_online: !!user.is_online,
			friend_code: user.friend_code,
			dm_from_friends_only: !!user.dm_from_friends_only,
			friend_requests_enabled: !!user.friend_requests_enabled
		};
	}

	async validateUser(identifier, password) {
		await this.ensureReady();
		const query = typeof identifier === 'string' && identifier.includes('@')
			? { email: identifier }
			: { $or: [{ username: identifier }, { email: identifier }] };
		const user = await this.User.findOne(query).lean();
		if (user && bcrypt.compareSync(password, user.password_hash)) {
			await this.updateLastLogin(user._id.toString());
			return {
				id: user._id.toString(),
				username: user.username,
				email: user.email,
				displayName: user.display_name,
				avatarUrl: user.avatar_url || null,
				totalGames: user.total_games,
				totalWins: user.total_wins,
				mafiaWins: user.mafia_wins,
				civilianWins: user.civilian_wins,
				favoriteRole: user.favorite_role || null
			};
		}
		return null;
	}

	async updateLastLogin(userId) {
		await this.ensureReady();
		await this.User.findByIdAndUpdate(userId, { last_login: new Date(), is_online: true });
	}

	async setUserOffline(userId) {
		await this.ensureReady();
		await this.User.findByIdAndUpdate(userId, { is_online: false });
	}

	async updateDisplayName(userId, displayName) {
		await this.ensureReady();
		await this.User.findByIdAndUpdate(userId, { display_name: displayName });
	}

	async updateAvatarUrl(userId, avatarUrl) {
		await this.ensureReady();
		await this.User.findByIdAndUpdate(userId, { avatar_url: avatarUrl });
	}

	async canReceiveDm(recipientId, senderId) {
		await this.ensureReady();
		const recipient = await this.User.findById(recipientId).lean();
		if (!recipient) return false;
		if (!recipient.dm_from_friends_only) return true;
		return await this.areFriends(recipientId, senderId);
	}

	async updateUsername(userId, newUsername) {
		await this.ensureReady();
		const exists = await this.User.findOne({ username: newUsername }).lean();
		if (exists) throw new Error('Username already exists');
		await this.User.findByIdAndUpdate(userId, { username: newUsername });
	}

	async updateBio(userId, bio) {
		await this.ensureReady();
		await this.User.findByIdAndUpdate(userId, { bio });
	}

	async updatePrivacy(userId, settings) {
		await this.ensureReady();
		const update = {};
		if (typeof settings.dm_from_friends_only === 'boolean') update.dm_from_friends_only = settings.dm_from_friends_only;
		if (typeof settings.friend_requests_enabled === 'boolean') update.friend_requests_enabled = settings.friend_requests_enabled;
		await this.User.findByIdAndUpdate(userId, update);
	}

	// Friends system methods
	async sendFriendRequest(userId, friendUsername) {
		await this.ensureReady();
		const friend = await this.User.findOne({ username: friendUsername }).lean();
		if (!friend) throw new Error('User not found');
		if (friend._id.toString() === userId) throw new Error('Cannot add yourself as a friend');

		const existing = await this.Friend.findOne({
			$or: [
				{ user_id: userId, friend_id: friend._id },
				{ user_id: friend._id, friend_id: userId }
			]
		}).lean();
		if (existing) throw new Error('Friend request already exists');

		await this.Friend.create({ user_id: userId, friend_id: friend._id, status: 'pending' });
		return { friendId: friend._id.toString(), friendUsername: friend.username, status: 'pending' };
	}

	async sendFriendRequestByCode(userId, friendCode) {
		await this.ensureReady();
		const friend = await this.User.findOne({ friend_code: friendCode }).lean();
		if (!friend) throw new Error('User not found');
		if (friend._id.toString() === userId) throw new Error('Cannot add yourself as a friend');

		const existing = await this.Friend.findOne({
			$or: [
				{ user_id: userId, friend_id: friend._id },
				{ user_id: friend._id, friend_id: userId }
			]
		}).lean();
		if (existing) throw new Error('Friend request already exists');

		await this.Friend.create({ user_id: userId, friend_id: friend._id, status: 'pending' });
		return { friendId: friend._id.toString(), friendUsername: friend.username, status: 'pending' };
	}

	async acceptFriendRequest(userId, friendId) {
		await this.ensureReady();
		const req = await this.Friend.findOne({ user_id: friendId, friend_id: userId, status: 'pending' });
		if (!req) throw new Error('Friend request not found');

		req.status = 'accepted';
		req.updated_at = new Date();
		await req.save();

		// Create reverse relation if missing
		const reverse = await this.Friend.findOne({ user_id: userId, friend_id: friendId });
		if (!reverse) {
			await this.Friend.create({ user_id: userId, friend_id: friendId, status: 'accepted' });
		}
	}

	async denyFriendRequest(userId, friendId) {
		await this.ensureReady();
		const res = await this.Friend.deleteOne({ user_id: friendId, friend_id: userId, status: 'pending' });
		if (res.deletedCount === 0) throw new Error('Friend request not found');
	}

	async getFriends(userId) {
		await this.ensureReady();
		const relations = await this.Friend.find({ user_id: userId, status: 'accepted' }).populate('friend_id').lean();
		return relations.map(r => ({
			id: r.friend_id._id.toString(),
			display_name: r.friend_id.display_name,
			avatar_url: r.friend_id.avatar_url || null,
			is_online: !!r.friend_id.is_online,
			status: r.status
		}));
	}

	async getFriendRequests(userId) {
		await this.ensureReady();
		const pending = await this.Friend.find({ friend_id: userId, status: 'pending' }).populate('user_id').sort({ created_at: -1 }).lean();
		return pending.map(p => ({
			id: p.user_id._id.toString(),
			display_name: p.user_id.display_name,
			avatar_url: p.user_id.avatar_url || null,
			created_at: p.created_at
		}));
	}

	async removeFriend(userId, friendId) {
		await this.ensureReady();
		await this.Friend.deleteMany({
			$or: [
				{ user_id: userId, friend_id: friendId },
				{ user_id: friendId, friend_id: userId }
			]
		});
	}

	async areFriends(userId, otherUserId) {
		await this.ensureReady();
		const rel = await this.Friend.findOne({ user_id: userId, friend_id: otherUserId, status: 'accepted' }).lean();
		return !!rel;
	}

	async createDirectMessage(fromUserId, toUserId, text) {
		await this.ensureReady();
		const doc = await this.DirectMessage.create({ from_user_id: fromUserId, to_user_id: toUserId, text });
		return {
			id: doc._id.toString(),
			fromUserId: doc.from_user_id.toString(),
			toUserId: doc.to_user_id.toString(),
			text: doc.text,
			createdAt: doc.created_at
		};
	}

	async getDirectMessagesBetween(userId, otherUserId, limit = 50, before = null) {
		await this.ensureReady();
		const query = {
			$or: [
				{ from_user_id: userId, to_user_id: otherUserId },
				{ from_user_id: otherUserId, to_user_id: userId }
			]
		};
		if (before) query.created_at = { $lt: new Date(before) };
		const items = await this.DirectMessage.find(query).sort({ created_at: -1 }).limit(limit).lean();
		return items.reverse().map(m => ({
			id: m._id.toString(),
			fromUserId: m.from_user_id.toString(),
			toUserId: m.to_user_id.toString(),
			text: m.text,
			createdAt: m.created_at
		}));
	}

	// Game statistics methods
	async updateUserStats(userId, role, won, teamWon) {
		await this.ensureReady();
		const update = { $inc: { total_games: 1 } };
		// Track wins
		if (won) update.$inc.total_wins = 1;
		if (teamWon === 'mafia') update.$inc.mafia_wins = (update.$inc.mafia_wins || 0) + 1;
		if (teamWon === 'innocents') update.$inc.civilian_wins = (update.$inc.civilian_wins || 0) + 1;
		// Track games by alignment for rate calculations
		const mafiaRoles = new Set(['mafia', 'suicide_bomber', 'manipulator']);
		if (mafiaRoles.has(role)) {
			update.$inc.mafia_games = (update.$inc.mafia_games || 0) + 1;
		} else {
			update.$inc.civilian_games = (update.$inc.civilian_games || 0) + 1;
		}
		await this.User.findByIdAndUpdate(userId, update);
	}

	async createGameSession(roomCode, totalPlayers) {
		await this.ensureReady();
		const session = await this.GameSession.create({ room_code: roomCode, total_players: totalPlayers });
		return session._id.toString();
	}

	async endGameSession(sessionId, winnerTeam, totalDays, duration) {
		await this.ensureReady();
		await this.GameSession.findByIdAndUpdate(sessionId, {
			ended_at: new Date(),
			winner_team: winnerTeam,
			total_days: totalDays,
			game_duration: duration
		});
	}

	async addGameParticipant(sessionId, userId, username, role, survived, won) {
		await this.ensureReady();
		await this.GameParticipant.create({
			game_session_id: sessionId,
			user_id: userId || null,
			username,
			role,
			survived,
			won
		});
	}

	async getUserGameHistory(userId, limit = 10) {
		await this.ensureReady();
		const parts = await this.GameParticipant.find({ user_id: userId }).sort({ _id: -1 }).limit(limit).lean();
		const sessionIds = parts.map(p => p.game_session_id);
		const sessions = await this.GameSession.find({ _id: { $in: sessionIds } }).lean();
		const sessionMap = new Map(sessions.map(s => [s._id.toString(), s]));
		return parts.map(p => {
			const s = sessionMap.get(p.game_session_id.toString());
			return {
				room_code: s?.room_code || null,
				started_at: s?.started_at || null,
				ended_at: s?.ended_at || null,
				winner_team: s?.winner_team || null,
				total_players: s?.total_players || null,
				total_days: s?.total_days || null,
				role: p.role,
				survived: p.survived,
				won: p.won
			};
		});
	}

	async close() {
		await mongoose.connection.close();
	}
}

module.exports = VelmoraDatabase; 