'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, Company, Group, MobileDevice } = require('../models');
const { publishPushNotification } = require('../workers/fcmPushWorker');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_change_in_production';
const MOBILE_ACCESS_EXPIRY = '15m'; // Short-lived access token for zero-trust posture

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/mobile/login
 * Mobile biometric/credentials initial authentication
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, deviceId, platform, appVersion, fcmToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const effectiveDeviceId = deviceId || crypto.randomUUID();

    const user = await User.findOne({ email: email.toLowerCase() })
      .populate('company')
      .populate('groups');

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const tenantId = user.company?._id || user.company;

    // Issue 15m access token
    const accessToken = jwt.sign(
      {
        userId: user._id,
        sub: user._id.toString(),
        companyId: tenantId,
        tenantId: tenantId.toString(),
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: MOBILE_ACCESS_EXPIRY }
    );

    // Issue high-entropy 256-bit refresh token
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = hashRefreshToken(rawRefreshToken);

    await MobileDevice.findOneAndUpdate(
      { deviceId: effectiveDeviceId },
      {
        $set: {
          userId: user._id,
          tenantId,
          platform: platform === 'ios' ? 'ios' : 'android',
          appVersion: appVersion || '3.0.0',
          fcmToken: fcmToken || null,
          refreshTokenHash,
          lastIpAddress: req.ip || req.connection?.remoteAddress,
          wipeRequested: false,
          wipeAcknowledgedAt: null,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json({
      accessToken,
      refreshToken: rawRefreshToken,
      deviceId: effectiveDeviceId,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        company: user.company ? { id: tenantId, name: user.company.name } : null,
        groups: (user.groups || []).map((g) => ({
          id: g._id,
          name: g.name,
          permissions: g.permissions || [],
        })),
      },
    });
  } catch (err) {
    console.error('[Mobile Login Error]:', err);
    res.status(500).json({ error: 'Mobile authentication failed' });
  }
});

/**
 * POST /api/auth/mobile/register
 * Provision a new firm organization + admin user + mobile device session
 */
router.post('/register', async (req, res) => {
  try {
    const { companyName, adminEmail, adminPassword, adminName, deviceId, platform, appVersion } = req.body;
    if (!companyName || !adminEmail || !adminPassword || !adminName) {
      return res.status(400).json({ error: 'Company name, admin name, email, and password are required.' });
    }

    const existingCompany = await Company.findOne({ name: companyName.trim() });
    if (existingCompany) {
      return res.status(400).json({ error: 'Company with this name already exists.' });
    }

    const existingUser = await User.findOne({ email: adminEmail.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const company = new Company({ name: companyName.trim() });
    await company.save();

    const adminPermissions = [
      '*',
      'user:create', 'user:read', 'user:update', 'user:delete',
      'group:create', 'group:read', 'group:update', 'group:delete',
      'deal:create', 'deal:read', 'deal:update', 'deal:delete',
      'job:create', 'job:read', 'job:update', 'job:delete', 'job:sync',
      'report:read', 'report:generate',
      'task:create', 'task:read', 'task:update', 'task:delete', 'task:assign',
      'finding:read', 'finding:update', 'finding:assign', 'finding:review',
    ];
    const adminGroup = new Group({
      name: 'admin',
      description: 'Administrator group with all permissions',
      permissions: adminPermissions,
      company: company._id,
    });
    await adminGroup.save();

    const user = new User({
      email: adminEmail.toLowerCase().trim(),
      password: adminPassword,
      name: adminName.trim(),
      company: company._id,
      groups: [adminGroup._id],
    });
    await user.save();

    const effectiveDeviceId = deviceId || crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        userId: user._id,
        sub: user._id.toString(),
        companyId: company._id,
        tenantId: company._id.toString(),
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: MOBILE_ACCESS_EXPIRY }
    );

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = hashRefreshToken(rawRefreshToken);

    await MobileDevice.findOneAndUpdate(
      { deviceId: effectiveDeviceId },
      {
        $set: {
          userId: user._id,
          tenantId: company._id,
          platform: platform === 'ios' ? 'ios' : 'android',
          appVersion: appVersion || '3.0.0',
          refreshTokenHash,
          lastIpAddress: req.ip || req.connection?.remoteAddress,
          wipeRequested: false,
          wipeAcknowledgedAt: null,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      accessToken,
      refreshToken: rawRefreshToken,
      deviceId: effectiveDeviceId,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        company: { id: company._id, name: company.name },
        groups: [{ id: adminGroup._id, name: adminGroup.name, permissions: adminGroup.permissions }],
      },
    });
  } catch (err) {
    console.error('[Mobile Register Error]:', err);
    res.status(500).json({ error: 'Mobile registration failed' });
  }
});

/**
 * POST /api/auth/mobile/refresh
 * [BUG-06 & FEAT-01]: Single-Flight Refresh with Remote-Wipe Gate
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, deviceId } = req.body;
    if (!refreshToken || !deviceId) {
      return res.status(400).json({ error: 'Missing refreshToken or deviceId' });
    }

    const incomingHash = hashRefreshToken(refreshToken);
    const device = await MobileDevice.findOne({
      deviceId,
      refreshTokenHash: incomingHash,
    }).populate('userId');

    if (!device) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // [FEAT-01]: Check if administrator triggered Remote MNPI Wipe
    if (device.wipeRequested) {
      return res.status(403).json({
        code: 'REMOTE_WIPE_REQUIRED',
        error: 'Device has been decommissioned or marked for remote wipe.',
      });
    }

    const user = device.userId;
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User is inactive or deleted' });
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const newHash = hashRefreshToken(newRefreshToken);

    device.refreshTokenHash = newHash;
    device.lastSeenAt = new Date();
    device.lastIpAddress = req.ip || req.connection?.remoteAddress;
    await device.save();

    // Issue new 15m access token
    const accessToken = jwt.sign(
      {
        userId: user._id,
        sub: user._id.toString(),
        companyId: device.tenantId,
        tenantId: device.tenantId.toString(),
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: MOBILE_ACCESS_EXPIRY }
    );

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('[Mobile Refresh Error]:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/mobile/ack-wipe
 * Invoked by client after wiping local SQLite and SecureStore
 */
router.post('/ack-wipe', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  await MobileDevice.findOneAndUpdate(
    { deviceId },
    {
      $set: {
        wipeAcknowledgedAt: new Date(),
        refreshTokenHash: `WIPED_${Date.now()}`,
      },
    }
  );

  res.json({ status: 'ACKNOWLEDGED' });
});

/**
 * POST /api/auth/mobile/admin/wipe-device
 * Administrator kill-switch to wipe MNPI on lost/stolen device
 */
router.post('/admin/wipe-device', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const device = await MobileDevice.findOneAndUpdate(
    { deviceId },
    { $set: { wipeRequested: true } },
    { new: true }
  );

  if (!device) return res.status(404).json({ error: 'Device not found' });

  // Publish high-priority silent remote wipe event
  await publishPushNotification({
    type: 'REMOTE_WIPE',
    deviceId,
    userId: device.userId.toString(),
    idempotencyKey: `wipe_${deviceId}_${Date.now()}`,
  });

  res.json({
    status: 'WIPE_SIGNALED',
    deviceId,
    message: 'Remote wipe signaled to FCM stream and marked on device record.',
  });
});

module.exports = router;

