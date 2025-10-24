const crypto = require('crypto');
const config = require('../config');

/**
 * SessionService - Handles secure session management with encryption
 */
class SessionService {
    constructor() {
        this.sessionSecret = config.SESSION_SECRET;
        this.sessions = new Map(); // In production, use Redis or database
        this.sessionMaxAge = config.SESSION_MAX_AGE || 86400000; // 24 hours
        this.encryptionAlgorithm = 'aes-256-gcm';
        this.keyDerivationSalt = crypto.randomBytes(32);

        // Derive encryption key from session secret
        this.encryptionKey = crypto.pbkdf2Sync(
            this.sessionSecret,
            this.keyDerivationSalt,
            100000,
            32,
            'sha256'
        );
    }

    /**
     * Create a new session
     * @param {Object} sessionData - Data to store in session
     * @param {Object} options - Session options
     * @returns {Object} - Session object with ID and metadata
     */
    createSession(sessionData, options = {}) {
        const sessionId = crypto.randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (options.maxAge || this.sessionMaxAge));

        // Encrypt sensitive session data
        const encryptedData = this.encryptSessionData(sessionData);

        const session = {
            id: sessionId,
            data: encryptedData,
            createdAt: now,
            lastAccessedAt: now,
            expiresAt: expiresAt,
            ipAddress: options.ipAddress || null,
            userAgent: options.userAgent || null,
            isActive: true,
            metadata: {
                loginCount: 1,
                lastLoginAt: now,
                securityFlags: {
                    requiresReauth: false,
                    suspiciousActivity: false
                }
            }
        };

        this.sessions.set(sessionId, session);

