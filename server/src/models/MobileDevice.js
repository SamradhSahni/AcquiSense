'use strict';

const mongoose = require('mongoose');

const MobileDeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['android', 'ios'],
    default: 'android',
  },
  appVersion: {
    type: String,
    default: '3.0.0',
  },
  fcmToken: {
    type: String,
    default: null,
  },
  refreshTokenHash: {
    type: String,
    required: true,
    index: true,
  },
  lastIpAddress: {
    type: String,
    default: null,
  },
  wipeRequested: {
    type: Boolean,
    default: false,
  },
  wipeAcknowledgedAt: {
    type: Date,
    default: null,
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

MobileDeviceSchema.index({ tenantId: 1, userId: 1 });

module.exports = mongoose.model('MobileDevice', MobileDeviceSchema);
