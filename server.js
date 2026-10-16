const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 bytes.');
}

app.get(['/admin', '/admin/', '/admin.html'], (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'richemonte/webseite/admin.html'));
});

app.get(['/dashboard', '/dashboard.html'], (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'richemonte/webseite/dashboard.html'));
});

app.get(['/buchhaltung', '/buchhaltung/', '/buchhaltung/login.html'], (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.redirect('/admin.html');
});

app.get(['/buchhaltung/dashboard', '/buchhaltung/dashboard.html'], (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'richemonte/webseite/buchhaltung/dashboard.html'));
});

// Middleware
app.use(cors());
app.use(express.json());

const getSettings = () => {
  const defaultMaintenance = {
    active: false,
    message: 'Wartungsarbeiten. In Kürze sind wir wieder für Sie da.',
    availableAt: ''
  };

  const settings = readJsonFile(settingsFile, {
    siteTitle: 'Richemont Monaco',
    siteSubtitle: 'Designer Clothing',
    maintenance: defaultMaintenance
  });

  const maintenanceConfig = {
    ...defaultMaintenance,
    ...(settings.maintenance || {})
  };
  const availableAt = maintenanceConfig.availableAt ? new Date(maintenanceConfig.availableAt) : null;
  const maintenanceActive = maintenanceConfig.active === true && (!availableAt || availableAt > new Date());

  return {
    siteTitle: settings.siteTitle || 'Richemont Monaco',
    siteSubtitle: settings.siteSubtitle || 'Designer Clothing',
    maintenance: {
      ...maintenanceConfig,
      active: maintenanceActive,
      availableAt: maintenanceConfig.availableAt || ''
    }
  };
};

app.use((req, res, next) => {
  const allowedPaths = [
    '/admin',
    '/admin/',
    '/admin.html',
    '/dashboard',
    '/dashboard.html',
    '/buchhaltung',
    '/buchhaltung/',
    '/buchhaltung/login.html',
    '/buchhaltung/dashboard',
    '/buchhaltung/dashboard.html',
    '/api/auth/login',
    '/api/auth/me',
    '/api/auth/change-password',
    '/health',
    '/wartung.html'
  ];
  const publicAssetRegex = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|map|json)$/i;
  if (allowedPaths.includes(req.path) || req.path.startsWith('/api') || req.path.startsWith('/uploads') || publicAssetRegex.test(req.path)) {
    return next();
  }
  const settings = getSettings();
  if (settings.maintenance.active) {
    return res.sendFile(path.join(__dirname, 'richemonte/webseite/wartung.html'));
  }
  return next();
});

app.disable('x-powered-by');

