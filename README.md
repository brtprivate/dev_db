# MongoDB Web GUI

A modern, web-based graphical user interface for MongoDB administration, similar to Mongo Express and AdminMongo. This application provides an intuitive interface for managing MongoDB databases, collections, and documents.

## Features

- 🔐 **Secure Authentication** - JWT-based authentication system
- 🗄️ **Database Management** - Browse and manage multiple databases
- 📁 **Collection Explorer** - View and navigate collections
- 📄 **Document CRUD** - Create, read, update, and delete documents
- 🔍 **Advanced Querying** - Execute custom MongoDB queries
- 📊 **Pagination** - Efficient handling of large datasets
- 🎨 **Modern UI** - Clean, responsive interface
- 📱 **Mobile Friendly** - Works on all device sizes

## Installation

### Prerequisites

- Node.js (v14 or higher)
- MongoDB instance running locally or remotely
- npm or yarn package manager

### Setup

1. **Clone or download the project**
   ```bash
   cd mongoweb
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Access the application**
   Open your browser and go to: `http://localhost:3000`

## Usage

### Default Login Credentials

- **Username:** `admin`
- **Password:** `admin`
- **Connection String:** `mongodb://localhost:27017` (or your MongoDB connection string)

### Getting Started

1. **Login** - Use the default credentials or modify them in the server code
2. **Connect** - Enter your MongoDB connection string
3. **Browse** - Click on databases to expand and view collections
4. **Explore** - Click on collections to view documents
5. **Manage** - Use the interface to create, edit, and delete documents

### Features Overview

#### Database Management
- View all databases in your MongoDB instance
- See database sizes and statistics
- Navigate through collections

#### Document Operations
- **View Documents** - Browse documents with pagination
- **Add Documents** - Create new documents with JSON editor
- **Edit Documents** - Modify existing documents
- **Delete Documents** - Remove documents with confirmation

#### Query Interface
- Execute custom MongoDB queries
- Support for find, aggregate, and count operations
- JSON-based query input

## Configuration

### Environment Variables

You can set the following environment variables:

- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - Default MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens (change in production)

### Security Considerations

⚠️ **Important Security Notes:**

1. **Change Default Credentials** - The default admin/admin credentials should be changed in production
2. **Use Environment Variables** - Store sensitive configuration in environment variables
3. **Enable HTTPS** - Use HTTPS in production environments
4. **Network Security** - Restrict access to the application in production

## Development

### Running in Development Mode

```bash
npm run dev
```

This will start the server with nodemon for automatic restarts on file changes.

### Project Structure

```
mongoweb/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── public/                # Frontend files
│   ├── index.html         # Main HTML file
│   ├── styles.css         # CSS styles
│   └── script.js          # JavaScript functionality
└── README.md              # This file
```

## API Endpoints

The application provides the following REST API endpoints:

- `POST /api/login` - User authentication
- `POST /api/connect` - Connect to MongoDB
- `GET /api/databases` - List all databases
- `GET /api/databases/:dbName/collections` - List collections in a database
- `GET /api/databases/:dbName/collections/:collectionName/documents` - Get documents
- `POST /api/databases/:dbName/collections/:collectionName/documents` - Create document
- `PUT /api/databases/:dbName/collections/:collectionName/documents/:documentId` - Update document
- `DELETE /api/databases/:dbName/collections/:collectionName/documents/:documentId` - Delete document
- `POST /api/query` - Execute custom queries

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Ensure MongoDB is running
   - Check connection string format
   - Verify network connectivity

2. **Authentication Errors**
   - Verify username/password
   - Check JWT secret configuration

3. **Permission Denied**
   - Ensure MongoDB user has appropriate permissions
   - Check database access rights

### Logs

Check the console output for detailed error messages and debugging information.

## Contributing

Feel free to contribute to this project by:

1. Reporting bugs
2. Suggesting new features
3. Submitting pull requests
4. Improving documentation

## License

This project is licensed under the MIT License.

## Support

For support and questions:

1. Check the troubleshooting section
2. Review the console logs for errors
3. Ensure all dependencies are properly installed
4. Verify MongoDB connectivity

---

**Note:** This is a development tool. For production use, implement proper security measures, user management, and access controls.



