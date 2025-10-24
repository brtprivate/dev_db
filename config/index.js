const Joi = require('joi');
require('dotenv').config();

// Define the configuration schema
const configSchema = Joi.object({
    // Server Configuration
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number()
        .port()
        .default(3000),

    // Security Configuration
    JWT_SECRET: Joi.string()
        .min(32)
        .required()
        .messages({
            'string.min': 'JWT_SECRET must be at least 32 characters long',
            'any.required': 'JWT_SECRET is required for security'
        }),
    SESSION_SECRET: Joi.string()
        .min(32)
        .required()
        .messages({
            'string.min': 'SESSION_SECRET must be at least 32 characters long',
            'any.required': 'SESSION_SECRET is required for security'
        }),

    // MongoDB Configuration
    MONGODB_URI: Joi.string()
        .uri({ scheme: ['mongodb', 'mongodb+srv'] })
        .required()
        .messages({
            'string.uri': 'MONGODB_URI must be a valid MongoDB connection string',
            'any.required': 'MONGODB_URI is required'
        }),

    // CORS Configuration
    CORS_ORIGINS: Joi.string()
        .default('http://localhost:3000')
        .custom((value, helpers) => {
            const origins = value.split(',').map(origin => origin.trim());
            for (const origin of origins) {
                if (!Joi.string().uri().validate(origin).error && origin !== '*') {
                    continue;
                }
                if (origin === '*' && process.env.NODE_ENV === 'production') {
                    return helpers.error('cors.wildcard.production');
                }
                if (origin !== '*' && Joi.string().uri().validate(origin).error) {
                    return helpers.error('cors.invalid.uri');
                }
            }
            return origins;
        })
        .messages({
            'cors.wildcard.production': 'Wildcard CORS origin (*) is not allowed in production',
            'cors.invalid.uri': 'All CORS origins must be valid URIs'
        }),

    // Rate Limiting Configuration
    RATE_LIMIT_WINDOW_MS: Joi.number()
        .integer()
        .min(60000) // Minimum 1 minute
        .default(900000), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: Joi.number()
        .integer()
        .min(1)
        .default(100),

    // Export Configuration
    EXPORT_TEMP_DIR: Joi.string()
        .default('./temp/exports'),
    EXPORT_MAX_FILE_SIZE: Joi.number()
        .integer()
        .min(1048576) // Minimum 1MB
        .default(104857600), // 100MB

    // Logging Configuration
    LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'debug')
        .default('info'),
    LOG_FILE: Joi.string()
        .default('./logs/app.log'),

    // Security Headers Configuration
    CSP_REPORT_URI: Joi.string()
        .uri()
        .allow('')
        .default(''),
    HSTS_MAX_AGE: Joi.number()
        .integer()
        .min(0)
        .default(31536000), // 1 year

    // Session Configuration
    SESSION_MAX_AGE: Joi.number()
        .integer()
        .min(300000) // Minimum 5 minutes
        .default(86400000), // 24 hours
    SESSION_SECURE: Joi.boolean()
        .default(false)
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.boolean().default(true)
        }),

    // Connection Pool Configuration
    MONGODB_MAX_POOL_SIZE: Joi.number()
        .integer()
        .min(1)
        .default(10),
    MONGODB_MIN_POOL_SIZE: Joi.number()
        .integer()
        .min(0)
        .default(5),
    MONGODB_MAX_IDLE_TIME_MS: Joi.number()
        .integer()
        .min(1000)
        .default(30000),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: Joi.number()
        .integer()
        .min(1000)
        .default(10000)
}).unknown(true); // Allow other environment variables

// Validate and export configuration
const { error, value: config } = configSchema.validate(process.env);

if (error) {
    console.error('❌ Configuration validation failed:');
    error.details.forEach(detail => {
        console.error(`   ${detail.message}`);
    });
    process.exit(1);
}

// Additional validation for production environment
if (config.NODE_ENV === 'production') {
    const productionChecks = [];

    if (config.JWT_SECRET === 'your-super-secure-jwt-secret-key-change-this-in-production') {
        productionChecks.push('JWT_SECRET must be changed from default value in production');
    }

    if (config.SESSION_SECRET === 'your-super-secure-session-secret-key-change-this-in-production') {
        productionChecks.push('SESSION_SECRET must be changed from default value in production');
    }

    if (config.CORS_ORIGINS.includes('*')) {
        productionChecks.push('CORS_ORIGINS should not include wildcard (*) in production');
    }

    if (productionChecks.length > 0) {
        console.error('❌ Production environment validation failed:');
        productionChecks.forEach(check => {
            console.error(`   ${check}`);
        });
        process.exit(1);
    }
}

console.log(`✅ Configuration loaded successfully for ${config.NODE_ENV} environment`);

module.exports = config;