'use strict';
/**
 * Group Management Routes
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

// Helper to ensure user belongs to the same company as the target group
async function checkSameCompany(req, targetGroupId) {
  try {
    const targetGroup = await Group.findById(targetGroupId).select('companyId').lean();
    if (!targetGroup) {
      return { error: 'Group not found', status: 404 };
    }
    if (targetGroup.companyId.toString() !== req.user.company.id) {
      return { error: 'Access denied: group belongs to another company', status: 403 };
    }
    return null; // OK
  } catch (err) {
    return { error: 'Invalid group ID', status: 400 };
  }
}

// ── List groups in the same company ─────────────────────────────────────────────
/**
 * GET /api/groups
 * Query params: page, limit, search
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Check permission for viewing groups
    if (!hasPermission(req.user, 'group:read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view groups' });
    }

    const { page = 0, limit = 10, search = '' } = req.query;
    const filter = { company: req.user.company.id };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [groups, total] = await Promise.all([
      Group.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(page) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Group.countDocuments(filter),
    ]);

    res.json({ groups, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create a new group ─────────────────────────────────────────────────────────
/**
 * POST /api/groups
 * Body: { name, description, permissions: [] }
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check permission for creating groups
    if (!hasPermission(req.user, 'group:create')) {
      return res.status(403).json({ error: 'Insufficient permissions to create groups' });
    }

    const { name, description, permissions = [] } = req.body;

    // Basic validation
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Check if group name already exists in the same company
    const existingGroup = await Group.findOne({ name, company: req.user.company.id });
    if (existingGroup) {
      return res.status(400).json({ error: 'Group with this name already exists in your company' });
    }

    // Create new group
    const group = new Group({
      name,
      description: description || '',
      permissions,
      company: req.user.company.id
    });
    await group.save();

    res.status(201).json({
      message: 'Group created successfully',
      group: {
        id: group._id,
        name: group.name,
        description: group.description,
        permissions: group.permissions
      }
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get a group by ID ─────────────────────────────────────────────────────────
/**
 * GET /api/groups/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Check permission for viewing groups
    if (!hasPermission(req.user, 'group:read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view groups' });
    }

    // Check same company
    const accessError = await checkSameCompany(req, req.params.id);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const group = await Group.findById(req.params.id).lean();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update a group ────────────────────────────────────────────────────────────
/**
 * PATCH /api/groups/:id
 * Body: { name?, description?, permissions?: [] }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    // Check permission for updating groups
    if (!hasPermission(req.user, 'group:update')) {
      return res.status(403).json({ error: 'Insufficient permissions to update groups' });
    }

    // Check same company
    const accessError = await checkSameCompany(req, req.params.id);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const { name, description, permissions } = req.body;
    const updateData = {};

    if (name !== undefined) {
      // Check if group name already exists in the same company (excluding current group)
      const existingGroup = await Group.findOne({
        name,
        company: req.user.company.id,
        _id: { $ne: req.params.id }
      });
      if (existingGroup) {
        return res.status(400).json({ error: 'Group with this name already exists in your company' });
      }
      updateData.name = name;
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    if (permissions !== undefined) {
      updateData.permissions = permissions;
    }

    const group = await Group.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).lean();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({
      message: 'Group updated successfully',
      group: {
        id: group._id,
        name: group.name,
        description: group.description,
        permissions: group.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete a group ────────────────────────────────────────────────────────────
/**
 * DELETE /api/groups/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Check permission for deleting groups
    if (!hasPermission(req.user, 'group:delete')) {
      return res.status(403).json({ error: 'Insufficient permissions to delete groups' });
    }

    // Check same company
    const accessError = await checkSameCompany(req, req.params.id);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;