const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User, Company, Group } = require('../models');

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days

// Middleware to verify JWT token and attach user info to request
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    const companyId = decoded.companyId;

    // Fetch user with company and groups populated
    const user = await User.findById(userId)
      .populate('company')
      .populate('groups');

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Attach user to request
    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      company: {
        id: user.company?._id || user.company || null,
        name: user.company?.name || 'Default'
      },
      groups: (user.groups || []).map(g => ({
        id: g._id,
        name: g.name,
        permissions: g.permissions || []
      })),
      // Also include raw groups for permission checking if needed
      _groups: user.groups || []
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ── Register a new company and admin user ─────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { companyName, adminEmail, adminPassword, adminName } = req.body;

    // Basic validation
    if (!companyName || !adminEmail || !adminPassword || !adminName) {
      return res.status(400).json({ error: 'Company name, admin email, password, and name are required' });
    }

    // Check if company already exists
    const existingCompany = await Company.findOne({ name: companyName });
    if (existingCompany) {
      return res.status(400).json({ error: 'Company with this name already exists' });
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Start a session for transaction? We'll do it step by step and handle errors.

    // 1. Create company
    const company = new Company({ name: companyName });
    await company.save();

    // 2. Create admin group with all permissions (we'll define a list of permissions)
    const adminPermissions = [
      '*',
      'user:create', 'user:read', 'user:update', 'user:delete',
      'group:create', 'group:read', 'group:update', 'group:delete',
      'deal:create', 'deal:read', 'deal:update', 'deal:delete',
      'job:create', 'job:read', 'job:update', 'job:delete', 'job:sync',
      'report:read', 'report:generate',
      'task:create', 'task:read', 'task:update', 'task:delete', 'task:assign',
      'finding:read', 'finding:update', 'finding:assign', 'finding:review'
    ];
    const adminGroup = new Group({
      name: 'admin',
      description: 'Administrator group with all permissions',
      permissions: adminPermissions,
      company: company._id
    });
    await adminGroup.save();

    // 3. Create admin user
    const user = new User({
      email: adminEmail.toLowerCase(),
      password: adminPassword,
      name: adminName,
      company: company._id,
      groups: [adminGroup._id] // Assign to admin group
    });
    await user.save();

    // Generate JWT token for the admin user
    const token = jwt.sign(
      { userId: user._id, companyId: company._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return success with token (don't send password)
    res.status(201).json({
      message: 'Company and admin user created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: {
          id: company._id,
          name: company.name
        },
        groups: [{
          id: adminGroup._id,
          name: adminGroup.name,
          permissions: adminGroup.permissions
        }]
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).populate('company').populate('groups');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Validate password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, companyId: user.company._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return user info and token
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: {
          id: user.company._id,
          name: user.company.name
        },
        groups: user.groups.map(g => ({
          id: g._id,
          name: g.name,
          permissions: g.permissions
        }))
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get current user profile ─────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // req.user is already populated by the middleware
    res.json({
      user: req.user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, authenticateToken };