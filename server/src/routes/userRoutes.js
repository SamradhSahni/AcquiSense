'use strict';
/**
 * User Management Routes
 */
const express = require('express');
const router = express.Router();
const { User, Company, Group } = require('../models');
const { authenticateToken } = require('./authRoutes');

// Helper to check if user has a specific permission from their groups
function hasPermission(user, permission) {
  if (!user || !user.groups) return false;
  return user.groups.some(group =>
    group.permissions && group.permissions.includes(permission)
  );
}

// Helper to ensure user belongs to the same company as the target user
async function checkSameCompany(req, targetUserId) {
  try {
    const targetUser = await User.findById(targetUserId).select('companyId').lean();
    if (!targetUser) {
      return { error: 'User not found', status: 404 };
    }
    if (targetUser.companyId.toString() !== req.user.company.id) {
      return { error: 'Access denied: user belongs to another company', status: 403 };
    }
    return null; // OK
  } catch (err) {
    return { error: 'Invalid user ID', status: 400 };
  }
}

// ── List users in the same company ─────────────────────────────────────────────
/**
 * GET /api/users
 * Query params: page, limit, search
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Check permission for viewing users
    if (!hasPermission(req.user, 'user:read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view users' });
    }

    const { page = 0, limit = 10, search = '' } = req.query;
    const filter = { company: req.user.company.id };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .populate('groups', 'name permissions')
        .sort({ createdAt: -1 })
        .skip(Number(page) * Number(limit))
        .limit(Number(limit))
        .select('-password -__v')
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create a new user ─────────────────────────────────────────────────────────
/**
 * POST /api/users
 * Body: { email, password, name, groupIds: [] }
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check permission for creating users
    if (!hasPermission(req.user, 'user:create')) {
      return res.status(403).json({ error: 'Insufficient permissions to create users' });
    }

    const { email, password, name, groupIds = [] } = req.body;

    // Basic validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if email already exists in the same company
    const existingUser = await User.findOne({ email: email.toLowerCase(), company: req.user.company.id });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists in your company' });
    }

    // Validate groupIds belong to the same company
    if (groupIds.length > 0) {
      const groups = await Group.find({ _id: { $in: groupIds }, company: req.user.company.id }).select('_id');
      if (groups.length !== groupIds.length) {
        return res.status(400).json({ error: 'One or more groups do not belong to your company' });
      }
    }

    // Create new user
    const user = new User({
      email: email.toLowerCase(),
      password,
      name,
      company: req.user.company.id,
      groups: groupIds
    });
    await user.save();

    // Populate groups for response
    await user.populate('groups', 'name permissions');

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        groups: user.groups.map(g => ({
          id: g._id,
          name: g.name,
          permissions: g.permissions
        }))
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get a user by ID ─────────────────────────────────────────────────────────
/**
 * GET /api/users/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Check permission for viewing users
    if (!hasPermission(req.user, 'user:read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view users' });
    }

    // Check same company
    const accessError = await checkSameCompany(req, req.params.id);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const user = await User.findById(req.params.id)
      .populate('groups', 'name permissions')
      .select('-password -__v')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update a user ────────────────────────────────────────────────────────────
/**
 * PATCH /api/users/:id
 * Body: { email?, name?, groupIds?: [] }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    // Check permission for updating users
    if (!hasPermission(req.user, 'user:update')) {
      return res.status(403).json({ error: 'Insufficient permissions to update users' });
    }

    // Check same company
    const accessError = await checkSameCompany(req, req.params.id);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const { email, name, groupIds } = req.body;
    const updateData = {};

    if (email !== undefined) {
      // Check if email already exists in the same company (excluding current user)
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        company: req.user.company.id,
        _id: { $ne: req.params.id }
      });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists in your company' });
      }
      updateData.email = email.toLowerCase();
    }

    if (name !== undefined) {
      updateData.name = name;
    }

    if (groupIds !== undefined) {
      // Validate groupIds belong to the same company
      if (groupIds.length > 0) {
        const groups = await Group.find({ _id: { $in: groupIds }, company: req.user.company.id }).select('_id');
        if (groups.length !== groupIds.length) {
          return res.status(400).json({ error: 'One or more groups do not belong to your company' });
        }
      }
      updateData.groups = groupIds;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    )
    .populate('groups', 'name permissions')
    .select('-password -__v')
    .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        groups: user.groups.map(g => ({
          id: g._id,
          name: g.name,
          permissions: g.permissions
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete a user ────────────────────────────────────────────────────────────
/**
 * DELETE /api/users/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Check permission for deleting users
    if (!hasPermission(req.user, 'user:delete')) {
      return res.status(403).json({ error: 'Insufficient permissions to delete users' });
    }

    // Check same company
    const accessError = await checkSameCompany(req, req.params.id);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;