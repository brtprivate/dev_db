const crypto = require('crypto');
const { URL } = require('url');
const config = require('../config');

/**
 * ConnectionService - Handles MongoDB connection string validation, sanitization, and encryption
 */
class ConnectionService {
    constructor() {
        this.encryptionKey = this.deriveEncryptionKey();
        this.encryptionAlgorithm = 'aes-256-gcm';

        // Allowed MongoDB schemes
        this.allowedSchemes = ['mongodb', 'mongodb+srv'];

        // Dangerous query parameters that should be filtered
        this.dangerousParams = [
            'eval',
            'where',
            '$where',
            'mapReduce',
            'group'
        ];

        // Default connection options for security
        this.secureDefaults = {
            readPreference: 'secondaryPreferred',
            maxPoolSize: config.MONGODB_MAX_POOL_SIZE || 10,
            minPoolSize: config.MONGODB_MIN_POOL_SIZE || 5,
            maxIdleTimeMS: config.MONGODB_MAX_IDLE_TIME_MS || 30000,
            serverSelectionTimeoutMS: config.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000,
            socketTimeoutMS: 30000,
            connectTimeoutMS: 10000,
            retryWrites: false, // Disable for read-only access
            retryReads: true
        };
    }

    /**
     * Derive encryption key from configuration
     * @returns {Buffer} - Encryption key
     */
    deriveEncryptionKey() {
        const salt = Buffer.from('mongodb-connection-salt', 'utf8');
        return crypto.pbkdf2Sync(config.SESSION_SECRET, salt, 100000, 32, 'sha256');
    }

