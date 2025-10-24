const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration (using memory store to avoid early MongoDB connection)
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  // Removed MongoStore to avoid early MongoDB connection
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// MongoDB connection
let mongoClient = null;
let currentConnection = null;

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Routes

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password, connectionString } = req.body;
  
  try {
    // For demo purposes, using simple authentication
    // In production, implement proper user management
    if (username === 'admin' && password === 'admin') {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
      
      // Store connection string in session
      req.session.connectionString = connectionString || 'mongodb://localhost:27017';
      
      res.json({ 
        success: true, 
        token,
        message: 'Login successful' 
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Connect to MongoDB
app.post('/api/connect', authenticateToken, async (req, res) => {
  const { connectionString } = req.body;
  
  console.log('Attempting to connect to MongoDB:', connectionString);
  
  try {
    if (mongoClient) {
      await mongoClient.close();
    }
    
    if (!connectionString) {
      return res.status(400).json({ 
        error: 'Connection string is required' 
      });
    }
    
    mongoClient = new MongoClient(connectionString, {
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000
    });
    
    await mongoClient.connect();
    
    // Test the connection by pinging the server
    await mongoClient.db().admin().ping();
    
    currentConnection = mongoClient.db();
    
    console.log('MongoDB connection successful');
    
    res.json({ 
      success: true, 
      message: 'Connected to MongoDB successfully' 
    });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    
    let errorMessage = 'Connection failed';
    let errorDetails = error.message;
    
    if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused';
      errorDetails = 'MongoDB server is not running or not accessible. Check if the server is running and the connection string is correct.';
    } else if (error.message.includes('ENOTFOUND')) {
      errorMessage = 'Host not found';
      errorDetails = 'The MongoDB host address could not be resolved. Check the IP address or hostname.';
    } else if (error.message.includes('authentication')) {
      errorMessage = 'Authentication failed';
      errorDetails = 'Invalid username or password. Check your credentials.';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Connection timeout';
      errorDetails = 'Connection timed out. The server may be unreachable or slow to respond.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      originalError: error.message
    });
  }
});

// Get databases
app.get('/api/databases', authenticateToken, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(400).json({ error: 'Not connected to MongoDB. Please connect first.' });
    }
    
    console.log('Fetching databases...');
    const adminDb = mongoClient.db().admin();
    const result = await adminDb.listDatabases();
    
    console.log('Found databases:', result.databases.length);
    
    res.json({ 
      success: true, 
      databases: result.databases 
    });
  } catch (error) {
    console.error('Error fetching databases:', error);
    res.status(500).json({ 
      error: 'Failed to fetch databases', 
      details: error.message 
    });
  }
});

// Get collections for a database
app.get('/api/databases/:dbName/collections', authenticateToken, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(400).json({ error: 'Not connected to MongoDB' });
    }
    
    const db = mongoClient.db(req.params.dbName);
    const collections = await db.listCollections().toArray();
    
    res.json({ 
      success: true, 
      collections: collections.map(col => ({
        name: col.name,
        type: col.type,
        options: col.options
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch collections', 
      details: error.message 
    });
  }
});

// Get documents from a collection
app.get('/api/databases/:dbName/collections/:collectionName/documents', authenticateToken, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(400).json({ error: 'Not connected to MongoDB' });
    }
    
    const db = mongoClient.db(req.params.dbName);
    const collection = db.collection(req.params.collectionName);
    const { page = 1, limit = 50, query = '{}' } = req.query;
    
    const parsedQuery = JSON.parse(query);
    const skip = (page - 1) * limit;
    
    const documents = await collection
      .find(parsedQuery)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    const totalCount = await collection.countDocuments(parsedQuery);
    
    res.json({ 
      success: true, 
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch documents', 
      details: error.message 
    });
  }
});

// Create document - DISABLED FOR READ-ONLY ACCESS
app.post('/api/databases/:dbName/collections/:collectionName/documents', authenticateToken, async (req, res) => {
  res.status(403).json({ 
    error: 'Write operations are disabled. This is a read-only interface.' 
  });
});

// Update document - DISABLED FOR READ-ONLY ACCESS
app.put('/api/databases/:dbName/collections/:collectionName/documents/:documentId', authenticateToken, async (req, res) => {
  res.status(403).json({ 
    error: 'Write operations are disabled. This is a read-only interface.' 
  });
});

// Delete document - DISABLED FOR READ-ONLY ACCESS
app.delete('/api/databases/:dbName/collections/:collectionName/documents/:documentId', authenticateToken, async (req, res) => {
  res.status(403).json({ 
    error: 'Write operations are disabled. This is a read-only interface.' 
  });
});

// Execute custom query
app.post('/api/query', authenticateToken, async (req, res) => {
  try {
    if (!mongoClient) {
      return res.status(400).json({ error: 'Not connected to MongoDB' });
    }
    
    const { database, collection, query, operation = 'find' } = req.body;
    const db = mongoClient.db(database);
    const col = db.collection(collection);
    
    let result;
    switch (operation) {
      case 'find':
        result = await col.find(JSON.parse(query)).toArray();
        break;
      case 'aggregate':
        result = await col.aggregate(JSON.parse(query)).toArray();
        break;
      case 'count':
        result = await col.countDocuments(JSON.parse(query));
        break;
      default:
        return res.status(400).json({ error: 'Invalid operation' });
    }
    
    res.json({ 
      success: true, 
      result 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Query execution failed', 
      details: error.message 
    });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ 
    error: 'Internal server error', 
    details: error.message 
  });
});
app.get("/health",(req,res)=>{
  res.send("working.......")
})
// Start server
app.listen(PORT, () => {
  console.log(`MongoDB Web GUI server running on http://localhost:${PORT}`);
  console.log('Default login: admin / admin');
  console.log('Server started successfully - MongoDB connection will be established after user login');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});
