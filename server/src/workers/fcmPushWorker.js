'use strict';

const Redis = require('ioredis');
const { MobileDevice } = require('../models');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const STREAM_KEY = 'mobile:push:stream';
const CONSUMER_GROUP = 'fcm-push-workers';
const CONSUMER_ID = `fcm-worker-${process.pid}`;

let redisClient = null;
let publisherClient = null;
let isRunning = false;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  }
  return redisClient;
}

function getPublisherClient() {
  if (!publisherClient) {
    publisherClient = new Redis(REDIS_URL, { lazyConnect: true });
  }
  return publisherClient;
}

/**
 * Publish a push notification event to Redis Stream
 */
async function publishPushNotification(event) {
  try {
    const pub = getPublisherClient();
    if (pub.status === 'wait') await pub.connect();
    const payload = typeof event === 'string' ? event : JSON.stringify(event);
    await pub.xadd(STREAM_KEY, '*', 'event', payload);
  } catch (err) {
    console.error('[FCM Worker] Failed to publish push notification event:', err.message);
  }
}

/**
 * Main FCM Worker Loop
 */
async function startFcmPushWorker() {
  if (isRunning) return;
  isRunning = true;

  const redis = getRedisClient();
  try {
    if (redis.status === 'wait') await redis.connect();

    // Ensure consumer group exists
    try {
      await redis.xgroup('CREATE', STREAM_KEY, CONSUMER_GROUP, '$', 'MKSTREAM');
      console.log(`[FCM Worker] Consumer group "${CONSUMER_GROUP}" initialized on stream "${STREAM_KEY}".`);
    } catch (e) {
      if (!e.message.includes('BUSYGROUP')) {
        console.warn('[FCM Worker] Consumer group init notice:', e.message);
      }
    }

    console.log(`[FCM Worker] Started consumer ${CONSUMER_ID} listening on ${STREAM_KEY}`);

    while (isRunning) {
      try {
        const response = await redis.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          CONSUMER_ID,
          'BLOCK',
          2000,
          'COUNT',
          10,
          'STREAMS',
          STREAM_KEY,
          '>'
        );

        if (!response || !response.length) continue;

        for (const [stream, messages] of response) {
          for (const [msgId, fields] of messages) {
            let event = null;
            try {
              const rawData = fields[1];
              event = JSON.parse(rawData);
            } catch (pErr) {
              console.error('[FCM Worker] JSON parse error on message:', msgId, pErr);
              await redis.xack(STREAM_KEY, CONSUMER_GROUP, msgId);
              continue;
            }

            // Deduplication via Redis NX key
            if (event.idempotencyKey) {
              const dedupKey = `fcm:dedup:${event.idempotencyKey}`;
              const acquired = await redis.set(dedupKey, '1', 'EX', 120, 'NX');
              if (!acquired) {
                console.log(`[FCM Worker] Deduplicated push: ${event.idempotencyKey}`);
                await redis.xack(STREAM_KEY, CONSUMER_GROUP, msgId);
                continue;
              }
            }

            // Find recipient mobile devices
            const devices = await MobileDevice.find({
              userId: event.userId,
              wipeRequested: false,
              fcmToken: { $ne: null },
            }).select('deviceId fcmToken platform').lean();

            if (devices.length > 0) {
              const tokens = devices.map((d) => d.fcmToken).filter(Boolean);
              console.log(
                `[FCM Worker] Multicasting push "${event.type || 'ALERT'}" to ${tokens.length} devices (User: ${event.userId})`
              );
              // In production with FIREBASE_SERVICE_ACCOUNT configured:
              // await admin.messaging().sendEachForMulticast({ tokens, ...payload });
            }

            await redis.xack(STREAM_KEY, CONSUMER_GROUP, msgId);
          }
        }
      } catch (loopErr) {
        if (!isRunning) break;
        console.warn('[FCM Worker] Loop warning:', loopErr.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } catch (err) {
    console.error('[FCM Worker] Fatal error:', err.message);
  }
}

function stopFcmPushWorker() {
  isRunning = false;
  if (redisClient) {
    redisClient.quit().catch(() => {});
    redisClient = null;
  }
  if (publisherClient) {
    publisherClient.quit().catch(() => {});
    publisherClient = null;
  }
}

module.exports = {
  startFcmPushWorker,
  stopFcmPushWorker,
  publishPushNotification,
};
