const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');

/**
 * AuthService - Handles JWT token management, refresh tokens, and authentication
 */
class AuthService {
    constructor() {
        this.jwtSecret = config.JWT_SECRET;
        this.refreshTokens = new Map(); // In production, use Redis or database
        this.blacklistedTokens = new Set(); // In production, use Redis with TTL
        this.tokenExpiry = '15m'; // Access token expires in 15 minutes
        this.refreshTokenExpiry = '7d'; // Refresh token expires in 7 days
    }

    /**
     * Generate access token and refresh token pair
     * @param {Object} payload - User payload to encode in token
     * @returns {Object} - Object containing access token and refresh token
     */
    generateTokens(payload) {
        // Generate access token with short expiry
        const accessToken = jwt.sign(
            {
                ...payload,
                type: 'access',
                iat: Math.floor(Date.now() / 1000)
            },
            this.jwtSecret,
            {
                expiresIn: this.tokenExpiry,
                issuer: 'mongodb-gui',
                audience: 'mongodb-gui-client'
            }
        );

        // Generate refresh token with longer expiry
        const refreshTokenId = crypto.randomUUID();
        const refreshToken = jwt.sign(
            {
                userId: payload.userId || payload.username,
                tokenId: refreshTokenId,
                type: 'refresh',
                iat: Math.floor(Date.now() / 1000)
            },
            this.jwtSecret,
            {
                expiresIn: this.refreshTokenExpiry,
                issuer: 'mongodb-gui',
                audience: 'mongodb-gui-client'
            }
        );

        // Store refresh token metadata
        this.refreshTokens.set(refreshTokenId, {
            userId: payload.userId || payload.username,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            isActive: true
        });

        return {
            accessToken,
            refreshToken,
            expiresIn: 15 * 60, // 15 minutes in seconds
            tokenType: 'Bearer'
        };
    }

    /**
     * Validate and decode JWT token
     * @param {string} token - JWT token to validate
     * @returns {Object} - Decoded token payload or null if invalid
     */
    validateToken(token) {
        try {
            // Check if token is blacklisted
            if (this.blacklistedTokens.has(token)) {
                throw new Error('Token has been revoked');
            }

            const decoded = jwt.verify(token, this.jwtSecret, {
                issuer: 'mongodb-gui',
                audience: 'mongodb-gui-client'
            });

            // Additional validation for token type
            if (decoded.type !== 'access') {
                throw new Error('Invalid token type');
            }

            return decoded;
        } catch (error) {
            console.error('Token validation failed:', error.message);
            return null;
        }
    }

    /**
     * Refresh access token using refresh token
     * @param {string} refreshToken - Refresh token
     * @returns {Object} - New token pair or null if invalid
     */
    refreshAccessToken(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, this.jwtSecret, {
                issuer: 'mongodb-gui',
                audience: 'mongodb-gui-client'
            });

            // Validate token type
            if (decoded.type !== 'refresh') {
                throw new Error('Invalid token type for refresh');
            }

            // Check if refresh token exists and is active
            const tokenMetadata = this.refreshTokens.get(decoded.tokenId);
            if (!tokenMetadata || !tokenMetadata.isActive) {
                throw new Error('Refresh token not found or inactive');
            }

            // Check if refresh token has expired
            if (new Date() > tokenMetadata.expiresAt) {
                this.refreshTokens.delete(decoded.tokenId);
                throw new Error('Refresh token has expired');
            }

            // Generate new token pair
            const newTokens = this.generateTokens({
                userId: decoded.userId,
                username: decoded.userId // For backward compatibility
            });

            // Invalidate old refresh token
            this.refreshTokens.delete(decoded.tokenId);

            return newTokens;
        } catch (error) {
            console.error('Token refresh failed:', error.message);
            return null;
        }
    }

    /**
     * Blacklist a token (for logout)
     * @param {string} token - Token to blacklist
     * @returns {boolean} - Success status
     */
    blacklistToken(token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded) {
                this.blacklistedTokens.add(token);

                // If it's a refresh token, also remove from refresh tokens
                if (decoded.type === 'refresh' && decoded.tokenId) {
                    const tokenMetadata = this.refreshTokens.get(decoded.tokenId);
                    if (tokenMetadata) {
                        tokenMetadata.isActive = false;
                    }
                }

                return true;
            }
            return false;
        } catch (error) {
            console.error('Token blacklisting failed:', error.message);
            return false;
        }
    }

    /**
     * Logout user by invalidating all their tokens
     * @param {string} userId - User ID to logout
     * @returns {number} - Number of tokens invalidated
     */
    logoutUser(userId) {
        let invalidatedCount = 0;

        // Invalidate all refresh tokens for the user
        for (const [tokenId, metadata] of this.refreshTokens.entries()) {
            if (metadata.userId === userId && metadata.isActive) {
                metadata.isActive = false;
                invalidatedCount++;
            }
        }

        return invalidatedCount;
    }

    /**
     * Hash password using bcrypt
     * @param {string} password - Plain text password
     * @returns {Promise<string>} - Hashed password
     */
    async hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    /**
     * Verify password against hash
     * @param {string} password - Plain text password
     * @param {string} hash - Hashed password
     * @returns {Promise<boolean>} - Verification result
     */
    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    /**
     * Clean up expired tokens (should be called periodically)
     */
    cleanupExpiredTokens() {
        const now = new Date();
        let cleanedCount = 0;

        // Clean up expired refresh tokens
        for (const [tokenId, metadata] of this.refreshTokens.entries()) {
            if (now > metadata.expiresAt) {
                this.refreshTokens.delete(tokenId);
                cleanedCount++;
            }
        }

        // Note: Blacklisted access tokens will naturally expire due to their short lifespan
        // In production, implement TTL-based cleanup for blacklisted tokens

        console.log(`Cleaned up ${cleanedCount} expired refresh tokens`);
        return cleanedCount;
    }

    /**
     * Get token statistics (for monitoring)
     * @returns {Object} - Token statistics
     */
    getTokenStats() {
        const activeRefreshTokens = Array.from(this.refreshTokens.values())
            .filter(token => token.isActive).length;

        return {
            activeRefreshTokens,
            totalRefreshTokens: this.refreshTokens.size,
            blacklistedTokens: this.blacklistedTokens.size
        };
    }

    /**
     * Extract token from Authorization header
     * @param {string} authHeader - Authorization header value
     * @returns {string|null} - Extracted token or null
     */
    extractTokenFromHeader(authHeader) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        return authHeader.substring(7); // Remove 'Bearer ' prefix
    }

    /**
     * Create authentication middleware
     * @returns {Function} - Express middleware function
     */
    createAuthMiddleware() {
        return (req, res, next) => {
            const authHeader = req.headers.authorization;
            const token = this.extractTokenFromHeader(authHeader);

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'MISSING_TOKEN',
                        message: 'Access token is required',
                        timestamp: new Date().toISOString()
                    }
                });
            }

            const decoded = this.validateToken(token);
            if (!decoded) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'INVALID_TOKEN',
                        message: 'Invalid or expired access token',
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Add user info to request
            req.user = {
                userId: decoded.userId || decoded.username,
                username: decoded.username,
                tokenIat: decoded.iat
            };

            next();
        };
    }
}

module.exports = AuthService;