app.use((req, res, next) => {
  const assetExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.json', '.map'];
  const ext = path.extname(req.path).toLowerCase();
  if (req.method === 'GET' && assetExtensions.includes(ext)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'richemonte/webseite')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.upload`)
});

const allowedImageTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp']
]);

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedImageTypes.get(extension) !== file.mimetype) {
      return cb(new Error('Only PNG, JPEG, GIF and WebP images are allowed.'));
    }
    cb(null, true);
  }
});

app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'none'; sandbox");
  }
}));

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function getImageExtension(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return '.gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

const listImageFiles = (dir, baseDir, routePrefix = '') => {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listImageFiles(entryPath, baseDir, routePrefix));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (imageExtensions.includes(ext)) {
        const rel = path.relative(baseDir, entryPath).replace(/\\/g, '/');
        results.push(`${routePrefix}/${rel}`.replace(/\/+/g, '/'));
      }
    }
  }
  return results;
};

// Data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const publicWebDir = path.join(__dirname, 'richemonte/webseite');

const productsFile = path.join(dataDir, 'products.json');
const settingsFile = path.join(dataDir, 'settings.json');
const usersFile = path.join(dataDir, 'users.json');
const authMigrationFile = path.join(dataDir, '.auth-migrations.json');
const categoriesFile = path.join(dataDir, 'categories.json');
const discountsFile = path.join(dataDir, 'discounts.json');
const ordersFile = path.join(dataDir, 'orders.json');
const expensesFile = path.join(dataDir, 'expenses.json');

// Helper functions for file operations
const readJsonFile = (filePath, defaultValue = []) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return defaultValue;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return defaultValue;
  }
};

const writeJsonFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Initialize data files if they don't exist
const initializeDataFiles = () => {
  if (!fs.existsSync(productsFile)) {
    const defaultProducts = require('./richemonte/webseite/products.json').products;
    fs.writeFileSync(productsFile, JSON.stringify(defaultProducts, null, 2));
  }

  if (!fs.existsSync(settingsFile)) {
    const defaultSettings = {
      siteTitle: 'Richemont Monaco',
      siteSubtitle: 'Designer Clothing',
      maintenance: {
        active: false,
        message: 'Wartungsarbeiten. In Kürze sind wir wieder für Sie da.',
        availableAt: ''
      },
      siteContent: {
        heroImage: 'Bildschirmfoto 2026-05-04 um 14.08.18.png',
        homepageHeadline: 'Richemont Monaco',
        homepageDescription: 'Premium Herrenmode direkt aus Monaco.',
        announcementText: ''
      },
      invoiceDetails: {
        companyName: 'Richemont Monaco',
        bankName: 'Nord Ostsee Sparkasse',
        iban: 'DE23456787654',
        bic: 'NOLADE21ESG'
      }
    };
    fs.writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));
  }

  if (!fs.existsSync(usersFile)) {
    const username = String(process.env.ADMIN_USERNAME || '').trim();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!username || password.length < 12) {
      throw new Error('Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters to create the first admin account.');
    }
    const initialUsers = [
      {
        id: username,
        username,
        password: bcrypt.hashSync(password, 12),
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(usersFile, JSON.stringify(initialUsers, null, 2));
    fs.writeFileSync(authMigrationFile, JSON.stringify({ legacyAdminCredentialsRotated: true }, null, 2));
  } else {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    if (!Array.isArray(users)) {
      throw new Error('The users data file must contain a JSON array.');
    }
    if (!fs.existsSync(authMigrationFile)) {
      const legacyAccounts = users.filter(user => ['jamie', 'alfred'].includes(user.username));
      if (legacyAccounts.length || users.length === 0) {
        const username = String(process.env.ADMIN_USERNAME || '').trim();
        const password = process.env.ADMIN_PASSWORD || '';
        if (!username || password.length < 12) {
          throw new Error('Legacy admin accounts need secure credentials. Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters to rotate them.');
        }

        let admin = users.find(user => user.username === username);
        if (!admin) {
          admin = {
            id: username,
            username,
            role: 'admin',
            active: true,
            createdAt: new Date().toISOString()
          };
          users.push(admin);
        }
        admin.password = bcrypt.hashSync(password, 12);
        admin.role = 'admin';
        admin.active = true;
        legacyAccounts.forEach(user => {
          if (user !== admin) user.active = false;
        });
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
      }
      fs.writeFileSync(authMigrationFile, JSON.stringify({ legacyAdminCredentialsRotated: true }, null, 2));
    }
  }

  if (!fs.existsSync(categoriesFile)) {
    const defaultCategories = [
      { name: 'Hemden', description: 'Premium Hemden und Oberbekleidung' },
      { name: 'Jacken', description: 'Exklusive Jacken und Mäntel' },
      { name: 'T-Shirts', description: 'Hochwertige T-Shirts' },
      { name: 'Hosen', description: 'Elegante Hosen' }
    ];
    fs.writeFileSync(categoriesFile, JSON.stringify(defaultCategories, null, 2));
  }

  if (!fs.existsSync(discountsFile)) {
    const defaultDiscounts = [];
    fs.writeFileSync(discountsFile, JSON.stringify(defaultDiscounts, null, 2));
  }

  if (!fs.existsSync(expensesFile)) {
    fs.writeFileSync(expensesFile, JSON.stringify([], null, 2));
  }
};

initializeDataFiles();
createMaintenancePage(getSettings().maintenance);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
};

app.get('/api/images', authenticateToken, requireAdmin, (req, res) => {
  try {
    const images = [
      ...listImageFiles(publicWebDir, publicWebDir, ''),
      ...listImageFiles(uploadsDir, uploadsDir, '/uploads')
    ];
    res.json({ images });
  } catch (error) {
    console.error('Error reading image files:', error);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// Helper functions
const getUsers = () => JSON.parse(fs.readFileSync(usersFile, 'utf8'));
const saveUsers = (users) => fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

const getExpenses = () => JSON.parse(fs.readFileSync(expensesFile, 'utf8'));
const saveExpenses = (expenses) => fs.writeFileSync(expensesFile, JSON.stringify(expenses, null, 2));

const findUserByUsername = (username) => {
  const users = getUsers();
  return users.find(u => u.username === username);
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// ============ AUTH ROUTES ============

// POST /api/auth/login - Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = findUserByUsername(username);

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me - Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = findUserByUsername(req.user.username);
    res.json({
      id: user.id,
      username: user.username,
      role: user.role
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============ USER MANAGEMENT ROUTES (Admin only) ============

// GET /api/users - Get all users (admin only)
app.get('/api/users', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const users = getUsers();
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt
    }));

    res.json({ users: safeUsers });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// POST /api/users - Create new user (admin only)
app.post('/api/users', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { username, password, role, active } = req.body;

    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({ error: 'A username and a password of at least 12 characters are required' });
    }

    const users = getUsers();
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const newUser = {
      id: username,
      username,
      password: bcrypt.hashSync(password, 10),
      role: role || 'user',
      active: active !== undefined ? !!active : true,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    res.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        active: newUser.active
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/users/:username - Update user (admin only)
app.patch('/api/users/:username', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { username } = req.params;
    const { password, role, active } = req.body;

    const users = getUsers();
    const userIndex = users.findIndex(u => u.username === username);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 12) {
        return res.status(400).json({ error: 'Passwords must be at least 12 characters long' });
      }
      users[userIndex].password = bcrypt.hashSync(password, 12);
    }
    if (role !== undefined) users[userIndex].role = role;
    if (active !== undefined) users[userIndex].active = active;

    saveUsers(users);

    res.json({
      success: true,
      user: {
        id: users[userIndex].id,
        username: users[userIndex].username,
        role: users[userIndex].role,
        active: users[userIndex].active
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:username - Delete user (admin only)
app.delete('/api/users/:username', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { username } = req.params;

    if (username === 'jamie') {
      return res.status(400).json({ error: 'Cannot delete main admin' });
    }

    const users = getUsers();
    const filtered = users.filter(u => u.username !== username);

    if (filtered.length === users.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    saveUsers(filtered);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/auth/change-password - Change own password
app.post('/api/auth/change-password', authenticateToken, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === req.user.id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!bcrypt.compareSync(currentPassword, users[userIndex].password)) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }

    users[userIndex].password = bcrypt.hashSync(newPassword, 12);
    saveUsers(users);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============ PRODUCT ROUTES (Protected) ============

// GET /api/products - Get all products
app.get('/api/products', (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    res.json({ products });
  } catch (error) {
    console.error('Error reading products:', error);
    res.status(500).json({ error: 'Failed to read products' });
  }
});

// POST /api/products - Update products (Protected)
app.post('/api/products', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Products must be an array' });
    }
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
    res.json({ success: true, message: 'Products updated successfully' });
  } catch (error) {
    console.error('Error updating products:', error);
    res.status(500).json({ error: 'Failed to update products' });
  }
});

// GET /api/settings - Get site settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const { siteTitle, siteSubtitle, maintenance, siteContent } = settings;
    res.json({ siteTitle, siteSubtitle, maintenance, siteContent });
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// POST /api/settings - Update settings (Protected)
app.post('/api/settings', authenticateToken, requireAdmin, (req, res) => {
  try {
    const incoming = req.body || {};
    const currentSettings = readJsonFile(settingsFile, {});
    const merged = {
      ...currentSettings,
      ...incoming,
      invoiceDetails: {
        ...(currentSettings.invoiceDetails || {}),
        ...(incoming.invoiceDetails || {})
      }
    };
    fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2));
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/orders - Get all orders (Protected)
app.get('/api/orders', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orders = readJsonFile(ordersFile, []);
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Error reading orders:', error);
    res.status(500).json({ success: false, error: 'Failed to read orders' });
  }
});

app.post('/api/orders/test', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orders = readJsonFile(ordersFile, []);
    const timestamp = Date.now();
    const orderId = `TEST-${timestamp}`;
    const newOrder = {
      id: orderId,
      items: [
        {
          productId: 'test-product',
          title: 'Testbestellung',
          quantity: 1,
          price: 49.99
        }
      ],
      total: 49.99,
      customer: {
        name: 'Test Kunde',
        email: 'test@richemont-monaco.com',
        address: 'Musterstraße 1, 12345 Berlin'
      },
      notes: 'Testbestellung vom Admin',
      paymentMethod: 'banktransfer',
      iban: 'DE12 3456 7890 1234 5678 90',
      status: 'offen',
      trackingNumber: '',
      createdAt: new Date().toISOString()
    };
    orders.push(newOrder);
    writeJsonFile(ordersFile, orders);
    res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error('Error creating test order:', error);
    res.status(500).json({ success: false, error: 'Failed to create test order' });
  }
});

app.patch('/api/orders/:orderId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    const orders = readJsonFile(ordersFile, []);
    const orderIndex = orders.findIndex((o) => String(o.id) === orderId);
    if (orderIndex === -1) {
      return res.status(404).json({ success: false, error: 'Bestellung nicht gefunden' });
    }

    const updates = req.body || {};
    const updatedOrder = {
      ...orders[orderIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    orders[orderIndex] = updatedOrder;
    writeJsonFile(ordersFile, orders);

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

app.delete('/api/orders/:orderId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    const orders = readJsonFile(ordersFile, []);
    const filtered = orders.filter((o) => String(o.id) !== orderId);
    if (filtered.length === orders.length) {
      return res.status(404).json({ success: false, error: 'Bestellung nicht gefunden' });
    }

    writeJsonFile(ordersFile, filtered);
    res.json({ success: true, message: 'Bestellung gelöscht' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ success: false, error: 'Failed to delete order' });
  }
});

app.delete('/api/orders', authenticateToken, requireAdmin, (req, res) => {
  try {
    writeJsonFile(ordersFile, []);
    res.json({ success: true, message: 'Alle Bestellungen wurden gelöscht' });
  } catch (error) {
    console.error('Error deleting all orders:', error);
    res.status(500).json({ success: false, error: 'Failed to delete orders' });
  }
});

// Bookkeeping expenses API
app.get('/api/expenses', authenticateToken, requireAdmin, (req, res) => {
  try {
    const expenses = getExpenses();
    res.json({ success: true, expenses });
  } catch (error) {
    console.error('Error reading expenses:', error);
    res.status(500).json({ success: false, error: 'Failed to read expenses' });
  }
});

app.post('/api/expenses', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { supplier, description, amount, date, taxRate, category } = req.body;
    if (!supplier || !amount || !date) {
      return res.status(400).json({ success: false, error: 'Supplier, amount and date are required' });
    }
    const expenses = getExpenses();
    const expenseId = `EXP-${Date.now()}`;
    const taxAmount = Number(amount) * (Number(taxRate || 0) / 100);
    const newExpense = {
      id: expenseId,
      supplier,
      description: description || '',
      amount: Number(amount),
      date,
      taxRate: Number(taxRate || 0),
      taxAmount,
      category: category || 'Allgemein',
      createdBy: req.user.username,
      createdAt: new Date().toISOString()
    };
    expenses.push(newExpense);
    saveExpenses(expenses);
    res.json({ success: true, expense: newExpense });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ success: false, error: 'Failed to create expense' });
  }
});

app.patch('/api/expenses/:expenseId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const expenseId = String(req.params.expenseId || '').trim();
    const expenses = getExpenses();
    const index = expenses.findIndex(exp => exp.id === expenseId);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }
    const updates = req.body || {};
    const updatedExpense = {
      ...expenses[index],
      ...updates,
      taxAmount: Number(updates.amount || expenses[index].amount) * (Number(updates.taxRate !== undefined ? updates.taxRate : expenses[index].taxRate) / 100),
      updatedBy: req.user.username,
      updatedAt: new Date().toISOString()
    };
    expenses[index] = updatedExpense;
    saveExpenses(expenses);
    res.json({ success: true, expense: updatedExpense });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ success: false, error: 'Failed to update expense' });
  }
});

app.delete('/api/expenses/:expenseId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const expenseId = String(req.params.expenseId || '').trim();
    const expenses = getExpenses();
    const filtered = expenses.filter(exp => exp.id !== expenseId);
    if (filtered.length === expenses.length) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }
    saveExpenses(filtered);
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ success: false, error: 'Failed to delete expense' });
  }
});

app.get('/api/bookkeeping/summary', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orders = readJsonFile(ordersFile, []);
    const expenses = getExpenses();
    const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const expenseTotal = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
    const vatRevenue = orders.reduce((sum, order) => {
      const orderVat = (order.items || []).reduce((itemSum, item) => {
        const price = Number(item.price || 0);
        const qty = Number(item.quantity || 1);
        return itemSum + (price * qty * 0.19);
      }, 0);
      return sum + orderVat;
    }, 0);
    const vatExpenses = expenses.reduce((sum, exp) => sum + Number(exp.taxAmount || 0), 0);
    const netProfit = revenue - expenseTotal;
    res.json({
      success: true,
      revenue,
      expenseTotal,
      netProfit,
      vatRevenue,
      vatExpenses,
      openOrders: orders.filter(order => order.status !== 'paid').length,
      expenseCount: expenses.length,
      orderCount: orders.length
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ success: false, error: 'Failed to generate summary' });
  }
});

const formatDate = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString || '';
  return date.toLocaleDateString('de-DE');
};

app.get('/api/bookkeeping/export-datev', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orders = readJsonFile(ordersFile, []);
    const expenses = getExpenses();
    const datevData = {
      orders,
      expenses,
      exportedAt: new Date().toISOString()
    };
    res.json({ success: true, datevData });
  } catch (error) {
    console.error('Error exporting DATEV:', error);
    res.status(500).json({ success: false, error: 'Failed to export DATEV data' });
  }
});

app.get('/api/bookkeeping/cashbook', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orders = readJsonFile(ordersFile, []);
    const expenses = getExpenses();
    const entries = [];
    orders.forEach(order => {
      entries.push({
        type: 'Einnahme',
        date: formatDate(order.createdAt),
        partner: order.customer?.name || 'Kunde',
        description: `Rechnung ${order.id}`,
        amount: Number(order.total || 0),
        tax: 0,
        category: 'Umsatz'
      });
    });
    expenses.forEach(expense => {
      entries.push({
        type: 'Ausgabe',
        date: formatDate(expense.date),
        partner: expense.supplier,
        description: expense.description || 'Ausgabe',
        amount: -Number(expense.amount || 0),
        tax: Number(expense.taxAmount || 0),
        category: expense.category || 'Allgemein',
        createdBy: expense.createdBy || '–'
      });
    });
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error reading cashbook entries:', error);
    res.status(500).json({ success: false, error: 'Failed to read cashbook entries' });
  }
});

app.get('/api/bookkeeping/export-cashbook', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orders = readJsonFile(ordersFile, []);
    const expenses = getExpenses();
    const entries = [];
    orders.forEach(order => {
      entries.push({
        type: 'Einnahme',
        date: formatDate(order.createdAt),
        partner: order.customer?.name || 'Kunde',
        description: `Rechnung ${order.id}`,
        amount: Number(order.total || 0).toFixed(2),
        tax: '0,00',
        category: 'Umsatz'
      });
    });
    expenses.forEach(expense => {
      entries.push({
        type: 'Ausgabe',
        date: formatDate(expense.date),
        partner: expense.supplier,
        description: expense.description || 'Ausgabe',
        amount: (-Number(expense.amount || 0)).toFixed(2),
        tax: Number(expense.taxAmount || 0).toFixed(2),
        category: expense.category || 'Allgemein',
        createdBy: expense.createdBy || '–'
      });
    });
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.2">
  <office:body>
    <office:text>
      <text:h text:style-name="Heading1">Kassenbuch</text:h>
      <table:table table:name="Kassenbuch">
        <table:table-row>
          <table:table-cell><text:p>Typ</text:p></table:table-cell>
          <table:table-cell><text:p>Datum</text:p></table:table-cell>
          <table:table-cell><text:p>Partner</text:p></table:table-cell>
          <table:table-cell><text:p>Beschreibung</text:p></table:table-cell>
          <table:table-cell><text:p>Betrag</text:p></table:table-cell>
          <table:table-cell><text:p>Steuer</text:p></table:table-cell>
          <table:table-cell><text:p>Kategorie</text:p></table:table-cell>
          <table:table-cell><text:p>Erfasst von</text:p></table:table-cell>
        </table:table-row>
        ${entries.map(entry => `
        <table:table-row>
          <table:table-cell><text:p>${entry.type}</text:p></table:table-cell>
          <table:table-cell><text:p>${entry.date}</text:p></table:table-cell>
          <table:table-cell><text:p>${entry.partner}</text:p></table:table-cell>
          <table:table-cell><text:p>${entry.description}</text:p></table:table-cell>
          <table:table-cell><text:p>${entry.amount.replace('.', ',')}</text:p></table:table-cell>
          <table:table-cell><text:p>${entry.tax.replace('.', ',')}</text:p></table:table-cell>
          <table:table-cell><text:p>${entry.category}</text:p></table:table-cell>
          <table:table-cell><text:p>${entry.createdBy || '–'}</text:p></table:table-cell>
        </table:table-row>`).join('')}
      </table:table>
    </office:text>
  </office:body>
</office:document-content>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.2">
  <office:styles>
    <style:style style:name="Heading1" style:family="paragraph" style:parent-style-name="Heading" />
  </office:styles>
</office:document-styles>`;

    const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

    const zip = new AdmZip();
    zip.addFile('mimetype', Buffer.from('application/vnd.oasis.opendocument.text', 'utf8'));
    zip.addFile('content.xml', Buffer.from(contentXml, 'utf8'));
    zip.addFile('styles.xml', Buffer.from(stylesXml, 'utf8'));
    zip.addFile('META-INF/manifest.xml', Buffer.from(manifestXml, 'utf8'));

    const buffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/vnd.oasis.opendocument.text');
    res.setHeader('Content-Disposition', 'attachment; filename="kassenbuch.odt"');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting cashbook ODF:', error);
    res.status(500).json({ success: false, error: 'Failed to export cashbook ODF' });
  }
});

