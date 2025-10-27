// Global variables
let authToken = null;
let currentDatabase = null;
let currentCollection = null;
let currentPage = 1;
let totalPages = 1;
let cachedConnectionString = null;
let cachedCredentials = null;

// Connection help toggle function
function toggleConnectionHelp() {
    const helpTooltip = document.querySelector('.help-tooltip');
    if (helpTooltip) {
        helpTooltip.classList.toggle('hidden');
    }
}

// Password toggle function
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleButton = document.querySelector('.password-toggle i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleButton.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        toggleButton.className = 'fas fa-eye';
    }
}

// Cache connection data
function saveConnectionCache(connectionString, username, password) {
    const connectionData = {
        connectionString: connectionString,
        username: username,
        password: password,
        timestamp: Date.now()
    };

    try {
        localStorage.setItem('mongodb_connection_cache', JSON.stringify(connectionData));
        console.log('Connection data cached successfully');
    } catch (error) {
        console.error('Failed to cache connection data:', error);
    }
}

// Load cached connection data
function loadConnectionCache() {
    try {
        const cachedData = localStorage.getItem('mongodb_connection_cache');
        if (cachedData) {
            const connectionData = JSON.parse(cachedData);

            // Check if cache is not older than 24 hours
            const cacheAge = Date.now() - connectionData.timestamp;
            const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

            if (cacheAge < maxCacheAge) {
                console.log('Valid cached connection data found');
                return connectionData;
            } else {
                console.log('Cached connection data expired, clearing cache');
                clearConnectionCache();
            }
        }
    } catch (error) {
        console.error('Failed to load cached connection data:', error);
        clearConnectionCache();
    }
    return null;
}

// Clear cached connection data
function clearConnectionCache() {
    try {
        localStorage.removeItem('mongodb_connection_cache');
        console.log('Connection cache cleared');
    } catch (error) {
        console.error('Failed to clear connection cache:', error);
    }
}

// Auto-fill login form with cached data
function fillLoginFormWithCache() {
    const cachedData = loadConnectionCache();
    if (cachedData) {
        const usernameField = document.getElementById('username');
        const passwordField = document.getElementById('password');
        const connectionStringField = document.getElementById('connectionString');

        if (usernameField) usernameField.value = cachedData.username || '';
        if (passwordField) passwordField.value = cachedData.password || '';
        if (connectionStringField) connectionStringField.value = cachedData.connectionString || '';

        console.log('Login form filled with cached data');
        return true;
    }
    return false;
}

// Auto-connect with cached connection data
async function autoConnectWithCache() {
    try {
        const cachedData = loadConnectionCache();
        if (cachedData && cachedData.connectionString) {
            console.log('Auto-connecting with cached connection string...');
            showNotification('Auto-connecting to database...', 'info');

            // Connect to MongoDB with cached connection string
            await connectToMongoDB(cachedData.connectionString);

            // Auto-load databases after connection
            await loadDatabases();

            showNotification('Auto-connected successfully!', 'success');
        } else {
            console.log('No cached connection data found');
        }
    } catch (error) {
        console.error('Auto-connection failed:', error);
        showNotification('Auto-connection failed: ' + error.message, 'error');
    }
}

// DOM elements - will be initialized after DOM loads
let loginModal, app, loginForm, logoutBtn, refreshBtn, databasesList;
let welcomeScreen, collectionView, collectionName, documentsTableBody;
let addDocumentBtn, queryBtn, queryPanel, documentModal, documentEditor;
let loadingOverlay, notification;

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    try {
        // Initialize DOM elements
        loginModal = document.getElementById('loginModal');
        app = document.getElementById('app');
        loginForm = document.getElementById('loginForm');
        logoutBtn = document.getElementById('logoutBtn');
        refreshBtn = document.getElementById('refreshBtn');
        databasesList = document.getElementById('databasesList');
        welcomeScreen = document.getElementById('welcomeScreen');
        collectionView = document.getElementById('collectionView');
        collectionName = document.getElementById('collectionName');
        documentsTableBody = document.getElementById('documentsTableBody');
        addDocumentBtn = document.getElementById('addDocumentBtn');
        queryBtn = document.getElementById('queryBtn');
        queryPanel = document.getElementById('queryPanel');
        documentModal = document.getElementById('documentModal');
        documentEditor = document.getElementById('documentEditor');
        loadingOverlay = document.getElementById('loadingOverlay');
        notification = document.getElementById('notification');

        console.log('DOM elements initialized:', {
            loginModal: !!loginModal,
            app: !!app,
            loginForm: !!loginForm
        });

        // Check if user is already logged in
        const token = localStorage.getItem('authToken');
        if (token) {
            authToken = token;
            showApp();
            // Auto-connect if cached connection data exists
            autoConnectWithCache();
        } else {
            showLoginModal();
            // Try to fill login form with cached data
            fillLoginFormWithCache();
        }

        // Event listeners
        setupEventListeners();
    } catch (error) {
        console.error('Error initializing application:', error);
        // Show a basic error message
        document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h1>Error Loading Application</h1><p>Please refresh the page and try again.</p><p>Error: ' + error.message + '</p></div>';
    }
});

function setupEventListeners() {
    try {
        // Login form
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // Refresh
        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadDatabases);
        }

        // Add document - DISABLED FOR READ-ONLY
        // addDocumentBtn.addEventListener('click', showAddDocumentModal);

        // Query
        queryBtn.addEventListener('click', toggleQueryPanel);

        // Export buttons
        const exportJsonBtn = document.getElementById('exportJsonBtn');
        const exportCsvBtn = document.getElementById('exportCsvBtn');

        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Export JSON clicked');
                showExportModal('json');
            });
        } else {
            console.error('Export JSON button not found');
        }

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Export CSV clicked');
                showExportModal('csv');
            });
        } else {
            console.error('Export CSV button not found');
        }

        // document.getElementById('exportAllBtn').addEventListener('click', (e) => {
        //     e.preventDefault();
        //     console.log('Export All clicked');
        //     showExportModal('all');
        // });

        // Document modal - only add listeners if elements exist
        const closeDocumentModal = document.getElementById('closeDocumentModal');
        const saveDocumentBtn = document.getElementById('saveDocumentBtn');
        const cancelDocumentBtn = document.getElementById('cancelDocumentBtn');

        if (closeDocumentModal) closeDocumentModal.addEventListener('click', hideDocumentModal);
        if (saveDocumentBtn) saveDocumentBtn.addEventListener('click', saveDocument);
        if (cancelDocumentBtn) cancelDocumentBtn.addEventListener('click', hideDocumentModal);

        // Query panel
        document.getElementById('closeQueryBtn').addEventListener('click', hideQueryPanel);
        document.getElementById('executeQueryBtn').addEventListener('click', executeQuery);

        // Export modal
        document.getElementById('closeExportModal').addEventListener('click', hideExportModal);
        document.getElementById('cancelExportBtn').addEventListener('click', hideExportModal);
        document.getElementById('startExportBtn').addEventListener('click', startExport);

        // Pagination
        document.getElementById('prevPageBtn').addEventListener('click', () => changePage(-1));
        document.getElementById('nextPageBtn').addEventListener('click', () => changePage(1));

        // Notification
        document.getElementById('closeNotification').addEventListener('click', hideNotification);
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}

// Authentication functions
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const connectionString = document.getElementById('connectionString').value;
    const loginBtn = document.querySelector('.btn-login');

    // Show loading state
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, connectionString })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);

            // Save connection data to cache if remember me is checked
            const rememberMe = document.getElementById('rememberMe').checked;
            if (rememberMe) {
                saveConnectionCache(connectionString, username, password);
            } else {
                clearConnectionCache();
            }

            // Connect to MongoDB
            await connectToMongoDB(connectionString);

            // Hide login modal with animation
            hideLoginModal();
            showApp();

            // Automatically load databases after successful login
            await loadDatabases();

            showNotification('Login successful! Databases loaded.', 'success');
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showNotification('Connection failed: ' + error.message, 'error');
    } finally {
        // Reset loading state
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
}

async function connectToMongoDB(connectionString) {
    try {
        console.log('Attempting to connect to MongoDB:', connectionString);

        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ connectionString })
        });

        const data = await response.json();
        console.log('MongoDB connection response:', data);

        if (!data.success) {
            // Provide more specific error messages
            if (data.error.includes('authentication') || data.error.includes('auth')) {
                throw new Error('Authentication failed. Please check your username and password in the connection string.');
            } else if (data.error.includes('network') || data.error.includes('ECONNREFUSED')) {
                throw new Error('Connection refused. Possible issues:\n1. MongoDB server is not running\n2. Firewall is blocking the connection\n3. IP address is not accessible\n4. Port 27017 is not open\n5. MongoDB is not configured to accept external connections');
            } else if (data.error.includes('timeout')) {
                throw new Error('Connection timeout. Please check if MongoDB is running and accessible.');
            } else {
                throw new Error(data.error || 'Connection failed');
            }
        }
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

function handleLogout() {
    authToken = null;
    localStorage.removeItem('authToken');
    clearConnectionCache(); // Clear cached connection data
    showLoginModal();
    hideNotification();
}

// UI functions
function showLoginModal() {
    if (loginModal) {
        loginModal.classList.remove('hidden');
        loginModal.classList.add('is-open');
    }
    if (app) {
        app.classList.add('hidden');
    }
}

function hideLoginModal() {
    if (loginModal) {
        loginModal.classList.remove('is-open');
        setTimeout(() => {
            loginModal.classList.add('hidden');
        }, 300); // Match animation duration
    }
}

function showApp() {
    if (loginModal) {
        loginModal.classList.add('hidden');
        loginModal.classList.remove('is-open');
    }
    if (app) {
        app.classList.remove('hidden');
    }
}

function showLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    if (notification) {
        const notificationText = document.getElementById('notificationText');
        if (notificationText) {
            notificationText.textContent = message;
        }
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        // Auto hide after 5 seconds
        setTimeout(() => {
            hideNotification();
        }, 5000);
    }
}

function hideNotification() {
    if (notification) {
        notification.classList.add('hidden');
    }
}

function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showNotification(message, type = 'info') {
    const notificationText = document.getElementById('notificationText');
    notificationText.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    // Auto hide after 5 seconds
    setTimeout(() => {
        hideNotification();
    }, 5000);
}

function hideNotification() {
    notification.classList.add('hidden');
}

