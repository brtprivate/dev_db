# Authentication and Session Management Services

This directory contains the enhanced authentication and session management services for the MongoDB Web GUI production application.

## Services Overview

### AuthService
Handles JWT token management with refresh tokens, token blacklisting, and password hashing.

**Key Features:**
- JWT access tokens with 15-minute expiry
- Refresh tokens with 7-day expiry
- Token blacklisting for secure logout
- Password hashing with bcrypt
- Automatic token cleanup
- Built-in authentication middleware

### SessionService
Manages secure encrypted sessions with automatic cleanup and security validation.

**Key Features:**
- AES-256-GCM encryption for session data
- Automatic session expiration
- IP address and user agent validation
- Session security monitoring
- Built-in session middleware

### ConnectionService
Validates, sanitizes, and encrypts MongoDB connection strings.

**Key Features:**
- Comprehensive connection string validation
- Injection attack prevention
- Connection string sanitization
- Encryption for secure storage
- Support for MongoDB and MongoDB+SRV schemes

## Quick Start

```javascript
const { serviceManager } = require('./services');

// Use in Express app
app.use('/api/protected', serviceManager.getAuthMiddleware());

// Authenticate user
const result = await serviceManager.authenticateUser({
    username: 'admin',
    password: 'admin',
    connectionString: 'mongodb://localhost:27017'
}, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
});
```

## API Reference

### ServiceManager

The main service manager that coordinates all authentication services.

#### Methods

##### `authenticateUser(credentials, requestInfo)`
Authenticates a user and creates a session.

**Parameters:**
- `credentials` (Object): User credentials
  - `username` (string): Username
  - `password` (string): Password
  - `connectionString` (string): MongoDB connection string
- `requestInfo` (Object): Request information
  - `ipAddress` (string): Client IP address
  - `userAgent` (string): Client user agent

**Returns:** Authentication result object

##### `logoutUser(userId, token)`
Logs out a user by invalidating all their tokens and sessions.

**Parameters:**
- `userId` (string): User ID
- `token` (string): Access token to blacklist

**Returns:** Logout result object

##### `getAuthMiddleware()`
Returns Express middleware for JWT authentication.

##### `getSessionMiddleware()`
Returns Express middleware for session validation.

##### `getCombinedAuthMiddleware()`
Returns combined authentication and session middleware.

### AuthService

#### Methods

##### `generateTokens(payload)`
Generates access and refresh token pair.

##### `validateToken(token)`
Validates and decodes a JWT token.

##### `refreshAccessToken(refreshToken)`
Refreshes an access token using a refresh token.

##### `blacklistToken(token)`
Blacklists a token for logout.

##### `hashPassword(password)`
Hashes a password using bcrypt.

##### `verifyPassword(password, hash)`
Verifies a password against its hash.

### SessionService

#### Methods

##### `createSession(sessionData, options)`
Creates a new encrypted session.

##### `getSession(sessionId)`
Retrieves and decrypts session data.

##### `updateSession(sessionId, newData, options)`
Updates session data.

##### `destroySession(sessionId)`
Destroys a session.

##### `validateSessionSecurity(sessionId, requestInfo)`
Validates session security.

### ConnectionService

#### Methods

##### `validateConnectionString(connectionString)`
Validates and sanitizes a MongoDB connection string.

##### `encryptConnectionString(connectionString)`
Encrypts a connection string for storage.

##### `decryptConnectionString(encryptedData)`
Decrypts a stored connection string.

## Security Features

### Token Security
- Short-lived access tokens (15 minutes)
- Long-lived refresh tokens (7 days)
- Token blacklisting for secure logout
- Automatic token cleanup

### Session Security
- AES-256-GCM encryption
- IP address validation
- User agent consistency checks
- Automatic session expiration
- Security violation detection

### Connection String Security
- Comprehensive validation
- Injection attack prevention
- Parameter sanitization
- Encryption for storage
- Support for MongoDB Atlas and local connections

## Configuration

The services use configuration from `config/index.js`:

```javascript
{
    JWT_SECRET: 'your-jwt-secret',
    SESSION_SECRET: 'your-session-secret',
    SESSION_MAX_AGE: 86400000, // 24 hours
    MONGODB_MAX_POOL_SIZE: 10,
    // ... other config options
}
```

## Error Handling

All services return structured error objects:

```javascript
{
    success: false,
    error: {
        code: 'ERROR_CODE',
        message: 'User-friendly message',
        details: 'Technical details',
        timestamp: '2024-01-01T00:00:00Z'
    }
}
```

## Integration Example

See `examples/auth-integration-example.js` for complete integration examples showing how to:

- Set up login/logout endpoints
- Implement token refresh
- Create protected routes
- Handle connection validation
- Add health checks

## Production Considerations

### Redis Integration
For production deployments, replace in-memory storage with Redis:

```javascript
// In AuthService constructor
this.refreshTokens = new Redis(process.env.REDIS_URL);
this.blacklistedTokens = new Redis(process.env.REDIS_URL);

// In SessionService constructor
this.sessions = new Redis(process.env.REDIS_URL);
```

### Database Integration
Replace simple credential checking with proper user management:

```javascript
// In ServiceManager.authenticateUser()
const user = await User.findOne({ username });
const isValid = await this.authService.verifyPassword(password, user.passwordHash);
```

### Monitoring
Set up monitoring for:
- Token generation/validation rates
- Session creation/destruction
- Failed authentication attempts
- Connection string validation failures

### Logging
All services include comprehensive logging. Configure log levels in your environment:

```bash
LOG_LEVEL=info  # error, warn, info, debug
```

## Testing

The services include built-in validation and error handling. For testing:

1. Test token generation and validation
2. Test session encryption/decryption
3. Test connection string validation
4. Test security violation detection
5. Test cleanup processes

## Troubleshooting

### Common Issues

1. **Token validation fails**: Check JWT_SECRET configuration
2. **Session decryption fails**: Check SESSION_SECRET configuration
3. **Connection validation fails**: Check connection string format
4. **Memory usage grows**: Ensure cleanup tasks are running

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug
```

This will provide detailed information about token operations, session management, and connection validation.