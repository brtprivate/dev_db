const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, query, param, validationResult } = require('express-validator');
const config = require('../config');

/**
 * Configure Content Security Policy
 */
const cspConfig = {
    directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
            "'self'",
            "'unsafe-inline'", // Required for dynamic styles
            "https://cdnjs.cloudflare.com",
            "https://fonts.googleapis.com"
        ],
        scriptSrc: [
            "'self'",
            "'unsafe-eval'", // Required for JSON parsing in development
            ...(config.NODE_ENV === 'development' ? ["'unsafe-inline'"] : [])
        ],
        imgSrc: [
            "'self'",
            "data:",
            "https:"
        ],
        connectSrc: [
            "'self'",
            ...(config.NODE_ENV === 'development' ? ["ws:", "wss:"] : [])
        ],
        fontSrc: [
            "'self'",
            "https://cdnjs.cloudflare.com",
            "https://fonts.gstatic.com"
        ],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
    },
    reportUri: config.CSP_REPORT_URI || undefined
};

/**
 * Security headers middleware using Helmet
 */
const securityHeaders = helmet({
    contentSecurityPolicy: cspConfig,
    hsts: {
        maxAge: config.HSTS_MAX_AGE,
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false,
    crossOriginEmbedderPolicy: false, // Disabled for compatibility
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
});

/**
 * CORS configuration
 */
const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = config.CORS_ORIGINS;

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            return callback(null, true);
        }

        // In development, be more permissive
        if (config.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
            return callback(null, true);
        }

        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Request-ID'
    ],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400 // 24 hours
};

/**
 * Rate limiting configuration
 */
const createRateLimit = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            error: 'Too many requests',
            message,
            retryAfter: Math.ceil(windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                error: 'Too many requests',
                message,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
    });
};

// General API rate limiting
const apiRateLimit = createRateLimit(
    config.RATE_LIMIT_WINDOW_MS,
    config.RATE_LIMIT_MAX_REQUESTS,
    'Too many API requests from this IP, please try again later'
);

// Stricter rate limiting for authentication endpoints
const authRateLimit = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    5, // 5 attempts
    'Too many authentication attempts, please try again later'
);

// Very strict rate limiting for connection attempts
const connectionRateLimit = createRateLimit(
    5 * 60 * 1000, // 5 minutes
    3, // 3 attempts
    'Too many connection attempts, please try again later'
);

/**
 * Input validation middleware
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array().map(error => ({
                field: error.path,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();
};

/**
 * Common validation rules
 */
const validationRules = {
    // MongoDB connection string validation
    connectionString: body('connectionString')
        .isString()
        .trim()
        .isLength({ min: 10, max: 1000 })
        .matches(/^mongodb(\+srv)?:\/\//)
        .withMessage('Must be a valid MongoDB connection string')
        .customSanitizer(value => {
            // Remove any potential injection attempts
            return value.replace(/[<>'"]/g, '');
        }),

    // Database name validation
    databaseName: param('dbName')
        .isString()
        .trim()
        .isLength({ min: 1, max: 64 })
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Database name must contain only alphanumeric characters, underscores, and hyphens'),

    // Collection name validation
    collectionName: param('collectionName')
        .isString()
        .trim()
        .isLength({ min: 1, max: 64 })
        .matches(/^[a-zA-Z0-9_.-]+$/)
        .withMessage('Collection name must contain only alphanumeric characters, underscores, dots, and hyphens'),

    // Query validation
    mongoQuery: body('query')
        .optional()
        .isString()
        .trim()
        .customSanitizer(value => {
            try {
                // Validate that it's valid JSON
                JSON.parse(value || '{}');
                return value || '{}';
            } catch (error) {
                throw new Error('Query must be valid JSON');
            }
        }),

    // Pagination validation
    pagination: [
        query('page')
            .optional()
            .isInt({ min: 1, max: 10000 })
            .withMessage('Page must be a positive integer between 1 and 10000'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 1000 })
            .withMessage('Limit must be a positive integer between 1 and 1000')
    ],

    // Authentication validation
    login: [
        body('username')
            .isString()
            .trim()
            .isLength({ min: 1, max: 50 })
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('Username must contain only alphanumeric characters, underscores, and hyphens'),
        body('password')
            .isString()
            .isLength({ min: 1, max: 100 })
            .withMessage('Password is required')
    ]
};

/**
 * Security middleware to prevent common attacks
 */
const preventInjection = (req, res, next) => {
    const checkForInjection = (obj, path = '') => {
        if (typeof obj === 'string') {
            // Check for potential MongoDB injection patterns
            const injectionPatterns = [
                /\$where/i,
                /\$ne/i,
                /\$gt/i,
                /\$lt/i,
                /\$regex/i,
                /javascript:/i,
                /<script/i,
                /eval\(/i,
                /function\s*\(/i
            ];

            for (const pattern of injectionPatterns) {
                if (pattern.test(obj)) {
                    throw new Error(`Potential injection detected in ${path || 'input'}`);
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
                checkForInjection(value, path ? `${path}.${key}` : key);
            }
        }
    };

    try {
        // Check request body
        if (req.body) {
            checkForInjection(req.body, 'body');
        }

        // Check query parameters
        if (req.query) {
            checkForInjection(req.query, 'query');
        }

        next();
    } catch (error) {
        res.status(400).json({
            success: false,
            error: 'Invalid input detected',
            message: error.message
        });
    }
};

module.exports = {
    securityHeaders,
    cors: cors(corsOptions),
    apiRateLimit,
    authRateLimit,
    connectionRateLimit,
    validationRules,
    handleValidationErrors,
    preventInjection
};