// Database functions
async function loadDatabases() {
    if (!authToken) {
        showNotification('Please login first', 'warning');
        return;
    }

    showLoading();

    try {
        const response = await fetch('/api/databases', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('Databases API response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Databases API response data:', data);

        if (data.success) {
            console.log('Databases loaded successfully:', data.databases);
            displayDatabases(data.databases);
        } else {
            console.error('Failed to load databases:', data.error);
            showNotification(data.error || 'Failed to load databases', 'error');
        }
    } catch (error) {
        console.error('Load databases error:', error);
        showNotification('Failed to load databases: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayDatabases(databases) {
    console.log('Displaying databases:', databases);
    databasesList.innerHTML = '';

    // Update database count
    const databaseCount = document.getElementById('databaseCount');
    if (databaseCount) {
        databaseCount.textContent = databases.length;
    }

    // Hide welcome screen when databases are loaded
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
        console.log('Welcome screen hidden');
    }

    databases.forEach(db => {
        const dbItem = document.createElement('div');
        dbItem.className = 'tree-item';

        const dbHeader = document.createElement('div');
        dbHeader.className = 'tree-item-header';
        dbHeader.innerHTML = `
            <i class="fas fa-database"></i>
            <span>${db.name}</span>
            <span style="margin-left: auto; font-size: 12px; opacity: 0.7;">${formatBytes(db.sizeOnDisk)}</span>
        `;

        const collectionsContainer = document.createElement('div');
        collectionsContainer.className = 'tree-item-children';
        collectionsContainer.style.display = 'none';

        dbHeader.addEventListener('click', () => {
            const isExpanded = collectionsContainer.style.display !== 'none';
            collectionsContainer.style.display = isExpanded ? 'none' : 'block';

            if (!isExpanded && collectionsContainer.children.length === 0) {
                loadCollections(db.name, collectionsContainer);
            }
        });

        dbItem.appendChild(dbHeader);
        dbItem.appendChild(collectionsContainer);
        databasesList.appendChild(dbItem);
    });
}

async function loadCollections(databaseName, container) {
    showLoading();

    try {
        const response = await fetch(`/api/databases/${databaseName}/collections`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            displayCollections(databaseName, data.collections, container);
        } else {
            showNotification(data.error || 'Failed to load collections', 'error');
        }
    } catch (error) {
        showNotification('Failed to load collections: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayCollections(databaseName, collections, container) {
    container.innerHTML = '';

    collections.forEach(collection => {
        const collectionItem = document.createElement('div');
        collectionItem.className = 'tree-item';

        const collectionHeader = document.createElement('div');
        collectionHeader.className = 'tree-item-header';
        collectionHeader.innerHTML = `
            <i class="fas fa-folder"></i>
            <span>${collection.name}</span>
        `;

        collectionHeader.addEventListener('click', () => {
            selectCollection(databaseName, collection.name);
        });

        collectionItem.appendChild(collectionHeader);
        container.appendChild(collectionItem);
    });
}

function selectCollection(databaseName, collectionName) {
    currentDatabase = databaseName;
    currentCollection = collectionName;

    // Update UI
    document.getElementById('collectionName').textContent = `${databaseName}.${collectionName}`;
    welcomeScreen.classList.add('hidden');
    collectionView.classList.remove('hidden');

    // Show export buttons for current collection
    document.getElementById('exportJsonBtn').classList.add('show');
    document.getElementById('exportCsvBtn').classList.add('show');

    // Load documents
    loadDocuments();
}

async function loadDocuments(page = 1) {
    showLoading();
    currentPage = page;

    try {
        const response = await fetch(`/api/databases/${currentDatabase}/collections/${currentCollection}/documents?page=${page}&limit=50`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            displayDocuments(data.documents);
            updatePagination(data.pagination);
        } else {
            showNotification(data.error || 'Failed to load documents', 'error');
        }
    } catch (error) {
        showNotification('Failed to load documents: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayDocuments(documents) {
    console.log('Displaying documents:', documents);
    documentsTableBody.innerHTML = '';

    if (documents.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 2;
        cell.innerHTML = '<div class="no-documents">No documents found in this collection.</div>';
        row.appendChild(cell);
        documentsTableBody.appendChild(row);
        return;
    }

    documents.forEach((doc, index) => {
        const row = document.createElement('tr');
        row.style.background = '#ffffff';
        row.style.borderBottom = '1px solid #e5e7eb';

        const jsonCell = document.createElement('td');
        jsonCell.style.padding = '1rem';
        jsonCell.style.verticalAlign = 'top';
        jsonCell.style.width = '70%';

        const jsonString = JSON.stringify(doc, null, 2);
        const docSize = new Blob([jsonString]).size;
        const highlightedJson = highlightJson(jsonString);

        jsonCell.innerHTML = `
            <div class="document-container">
                <div class="document-header">
                    <span class="document-id">Document ${index + 1}</span>
                    <div class="document-info">
                        <span class="doc-size">${formatBytes(docSize)}</span>
                        <button class="btn btn-sm btn-secondary" onclick="toggleDocument(${index})">
                            <i class="fas fa-expand-alt"></i> Expand
                        </button>
                    </div>
                </div>
                <div class="document-json" id="doc-${index}" style="max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; background: #f8fafc;">
                    <pre style="color: #1f2937; background: transparent; margin: 0; padding: 0; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 0.875rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${highlightedJson}</pre>
                </div>
            </div>
        `;

        const actionsCell = document.createElement('td');
        actionsCell.style.padding = '1rem';
        actionsCell.style.verticalAlign = 'top';
        actionsCell.style.width = '30%';

        // Create buttons with proper event listeners instead of inline onclick
        actionsCell.innerHTML = `
            <div class="document-actions">
                <button class="btn btn-sm btn-primary view-doc-btn" data-index="${index}">
                    <i class="fas fa-eye"></i> View Full
                </button>
                <button class="btn btn-sm btn-secondary copy-doc-btn" data-index="${index}">
                    <i class="fas fa-copy"></i> Copy JSON
                </button>
                <span class="read-only-text" style="display: block; margin-top: 8px; font-size: 0.75rem; color: #6b7280;">
                    <i class="fas fa-eye"></i> Read Only Mode
                </span>
            </div>
        `;

        // Add event listeners to the buttons
        const viewBtn = actionsCell.querySelector('.view-doc-btn');
        const copyBtn = actionsCell.querySelector('.copy-doc-btn');

        viewBtn.addEventListener('click', () => viewDocumentModal(index, doc));
        copyBtn.addEventListener('click', () => copyDocumentJson(doc));

        row.appendChild(jsonCell);
        row.appendChild(actionsCell);
        documentsTableBody.appendChild(row);
    });

    console.log('Documents displayed successfully');
}

// JSON syntax highlighting function
function highlightJson(jsonString) {
    return jsonString
        .replace(/(".*?")\s*:/g, '<span style="color: #0d9488; font-weight: 600;">$1</span>:')
        .replace(/:\s*(".*?")/g, ': <span style="color: #dc2626; font-weight: 500;">$1</span>')
        .replace(/:\s*(\d+\.?\d*)/g, ': <span style="color: #2563eb; font-weight: 600;">$1</span>')
        .replace(/:\s*(true|false)/g, ': <span style="color: #7c3aed; font-weight: 600;">$1</span>')
        .replace(/:\s*(null)/g, ': <span style="color: #6b7280; font-style: italic; font-weight: 500;">$1</span>')
        .replace(/(\{|\})/g, '<span style="color: #374151; font-weight: 700;">$1</span>')
        .replace(/(\[|\])/g, '<span style="color: #374151; font-weight: 700;">$1</span>');
}

// Toggle document expansion
function toggleDocument(index) {
    const docElement = document.getElementById(`doc-${index}`);
    const button = event.target.closest('button');

    if (docElement) {
        if (docElement.style.maxHeight === '200px' || docElement.style.maxHeight === '') {
            docElement.style.maxHeight = 'none';
            docElement.style.overflow = 'visible';
            button.innerHTML = '<i class="fas fa-compress-alt"></i> Collapse';
        } else {
            docElement.style.maxHeight = '200px';
            docElement.style.overflow = 'hidden';
            button.innerHTML = '<i class="fas fa-expand-alt"></i> Expand';
        }
    }
}

function updatePagination(pagination) {
    document.getElementById('paginationInfo').textContent =
        `Showing ${pagination.page * pagination.limit - pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} documents`;

    document.getElementById('pageInfo').textContent =
        `Page ${pagination.page} of ${pagination.pages}`;

    document.getElementById('prevPageBtn').disabled = pagination.page <= 1;
    document.getElementById('nextPageBtn').disabled = pagination.page >= pagination.pages;

    totalPages = pagination.pages;
}

function changePage(direction) {
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        loadDocuments(newPage);
    }
}

// Document operations
function showAddDocumentModal() {
    document.getElementById('documentModalTitle').textContent = 'Add New Document';
    documentEditor.value = '{\n  \n}';
    documentModal.classList.remove('hidden');
}

function editDocument(documentId) {
    // Find the document in the current view
    const documents = Array.from(documentsTableBody.children).map(row => {
        const jsonText = row.querySelector('.document-json').textContent;
        return JSON.parse(jsonText);
    });

    const document = documents.find(doc => doc._id === documentId);
    if (document) {
        document.getElementById('documentModalTitle').textContent = 'Edit Document';
        documentEditor.value = JSON.stringify(document, null, 2);
        documentModal.classList.remove('hidden');

        // Store the document ID for saving
        documentEditor.dataset.documentId = documentId;
    }
}

function hideDocumentModal() {
    documentModal.classList.add('hidden');
    documentEditor.dataset.documentId = '';
}

async function saveDocument() {
    try {
        const documentData = JSON.parse(documentEditor.value);
        const documentId = documentEditor.dataset.documentId;

        showLoading();

        let response;
        if (documentId) {
            // Update existing document
            response = await fetch(`/api/databases/${currentDatabase}/collections/${currentCollection}/documents/${documentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(documentData)
            });
        } else {
            // Create new document
            response = await fetch(`/api/databases/${currentDatabase}/collections/${currentCollection}/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(documentData)
            });
        }

        const data = await response.json();

        if (data.success) {
            hideDocumentModal();
            loadDocuments(currentPage);
            showNotification(data.message || 'Document saved successfully', 'success');
        } else {
            showNotification(data.error || 'Failed to save document', 'error');
        }
    } catch (error) {
        showNotification('Invalid JSON: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteDocument(documentId) {
    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }

    showLoading();

    try {
        const response = await fetch(`/api/databases/${currentDatabase}/collections/${currentCollection}/documents/${documentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            loadDocuments(currentPage);
            showNotification('Document deleted successfully', 'success');
        } else {
            showNotification(data.error || 'Failed to delete document', 'error');
        }
    } catch (error) {
        showNotification('Failed to delete document: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Query functions
function toggleQueryPanel() {
    queryPanel.classList.toggle('hidden');
}

function hideQueryPanel() {
    queryPanel.classList.add('hidden');
}

async function executeQuery() {
    const operation = document.getElementById('queryOperation').value;
    const queryText = document.getElementById('queryText').value;

    if (!queryText.trim()) {
        showNotification('Please enter a query', 'warning');
        return;
    }

    showLoading();

    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                database: currentDatabase,
                collection: currentCollection,
                query: queryText,
                operation: operation
            })
        });

        const data = await response.json();

        if (data.success) {
            // Display results in a modal or update the documents table
            displayQueryResults(data.result);
            showNotification('Query executed successfully', 'success');
        } else {
            showNotification(data.error || 'Query execution failed', 'error');
        }
    } catch (error) {
        showNotification('Query execution failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayQueryResults(results) {
    // Create a modal to display query results
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'queryResultsModal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content large';

    modalContent.innerHTML = `
        <div class="modal-header">
            <h2><i class="fas fa-search"></i> Query Results</h2>
            <button class="close-btn" onclick="closeQueryResults()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="query-results-info">
                <span class="results-count">Found ${Array.isArray(results) ? results.length : 1} result(s)</span>
            </div>
            <div class="query-results-container">
                <pre class="query-results-json">${JSON.stringify(results, null, 2)}</pre>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeQueryResults()">
                <i class="fas fa-times"></i> Close
            </button>
        </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

function closeQueryResults() {
    const modal = document.getElementById('queryResultsModal');
    if (modal) {
        modal.remove();
    }
}

// Utility functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Toggle document view
function toggleDocument(index) {
    const docElement = document.getElementById(`doc-${index}`);
    const button = docElement.parentElement.querySelector('button');

    if (docElement.style.maxHeight && docElement.style.maxHeight !== 'none') {
        docElement.style.maxHeight = 'none';
        button.innerHTML = '<i class="fas fa-compress-alt"></i> Collapse';
    } else {
        docElement.style.maxHeight = '200px';
        button.innerHTML = '<i class="fas fa-expand-alt"></i> Expand';
    }
}

// Set query example
function setQueryExample(operation, query) {
    document.getElementById('queryOperation').value = operation;
    document.getElementById('queryText').value = query;
}

// Export functionality
function showExportModal(format = null) {
    console.log('showExportModal called with format:', format);

    // Check if user is connected and has selected a collection (for current collection export)
    if ((format === 'json' || format === 'csv') && (!currentDatabase || !currentCollection)) {
        showNotification('Please select a collection first', 'warning');
        return;
    }

    const modal = document.getElementById('exportModal');
    console.log('Modal element:', modal);

    // Set default format if provided
    if (format) {
        if (format === 'json' || format === 'csv') {
            document.querySelector(`input[name="exportFormat"][value="${format}"]`).checked = true;
            document.querySelector('input[name="exportScope"][value="current"]').checked = true;
        } else if (format === 'all') {
            document.querySelector('input[name="exportFormat"][value="json"]').checked = true;
            document.querySelector('input[name="exportScope"][value="all"]').checked = true;
        }
    }

    // Update scope change handler
    document.querySelectorAll('input[name="exportScope"]').forEach(radio => {
        radio.addEventListener('change', handleScopeChange);
    });

    modal.classList.remove('hidden');
    console.log('Modal should be visible now');
}

function handleScopeChange() {
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    const collectionSelectGroup = document.getElementById('collectionSelectGroup');

    if (scope === 'all') {
        collectionSelectGroup.style.display = 'block';
        loadCollectionsForExport();
    } else {
        collectionSelectGroup.style.display = 'none';
    }
}

async function loadCollectionsForExport() {
    try {
        const response = await fetch(`/api/databases/${currentDatabase}/collections`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const collectionsList = document.getElementById('collectionsList');
            collectionsList.innerHTML = '';

            data.collections.forEach(collection => {
                const item = document.createElement('div');
                item.className = 'collection-checkbox-item';
                item.innerHTML = `
                    <input type="checkbox" id="col-${collection.name}" value="${collection.name}" checked>
                    <label for="col-${collection.name}">${collection.name}</label>
                `;
                collectionsList.appendChild(item);
            });
        }
    } catch (error) {
        showNotification('Failed to load collections: ' + error.message, 'error');
    }
}

function hideExportModal() {
    document.getElementById('exportModal').classList.add('hidden');
}

async function startExport() {
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const scope = document.querySelector('input[name="exportScope"]:checked').value;

    console.log(`Starting export - Format: ${format}, Scope: ${scope}`);
    console.log(`Current database: ${currentDatabase}, Current collection: ${currentCollection}`);

    showLoading();

    try {
        let collections = [];

        if (scope === 'current') {
            if (!currentCollection) {
                showNotification('No collection selected. Please select a collection first.', 'warning');
                hideLoading();
                return;
            }
            collections = [currentCollection];
            console.log(`Exporting current collection: ${currentCollection}`);
        } else {
            // Get selected collections
            const selectedCollections = Array.from(document.querySelectorAll('#collectionsList input:checked'))
                .map(input => input.value);
            collections = selectedCollections;
            console.log(`Exporting selected collections: ${collections.join(', ')}`);
        }

        if (collections.length === 0) {
            showNotification('Please select at least one collection', 'warning');
            hideLoading();
            return;
        }

        // Export each collection
        for (const collectionName of collections) {
            console.log(`Exporting collection: ${collectionName} from database: ${currentDatabase}`);
            await exportCollection(currentDatabase, collectionName, format);
        }

        showNotification(`Export completed for ${collections.length} collection(s)`, 'success');
        hideExportModal();

    } catch (error) {
        console.error('Export error:', error);
        showNotification('Export failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function exportCollection(database, collection, format) {
    try {
        console.log(`Fetching documents from ${database}.${collection}`);

        // Get all documents from the collection
        const response = await fetch(`/api/databases/${database}/collections/${collection}/documents?limit=10000`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log(`Response status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Response data:', data);

        if (data.success) {
            const documents = data.documents;
            console.log(`Exporting ${documents.length} documents from ${database}.${collection}`);

            if (documents.length === 0) {
                showNotification(`No documents found in ${collection}`, 'warning');
                return;
            }

            if (format === 'json') {
                exportAsJSON(documents, `${database}_${collection}.json`);
            } else if (format === 'csv') {
                exportAsCSV(documents, `${database}_${collection}.csv`);
            }
        } else {
            throw new Error(data.error || 'Failed to fetch documents');
        }
    } catch (error) {
        console.error('Export collection error:', error);
        showNotification(`Failed to export ${collection}: ${error.message}`, 'error');
        throw error;
    }
}

function exportAsJSON(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    downloadFile(blob, filename);
}

function exportAsCSV(data, filename) {
    if (data.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }

    // Get all unique keys from all documents
    const allKeys = new Set();
    data.forEach(doc => {
        Object.keys(doc).forEach(key => allKeys.add(key));
    });

    const keys = Array.from(allKeys);

    // Create CSV header
    const csvHeader = keys.join(',');

    // Create CSV rows
    const csvRows = data.map(doc => {
        return keys.map(key => {
            const value = doc[key];
            if (value === null || value === undefined) {
                return '';
            }
            if (typeof value === 'object') {
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            }
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    downloadFile(blob, filename);
}

function downloadFile(blob, filename) {
    try {
        console.log(`Downloading file: ${filename}`);

        // Method 1: Direct download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);

        // Trigger download
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log(`File download initiated: ${filename}`);

        // Show success notification
        showNotification(`File downloaded: ${filename}`, 'success');

    } catch (error) {
        console.error('Download error:', error);

        // Fallback method
        try {
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            showNotification(`File opened in new tab: ${filename}`, 'info');
        } catch (fallbackError) {
            console.error('Fallback download error:', fallbackError);
            showNotification('Download failed. Please try again.', 'error');
        }
    }
}

// Test export function
function testExport() {
    console.log('Testing export functionality...');
    const testData = [
        { name: 'John', age: 30, city: 'New York' },
        { name: 'Jane', age: 25, city: 'London' }
    ];

    exportAsJSON(testData, 'test_export.json');
    showNotification('Test export completed!', 'success');
}

// Simple direct export function
function directExport() {
    if (!currentDatabase || !currentCollection) {
        showNotification('Please select a collection first', 'warning');
        return;
    }

    console.log(`Direct export: ${currentDatabase}.${currentCollection}`);
    showLoading();

    // Simple direct fetch and export
    fetch(`/api/databases/${currentDatabase}/collections/${currentCollection}/documents?limit=10000`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
        .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            if (data.success && data.documents) {
                console.log(`Found ${data.documents.length} documents`);

                // Create and download JSON file
                const jsonString = JSON.stringify(data.documents, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${currentDatabase}_${currentCollection}.json`;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showNotification(`Exported ${data.documents.length} documents successfully!`, 'success');
            } else {
                throw new Error(data.error || 'No documents found');
            }
        })
        .catch(error => {
            console.error('Export error:', error);
            showNotification('Export failed: ' + error.message, 'error');
        })
        .finally(() => {
            hideLoading();
        });
}

// Simple CSV export function
function directExportCSV() {
    if (!currentDatabase || !currentCollection) {
        showNotification('Please select a collection first', 'warning');
        return;
    }

    console.log(`Direct CSV export: ${currentDatabase}.${currentCollection}`);
    showLoading();

    // Simple direct fetch and export
    fetch(`/api/databases/${currentDatabase}/collections/${currentCollection}/documents?limit=10000`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
        .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            if (data.success && data.documents) {
                console.log(`Found ${data.documents.length} documents`);

                // Convert to CSV
                const documents = data.documents;
                if (documents.length === 0) {
                    showNotification('No documents to export', 'warning');
                    return;
                }

                // Get all unique keys
                const allKeys = new Set();
                documents.forEach(doc => {
                    Object.keys(doc).forEach(key => allKeys.add(key));
                });
                const keys = Array.from(allKeys);

                // Create CSV header
                const csvHeader = keys.join(',');

                // Create CSV rows
                const csvRows = documents.map(doc => {
                    return keys.map(key => {
                        const value = doc[key];
                        if (value === null || value === undefined) {
                            return '';
                        }
                        if (typeof value === 'object') {
                            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                        }
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                            return `"${value.replace(/"/g, '""')}"`;
                        }
                        return value;
                    }).join(',');
                });

                const csvContent = [csvHeader, ...csvRows].join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${currentDatabase}_${currentCollection}.csv`;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showNotification(`Exported ${documents.length} documents to CSV successfully!`, 'success');
            } else {
                throw new Error(data.error || 'No documents found');
            }
        })
        .catch(error => {
            console.error('CSV Export error:', error);
            showNotification('CSV Export failed: ' + error.message, 'error');
        })
        .finally(() => {
            hideLoading();
        });
}

// Test connection function
function testConnection() {
    if (!authToken) {
        showNotification('Please login first', 'warning');
        return;
    }

    console.log('Testing connection...');
    showLoading();

    fetch('/api/databases', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
        .then(response => {
            console.log('Connection test response:', response.status);
            if (response.ok) {
                showNotification('Connection successful!', 'success');
            } else {
                showNotification('Connection failed: ' + response.status, 'error');
            }
        })
        .catch(error => {
            console.error('Connection test error:', error);
            showNotification('Connection test failed: ' + error.message, 'error');
        })
        .finally(() => {
            hideLoading();
        });
}

// Test MongoDB connection specifically
function testMongoConnection() {
    const connectionString = prompt('Enter MongoDB connection string:');
    if (!connectionString) return;

    console.log('Testing MongoDB connection:', connectionString);
    showLoading();

    fetch('/api/connect', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ connectionString })
    })
        .then(response => response.json())
        .then(data => {
            console.log('MongoDB connection test result:', data);
            if (data.success) {
                showNotification('MongoDB connection successful!', 'success');
            } else {
                showNotification('MongoDB connection failed: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('MongoDB connection test error:', error);
            showNotification('MongoDB connection test failed: ' + error.message, 'error');
        })
        .finally(() => {
            hideLoading();
        });
}

// Make functions globally available for onclick handlers
window.editDocument = editDocument;
window.deleteDocument = deleteDocument;
window.toggleDocument = toggleDocument;
window.closeQueryResults = closeQueryResults;
window.setQueryExample = setQueryExample;
window.testExport = testExport;
window.directExport = directExport;
window.directExportCSV = directExportCSV;
window.testConnection = testConnection;
window.testMongoConnection = testMongoConnection;

// ===== JSON VIEWER FUNCTIONALITY =====

class JSONViewer {
    constructor() {
        this.currentJson = null;
        this.searchMatches = [];
        this.currentMatchIndex = -1;
        this.isSearchActive = false;

        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.modal = document.getElementById('documentModal');
        this.jsonViewer = document.getElementById('jsonViewer');
        this.jsonCode = document.getElementById('jsonCode');
        this.jsonSize = document.getElementById('jsonSize');
        this.searchContainer = document.getElementById('jsonSearchContainer');
        this.searchInput = document.getElementById('jsonSearchInput');
        this.searchResults = document.getElementById('jsonSearchResults');

        // Buttons
        this.copyBtn = document.getElementById('copyJsonBtn');
        this.expandAllBtn = document.getElementById('expandAllBtn');
        this.collapseAllBtn = document.getElementById('collapseAllBtn');
        this.searchBtn = document.getElementById('searchInJsonBtn');
        this.searchPrevBtn = document.getElementById('jsonSearchPrev');
        this.searchNextBtn = document.getElementById('jsonSearchNext');
        this.closeSearchBtn = document.getElementById('closeJsonSearch');
        this.closeModalBtn = document.getElementById('closeDocumentModal');
    }

    bindEvents() {
        // Modal controls
        this.closeModalBtn?.addEventListener('click', () => this.hide());

        // JSON actions
        this.copyBtn?.addEventListener('click', () => this.copyToClipboard());
        this.expandAllBtn?.addEventListener('click', () => this.expandAll());
        this.collapseAllBtn?.addEventListener('click', () => this.collapseAll());
        this.searchBtn?.addEventListener('click', () => this.toggleSearch());

        // Search controls
        this.searchInput?.addEventListener('input', (e) => this.performSearch(e.target.value));
        this.searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.previousMatch();
                } else {
                    this.nextMatch();
                }
            } else if (e.key === 'Escape') {
                this.closeSearch();
            }
        });

        this.searchPrevBtn?.addEventListener('click', () => this.previousMatch());
        this.searchNextBtn?.addEventListener('click', () => this.nextMatch());
        this.closeSearchBtn?.addEventListener('click', () => this.closeSearch());

        // Close modal on backdrop click
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.modal && !this.modal.classList.contains('hidden')) {
                if (e.key === 'Escape') {
                    if (this.isSearchActive) {
                        this.closeSearch();
                    } else {
                        this.hide();
                    }
                } else if (e.ctrlKey || e.metaKey) {
                    switch (e.key) {
                        case 'c':
                            if (!this.isSearchActive) {
                                e.preventDefault();
                                this.copyToClipboard();
                            }
                            break;
                        case 'f':
                            e.preventDefault();
                            this.toggleSearch();
                            break;
                        case 'e':
                            e.preventDefault();
                            this.expandAll();
                            break;
                        case 'r':
                            e.preventDefault();
                            this.collapseAll();
                            break;
                    }
                }
            }
        });
    }

    show(jsonData, title = 'Document Viewer') {
        if (!this.modal) return;

        this.currentJson = jsonData;

        // Update modal title
        const modalTitle = document.getElementById('documentModalTitle');
        if (modalTitle) {
            modalTitle.innerHTML = `<i class="fas fa-file-code"></i> ${title}`;
        }

        // Format and display JSON
        this.displayJSON(jsonData);

        // Show modal
        this.modal.classList.remove('hidden');
        this.modal.classList.add('is-open');

        // Focus management
        this.modal.focus();
    }

    hide() {
        if (!this.modal) return;

        this.modal.classList.add('hidden');
        this.modal.classList.remove('is-open');
        this.closeSearch();
        this.currentJson = null;
    }

    displayJSON(jsonData) {
        if (!this.jsonCode || !this.jsonViewer) return;

        try {
            // Format JSON with proper indentation
            const formattedJson = JSON.stringify(jsonData, null, 2);

            // Update size info
            if (this.jsonSize) {
                const size = new Blob([formattedJson]).size;
                this.jsonSize.textContent = `${formatBytes(size)} • ${formattedJson.split('\n').length} lines`;
            }

            // Set the code content
            this.jsonCode.textContent = formattedJson;

            // Apply syntax highlighting
            if (window.Prism) {
                Prism.highlightElement(this.jsonCode);
            }

            // Add collapsible functionality
            this.makeCollapsible();

        } catch (error) {
            console.error('Error displaying JSON:', error);
            this.jsonCode.textContent = 'Error: Invalid JSON data';
        }
    }

    makeCollapsible() {
        if (!this.jsonCode) return;

        const lines = this.jsonCode.innerHTML.split('\n');
        const processedLines = [];
        const stack = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Check for opening braces/brackets
            if (trimmedLine.includes('{') || trimmedLine.includes('[')) {
                const isObject = trimmedLine.includes('{');
                const level = stack.length;

                stack.push({ type: isObject ? 'object' : 'array', line: i });

                // Add collapsible toggle
                const toggleId = `toggle-${i}`;
                const contentId = `content-${i}`;

                processedLines.push(`
                    <div class="json-collapsible" data-level="${level}">
                        <button class="json-collapsible-toggle" data-toggle="${toggleId}" data-content="${contentId}"></button>
                        ${line}
                        <div class="json-collapsible-content" id="${contentId}">
                `);
            }
            // Check for closing braces/brackets
            else if (trimmedLine.includes('}') || trimmedLine.includes(']')) {
                if (stack.length > 0) {
                    const parent = stack.pop();
                    processedLines.push(`
                        </div>
                        ${line}
                    </div>
                    `);
                } else {
                    processedLines.push(line);
                }
            } else {
                processedLines.push(line);
            }
        }

        // Update the content with collapsible structure
        this.jsonCode.innerHTML = processedLines.join('\n');

        // Bind toggle events
        this.bindCollapsibleEvents();
    }

    bindCollapsibleEvents() {
        const toggles = this.jsonCode.querySelectorAll('.json-collapsible-toggle');

        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const collapsible = toggle.closest('.json-collapsible');
                const content = collapsible.querySelector('.json-collapsible-content');

                if (collapsible.classList.contains('collapsed')) {
                    collapsible.classList.remove('collapsed');
                    content.style.display = 'block';
                } else {
                    collapsible.classList.add('collapsed');
                    content.style.display = 'none';
                }
            });
        });
    }

    expandAll() {
        const collapsibles = this.jsonCode.querySelectorAll('.json-collapsible');
        collapsibles.forEach(collapsible => {
            collapsible.classList.remove('collapsed');
            const content = collapsible.querySelector('.json-collapsible-content');
            if (content) content.style.display = 'block';
        });
    }

    collapseAll() {
        const collapsibles = this.jsonCode.querySelectorAll('.json-collapsible');
        collapsibles.forEach(collapsible => {
            collapsible.classList.add('collapsed');
            const content = collapsible.querySelector('.json-collapsible-content');
            if (content) content.style.display = 'none';
        });
    }

    async copyToClipboard() {
        if (!this.currentJson) return;

        try {
            const jsonString = JSON.stringify(this.currentJson, null, 2);
            await navigator.clipboard.writeText(jsonString);

            // Show feedback
            this.showCopyFeedback();

        } catch (error) {
            console.error('Failed to copy to clipboard:', error);

            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = JSON.stringify(this.currentJson, null, 2);
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);

            this.showCopyFeedback();
        }
    }

    showCopyFeedback() {
        // Create or update feedback element
        let feedback = this.copyBtn.querySelector('.copy-feedback');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'copy-feedback';
            feedback.textContent = 'Copied!';
            this.copyBtn.style.position = 'relative';
            this.copyBtn.appendChild(feedback);
        }

        feedback.classList.add('show');

        setTimeout(() => {
            feedback.classList.remove('show');
        }, 2000);
    }

    toggleSearch() {
        if (this.isSearchActive) {
            this.closeSearch();
        } else {
            this.openSearch();
        }
    }

    openSearch() {
        if (!this.searchContainer || !this.searchInput) return;

        this.searchContainer.classList.remove('hidden');
        this.isSearchActive = true;
        this.searchInput.focus();
        this.searchBtn.innerHTML = '<i class="fas fa-times"></i> Close Search';
    }

    closeSearch() {
        if (!this.searchContainer) return;

        this.searchContainer.classList.add('hidden');
        this.isSearchActive = false;
        this.clearSearchHighlights();
        this.searchMatches = [];
        this.currentMatchIndex = -1;
        this.searchInput.value = '';
        this.searchBtn.innerHTML = '<i class="fas fa-search"></i> Search';
    }

    performSearch(query) {
        if (!query.trim()) {
            this.clearSearchHighlights();
            this.searchMatches = [];
            this.currentMatchIndex = -1;
            this.updateSearchResults();
            return;
        }

        this.clearSearchHighlights();
        this.searchMatches = [];

        // Get the text content for searching
        const textContent = this.jsonCode.textContent || '';
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let match;

        while ((match = regex.exec(textContent)) !== null) {
            this.searchMatches.push({
                index: match.index,
                length: match[0].length,
                text: match[0]
            });
        }

        if (this.searchMatches.length > 0) {
            this.highlightSearchMatches(query);
            this.currentMatchIndex = 0;
            this.scrollToMatch(0);
        }

        this.updateSearchResults();
    }

    highlightSearchMatches(query) {
        if (!this.jsonCode) return;

        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const highlightedHTML = this.jsonCode.innerHTML.replace(regex,
            '<span class="json-search-highlight">$1</span>'
        );

        this.jsonCode.innerHTML = highlightedHTML;

        // Re-apply syntax highlighting
        if (window.Prism) {
            Prism.highlightElement(this.jsonCode);
        }
    }

    clearSearchHighlights() {
        if (!this.jsonCode) return;

        const highlights = this.jsonCode.querySelectorAll('.json-search-highlight');
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize();
        });
    }

    nextMatch() {
        if (this.searchMatches.length === 0) return;

        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
        this.scrollToMatch(this.currentMatchIndex);
        this.updateSearchResults();
    }

    previousMatch() {
        if (this.searchMatches.length === 0) return;

        this.currentMatchIndex = this.currentMatchIndex <= 0
            ? this.searchMatches.length - 1
            : this.currentMatchIndex - 1;
        this.scrollToMatch(this.currentMatchIndex);
        this.updateSearchResults();
    }

    scrollToMatch(index) {
        const highlights = this.jsonCode.querySelectorAll('.json-search-highlight');

        // Remove current highlight
        highlights.forEach(h => h.classList.remove('current'));

        // Add current highlight
        if (highlights[index]) {
            highlights[index].classList.add('current');
            highlights[index].scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    updateSearchResults() {
        if (!this.searchResults) return;

        if (this.searchMatches.length === 0) {
            this.searchResults.textContent = 'No matches';
        } else {
            this.searchResults.textContent = `${this.currentMatchIndex + 1} of ${this.searchMatches.length}`;
        }
    }
}

// Initialize JSON viewer
const jsonViewer = new JSONViewer();

// Enhanced document display function
function displayDocumentsWithSyntaxHighlighting(documents) {
    documentsTableBody.innerHTML = '';

    if (documents.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 2;
        cell.innerHTML = '<div class="no-documents">No documents found in this collection.</div>';
        row.appendChild(cell);
        documentsTableBody.appendChild(row);
        return;
    }

    documents.forEach((doc, index) => {
        const row = document.createElement('tr');

        const jsonCell = document.createElement('td');
        const jsonString = JSON.stringify(doc, null, 2);
        const docSize = new Blob([jsonString]).size;

        jsonCell.innerHTML = `
            <div class="document-json-enhanced">
                <div class="document-json-header">
                    <div class="document-info">
                        <span class="document-id">Document ${index + 1}</span>
                        <span class="doc-size">${formatBytes(docSize)}</span>
                    </div>
                    <div class="document-json-actions">
                        <button class="btn btn-xs btn-secondary" onclick="copyDocumentJson(${index})" title="Copy JSON">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn btn-xs btn-primary" onclick="viewDocumentInModal(${index})" title="View in modal">
                            <i class="fas fa-expand"></i> View
                        </button>
                    </div>
                </div>
                <div class="document-json-content" id="doc-content-${index}">
                    <pre class="language-json"><code>${Prism.highlight(jsonString, Prism.languages.json, 'json')}</code></pre>
                </div>
            </div>
        `;

        const actionsCell = document.createElement('td');
        actionsCell.innerHTML = `
            <div class="document-actions">
                <span class="read-only-text">
                    <i class="fas fa-eye"></i> View Only
                </span>
            </div>
        `;

        row.appendChild(jsonCell);
        row.appendChild(actionsCell);
        documentsTableBody.appendChild(row);
    });

    // Store documents for later use
    window.currentDocuments = documents;
}

// Helper functions for document actions
function copyDocumentJson(index) {
    if (!window.currentDocuments || !window.currentDocuments[index]) return;

    const doc = window.currentDocuments[index];
    const jsonString = JSON.stringify(doc, null, 2);

    navigator.clipboard.writeText(jsonString).then(() => {
        showNotification('Document JSON copied to clipboard', 'success');
    }).catch(error => {
        console.error('Failed to copy:', error);
        showNotification('Failed to copy to clipboard', 'error');
    });
}

function viewDocumentInModal(index) {
    if (!window.currentDocuments || !window.currentDocuments[index]) return;

    const doc = window.currentDocuments[index];
    const title = `Document ${index + 1} - ${currentDatabase}.${currentCollection}`;

    jsonViewer.show(doc, title);
}

// Update the existing displayDocuments function to use the enhanced version
function displayDocuments(documents) {
    displayDocumentsWithSyntaxHighlighting(documents);
}

// ===== ADVANCED SEARCH AND FILTERING FUNCTIONALITYNALITY

class AdvancedSearch {
    constructor() {
        this.currentFields = [];
        this.savedQueries = JSON.parse(localStorage.getItem('mongoGUI_savedQueries') || '[]');
        this.queryHistory = JSON.parse(localStorage.getItem('mongoGUI_queryHistory') || '[]');
        this.conditions = [];
        this.conditionCounter = 0;

        this.initializeElements();
        this.bindEvents();
        this.loadSavedQueries();
        this.loadQueryHistory();
    }

    initializeElements() {
        // Tab elements
        this.tabs = document.querySelectorAll('.query-tab');
        this.tabContents = document.querySelectorAll('.query-tab-content');

        // Simple search elements
        this.simpleSearchInput = document.getElementById('simpleSearchInput');
        this.simpleSearchBtn = document.getElementById('simpleSearchBtn');
        this.searchFieldSelect = document.getElementById('searchFieldSelect');
        this.matchTypeSelect = document.getElementById('matchTypeSelect');
        this.caseSensitiveCheck = document.getElementById('caseSensitiveCheck');

        // Query builder elements
        this.addConditionBtn = document.getElementById('addConditionBtn');
        this.clearConditionsBtn = document.getElementById('clearConditionsBtn');
        this.queryConditions = document.getElementById('queryConditions');
        this.generatedQuery = document.getElementById('generatedQuery');

        // Raw query elements
        this.queryOperation = document.getElementById('queryOperation');
        this.queryText = document.getElementById('queryText');

        // Saved queries elements
        this.saveCurrentQueryBtn = document.getElementById('saveCurrentQueryBtn');
        this.savedQueriesList = document.getElementById('savedQueriesList');
        this.queryHistoryList = document.getElementById('queryHistoryList');

        // Action buttons
        this.executeQueryBtn = document.getElementById('executeQueryBtn');
        this.exportQueryResultsBtn = document.getElementById('exportQueryResultsBtn');
    }

    bindEvents() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Simple search events
        this.simpleSearchBtn?.addEventListener('click', () => this.executeSimpleSearch());
        this.simpleSearchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.executeSimpleSearch();
            }
        });

        // Query builder events
        this.addConditionBtn?.addEventListener('click', () => this.addCondition());
        this.clearConditionsBtn?.addEventListener('click', () => this.clearConditions());

        // Saved queries events
        this.saveCurrentQueryBtn?.addEventListener('click', () => this.showSaveQueryModal());

        // Export results
        this.exportQueryResultsBtn?.addEventListener('click', () => this.exportQueryResults());
    }

    switchTab(tabName) {
        // Update tab buttons
        this.tabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update tab content
        this.tabContents.forEach(content => {
            if (content.id === `${tabName}SearchContent` || content.id === `${tabName}QueryContent` || content.id === `${tabName}QueriesContent`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // Load field suggestions when switching to simple search or query builder
        if (tabName === 'simple' || tabName === 'builder') {
            this.loadFieldSuggestions();
        }
    }

    async loadFieldSuggestions() {
        if (!currentDatabase || !currentCollection) return;

        try {
            // Get sample documents to extract field names
            const response = await fetch(`/api/databases/${currentDatabase}/collections/${currentCollection}/documents?limit=10`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            const data = await response.json();

            if (data.success && data.documents.length > 0) {
                const fields = new Set();

                // Extract all field names from sample documents
                data.documents.forEach(doc => {
                    this.extractFields(doc, '', fields);
                });

                this.currentFields = Array.from(fields).sort();
                this.updateFieldSelects();
            }
        } catch (error) {
            console.error('Failed to load field suggestions:', error);
        }
    }

    extractFields(obj, prefix, fields) {
        Object.keys(obj).forEach(key => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            fields.add(fullKey);

            if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
                this.extractFields(obj[key], fullKey, fields);
            }
        });
    }

    updateFieldSelects() {
        // Update simple search field select
        if (this.searchFieldSelect) {
            const currentValue = this.searchFieldSelect.value;
            this.searchFieldSelect.innerHTML = '<option value="">All fields</option>';

            this.currentFields.forEach(field => {
                const option = document.createElement('option');
                option.value = field;
                option.textContent = field;
                if (field === currentValue) option.selected = true;
                this.searchFieldSelect.appendChild(option);
            });
        }
    }

    executeSimpleSearch() {
        const searchTerm = this.simpleSearchInput?.value?.trim();
        if (!searchTerm) {
            showNotification('Please enter a search term', 'warning');
            return;
        }

        const field = this.searchFieldSelect?.value || '';
        const matchType = this.matchTypeSelect?.value || 'contains';
        const caseSensitive = this.caseSensitiveCheck?.checked || false;

        // Build MongoDB query based on search parameters
        let query = {};

        if (field) {
            // Search in specific field
            query[field] = this.buildFieldQuery(searchTerm, matchType, caseSensitive);
        } else {
            // Search in all fields using $or
            const orConditions = this.currentFields.map(fieldName => ({
                [fieldName]: this.buildFieldQuery(searchTerm, matchType, caseSensitive)
            }));

            if (orConditions.length > 0) {
                query = { $or: orConditions };
            } else {
                // Fallback to text search if no fields available
                query = { $text: { $search: searchTerm } };
            }
        }

        // Execute the query
        this.executeQuery('find', query);
    }

    buildFieldQuery(searchTerm, matchType, caseSensitive) {
        const flags = caseSensitive ? '' : 'i';

        switch (matchType) {
            case 'exact':
                return caseSensitive ? searchTerm : new RegExp(`^${this.escapeRegex(searchTerm)}$`, flags);
            case 'starts':
                return new RegExp(`^${this.escapeRegex(searchTerm)}`, flags);
            case 'ends':
                return new RegExp(`${this.escapeRegex(searchTerm)}$`, flags);
            case 'regex':
                try {
                    return new RegExp(searchTerm, flags);
                } catch (e) {
                    return new RegExp(this.escapeRegex(searchTerm), flags);
                }
            case 'contains':
            default:
                return new RegExp(this.escapeRegex(searchTerm), flags);
        }
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    addCondition() {
        const conditionId = `condition_${this.conditionCounter++}`;
        const isFirst = this.conditions.length === 0;

        const conditionElement = document.createElement('div');
        conditionElement.className = 'query-condition';
        conditionElement.dataset.conditionId = conditionId;

        conditionElement.innerHTML = `
            ${!isFirst ? '<div class="query-condition-connector">AND</div>' : '<div></div>'}
            <select class="form-select query-condition-field" data-field="field">
                <option value="">Select field...</option>
                ${this.currentFields.map(field => `<option value="${field}">${field}</option>`).join('')}
            </select>
            <select class="form-select query-condition-operator" data-field="operator">
                <option value="$eq">Equals</option>
                <option value="$ne">Not equals</option>
                <option value="$gt">Greater than</option>
                <option value="$gte">Greater than or equal</option>
                <option value="$lt">Less than</option>
                <option value="$lte">Less than or equal</option>
                <option value="$in">In array</option>
                <option value="$nin">Not in array</option>
                <option value="$regex">Matches regex</option>
                <option value="$exists">Field exists</option>
            </select>
            <input type="text" class="form-input query-condition-value" data-field="value" placeholder="Value...">
            <button class="query-condition-remove" type="button">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add event listeners
        const removeBtn = conditionElement.querySelector('.query-condition-remove');
        removeBtn.addEventListener('click', () => this.removeCondition(conditionId));

        const inputs = conditionElement.querySelectorAll('select, input');
        inputs.forEach(input => {
            input.addEventListener('change', () => this.updateGeneratedQuery());
        });

        this.queryConditions.appendChild(conditionElement);
        this.conditions.push(conditionId);

        // Update UI
        this.queryConditions.classList.add('has-conditions');
        this.updateGeneratedQuery();
    }

    removeCondition(conditionId) {
        const conditionElement = document.querySelector(`[data-condition-id="${conditionId}"]`);
        if (conditionElement) {
            conditionElement.remove();
        }

        this.conditions = this.conditions.filter(id => id !== conditionId);

        if (this.conditions.length === 0) {
            this.queryConditions.classList.remove('has-conditions');
        }

        this.updateGeneratedQuery();
    }

    clearConditions() {
        this.queryConditions.innerHTML = '';
        this.conditions = [];
        this.queryConditions.classList.remove('has-conditions');
        this.updateGeneratedQuery();
    }

    updateGeneratedQuery() {
        const conditions = [];

        this.queryConditions.querySelectorAll('.query-condition').forEach(conditionElement => {
            const field = conditionElement.querySelector('[data-field="field"]').value;
            const operator = conditionElement.querySelector('[data-field="operator"]').value;
            const value = conditionElement.querySelector('[data-field="value"]').value;

            if (field && operator && value) {
                let conditionValue = value;

                // Parse value based on operator
                if (operator === '$in' || operator === '$nin') {
                    try {
                        conditionValue = JSON.parse(value);
                    } catch (e) {
                        conditionValue = value.split(',').map(v => v.trim());
                    }
                } else if (operator === '$exists') {
                    conditionValue = value.toLowerCase() === 'true';
                } else if (operator === '$gt' || operator === '$gte' || operator === '$lt' || operator === '$lte') {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        conditionValue = numValue;
                    }
                }

                conditions.push({
                    [field]: { [operator]: conditionValue }
                });
            }
        });

        let query = {};
        if (conditions.length === 1) {
            query = conditions[0];
        } else if (conditions.length > 1) {
            query = { $and: conditions };
        }

        // Update the preview
        const queryCode = this.generatedQuery.querySelector('code');
        if (queryCode) {
            const formattedQuery = JSON.stringify(query, null, 2);
            queryCode.textContent = formattedQuery;

            if (window.Prism) {
                Prism.highlightElement(queryCode);
            }
        }
    }

    async executeQuery(operation, query) {
        if (!currentDatabase || !currentCollection) {
            showNotification('Please select a collection first', 'warning');
            return;
        }

        showLoading();

        try {
            const queryString = typeof query === 'string' ? query : JSON.stringify(query);

            const response = await fetch('/api/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    database: currentDatabase,
                    collection: currentCollection,
                    query: queryString,
                    operation: operation
                })
            });

            const data = await response.json();

            if (data.success) {
                // Add to query history
                this.addToQueryHistory(operation, queryString);

                // Display results
                if (operation === 'find') {
                    displayDocuments(data.result);
                    showNotification(`Found ${data.result.length} documents`, 'success');
                } else {
                    this.displayQueryResults(data.result, operation);
                }
            } else {
                showNotification(data.error || 'Query execution failed', 'error');
            }
        } catch (error) {
            showNotification('Query execution failed: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    displayQueryResults(results, operation) {
        // Create or update results modal
        let modal = document.getElementById('queryResultsModal');
        if (modal) {
            modal.remove();
        }

        modal = document.createElement('div');
        modal.className = 'modal is-open';
        modal.id = 'queryResultsModal';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content modal-xl';

        modalContent.innerHTML = `
            <div class="modal-header">
                <h2><i class="fas fa-search"></i> Query Results - ${operation.toUpperCase()}</h2>
                <button class="modal-close" onclick="closeQueryResults()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="query-results-info">
                    <span class="results-count">Operation: ${operation} | Results: ${Array.isArray(results) ? results.length : 1}</span>
                </div>
                <div class="json-viewer-container">
                    <div class="json-viewer-toolbar">
                        <div class="json-viewer-actions">
                            <button class="btn btn-sm btn-secondary" onclick="copyQueryResults()">
                                <i class="fas fa-copy"></i> Copy Results
                            </button>
                            <button class="btn btn-sm btn-info" onclick="exportQueryResults()">
                                <i class="fas fa-download"></i> Export
                            </button>
                        </div>
                    </div>
                    <div class="json-viewer-content">
                        <pre class="line-numbers language-json"><code>${Prism.highlight(JSON.stringify(results, null, 2), Prism.languages.json, 'json')}</code></pre>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeQueryResults()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Store results for export
        window.currentQueryResults = results;
    }

    addToQueryHistory(operation, query) {
        const historyItem = {
            id: Date.now(),
            operation,
            query,
            database: currentDatabase,
            collection: currentCollection,
            timestamp: new Date().toISOString()
        };

        // Add to beginning of history
        this.queryHistory.unshift(historyItem);

        // Keep only last 50 queries
        this.queryHistory = this.queryHistory.slice(0, 50);

        // Save to localStorage
        localStorage.setItem('mongoGUI_queryHistory', JSON.stringify(this.queryHistory));

        // Update UI
        this.loadQueryHistory();
    }

    loadQueryHistory() {
        if (!this.queryHistoryList) return;

        this.queryHistoryList.innerHTML = '';

        if (this.queryHistory.length === 0) {
            this.queryHistoryList.innerHTML = '<div class="text-center text-gray-500">No query history</div>';
            return;
        }

        this.queryHistory.forEach(item => {
            const historyElement = document.createElement('div');
            historyElement.className = 'query-history-item';

            historyElement.innerHTML = `
                <div class="query-history-info">
                    <div class="query-history-operation">${item.operation.toUpperCase()} - ${item.database}.${item.collection}</div>
                    <div class="query-history-preview">${item.query.substring(0, 100)}${item.query.length > 100 ? '...' : ''}</div>
                    <div class="text-xs text-gray-400">${new Date(item.timestamp).toLocaleString()}</div>
                </div>
                <div class="query-history-actions">
                    <button class="btn btn-xs btn-secondary" onclick="advancedSearch.loadQueryFromHistory('${item.id}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-xs btn-error" onclick="advancedSearch.removeFromHistory('${item.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            this.queryHistoryList.appendChild(historyElement);
        });
    }

    loadQueryFromHistory(itemId) {
        const item = this.queryHistory.find(h => h.id == itemId);
        if (!item) return;

        // Switch to raw query tab
        this.switchTab('raw');

        // Set the query
        if (this.queryOperation) this.queryOperation.value = item.operation;
        if (this.queryText) this.queryText.value = item.query;

        showNotification('Query loaded from history', 'success');
    }

    removeFromHistory(itemId) {
        this.queryHistory = this.queryHistory.filter(h => h.id != itemId);
        localStorage.setItem('mongoGUI_queryHistory', JSON.stringify(this.queryHistory));
        this.loadQueryHistory();
    }

    showSaveQueryModal() {
        // Get current query based on active tab
        let currentQuery = '';
        let operation = 'find';

        const activeTab = document.querySelector('.query-tab.active')?.dataset.tab;

        if (activeTab === 'simple') {
            // Build query from simple search
            const searchTerm = this.simpleSearchInput?.value?.trim();
            if (!searchTerm) {
                showNotification('Please enter a search term first', 'warning');
                return;
            }
            // Use the same logic as executeSimpleSearch but just build the query
            currentQuery = JSON.stringify(this.buildSimpleSearchQuery(), null, 2);
        } else if (activeTab === 'builder') {
            // Use generated query from builder
            const queryCode = this.generatedQuery?.querySelector('code');
            currentQuery = queryCode?.textContent || '{}';
        } else if (activeTab === 'raw') {
            // Use raw query
            currentQuery = this.queryText?.value || '{}';
            operation = this.queryOperation?.value || 'find';
        }

        if (!currentQuery || currentQuery === '{}') {
            showNotification('No query to save', 'warning');
            return;
        }

        // Create save modal
        const modal = document.createElement('div');
        modal.className = 'modal is-open save-query-modal';
        modal.id = 'saveQueryModal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-save"></i> Save Query</h2>
                    <button class="modal-close" onclick="closeSaveQueryModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="queryName" class="form-label">Query Name:</label>
                        <input type="text" id="queryName" class="form-input" placeholder="Enter a name for this query...">
                    </div>
                    <div class="form-group">
                        <label for="queryDescription" class="form-label">Description (optional):</label>
                        <textarea id="queryDescription" class="form-textarea" rows="3" placeholder="Describe what this query does..."></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Query Preview:</label>
                        <div class="save-query-preview">${currentQuery}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="advancedSearch.saveQuery('${operation}', \`${currentQuery.replace(/`/g, '\\`')}\`)">
                        <i class="fas fa-save"></i> Save Query
                    </button>
                    <button class="btn btn-secondary" onclick="closeSaveQueryModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    saveQuery(operation, query) {
        const nameInput = document.getElementById('queryName');
        const descriptionInput = document.getElementById('queryDescription');

        const name = nameInput?.value?.trim();
        if (!name) {
            showNotification('Please enter a name for the query', 'warning');
            return;
        }

        const savedQuery = {
            id: Date.now(),
            name,
            description: descriptionInput?.value?.trim() || '',
            operation,
            query,
            database: currentDatabase,
            collection: currentCollection,
            timestamp: new Date().toISOString()
        };

        this.savedQueries.unshift(savedQuery);
        localStorage.setItem('mongoGUI_savedQueries', JSON.stringify(this.savedQueries));

        this.loadSavedQueries();
        this.closeSaveQueryModal();

        showNotification('Query saved successfully', 'success');
    }

    loadSavedQueries() {
        if (!this.savedQueriesList) return;

        this.savedQueriesList.innerHTML = '';

        if (this.savedQueries.length === 0) {
            this.savedQueriesList.innerHTML = '<div class="text-center text-gray-500">No saved queries</div>';
            return;
        }

        this.savedQueries.forEach(query => {
            const queryElement = document.createElement('div');
            queryElement.className = 'saved-query-item';

            queryElement.innerHTML = `
                <div class="saved-query-info">
                    <div class="saved-query-name">${query.name}</div>
                    <div class="saved-query-preview">${query.query.substring(0, 100)}${query.query.length > 100 ? '...' : ''}</div>
                    <div class="text-xs text-gray-400">${query.operation.toUpperCase()} - ${query.database}.${query.collection}</div>
                </div>
                <div class="saved-query-actions">
                    <button class="btn btn-xs btn-primary" onclick="advancedSearch.loadSavedQuery('${query.id}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-xs btn-error" onclick="advancedSearch.deleteSavedQuery('${query.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            this.savedQueriesList.appendChild(queryElement);
        });
    }

    loadSavedQuery(queryId) {
        const query = this.savedQueries.find(q => q.id == queryId);
        if (!query) return;

        // Switch to raw query tab
        this.switchTab('raw');

        // Set the query
        if (this.queryOperation) this.queryOperation.value = query.operation;
        if (this.queryText) this.queryText.value = query.query;

        showNotification(`Loaded saved query: ${query.name}`, 'success');
    }

    deleteSavedQuery(queryId) {
        if (!confirm('Are you sure you want to delete this saved query?')) return;

        this.savedQueries = this.savedQueries.filter(q => q.id != queryId);
        localStorage.setItem('mongoGUI_savedQueries', JSON.stringify(this.savedQueries));
        this.loadSavedQueries();

        showNotification('Saved query deleted', 'success');
    }

    closeSaveQueryModal() {
        const modal = document.getElementById('saveQueryModal');
        if (modal) modal.remove();
    }

    buildSimpleSearchQuery() {
        const searchTerm = this.simpleSearchInput?.value?.trim();
        const field = this.searchFieldSelect?.value || '';
        const matchType = this.matchTypeSelect?.value || 'contains';
        const caseSensitive = this.caseSensitiveCheck?.checked || false;

        let query = {};

        if (field) {
            query[field] = this.buildFieldQuery(searchTerm, matchType, caseSensitive);
        } else {
            const orConditions = this.currentFields.map(fieldName => ({
                [fieldName]: this.buildFieldQuery(searchTerm, matchType, caseSensitive)
            }));

            if (orConditions.length > 0) {
                query = { $or: orConditions };
            }
        }

        return query;
    }
}

// Initialize advanced search
const advancedSearch = new AdvancedSearch();

// Global helper functions
function closeQueryResults() {
    const modal = document.getElementById('queryResultsModal');
    if (modal) modal.remove();
}

function copyQueryResults() {
    if (window.currentQueryResults) {
        const jsonString = JSON.stringify(window.currentQueryResults, null, 2);
        navigator.clipboard.writeText(jsonString).then(() => {
            showNotification('Results copied to clipboard', 'success');
        }).catch(error => {
            console.error('Failed to copy:', error);
            showNotification('Failed to copy to clipboard', 'error');
        });
    }
}

function exportQueryResults() {
    if (window.currentQueryResults) {
        const jsonString = JSON.stringify(window.currentQueryResults, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `query_results_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Query results exported', 'success');
    }
}

function closeSaveQueryModal() {
    const modal = document.getElementById('saveQueryModal');
    if (modal) modal.remove();
}

// Update the existing executeQuery function to work with the new system
function executeQuery() {
    const activeTab = document.querySelector('.query-tab.active')?.dataset.tab;

    if (activeTab === 'simple') {
        advancedSearch.executeSimpleSearch();
    } else if (activeTab === 'builder') {
        // Execute query from builder
        const queryCode = advancedSearch.generatedQuery?.querySelector('code');
        const query = queryCode?.textContent || '{}';

        if (query === '{}') {
            showNotification('Please add at least one condition', 'warning');
            return;
        }

        try {
            const parsedQuery = JSON.parse(query);
            advancedSearch.executeQuery('find', parsedQuery);
        } catch (error) {
            showNotification('Invalid query format', 'error');
        }
    } else if (activeTab === 'raw') {
        // Execute raw query
        const operation = advancedSearch.queryOperation?.value || 'find';
        const queryText = advancedSearch.queryText?.value?.trim();

        if (!queryText) {
            showNotification('Please enter a query', 'warning');
            return;
        }

        advancedSearch.executeQuery(operation, queryText);
    }
}

// ===== ENHANCED PAGINATION AND VIRTUAL SCROLLING =====

class PaginationManager {
    constructor() {
        this.currentMode = 'pagination'; // 'pagination', 'virtual', 'infinite'
        this.pageSize = 50;
        this.currentPage = 1;
        this.totalPages = 1;
        this.totalDocuments = 0;
        this.documents = [];
        this.isLoading = false;
        this.virtualScrollData = {
            itemHeight: 120,
            containerHeight: 600,
            scrollTop: 0,
            visibleStart: 0,
            visibleEnd: 0,
            totalHeight: 0
        };

        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // Pagination elements
        this.paginationContainer = document.getElementById('paginationContainer');
        this.virtualScrollContainer = document.getElementById('virtualScrollContainer');
        this.documentsTableBody = document.getElementById('documentsTableBody');

        // Control elements
        this.pageSizeSelect = document.getElementById('pageSizeSelect');
        this.paginationModeBtn = document.getElementById('paginationModeBtn');
        this.virtualScrollModeBtn = document.getElementById('virtualScrollModeBtn');

        // Pagination controls
        this.firstPageBtn = document.getElementById('firstPageBtn');
        this.prevPageBtn = document.getElementById('prevPageBtn');
        this.nextPageBtn = document.getElementById('nextPageBtn');
        this.lastPageBtn = document.getElementById('lastPageBtn');
        this.pageJumpInput = document.getElementById('pageJumpInput');
        this.pageJumpBtn = document.getElementById('pageJumpBtn');
        this.pageInfo = document.getElementById('pageInfo');
        this.paginationInfo = document.getElementById('paginationInfo');

        // Virtual scroll elements
        this.virtualScrollViewport = document.getElementById('virtualScrollViewport');
        this.virtualScrollContent = document.getElementById('virtualScrollContent');
        this.loadMoreContainer = document.getElementById('loadMoreContainer');
        this.loadMoreBtn = document.getElementById('loadMoreBtn');
    }

    bindEvents() {
        // Mode switching
        this.paginationModeBtn?.addEventListener('click', () => this.switchMode('pagination'));
        this.virtualScrollModeBtn?.addEventListener('click', () => this.switchMode('virtual'));

        // Page size change
        this.pageSizeSelect?.addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.loadDocuments();
        });

        // Pagination controls
        this.firstPageBtn?.addEventListener('click', () => this.goToPage(1));
        this.prevPageBtn?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        this.nextPageBtn?.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        this.lastPageBtn?.addEventListener('click', () => this.goToPage(this.totalPages));

        // Page jump
        this.pageJumpBtn?.addEventListener('click', () => this.jumpToPage());
        this.pageJumpInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.jumpToPage();
            }
        });

        // Virtual scroll
        this.virtualScrollViewport?.addEventListener('scroll', () => this.handleVirtualScroll());

        // Load more
        this.loadMoreBtn?.addEventListener('click', () => this.loadMoreDocuments());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (this.currentMode === 'pagination') {
                switch (e.key) {
                    case 'ArrowLeft':
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            this.goToPage(this.currentPage - 1);
                        }
                        break;
                    case 'ArrowRight':
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            this.goToPage(this.currentPage + 1);
                        }
                        break;
                    case 'Home':
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            this.goToPage(1);
                        }
                        break;
                    case 'End':
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            this.goToPage(this.totalPages);
                        }
                        break;
                }
            }
        });
    }

    switchMode(mode) {
        this.currentMode = mode;

        // Update button states
        this.paginationModeBtn?.classList.toggle('active', mode === 'pagination');
        this.virtualScrollModeBtn?.classList.toggle('active', mode === 'virtual');

        // Show/hide containers
        this.paginationContainer?.classList.toggle('hidden', mode !== 'pagination');
        this.virtualScrollContainer?.classList.toggle('hidden', mode !== 'virtual');

        // Update button text
        if (this.paginationModeBtn) {
            this.paginationModeBtn.innerHTML = mode === 'pagination'
                ? '<i class="fas fa-list"></i> Pagination'
                : '<i class="fas fa-list"></i> Pagination';
        }

        if (this.virtualScrollModeBtn) {
            this.virtualScrollModeBtn.innerHTML = mode === 'virtual'
                ? '<i class="fas fa-arrows-alt-v"></i> Virtual'
                : '<i class="fas fa-arrows-alt-v"></i> Virtual';
        }

        // Reload data in new mode
        if (mode === 'virtual') {
            this.initializeVirtualScroll();
        } else {
            this.loadDocuments();
        }

        // Save preference
        localStorage.setItem('mongoGUI_viewMode', mode);
    }

    async loadDocuments(page = 1) {
        if (this.isLoading) return;

        this.isLoading = true;
        this.currentPage = page;

        showLoading();

        try {
            const response = await fetch(
                `/api/databases/${currentDatabase}/collections/${currentCollection}/documents?page=${page}&limit=${this.pageSize}`,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                this.documents = data.documents;
                this.totalDocuments = data.pagination.total;
                this.totalPages = data.pagination.pages;

                if (this.currentMode === 'pagination') {
                    this.displayDocumentsPaginated(data.documents);
                    this.updatePaginationControls(data.pagination);
                } else if (this.currentMode === 'virtual') {
                    this.displayDocumentsVirtual(data.documents);
                }

                this.updatePerformanceIndicator();
            } else {
                showNotification(data.error || 'Failed to load documents', 'error');
            }
        } catch (error) {
            showNotification('Failed to load documents: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
            hideLoading();
        }
    }

    displayDocumentsPaginated(documents) {
        if (!this.documentsTableBody) return;

        this.documentsTableBody.innerHTML = '';

        if (documents.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 2;
            cell.innerHTML = '<div class="no-documents">No documents found in this collection.</div>';
            row.appendChild(cell);
            this.documentsTableBody.appendChild(row);
            return;
        }

        documents.forEach((doc, index) => {
            const row = document.createElement('tr');

            const jsonCell = document.createElement('td');
            const jsonString = JSON.stringify(doc, null, 2);
            const docSize = new Blob([jsonString]).size;

            jsonCell.innerHTML = `
                <div class="document-json-enhanced">
                    <div class="document-json-header">
                        <div class="document-info">
                            <span class="document-id">Document ${(this.currentPage - 1) * this.pageSize + index + 1}</span>
                            <span class="doc-size">${formatBytes(docSize)}</span>
                        </div>
                        <div class="document-json-actions">
                            <button class="btn btn-xs btn-secondary" onclick="paginationManager.copyDocumentJson(${index})" title="Copy JSON">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button class="btn btn-xs btn-primary" onclick="paginationManager.viewDocumentInModal(${index})" title="View in modal">
                                <i class="fas fa-expand"></i> View
                            </button>
                        </div>
                    </div>
                    <div class="document-json-content" id="doc-content-${index}">
                        <pre class="language-json"><code>${Prism.highlight(jsonString, Prism.languages.json, 'json')}</code></pre>
                    </div>
                </div>
            `;

            const actionsCell = document.createElement('td');
            actionsCell.innerHTML = `
                <div class="document-actions">
                    <span class="read-only-text">
                        <i class="fas fa-eye"></i> View Only
                    </span>
                </div>
            `;

            row.appendChild(jsonCell);
            row.appendChild(actionsCell);
            this.documentsTableBody.appendChild(row);
        });
    }

    initializeVirtualScroll() {
        if (!this.virtualScrollContainer) return;

        // Load all documents for virtual scrolling (or implement progressive loading)
        this.loadAllDocumentsForVirtualScroll();
    }

    async loadAllDocumentsForVirtualScroll() {
        if (this.isLoading) return;

        this.isLoading = true;
        showLoading();

        try {
            // Load first batch to get total count
            const response = await fetch(
                `/api/databases/${currentDatabase}/collections/${currentCollection}/documents?page=1&limit=1000`,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                this.documents = data.documents;
                this.totalDocuments = data.pagination.total;

                // If there are more documents, show load more option
                if (data.documents.length < this.totalDocuments) {
                    this.loadMoreContainer?.classList.remove('hidden');
                } else {
                    this.loadMoreContainer?.classList.add('hidden');
                }

                this.displayDocumentsVirtual(this.documents);
                this.updateVirtualScrollHeight();
            }
        } catch (error) {
            showNotification('Failed to load documents: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
            hideLoading();
        }
    }

    displayDocumentsVirtual(documents) {
        if (!this.virtualScrollContent) return;

        this.documents = documents;
        this.updateVirtualScrollHeight();
        this.renderVisibleItems();
    }

    updateVirtualScrollHeight() {
        if (!this.virtualScrollContent) return;

        this.virtualScrollData.totalHeight = this.documents.length * this.virtualScrollData.itemHeight;
        this.virtualScrollContent.style.height = `${this.virtualScrollData.totalHeight}px`;
    }

    handleVirtualScroll() {
        if (!this.virtualScrollViewport) return;

        this.virtualScrollData.scrollTop = this.virtualScrollViewport.scrollTop;
        this.renderVisibleItems();
    }

    renderVisibleItems() {
        if (!this.virtualScrollContent || !this.virtualScrollViewport) return;

        const containerHeight = this.virtualScrollViewport.clientHeight;
        const itemHeight = this.virtualScrollData.itemHeight;
        const scrollTop = this.virtualScrollData.scrollTop;

        // Calculate visible range with buffer
        const buffer = 5;
        const visibleStart = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
        const visibleEnd = Math.min(
            this.documents.length,
            Math.ceil((scrollTop + containerHeight) / itemHeight) + buffer
        );

        // Clear existing items
        this.virtualScrollContent.innerHTML = '';

        // Render visible items
        for (let i = visibleStart; i < visibleEnd; i++) {
            const item = this.createVirtualScrollItem(this.documents[i], i);
            this.virtualScrollContent.appendChild(item);
        }

        this.virtualScrollData.visibleStart = visibleStart;
        this.virtualScrollData.visibleEnd = visibleEnd;
    }

    createVirtualScrollItem(document, index) {
        const item = document.createElement('div');
        item.className = 'virtual-scroll-item';
        item.style.top = `${index * this.virtualScrollData.itemHeight}px`;
        item.style.height = `${this.virtualScrollData.itemHeight}px`;

        const jsonString = JSON.stringify(document, null, 2);
        const docSize = new Blob([jsonString]).size;
        const previewLength = 200;
        const preview = jsonString.length > previewLength
            ? jsonString.substring(0, previewLength) + '...'
            : jsonString;

        item.innerHTML = `
            <div class="virtual-scroll-item-content">
                <div class="virtual-document-preview" id="virtual-doc-${index}">
                    <div class="virtual-document-header">
                        <span class="document-id">Document ${index + 1} (${formatBytes(docSize)})</span>
                        <button class="virtual-document-toggle" onclick="paginationManager.toggleVirtualDocument(${index})">
                            <i class="fas fa-expand"></i> Expand
                        </button>
                    </div>
                    <pre class="language-json"><code>${Prism.highlight(preview, Prism.languages.json, 'json')}</code></pre>
                </div>
            </div>
            <div class="virtual-scroll-item-actions">
                <button class="btn btn-xs btn-secondary" onclick="paginationManager.copyVirtualDocumentJson(${index})" title="Copy JSON">
                    <i class="fas fa-copy"></i>
                </button>
                <button class="btn btn-xs btn-primary" onclick="paginationManager.viewVirtualDocumentInModal(${index})" title="View in modal">
                    <i class="fas fa-expand"></i>
                </button>
            </div>
        `;

        return item;
    }

    toggleVirtualDocument(index) {
        const preview = document.getElementById(`virtual-doc-${index}`);
        const button = preview?.querySelector('.virtual-document-toggle');

        if (preview && button) {
            const isExpanded = preview.classList.contains('expanded');

            if (isExpanded) {
                preview.classList.remove('expanded');
                button.innerHTML = '<i class="fas fa-expand"></i> Expand';

                // Show preview
                const jsonString = JSON.stringify(this.documents[index], null, 2);
                const previewLength = 200;
                const previewText = jsonString.length > previewLength
                    ? jsonString.substring(0, previewLength) + '...'
                    : jsonString;

                const code = preview.querySelector('code');
                if (code) {
                    code.innerHTML = Prism.highlight(previewText, Prism.languages.json, 'json');
                }
            } else {
                preview.classList.add('expanded');
                button.innerHTML = '<i class="fas fa-compress"></i> Collapse';

                // Show full document
                const jsonString = JSON.stringify(this.documents[index], null, 2);
                const code = preview.querySelector('code');
                if (code) {
                    code.innerHTML = Prism.highlight(jsonString, Prism.languages.json, 'json');
                }
            }
        }
    }

    async loadMoreDocuments() {
        if (this.isLoading) return;

        this.isLoading = true;
        const nextPage = Math.floor(this.documents.length / 1000) + 1;

        try {
            const response = await fetch(
                `/api/databases/${currentDatabase}/collections/${currentCollection}/documents?page=${nextPage}&limit=1000`,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                this.documents = [...this.documents, ...data.documents];

                // Update virtual scroll
                this.updateVirtualScrollHeight();
                this.renderVisibleItems();

                // Hide load more if all documents loaded
                if (this.documents.length >= this.totalDocuments) {
                    this.loadMoreContainer?.classList.add('hidden');
                }

                showNotification(`Loaded ${data.documents.length} more documents`, 'success');
            }
        } catch (error) {
            showNotification('Failed to load more documents: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    updatePaginationControls(pagination) {
        if (!pagination) return;

        // Update info
        if (this.paginationInfo) {
            this.paginationInfo.textContent =
                `Showing ${pagination.page * pagination.limit - pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} documents`;
        }

        if (this.pageInfo) {
            this.pageInfo.textContent = `Page ${pagination.page} of ${pagination.pages}`;
        }

        // Update button states
        if (this.firstPageBtn) this.firstPageBtn.disabled = pagination.page <= 1;
        if (this.prevPageBtn) this.prevPageBtn.disabled = pagination.page <= 1;
        if (this.nextPageBtn) this.nextPageBtn.disabled = pagination.page >= pagination.pages;
        if (this.lastPageBtn) this.lastPageBtn.disabled = pagination.page >= pagination.pages;

        // Update page jump input
        if (this.pageJumpInput) {
            this.pageJumpInput.max = pagination.pages;
            this.pageJumpInput.placeholder = `1-${pagination.pages}`;
        }

        this.totalPages = pagination.pages;
    }

    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.currentPage) return;

        this.loadDocuments(page);
    }

    jumpToPage() {
        const page = parseInt(this.pageJumpInput?.value);
        if (isNaN(page)) {
            showNotification('Please enter a valid page number', 'warning');
            return;
        }

        this.goToPage(page);
        if (this.pageJumpInput) this.pageJumpInput.value = '';
    }

    updatePerformanceIndicator() {
        // Add performance indicator based on document count and load time
        const performanceContainer = document.querySelector('.pagination-info');
        if (!performanceContainer) return;

        let existingIndicator = performanceContainer.querySelector('.performance-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        const indicator = document.createElement('div');
        indicator.className = 'performance-indicator';

        if (this.totalDocuments > 10000) {
            indicator.classList.add('warning');
            indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Large dataset - consider using filters';
        } else if (this.totalDocuments > 1000) {
            indicator.classList.add('good');
            indicator.innerHTML = '<i class="fas fa-info-circle"></i> Medium dataset';
        } else {
            indicator.classList.add('good');
            indicator.innerHTML = '<i class="fas fa-check-circle"></i> Small dataset';
        }

        performanceContainer.appendChild(indicator);
    }

    // Helper methods for document actions
    copyDocumentJson(index) {
        if (!this.documents[index]) return;

        const jsonString = JSON.stringify(this.documents[index], null, 2);
        navigator.clipboard.writeText(jsonString).then(() => {
            showNotification('Document JSON copied to clipboard', 'success');
        }).catch(error => {
            console.error('Failed to copy:', error);
            showNotification('Failed to copy to clipboard', 'error');
        });
    }

    viewDocumentInModal(index) {
        if (!this.documents[index]) return;

        const doc = this.documents[index];
        const title = `Document ${(this.currentPage - 1) * this.pageSize + index + 1} - ${currentDatabase}.${currentCollection}`;

        jsonViewer.show(doc, title);
    }

    copyVirtualDocumentJson(index) {
        this.copyDocumentJson(index);
    }

    viewVirtualDocumentInModal(index) {
        if (!this.documents[index]) return;

        const doc = this.documents[index];
        const title = `Document ${index + 1} - ${currentDatabase}.${currentCollection}`;

        jsonViewer.show(doc, title);
    }
}

// Initialize pagination manager
const paginationManager = new PaginationManager();

// Update the existing displayDocuments function to use the pagination manager
function displayDocuments(documents) {
    // Store documents for the pagination manager
    paginationManager.documents = documents;

    if (paginationManager.currentMode === 'pagination') {
        paginationManager.displayDocumentsPaginated(documents);
    } else if (paginationManager.currentMode === 'virtual') {
        paginationManager.displayDocumentsVirtual(documents);
    }
}

// Update existing pagination functions
function changePage(direction) {
    const newPage = paginationManager.currentPage + direction;
    paginationManager.goToPage(newPage);
}

function updatePagination(pagination) {
    paginationManager.updatePaginationControls(pagination);
}

// Load saved view mode preference
document.addEventListener('DOMContentLoaded', function () {
    const savedMode = localStorage.getItem('mongoGUI_viewMode');
    if (savedMode && (savedMode === 'virtual' || savedMode === 'pagination')) {
        paginationManager.switchMode(savedMode);
    }
});

// ===== ACCESSIBILITY AND KEYBOARD SHORTCUTS =====

class AccessibilityManager {
    constructor() {
        this.isKeyboardNavigation = false;
        this.focusableElements = [];
        this.currentFocusIndex = -1;
        this.ariaLiveRegion = null;
        this.ariaLiveRegionAssertive = null;

        this.initializeElements();
        this.bindEvents();
        this.setupKeyboardNavigation();
        this.setupFocusManagement();
    }

    initializeElements() {
        this.ariaLiveRegion = document.getElementById('aria-live-region');
        this.ariaLiveRegionAssertive = document.getElementById('aria-live-region-assertive');
        this.keyboardShortcutsModal = document.getElementById('keyboardShortcutsModal');
        this.keyboardShortcutsBtn = document.getElementById('keyboardShortcutsBtn');
    }

    bindEvents() {
        // Keyboard shortcuts button
        this.keyboardShortcutsBtn?.addEventListener('click', () => this.showKeyboardShortcuts());

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleGlobalKeyboard(e));

        // Focus management
        document.addEventListener('focusin', () => this.handleFocusIn());
        document.addEventListener('focusout', () => this.handleFocusOut());

        // Mouse detection for keyboard navigation
        document.addEventListener('mousedown', () => this.disableKeyboardNavigation());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.enableKeyboardNavigation();
            }
        });

        // Modal accessibility
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.handleEscapeKey();
            }
        });
    }

    setupKeyboardNavigation() {
        // Add tabindex to interactive elements that need it
        this.updateFocusableElements();

        // Set up tree navigation
        this.setupTreeNavigation();

        // Set up table navigation
        this.setupTableNavigation();
    }

    setupFocusManagement() {
        // Ensure modals trap focus
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            this.setupModalFocusTrap(modal);
        });
    }

    handleGlobalKeyboard(e) {
        // Help shortcut
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.showKeyboardShortcuts();
                return;
            }
        }

        // Navigation shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'f':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        this.focusSearch();
                    }
                    break;
                case 'r':
                    e.preventDefault();
                    this.refreshData();
                    break;
                case 's':
                    if (this.isQueryPanelOpen()) {
                        e.preventDefault();
                        this.saveCurrentQuery();
                    }
                    break;
                case 'Enter':
                    if (this.isQueryPanelOpen()) {
                        e.preventDefault();
                        this.executeCurrentQuery();
                    }
                    break;
                case 'ArrowLeft':
                    if (paginationManager.currentMode === 'pagination') {
                        e.preventDefault();
                        paginationManager.goToPage(paginationManager.currentPage - 1);
                    }
                    break;
                case 'ArrowRight':
                    if (paginationManager.currentMode === 'pagination') {
                        e.preventDefault();
                        paginationManager.goToPage(paginationManager.currentPage + 1);
                    }
                    break;
                case 'Home':
                    if (paginationManager.currentMode === 'pagination') {
                        e.preventDefault();
                        paginationManager.goToPage(1);
                    }
                    break;
                case 'End':
                    if (paginationManager.currentMode === 'pagination') {
                        e.preventDefault();
                        paginationManager.goToPage(paginationManager.totalPages);
                    }
                    break;
            }
        }

        // Alt + number shortcuts for query tabs
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 4) {
                e.preventDefault();
                this.switchQueryTab(num);
            }
        }

        // Arrow key navigation in tree
        if (e.target.closest('.tree-view')) {
            this.handleTreeNavigation(e);
        }

        // Enter key for document actions
        if (e.key === 'Enter' && e.target.closest('.documents-table tbody tr')) {
            e.preventDefault();
            this.activateDocumentRow(e.target.closest('tr'));
        }
    }

    handleFocusIn() {
        this.updateFocusableElements();
    }

    handleFocusOut() {
        // Update focus management
    }

    enableKeyboardNavigation() {
        this.isKeyboardNavigation = true;
        document.body.classList.add('keyboard-navigation');
    }

    disableKeyboardNavigation() {
        this.isKeyboardNavigation = false;
        document.body.classList.remove('keyboard-navigation');
    }

    updateFocusableElements() {
        const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        this.focusableElements = Array.from(document.querySelectorAll(selector));
    }

    setupTreeNavigation() {
        const treeView = document.getElementById('databasesList');
        if (!treeView) return;

        treeView.setAttribute('role', 'tree');

        // Add keyboard navigation to tree items
        const observer = new MutationObserver(() => {
            this.updateTreeItems();
        });

        observer.observe(treeView, { childList: true, subtree: true });
        this.updateTreeItems();
    }

    updateTreeItems() {
        const treeItems = document.querySelectorAll('.tree-item-header');

        treeItems.forEach((item, index) => {
            item.setAttribute('role', 'treeitem');
            item.setAttribute('tabindex', index === 0 ? '0' : '-1');
            item.setAttribute('aria-level', this.getTreeLevel(item));

            // Check if expandable
            const children = item.parentElement.querySelector('.tree-item-children');
            if (children) {
                const isExpanded = children.style.display !== 'none';
                item.setAttribute('aria-expanded', isExpanded.toString());
            }
        });
    }

    getTreeLevel(element) {
        let level = 1;
        let parent = element.closest('.tree-item').parentElement;

        while (parent && parent.classList.contains('tree-item-children')) {
            level++;
            parent = parent.closest('.tree-item').parentElement;
        }

        return level.toString();
    }

    handleTreeNavigation(e) {
        const currentItem = e.target;
        const treeItems = Array.from(document.querySelectorAll('.tree-item-header'));
        const currentIndex = treeItems.indexOf(currentItem);

        if (currentIndex === -1) return;

        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = Math.min(currentIndex + 1, treeItems.length - 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = Math.max(currentIndex - 1, 0);
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (currentItem.getAttribute('aria-expanded') === 'false') {
                    currentItem.click(); // Expand
                } else {
                    // Move to first child
                    const children = currentItem.parentElement.querySelector('.tree-item-children .tree-item-header');
                    if (children) {
                        nextIndex = treeItems.indexOf(children);
                    }
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (currentItem.getAttribute('aria-expanded') === 'true') {
                    currentItem.click(); // Collapse
                } else {
                    // Move to parent
                    const parent = currentItem.closest('.tree-item-children')?.closest('.tree-item')?.querySelector('.tree-item-header');
                    if (parent) {
                        nextIndex = treeItems.indexOf(parent);
                    }
                }
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                currentItem.click();
                return;
        }

        if (nextIndex !== currentIndex && treeItems[nextIndex]) {
            // Update tabindex
            treeItems.forEach((item, index) => {
                item.setAttribute('tabindex', index === nextIndex ? '0' : '-1');
            });

            treeItems[nextIndex].focus();
        }
    }

    setupTableNavigation() {
        const table = document.getElementById('documentsTable');
        if (!table) return;

        table.setAttribute('role', 'table');

        // Add ARIA labels to headers
        const headers = table.querySelectorAll('th');
        headers.forEach((header, index) => {
            header.setAttribute('role', 'columnheader');
            header.setAttribute('scope', 'col');
        });

        // Update table rows when content changes
        const tbody = table.querySelector('tbody');
        if (tbody) {
            const observer = new MutationObserver(() => {
                this.updateTableRows();
            });

            observer.observe(tbody, { childList: true, subtree: true });
        }
    }

    updateTableRows() {
        const rows = document.querySelectorAll('#documentsTable tbody tr');

        rows.forEach((row, index) => {
            row.setAttribute('role', 'row');
            row.setAttribute('tabindex', '0');
            row.setAttribute('aria-rowindex', (index + 1).toString());

            const cells = row.querySelectorAll('td');
            cells.forEach((cell, cellIndex) => {
                cell.setAttribute('role', 'cell');
            });
        });
    }

    setupModalFocusTrap(modal) {
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.trapFocus(e, modal);
            }
        });
    }

    trapFocus(e, container) {
        const focusableElements = container.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    showKeyboardShortcuts() {
        if (!this.keyboardShortcutsModal) return;

        this.keyboardShortcutsModal.classList.remove('hidden');
        this.keyboardShortcutsModal.setAttribute('aria-hidden', 'false');

        // Focus the modal
        const firstFocusable = this.keyboardShortcutsModal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }

        this.announceToScreenReader('Keyboard shortcuts dialog opened');
    }

    hideKeyboardShortcuts() {
        if (!this.keyboardShortcutsModal) return;

        this.keyboardShortcutsModal.classList.add('hidden');
        this.keyboardShortcutsModal.setAttribute('aria-hidden', 'true');

        // Return focus to trigger button
        if (this.keyboardShortcutsBtn) {
            this.keyboardShortcutsBtn.focus();
        }

        this.announceToScreenReader('Keyboard shortcuts dialog closed');
    }

    handleEscapeKey() {
        // Close any open modals
        const openModals = document.querySelectorAll('.modal:not(.hidden)');
        if (openModals.length > 0) {
            const lastModal = openModals[openModals.length - 1];

            if (lastModal.id === 'keyboardShortcutsModal') {
                this.hideKeyboardShortcuts();
            } else if (lastModal.id === 'documentModal') {
                jsonViewer.hide();
            } else {
                // Close other modals
                lastModal.classList.add('hidden');
                lastModal.setAttribute('aria-hidden', 'true');
            }
        }

        // Close query panel if open
        const queryPanel = document.getElementById('queryPanel');
        if (queryPanel && !queryPanel.classList.contains('hidden')) {
            hideQueryPanel();
        }
    }

    focusSearch() {
        // Focus the search input in the active query tab
        const activeTab = document.querySelector('.query-tab.active')?.dataset.tab;

        if (activeTab === 'simple') {
            const searchInput = document.getElementById('simpleSearchInput');
            if (searchInput) {
                searchInput.focus();
                this.announceToScreenReader('Search input focused');
            }
        } else {
            // Open query panel if not open
            const queryPanel = document.getElementById('queryPanel');
            if (queryPanel && queryPanel.classList.contains('hidden')) {
                toggleQueryPanel();
            }

            // Switch to simple search tab
            if (advancedSearch) {
                advancedSearch.switchTab('simple');
                setTimeout(() => {
                    const searchInput = document.getElementById('simpleSearchInput');
                    if (searchInput) {
                        searchInput.focus();
                        this.announceToScreenReader('Search panel opened and search input focused');
                    }
                }, 100);
            }
        }
    }

    refreshData() {
        if (typeof loadDatabases === 'function') {
            loadDatabases();
            this.announceToScreenReader('Database list refreshed');
        }
    }

    saveCurrentQuery() {
        if (advancedSearch && typeof advancedSearch.showSaveQueryModal === 'function') {
            advancedSearch.showSaveQueryModal();
            this.announceToScreenReader('Save query dialog opened');
        }
    }

    executeCurrentQuery() {
        if (typeof executeQuery === 'function') {
            executeQuery();
            this.announceToScreenReader('Query execution started');
        }
    }

    isQueryPanelOpen() {
        const queryPanel = document.getElementById('queryPanel');
        return queryPanel && !queryPanel.classList.contains('hidden');
    }

    switchQueryTab(tabNumber) {
        const tabs = ['simple', 'builder', 'raw', 'saved'];
        const tabName = tabs[tabNumber - 1];

        if (tabName && advancedSearch && typeof advancedSearch.switchTab === 'function') {
            // Open query panel if not open
            const queryPanel = document.getElementById('queryPanel');
            if (queryPanel && queryPanel.classList.contains('hidden')) {
                toggleQueryPanel();
            }

            advancedSearch.switchTab(tabName);
            this.announceToScreenReader(`Switched to ${tabName} query tab`);
        }
    }

    activateDocumentRow(row) {
        if (!row) return;

        const viewButton = row.querySelector('.btn-primary');
        if (viewButton) {
            viewButton.click();
            this.announceToScreenReader('Document opened in modal');
        }
    }

    announceToScreenReader(message, assertive = false) {
        const region = assertive ? this.ariaLiveRegionAssertive : this.ariaLiveRegion;
        if (!region) return;

        // Clear and set message
        region.textContent = '';
        setTimeout(() => {
            region.textContent = message;
        }, 100);

        // Clear after announcement
        setTimeout(() => {
            region.textContent = '';
        }, 3000);
    }

    updateLoadingState(element, isLoading, loadingText = 'Loading...') {
        if (!element) return;

        if (isLoading) {
            element.setAttribute('aria-busy', 'true');
            element.setAttribute('aria-label', loadingText);
            this.announceToScreenReader(loadingText);
        } else {
            element.removeAttribute('aria-busy');
            element.removeAttribute('aria-label');
        }
    }

    setFormFieldError(field, errorMessage) {
        if (!field) return;

        field.setAttribute('aria-invalid', 'true');

        // Create or update error message
        let errorElement = document.getElementById(`${field.id}-error`);
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = `${field.id}-error`;
            errorElement.className = 'form-error';
            errorElement.setAttribute('role', 'alert');
            field.parentNode.appendChild(errorElement);
        }

        errorElement.textContent = errorMessage;
        field.setAttribute('aria-describedby', errorElement.id);

        this.announceToScreenReader(`Error: ${errorMessage}`, true);
    }

    clearFormFieldError(field) {
        if (!field) return;

        field.setAttribute('aria-invalid', 'false');

        const errorElement = document.getElementById(`${field.id}-error`);
        if (errorElement) {
            errorElement.remove();
        }

        field.removeAttribute('aria-describedby');
    }

    updateProgressBar(progressBar, value, max = 100, label = '') {
        if (!progressBar) return;

        progressBar.setAttribute('role', 'progressbar');
        progressBar.setAttribute('aria-valuenow', value.toString());
        progressBar.setAttribute('aria-valuemin', '0');
        progressBar.setAttribute('aria-valuemax', max.toString());

        if (label) {
            progressBar.setAttribute('aria-label', label);
        }

        const percentage = (value / max) * 100;
        progressBar.style.setProperty('--progress-width', `${percentage}%`);

        this.announceToScreenReader(`Progress: ${Math.round(percentage)}%`);
    }
}

