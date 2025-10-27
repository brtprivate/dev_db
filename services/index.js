const AuthService = require('./AuthService');
const SessionService = require('./SessionService');
const ConnectionService = require('./ConnectionService');

/**
 * Service factory and integration module
 */

class ServiceManager {
    constructor() {
        this.authService = new AuthService();
        this.sessionService = new SessionService();
        this.connectionService = new ConnectionService();

        // Set up periodic cleanup
        this.setupCleanupTasks();
    }

    /**
     * Set up periodic cleanup tasks
     */
    setupCleanupTasks() {
        // Clean up expired tokens every 30 minutes
        setInterval(() => {
            this.authService.cleanupExpiredTokens();
        }, 30 * 60 * 1000);

        // Clean up expired sessions every 15 minutes
        setInterval(() => {
            this.sessionService.cleanupExpiredSessions();
        }, 15 * 60 * 1000);
    }

    /**
     * Get authentication middleware
     * @returns {Function} - Express middleware
     */
    getAuthMiddleware() {
        return this.authService.createAuthMiddleware();
    }

    /**
     * Get session middleware
     * @returns {Function} - Express middleware
     */
    getSessionMiddleware() {
        return this.sessionService.createSessionMiddleware();
    }

    /**
     * Combined authentication and session middleware
     * @returns {Function} - Express middleware
     */
    getCombinedAuthMiddleware() {
        const authMiddleware = this.getAuthMiddleware();
        const sessionMiddleware = this.getSessionMiddleware();

        return (req, res, next) => {
            // First check JWT token
            authMiddleware(req, res, (authError) => {
                if (authError) {
                    return next(authError);
                }

                // Then validate session if session ID is provided
                const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
                if (sessionId) {
                    sessionMiddleware(req, res, next);
                } else {
                    next();
                }
            });
        };
    }

    /**
     * Authenticate user and create session
     * @param {Object} credentials - User credentials
     * @param {Object} requestInfo - Request information
     * @returns {Object} - Authentication result
     */
    async authenticateUser(credentials, requestInfo = {}) {
        try {
            // For demo purposes, using simple authentication
            // In production, implement proper user management with database
            const { username, password, connectionString } = credentials;

            // Simple credential check (replace with proper user authentication)
            if (username !== 'admin' || password !== 'admin') {
                return {
                    success: false,
                    error: 'Invalid credentials'
                };
            }

            // Validate connection string if provided
            let validatedConnection = null;
            if (connectionString) {
                const validation = this.connectionService.validateConnectionString(connectionString);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: 'Invalid connection string',
                        details: validation.errors
                    };
                }
                validatedConnection = {
                    original: connectionString,
                    sanitized: validation.sanitized,
                    encrypted: this.connectionService.encryptConnectionString(validation.sanitized),
                    metadata: validation.metadata
                };
            }

            // Generate JWT tokens
            const tokens = this.authService.generateTokens({
                userId: username,
                username: username
            });

            // Create session
            const sessionData = {
                userId: username,
                username: username,
                connectionString: validatedConnection?.encrypted,
                connectionMetadata: validatedConnection?.metadata,
                loginTime: new Date(),
                lastActivity: new Date()
            };

            const session = this.sessionService.createSession(sessionData, {
                ipAddress: requestInfo.ipAddress,
                userAgent: requestInfo.userAgent
            });

            return {
                success: true,
                tokens,
                session,
                connectionMetadata: validatedConnection?.metadata
            };

        } catch (error) {
            console.error('Authentication failed:', error);
            return {
                success: false,
                error: 'Authentication failed',
                details: error.message
            };
        }
    }

    /**
     * Logout user
     * @param {string} userId - User ID
     * @param {string} token - Access token to blacklist
     * @returns {Object} - Logout result
     */
    logoutUser(userId, token) {
        try {
            // Blacklist the current token
            const tokenBlacklisted = this.authService.blacklistToken(token);

            // Invalidate all user tokens
            const tokensInvalidated = this.authService.logoutUser(userId);

            // Destroy all user sessions
            const sessionsDestroyed = this.sessionService.destroyUserSessions(userId);

            return {
                success: true,
                tokenBlacklisted,
                tokensInvalidated,
                sessionsDestroyed
            };
        } catch (error) {
            console.error('Logout failed:', error);
            return {
                success: false,
                error: 'Logout failed',
                details: error.message
            };
        }
    }

    /**
     * Get service statistics
     * @returns {Object} - Combined service statistics
     */
    getStats() {
        return {
            auth: this.authService.getTokenStats(),
            sessions: this.sessionService.getSessionStats(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Validate and decrypt connection string from session
     * @param {string} sessionId - Session ID
     * @returns {string|null} - Decrypted connection string or null
     */
    getConnectionStringFromSession(sessionId) {
        try {
            const sessionData = this.sessionService.getSession(sessionId);
            if (!sessionData || !sessionData.connectionString) {
                return null;
            }

            return this.connectionService.decryptConnectionString(sessionData.connectionString);
        } catch (error) {
            console.error('Failed to get connection string from session:', error);
            return null;
        }
    }
}

// Export singleton instance
const serviceManager = new ServiceManager();

module.exports = {
    ServiceManager,
    serviceManager,
    AuthService,
    SessionService,
    ConnectionService
};