    /**
     * Validate MongoDB connection string
     * @param {string} connectionString - MongoDB connection string to validate
     * @returns {Object} - Validation result with details
     */
    validateConnectionString(connectionString) {
        const result = {
            valid: false,
            sanitized: null,
            errors: [],
            warnings: [],
            metadata: {}
        };

        try {
            // Basic string validation
            if (!connectionString || typeof connectionString !== 'string') {
                result.errors.push('Connection string must be a non-empty string');
                return result;
            }

            // Trim whitespace
            connectionString = connectionString.trim();

            // Check for minimum length
            if (connectionString.length < 10) {
                result.errors.push('Connection string is too short');
                return result;
            }

            // Check for maximum length (prevent DoS)
            if (connectionString.length > 2048) {
                result.errors.push('Connection string is too long (max 2048 characters)');
                return result;
            }

            // Parse the connection string
            const parsed = this.parseConnectionString(connectionString);
            if (!parsed.valid) {
                result.errors.push(...parsed.errors);
                return result;
            }

            // Validate scheme
            if (!this.allowedSchemes.includes(parsed.scheme)) {
                result.errors.push(`Invalid scheme: ${parsed.scheme}. Allowed: ${this.allowedSchemes.join(', ')}`);
                return result;
            }

            // Validate hosts
            const hostValidation = this.validateHosts(parsed.hosts);
            if (!hostValidation.valid) {
                result.errors.push(...hostValidation.errors);
                result.warnings.push(...hostValidation.warnings);
            }

            // Validate database name
            if (parsed.database) {
                const dbValidation = this.validateDatabaseName(parsed.database);
                if (!dbValidation.valid) {
                    result.errors.push(...dbValidation.errors);
                }
            }

            // Validate and sanitize query parameters
            const paramValidation = this.validateQueryParameters(parsed.queryParams);
            if (!paramValidation.valid) {
                result.errors.push(...paramValidation.errors);
                result.warnings.push(...paramValidation.warnings);
            }

            // Check for injection attempts
            const injectionCheck = this.checkForInjectionAttempts(connectionString);
            if (!injectionCheck.safe) {
                result.errors.push(...injectionCheck.threats);
            }

            // If we have errors, return early
            if (result.errors.length > 0) {
                return result;
            }

            // Build sanitized connection string
            result.sanitized = this.buildSanitizedConnectionString({
                scheme: parsed.scheme,
                hosts: parsed.hosts,
                database: parsed.database,
                username: parsed.username,
                password: parsed.password,
                queryParams: paramValidation.sanitized
            });

            result.valid = true;
            result.metadata = {
                scheme: parsed.scheme,
                hostCount: parsed.hosts.length,
                hasAuth: !!(parsed.username && parsed.password),
                database: parsed.database,
                isAtlas: this.isAtlasConnection(parsed.hosts),
                isLocalhost: this.isLocalhostConnection(parsed.hosts)
            };

        } catch (error) {
            result.errors.push(`Connection string parsing failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Parse MongoDB connection string into components
     * @param {string} connectionString - Connection string to parse
     * @returns {Object} - Parsed components
     */
    parseConnectionString(connectionString) {
        const result = {
            valid: false,
            errors: [],
            scheme: null,
            username: null,
            password: null,
            hosts: [],
            database: null,
            queryParams: {}
        };

        try {
            // Use URL parser for initial parsing
            const url = new URL(connectionString);

            result.scheme = url.protocol.slice(0, -1); // Remove trailing ':'
            result.username = url.username ? decodeURIComponent(url.username) : null;
            result.password = url.password ? decodeURIComponent(url.password) : null;
            result.database = url.pathname.slice(1) || null; // Remove leading '/'

            // Parse hosts
            if (url.hostname) {
                const port = url.port ? parseInt(url.port) : (result.scheme === 'mongodb+srv' ? 27017 : 27017);
                result.hosts = [{ hostname: url.hostname, port }];
            }

            // Parse query parameters
            for (const [key, value] of url.searchParams.entries()) {
                result.queryParams[key] = value;
            }

            result.valid = true;

        } catch (error) {
            // Try manual parsing for complex connection strings
            const manualParse = this.manualParseConnectionString(connectionString);
            if (manualParse.valid) {
                return manualParse;
            }

            result.errors.push(`Invalid connection string format: ${error.message}`);
        }

        return result;
    }

    /**
     * Manual parsing for complex MongoDB connection strings
     * @param {string} connectionString - Connection string
     * @returns {Object} - Parsed result
     */
    manualParseConnectionString(connectionString) {
        const result = {
            valid: false,
            errors: [],
            scheme: null,
            username: null,
            password: null,
            hosts: [],
            database: null,
            queryParams: {}
        };

        try {
            // Extract scheme
            const schemeMatch = connectionString.match(/^(mongodb(?:\+srv)?):\/\//);
            if (!schemeMatch) {
                result.errors.push('Invalid or missing scheme');
                return result;
            }
            result.scheme = schemeMatch[1];

            // Remove scheme from string
            let remaining = connectionString.substring(schemeMatch[0].length);

            // Extract credentials
            const credentialsMatch = remaining.match(/^([^:@]+):([^@]+)@/);
            if (credentialsMatch) {
                result.username = decodeURIComponent(credentialsMatch[1]);
                result.password = decodeURIComponent(credentialsMatch[2]);
                remaining = remaining.substring(credentialsMatch[0].length);
            }

            // Split by '?' to separate hosts/database from query parameters
            const [hostsPart, queryPart] = remaining.split('?');

            // Extract database
            const hostsDatabaseMatch = hostsPart.match(/^([^/]+)(?:\/(.*))?$/);
            if (hostsDatabaseMatch) {
                const hostsString = hostsDatabaseMatch[1];
                result.database = hostsDatabaseMatch[2] || null;

                // Parse hosts
                const hostEntries = hostsString.split(',');
                for (const hostEntry of hostEntries) {
                    const [hostname, port] = hostEntry.trim().split(':');
                    result.hosts.push({
                        hostname: hostname.trim(),
                        port: port ? parseInt(port) : 27017
                    });
                }
            }

            // Parse query parameters
            if (queryPart) {
                const params = new URLSearchParams(queryPart);
                for (const [key, value] of params.entries()) {
                    result.queryParams[key] = value;
                }
            }

            result.valid = true;

        } catch (error) {
            result.errors.push(`Manual parsing failed: ${error.message}`);
        }

        return result;
    }

    /**
     * Validate host entries
     * @param {Array} hosts - Array of host objects
     * @returns {Object} - Validation result
     */
    validateHosts(hosts) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        if (!hosts || hosts.length === 0) {
            result.valid = false;
            result.errors.push('At least one host must be specified');
            return result;
        }

        for (const host of hosts) {
            // Validate hostname
            if (!host.hostname || typeof host.hostname !== 'string') {
                result.valid = false;
                result.errors.push('Invalid hostname');
                continue;
            }

            // Check for localhost/private IPs in production
            if (config.NODE_ENV === 'production' && this.isPrivateOrLocalhost(host.hostname)) {
                result.warnings.push(`Using localhost/private IP in production: ${host.hostname}`);
            }

            // Validate port
            if (host.port && (host.port < 1 || host.port > 65535)) {
                result.valid = false;
                result.errors.push(`Invalid port number: ${host.port}`);
            }

            // Check for suspicious hostnames
            if (this.isSuspiciousHostname(host.hostname)) {
                result.valid = false;
                result.errors.push(`Suspicious hostname detected: ${host.hostname}`);
            }
        }

        return result;
    }

    /**
     * Validate database name
     * @param {string} database - Database name
     * @returns {Object} - Validation result
     */
    validateDatabaseName(database) {
        const result = {
            valid: true,
            errors: []
        };

        if (!database) {
            return result; // Database is optional
        }

        // Check length
        if (database.length > 64) {
            result.valid = false;
            result.errors.push('Database name too long (max 64 characters)');
        }

        // Check for invalid characters
        const invalidChars = /[\/\\. "$*<>:|?]/;
        if (invalidChars.test(database)) {
            result.valid = false;
            result.errors.push('Database name contains invalid characters');
        }

        // Check for reserved names
        const reservedNames = ['admin', 'local', 'config'];
        if (reservedNames.includes(database.toLowerCase())) {
            result.errors.push(`Database name '${database}' is reserved`);
        }

        return result;
    }

    /**
     * Validate and sanitize query parameters
     * @param {Object} queryParams - Query parameters object
     * @returns {Object} - Validation result with sanitized parameters
     */
    validateQueryParameters(queryParams) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            sanitized: {}
        };

        for (const [key, value] of Object.entries(queryParams)) {
            // Check for dangerous parameters
            if (this.dangerousParams.includes(key.toLowerCase())) {
                result.valid = false;
                result.errors.push(`Dangerous parameter not allowed: ${key}`);
                continue;
            }

            // Sanitize parameter value
            const sanitizedValue = this.sanitizeParameterValue(key, value);
            if (sanitizedValue !== null) {
                result.sanitized[key] = sanitizedValue;
            } else {
                result.warnings.push(`Parameter '${key}' was removed during sanitization`);
            }
        }

        // Add secure defaults
        result.sanitized = { ...result.sanitized, ...this.secureDefaults };

        return result;
    }

    /**
     * Sanitize parameter value
     * @param {string} key - Parameter key
     * @param {string} value - Parameter value
     * @returns {string|null} - Sanitized value or null if should be removed
     */
    sanitizeParameterValue(key, value) {
        // Remove potentially dangerous values
        if (typeof value !== 'string') {
            return null;
        }

        // Check for script injection attempts
        if (/<script|javascript:|data:/i.test(value)) {
            return null;
        }

        // Validate specific parameters
        switch (key.toLowerCase()) {
            case 'maxpoolsize':
            case 'minpoolsize':
                const num = parseInt(value);
                return (num > 0 && num <= 100) ? num.toString() : null;

            case 'ssl':
            case 'tls':
                return ['true', 'false'].includes(value.toLowerCase()) ? value.toLowerCase() : null;

            case 'replicaset':
                return /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;

            default:
                // Generic sanitization
                return value.replace(/[<>'"&]/g, '');
        }
    }

    /**
     * Check for injection attempts
     * @param {string} connectionString - Connection string to check
     * @returns {Object} - Security check result
     */
    checkForInjectionAttempts(connectionString) {
        const result = {
            safe: true,
            threats: []
        };

        // Check for common injection patterns
        const injectionPatterns = [
            /\$where/i,
            /eval\s*\(/i,
            /function\s*\(/i,
            /javascript:/i,
            /<script/i,
            /\bexec\b/i,
            /\bsystem\b/i,
            /\.\.\//,
            /\0/,
            /%00/
        ];

        for (const pattern of injectionPatterns) {
            if (pattern.test(connectionString)) {
                result.safe = false;
                result.threats.push(`Potential injection attempt detected: ${pattern.source}`);
            }
        }

        return result;
    }

    /**
     * Build sanitized connection string
     * @param {Object} components - Connection string components
     * @returns {string} - Sanitized connection string
     */
    buildSanitizedConnectionString(components) {
        let connectionString = `${components.scheme}://`;

        // Add credentials if present
        if (components.username && components.password) {
            connectionString += `${encodeURIComponent(components.username)}:${encodeURIComponent(components.password)}@`;
        }

        // Add hosts
        const hostStrings = components.hosts.map(host => {
            return host.port !== 27017 ? `${host.hostname}:${host.port}` : host.hostname;
        });
        connectionString += hostStrings.join(',');

        // Add database
        if (components.database) {
            connectionString += `/${components.database}`;
        }

        // Add query parameters
        const queryParams = new URLSearchParams(components.queryParams);
        if (queryParams.toString()) {
            connectionString += `?${queryParams.toString()}`;
        }

        return connectionString;
    }

    /**
     * Encrypt connection string for storage
     * @param {string} connectionString - Connection string to encrypt
     * @returns {Object} - Encrypted connection string data
     */
    encryptConnectionString(connectionString) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(this.encryptionAlgorithm, this.encryptionKey);

        let encrypted = cipher.update(connectionString, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            algorithm: this.encryptionAlgorithm,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Decrypt connection string
     * @param {Object} encryptedData - Encrypted connection string data
     * @returns {string} - Decrypted connection string
     */
    decryptConnectionString(encryptedData) {
        const { encrypted, iv, authTag, algorithm } = encryptedData;

        if (algorithm !== this.encryptionAlgorithm) {
            throw new Error('Unsupported encryption algorithm');
        }

        const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Check if connection is to MongoDB Atlas
     * @param {Array} hosts - Host array
     * @returns {boolean} - True if Atlas connection
     */
    isAtlasConnection(hosts) {
        return hosts.some(host =>
            host.hostname.includes('mongodb.net') ||
            host.hostname.includes('cluster') ||
            host.hostname.includes('atlas')
        );
    }

    /**
     * Check if connection is to localhost
     * @param {Array} hosts - Host array
     * @returns {boolean} - True if localhost connection
     */
    isLocalhostConnection(hosts) {
        return hosts.some(host =>
            host.hostname === 'localhost' ||
            host.hostname === '127.0.0.1' ||
            host.hostname === '::1'
        );
    }

    /**
     * Check if hostname is private or localhost
     * @param {string} hostname - Hostname to check
     * @returns {boolean} - True if private/localhost
     */
    isPrivateOrLocalhost(hostname) {
        const privatePatterns = [
            /^localhost$/i,
            /^127\./,
            /^192\.168\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^::1$/,
            /^fe80:/i
        ];

        return privatePatterns.some(pattern => pattern.test(hostname));
    }

    /**
     * Check if hostname is suspicious
     * @param {string} hostname - Hostname to check
     * @returns {boolean} - True if suspicious
     */
    isSuspiciousHostname(hostname) {
        const suspiciousPatterns = [
            /[<>'"&]/,
            /\s/,
            /\.\./,
            /^-/,
            /-$/,
            /\0/
        ];

        return suspiciousPatterns.some(pattern => pattern.test(hostname));
    }
}

module.exports = ConnectionService;