// Initialize accessibility manager
const accessibilityManager = new AccessibilityManager();

// Enhanced notification function with accessibility
function showNotification(message, type = 'info') {
    const notificationText = document.getElementById('notificationText');
    notificationText.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    // Add ARIA attributes
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    // Announce to screen reader
    accessibilityManager.announceToScreenReader(message, type === 'error');

    // Auto hide after 5 seconds
    setTimeout(() => {
        hideNotification();
    }, 5000);
}

// Enhanced loading functions with accessibility
function showLoading() {
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.setAttribute('aria-hidden', 'false');
    accessibilityManager.updateLoadingState(document.body, true, 'Loading data...');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
    loadingOverlay.setAttribute('aria-hidden', 'true');
    accessibilityManager.updateLoadingState(document.body, false);
}

// Add keyboard shortcut button to header
document.addEventListener('DOMContentLoaded', function () {
    // Find the header right section and add keyboard shortcuts button
    const headerRight = document.querySelector('.header-right') || document.querySelector('header .header-left').parentNode;

    if (headerRight && !document.getElementById('keyboardShortcutsBtn')) {
        const shortcutsBtn = document.createElement('button');
        shortcutsBtn.id = 'keyboardShortcutsBtn';
        shortcutsBtn.className = 'btn btn-secondary';
        shortcutsBtn.setAttribute('aria-label', 'Show keyboard shortcuts');
        shortcutsBtn.setAttribute('title', 'Keyboard shortcuts (?)');
        shortcutsBtn.innerHTML = '<i class="fas fa-keyboard" aria-hidden="true"></i>';

        // Insert at the beginning of header right
        headerRight.insertBefore(shortcutsBtn, headerRight.firstChild);

        // Bind event
        shortcutsBtn.addEventListener('click', () => accessibilityManager.showKeyboardShortcuts());
    }
});
// JS
// ON syntax highlighting function