        console.log(`Session created: ${sessionId} (expires: ${expiresAt.toISOString()})`);
        return {
            sessionId,
            expiresAt,
            maxAge: options.maxAge || this.sessionMaxAge
        };
    }

    /**
     * Retrieve and decrypt session data
     * @param {string} sessionId - Session ID
     * @returns {Object|null} - Decrypted session data or null if not found/expired
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            return null;
        }

        // Check if session has expired
        if (new Date() > session.expiresAt || !session.isActive) {
            this.destroySession(sessionId);
            return null;
        }

        // Update last accessed time
        session.lastAccessedAt = new Date();

        // Decrypt session data
        try {
            const decryptedData = this.decryptSessionData(session.data);
            return {
                ...decryptedData,
                sessionMetadata: {
                    id: session.id,
                    createdAt: session.createdAt,
                    lastAccessedAt: session.lastAccessedAt,
                    expiresAt: session.expiresAt,
                    ipAddress: session.ipAddress,
                    userAgent: session.userAgent,
                    metadata: session.metadata
                }
            };
        } catch (error) {
            console.error('Failed to decrypt session data:', error.message);
            this.destroySession(sessionId);
            return null;
        }
    }

    /**
     * Update session data
     * @param {string} sessionId - Session ID
     * @param {Object} newData - New data to store
     * @param {Object} options - Update options
     * @returns {boolean} - Success status
     */
    updateSession(sessionId, newData, options = {}) {
        const session = this.sessions.get(sessionId);

        if (!session || !session.isActive) {
            return false;
        }

        // Check if session has expired
        if (new Date() > session.expiresAt) {
            this.destroySession(sessionId);
            return false;
        }

        try {
            // Merge with existing data if specified
            let dataToEncrypt = newData;
            if (options.merge) {
                const existingData = this.decryptSessionData(session.data);
                dataToEncrypt = { ...existingData, ...newData };
            }

            // Encrypt updated data
            session.data = this.encryptSessionData(dataToEncrypt);
            session.lastAccessedAt = new Date();

            // Update expiry if specified
            if (options.extendExpiry) {
                session.expiresAt = new Date(Date.now() + this.sessionMaxAge);
            }

            // Update metadata
            if (options.incrementLoginCount) {
                session.metadata.loginCount++;
                session.metadata.lastLoginAt = new Date();
            }

            return true;
        } catch (error) {
            console.error('Failed to update session:', error.message);
            return false;
        }
    }

    /**
     * Destroy a session
     * @param {string} sessionId - Session ID to destroy
     * @returns {boolean} - Success status
     */
    destroySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.isActive = false;
            this.sessions.delete(sessionId);
            console.log(`Session destroyed: ${sessionId}`);
            return true;
        }
        return false;
    }

    /**
     * Destroy all sessions for a user
     * @param {string} userId - User ID
     * @returns {number} - Number of sessions destroyed
     */
    destroyUserSessions(userId) {
        let destroyedCount = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            try {
                const decryptedData = this.decryptSessionData(session.data);
                if (decryptedData.userId === userId) {
                    this.destroySession(sessionId);
                    destroyedCount++;
                }
            } catch (error) {
                // If we can't decrypt, destroy the session anyway for security
                this.destroySession(sessionId);
                destroyedCount++;
            }
        }

        return destroyedCount;
    }

    /**
     * Clean up expired sessions
     * @returns {number} - Number of sessions cleaned up
     */
    cleanupExpiredSessions() {
        const now = new Date();
        let cleanedCount = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (now > session.expiresAt || !session.isActive) {
                this.sessions.delete(sessionId);
                cleanedCount++;
            }
        }

        console.log(`Cleaned up ${cleanedCount} expired sessions`);
        return cleanedCount;
    }

    /**
     * Encrypt session data
     * @param {Object} data - Data to encrypt
     * @returns {Object} - Encrypted data with IV and auth tag
     */
    encryptSessionData(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(this.encryptionAlgorithm, this.encryptionKey);
        cipher.setAAD(Buffer.from('session-data'));

        const jsonData = JSON.stringify(data);
        let encrypted = cipher.update(jsonData, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            algorithm: this.encryptionAlgorithm
        };
    }

    /**
     * Decrypt session data
     * @param {Object} encryptedData - Encrypted data object
     * @returns {Object} - Decrypted data
     */
    decryptSessionData(encryptedData) {
        const { encrypted, iv, authTag, algorithm } = encryptedData;

        if (algorithm !== this.encryptionAlgorithm) {
            throw new Error('Unsupported encryption algorithm');
        }

        const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
        decipher.setAAD(Buffer.from('session-data'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    }

    /**
     * Validate session security
     * @param {string} sessionId - Session ID
     * @param {Object} requestInfo - Request information for validation
     * @returns {Object} - Validation result
     */
    validateSessionSecurity(sessionId, requestInfo = {}) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            return { valid: false, reason: 'Session not found' };
        }

        // Check basic validity
        if (!session.isActive || new Date() > session.expiresAt) {
            return { valid: false, reason: 'Session expired or inactive' };
        }

        const warnings = [];

        // Check IP address consistency (if enabled)
        if (session.ipAddress && requestInfo.ipAddress &&
            session.ipAddress !== requestInfo.ipAddress) {
            warnings.push('IP address changed');
            session.metadata.securityFlags.suspiciousActivity = true;
        }

        // Check user agent consistency (basic check)
        if (session.userAgent && requestInfo.userAgent &&
            session.userAgent !== requestInfo.userAgent) {
            warnings.push('User agent changed');
        }

        // Check for suspicious activity patterns
        const timeSinceLastAccess = new Date() - session.lastAccessedAt;
        if (timeSinceLastAccess > 3600000) { // 1 hour
            warnings.push('Long period of inactivity');
        }

        return {
            valid: true,
            warnings,
            requiresReauth: session.metadata.securityFlags.requiresReauth,
            suspiciousActivity: session.metadata.securityFlags.suspiciousActivity
        };
    }

    /**
     * Get session statistics
     * @returns {Object} - Session statistics
     */
    getSessionStats() {
        const now = new Date();
        let activeSessions = 0;
        let expiredSessions = 0;
        let totalSessions = this.sessions.size;

        for (const session of this.sessions.values()) {
            if (session.isActive && now <= session.expiresAt) {
                activeSessions++;
            } else {
                expiredSessions++;
            }
        }

        return {
            totalSessions,
            activeSessions,
            expiredSessions,
            cleanupNeeded: expiredSessions > 0
        };
    }

    /**
     * Create session validation middleware
     * @returns {Function} - Express middleware function
     */
    createSessionMiddleware() {
        return (req, res, next) => {
            const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;

            if (!sessionId) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'MISSING_SESSION',
                        message: 'Session ID is required',
                        timestamp: new Date().toISOString()
                    }
                });
            }

            const sessionData = this.getSession(sessionId);
            if (!sessionData) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'INVALID_SESSION',
                        message: 'Invalid or expired session',
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Validate session security
            const validation = this.validateSessionSecurity(sessionId, {
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            if (!validation.valid) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'SESSION_SECURITY_VIOLATION',
                        message: validation.reason,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Add session data to request
            req.session = sessionData;
            req.sessionId = sessionId;

            // Add security warnings to response headers for monitoring
            if (validation.warnings.length > 0) {
                res.set('X-Session-Warnings', validation.warnings.join(', '));
            }

            next();
        };
    }
}

module.exports = SessionService;