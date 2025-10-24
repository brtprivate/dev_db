const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * Configure Winston logger
 */
const logger = winston.createLogger({
    level: config.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, stack, requestId, ...meta }) => {
            const logEntry = {
                timestamp,
                level,
                message,
                requestId,
                ...meta
            };

            if (stack) {
                logEntry.stack = stack;
            }

            return JSON.stringify(logEntry);
        })
    ),
    defaultMeta: {
        service: 'mongodb-gui'
    },
    transports: [
        // Console transport for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ timestamp, level, message, requestId, stack }) => {
                    const prefix = requestId ? `[${requestId}] ` : '';
                    const stackTrace = stack ? `\n${stack}` : '';
                    return `${timestamp} ${level}: ${prefix}${message}${stackTrace}`;
                })
            )
        })
    ]
});

// Add file transport for production
if (config.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({
        filename: config.LOG_FILE,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
        tailable: true
    }));

    // Add error-specific log file
    logger.add(new winston.transports.File({
        filename: config.LOG_FILE.replace('.log', '-error.log'),
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 5,
        tailable: true
    }));
}

/**
 * Request ID middleware for tracking requests
 */
const requestIdMiddleware = (req, res, next) => {
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Add request ID to logger context
    req.logger = logger.child({ requestId });

    next();
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Log incoming request
    req.logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        body: req.method !== 'GET' ? sanitizeLogData(req.body) : undefined
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const duration = Date.now() - start;

        req.logger.info('Request completed', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            contentLength: res.get('Content-Length')
        });

        originalEnd.call(this, chunk, encoding);
    };

    next();
};

/**
 * Sanitize sensitive data from logs
 */
const sanitizeLogData = (data) => {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const sensitiveFields = [
        'password',
        'token',
        'secret',
        'connectionString',
        'authorization'
    ];

    const sanitized = { ...data };

    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    }

    return sanitized;
};

/**
 * Custom error classes
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND_ERROR');
    }
}

class DatabaseError extends AppError {
    constructor(message, details = null) {
        super(message, 500, 'DATABASE_ERROR', details);
    }
}

class ExportError extends AppError {
    constructor(message, details = null) {
        super(message, 500, 'EXPORT_ERROR', details);
    }
}

/**
 * Error response formatter
 */
const formatErrorResponse = (error, requestId) => {
    const response = {
        success: false,
        error: {
            code: error.code || 'INTERNAL_ERROR',
            message: error.message || 'An unexpected error occurred',
            timestamp: new Date().toISOString(),
            requestId
        }
    };

    // Add details for operational errors
    if (error.isOperational && error.details) {
        response.error.details = error.details;
    }

    // Add stack trace in development
    if (config.NODE_ENV === 'development' && error.stack) {
        response.error.stack = error.stack;
    }

    return response;
};

/**
 * Main error handling middleware
 */
const errorHandler = (error, req, res, next) => {
    const requestId = req.requestId || 'unknown';
    const logger = req.logger || winston;

    // Set default error properties if not an AppError
    if (!error.isOperational) {
        error.statusCode = error.statusCode || 500;
        error.code = error.code || 'INTERNAL_ERROR';
    }

    // Log error with appropriate level
    const logLevel = error.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]('Request error', {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
        stack: error.stack,
        url: req.url,
        method: req.method,
        body: sanitizeLogData(req.body),
        query: req.query,
        params: req.params
    });

    // Handle specific error types
    if (error.name === 'ValidationError') {
        error = new ValidationError(error.message, error.details);
    } else if (error.name === 'JsonWebTokenError') {
        error = new AuthenticationError('Invalid token');
    } else if (error.name === 'TokenExpiredError') {
        error = new AuthenticationError('Token expired');
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
        error = new DatabaseError('Database operation failed', {
            code: error.code,
            codeName: error.codeName
        });
    } else if (error.code === 'ENOENT') {
        error = new NotFoundError('File not found');
    } else if (error.code === 'EACCES') {
        error = new AppError('Permission denied', 403, 'PERMISSION_ERROR');
    }

    // Send error response
    const response = formatErrorResponse(error, requestId);
    res.status(error.statusCode || 500).json(response);
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
    const error = new NotFoundError(`Route ${req.method} ${req.url} not found`);
    next(error);
};

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = (server) => {
    const shutdown = (signal) => {
        logger.info(`Received ${signal}, starting graceful shutdown`);

        server.close((err) => {
            if (err) {
                logger.error('Error during server shutdown', { error: err.message });
                process.exit(1);
            }

            logger.info('Server closed successfully');
            process.exit(0);
        });

        // Force shutdown after 30 seconds
        setTimeout(() => {
            logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

module.exports = {
    logger,
    requestIdMiddleware,
    requestLogger,
    errorHandler,
    notFoundHandler,
    asyncHandler,
    gracefulShutdown,
    sanitizeLogData,
    // Error classes
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    DatabaseError,
    ExportError
};