function highlightJson(jsonString) {
    return jsonString
        .replace(/(".*?")\s*:/g, '<span style="color: #0d9488; font-weight: 600;">$1</span>:')
        .replace(/:\s*(".*?")/g, ': <span style="color: #dc2626; font-weight: 500;">$1</span>')
        .replace(/:\s*(\d+\.?\d*)/g, ': <span style="color: #2563eb; font-weight: 600;">$1</span>')
        .replace(/:\s*(true|false)/g, ': <span style="color: #7c3aed; font-weight: 600;">$1</span>')
        .replace(/:\s*(null)/g, ': <span style="color: #6b7280; font-style: italic; font-weight: 500;">$1</span>')
        .replace(/(\{|\})/g, '<span style="color: #374151; font-weight: 700;">$1</span>')
        .replace(/(\[|\])/g, '<span style="color: #374151; font-weight: 700;">$1</span>');
}

// Format bytes helper function
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// View document in modal
function viewDocumentModal(index, doc) {
    const modal = document.getElementById('documentModal');
    const modalTitle = document.getElementById('documentModalTitle');
    const modalBody = modal.querySelector('.modal-body');

    modalTitle.innerHTML = `<i class="fas fa-file-code"></i> Document ${index + 1}`;

    const jsonString = JSON.stringify(doc, null, 2);
    const highlightedJson = highlightJson(jsonString);

    modalBody.innerHTML = `
        <div class="json-viewer-container">
            <div class="json-viewer-toolbar">
                <div class="json-viewer-actions">
                    <button class="btn btn-sm btn-secondary" onclick="copyToClipboard('${jsonString.replace(/'/g, "\\'")}')">
                        <i class="fas fa-copy"></i> Copy JSON
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="downloadJson(${JSON.stringify(doc).replace(/"/g, '&quot;')}, 'document_${index + 1}.json')">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
                <div class="json-viewer-info">
                    <span class="text-sm text-gray-500">${formatBytes(new Blob([jsonString]).size)}</span>
                </div>
            </div>
            <div class="json-content" style="max-height: 500px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; background: #f8fafc;">
                <pre style="color: #1f2937; background: transparent; margin: 0; padding: 0; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 0.875rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${highlightedJson}</pre>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

// Copy document JSON to clipboard
function copyDocumentJson(doc) {
    const jsonString = JSON.stringify(doc, null, 2);
    copyToClipboard(jsonString);
}

// Copy to clipboard helper
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

// Fallback copy function
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showNotification('Copied to clipboard!', 'success');
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
        showNotification('Failed to copy to clipboard', 'error');
    }
    document.body.removeChild(textArea);
}



// Download JSON file
function downloadJson(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('JSON file downloaded!', 'success');
}

// Toggle document expansion
function toggleDocument(index) {
    const docElement = document.getElementById(`doc-${index}`);
    const button = event.target.closest('button');

    if (docElement) {
        if (docElement.style.maxHeight === '300px' || docElement.style.maxHeight === '') {
            docElement.style.maxHeight = 'none';
            docElement.style.overflow = 'visible';
            button.innerHTML = '<i class="fas fa-compress-alt"></i> Collapse';
        } else {
            docElement.style.maxHeight = '300px';
            docElement.style.overflow = 'auto';
            button.innerHTML = '<i class="fas fa-expand-alt"></i> Expand';
        }
    }
}