// GET /api/orders/:orderId/invoice - Generate PDF invoice
app.get('/api/orders/:orderId/invoice', authenticateToken, requireAdmin, (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const orders = readJsonFile(ordersFile, []);
    const order = orders.find(o => String(o.id) === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="rechnung-${orderId}.pdf"`);
    
    doc.pipe(res);

    // Company name - top center, large and bold
    doc.fontSize(24).font('Helvetica-Bold').text('RICHEMONT MONACO', { align: 'center' });
    doc.moveDown(0.8);
    
    // Horizontal line
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.5);
    
    // Customer section - title
    doc.fontSize(12).font('Helvetica-Bold').text('Rechnung an:', { align: 'left' });
    doc.moveDown(0.3);
    
    // Customer details
    doc.fontSize(11).font('Helvetica');
    doc.text(order.customer?.name || '-');
    doc.text(order.customer?.email || '-');
    doc.text(order.customer?.address || '-');
    doc.moveDown(0.8);
    
    // Products section - title
    doc.fontSize(12).font('Helvetica-Bold').text('Produkte:', { align: 'left' });
    doc.moveDown(0.3);
    
    // Products list
    doc.fontSize(11).font('Helvetica');
    if (Array.isArray(order.items) && order.items.length > 0) {
      order.items.forEach((item, index) => {
        const qty = item.quantity || 1;
        const price = Number(item.price || 0);
        doc.text(`${index + 1}. ${item.title || '-'} (${qty}x € ${price.toFixed(2)})`);
      });
    }
    doc.moveDown(1);
    
    // Total
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text(`Gesamtpreis: € ${(order.total || 0).toFixed(2)}`);

    doc.end();
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// GET /api/all - Get all data (Protected for admin)
app.get('/api/all', authenticateToken, requireAdmin, (req, res) => {
  try {
    const products = readJsonFile(productsFile, []);
    const settings = readJsonFile(settingsFile, {});
    const categories = readJsonFile(categoriesFile, []);
    const discounts = readJsonFile(discountsFile, []);
    
    res.json({
      products,
      categories,
      discounts,
      siteTitle: settings.siteTitle || 'Richemont Monaco',
      siteSubtitle: settings.siteSubtitle || 'Designer Clothing',
      maintenance: settings.maintenance || {
        active: false,
        message: 'Wartungsarbeiten. In Kürze sind wir wieder für Sie da.',
        availableAt: ''
      },
      siteContent: settings.siteContent || {
        heroImage: 'Bildschirmfoto 2026-05-04 um 14.08.18.png',
        homepageHeadline: 'Richemont Monaco',
        homepageDescription: 'Premium Herrenmode direkt aus Monaco.',
        announcementText: ''
      },
      invoiceDetails: settings.invoiceDetails || {
        companyName: 'Richemont Monaco',
        address: 'bojuzm 1   24402 esgrus',
        owner: 'Inhaber Alfred von Reichbeerg',
        email: 'info@richemont-monaco.com',
        phone: '+377 99 00 00 00',
        bankName: 'Commerzbank',
        iban: 'DE12 3456 7890 1234 5678 90',
        bic: 'COBADEFFXXX',
        website: 'www.richemont-monaco.com',
        footerText: '© 2026 Richemont Monaco'
      }
    });
  } catch (error) {
    console.error('Error reading data:', error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createProductRedirectPage(detailPage, slug) {
  const target = `product.html?slug=${encodeURIComponent(slug)}`;
  const filePath = path.join(publicWebDir, detailPage);
  const content = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${target}">
  <title>Weiterleitung zum Produkt</title>
  <style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#050505;color:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}a{color:#d7b981;text-decoration:none}</style>
</head>
<body>
  <div>
    <p>Weiterleitung zum Produkt…</p>
    <p><a href="${target}">Falls die Weiterleitung nicht funktioniert, bitte hier klicken.</a></p>
  </div>
</body>
</html>`;
  fs.writeFileSync(filePath, content, 'utf8');
}

function generateProductPages(products) {
  products.forEach((product, index) => {
    const number = String(product.number || index + 1).padStart(2, '0');
    const slug = normalizeSlug(product.slug || product.title || `produkt-${number}`);
    const requestedDetailPage = String(product.detailPage || `produkt${number}.html`).trim();
    const safeDetailPage = path.basename(requestedDetailPage).replace(/[^a-zA-Z0-9._-]/g, '-');
    const detailPage = safeDetailPage || `produkt${number}.html`;

    product.number = number;
    product.slug = slug;
    product.detailPage = detailPage;
    createProductRedirectPage(detailPage, slug);
  });
}

function createMaintenancePage(maintenance) {
  const filePath = path.join(publicWebDir, 'wartung.html');
  const title = 'Wartung';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
  const message = escapeHtml(maintenance?.message || 'Wartungsarbeiten. In Kürze sind wir wieder für Sie da.');
  const availableAt = maintenance?.availableAt
    ? `<p>Wieder erreichbar ab: <strong>${escapeHtml(maintenance.availableAt)}</strong></p>`
    : '';
  const content = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #050505; color: #fff; font-family: 'Inter', sans-serif; text-align: center; }
    .page { padding: 40px; max-width: 760px; }
    h1 { font-size: clamp(2.5rem, 5vw, 4rem); margin-bottom: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; }
    p { color: #ccc; line-height: 1.8; margin: 0.75rem 0; }
    .highlight { color: #d7b98a; }
    .footer { margin-top: 2rem; font-size: 0.85rem; color: #777; }
  </style>
</head>
<body>
  <div class="page">
    <h1>${title}</h1>
    <p class="highlight">${message}</p>
    ${availableAt}
    <p class="footer">Wir arbeiten daran, die Website schnellstmöglich wieder verfügbar zu machen.</p>
  </div>
</body>
</html>`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// POST /api/all - Save all data (Protected)
app.post('/api/all', authenticateToken, requireAdmin, (req, res) => {
  try {
    let { products, categories, discounts, siteTitle, siteSubtitle, maintenance, invoiceDetails } = req.body;

    if (Array.isArray(products)) {
      generateProductPages(products);
      writeJsonFile(productsFile, products);
    }

    if (Array.isArray(categories)) {
      writeJsonFile(categoriesFile, categories);
    }

    if (Array.isArray(discounts)) {
      writeJsonFile(discountsFile, discounts);
    }

    const settings = {
      siteTitle: siteTitle || 'Richemont Monaco',
      siteSubtitle: siteSubtitle || 'Designer Clothing',
      maintenance: {
        active: maintenance?.active === true,
        message: maintenance?.message || 'Wartungsarbeiten. In Kürze sind wir wieder für Sie da.',
        availableAt: maintenance?.availableAt || ''
      },
      siteContent: {
        heroImage: req.body.siteContent?.heroImage || '',
        homepageHeadline: req.body.siteContent?.homepageHeadline || '',
        homepageDescription: req.body.siteContent?.homepageDescription || '',
        announcementText: req.body.siteContent?.announcementText || ''
      },
      invoiceDetails: {
        companyName: invoiceDetails?.companyName || 'Richemont Monaco',
        address: invoiceDetails?.address || 'bojuzm 1   24402 esgrus',
        owner: invoiceDetails?.owner || 'Inhaber Alfred von Reichbeerg',
        email: invoiceDetails?.email || 'info@richemont-monaco.com',
        phone: invoiceDetails?.phone || '+377 99 00 00 00',
        bankName: invoiceDetails?.bankName || 'Commerzbank',
        iban: invoiceDetails?.iban || 'DE12 3456 7890 1234 5678 90',
        bic: invoiceDetails?.bic || 'COBADEFFXXX',
        website: invoiceDetails?.website || 'www.richemont-monaco.com',
        footerText: invoiceDetails?.footerText || '© 2026 Richemont Monaco'
      }
    };
    writeJsonFile(settingsFile, settings);
    createMaintenancePage(settings.maintenance);

    res.json({ success: true, message: 'All data updated successfully' });
  } catch (error) {
    console.error('Error updating data:', error);
    res.status(500).json({ error: 'Failed to update data' });
  }
});

app.post('/api/upload', authenticateToken, requireAdmin, upload.array('images', 12), (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const verifiedFiles = req.files.map(file => {
      const imageExtension = getImageExtension(fs.readFileSync(file.path));
      const declaredExtension = path.extname(file.originalname).toLowerCase();
      const expectedExtension = declaredExtension === '.jpeg' ? '.jpg' : declaredExtension;
      return { file, imageExtension, expectedExtension };
    });
    if (verifiedFiles.some(({ imageExtension, expectedExtension }) => !imageExtension || imageExtension !== expectedExtension)) {
      req.files.forEach(file => fs.unlinkSync(file.path));
      return res.status(400).json({ error: 'The uploaded file content does not match an allowed image format.' });
    }

    const fileNames = verifiedFiles.map(({ file, imageExtension }) => {
      const filename = `${path.basename(file.filename, '.upload')}${imageExtension}`;
      fs.renameSync(file.path, path.join(uploadsDir, filename));
      return filename;
    });
    res.json({ success: true, files: fileNames });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'richemonte/webseite/index.html'));
});

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Admin Console: http://localhost:${PORT}/admin.html`);
  console.log(`✓ Health Check: http://localhost:${PORT}/health`);
});
