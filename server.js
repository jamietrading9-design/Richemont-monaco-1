const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'richemont-secret-key-change-in-production';

app.get(['/admin', '/admin/', '/admin.html'], (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'richemonte/webseite/admin.html'));
});

app.get(['/dashboard', '/dashboard.html'], (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'richemonte/webseite/dashboard.html'));
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

app.use(express.static(path.join(__dirname, 'richemonte/webseite')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '-');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use('/uploads', express.static(uploadsDir));

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

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
const categoriesFile = path.join(dataDir, 'categories.json');
const discountsFile = path.join(dataDir, 'discounts.json');

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
      }
    };
    fs.writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));
  }

  if (!fs.existsSync(usersFile)) {
    const defaultUsers = [
      {
        id: 'jamie',
        username: 'jamie',
        password: bcrypt.hashSync('jamielee.1o', 10),
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'alfred',
        username: 'alfred',
        password: bcrypt.hashSync('alfred', 10),
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(usersFile, JSON.stringify(defaultUsers, null, 2));
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

app.get('/api/images', authenticateToken, (req, res) => {
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

    if (!username || !password) {
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

    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
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
      active: true,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    res.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
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

    if (password) users[userIndex].password = bcrypt.hashSync(password, 10);
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

    if (!currentPassword || !newPassword) {
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

    users[userIndex].password = bcrypt.hashSync(newPassword, 10);
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
app.post('/api/products', authenticateToken, (req, res) => {
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
    res.json(settings);
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// POST /api/settings - Update settings (Protected)
app.post('/api/settings', authenticateToken, (req, res) => {
  try {
    const { siteTitle, siteSubtitle } = req.body;
    const settings = {
      siteTitle: siteTitle || 'Richemont Monaco',
      siteSubtitle: siteSubtitle || 'Designer Clothing'
    };
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/all - Get all data (Protected for admin)
app.get('/api/all', authenticateToken, (req, res) => {
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
  const message = maintenance?.message || 'Wartungsarbeiten. In Kürze sind wir wieder für Sie da.';
  const availableAt = maintenance?.availableAt ? `<p>Wieder erreichbar ab: <strong>${maintenance.availableAt}</strong></p>` : '';
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
app.post('/api/all', authenticateToken, (req, res) => {
  try {
    let { products, categories, discounts, siteTitle, siteSubtitle, maintenance } = req.body;

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

app.post('/api/upload', authenticateToken, upload.array('images', 12), (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const fileNames = req.files.map(file => file.filename);
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
  console.log(`✓ Users:`);
  console.log(`  - jamie / jamielee.1o (admin)`);
  console.log(`  - alfred / alfred (admin)`);
});
