import { EventEmitter } from 'events';

/**
 * Shared in-process event bus for real-time sell activity streaming.
 *
 * Usage:
 *   - Emit:     sellEventEmitter.emit('new-sell', { name, action, phone })
 *   - Subscribe: sellEventEmitter.on('new-sell', handler)
 *
 * NOTE: This works perfectly for a single-process deployment.
 * If the app ever scales to multiple Node.js instances (e.g. PM2 cluster mode),
 * replace this with a Redis Pub/Sub channel — `ioredis` is already installed.
 */
const sellEventEmitter = new EventEmitter();

// Raise the listener cap so many concurrent SSE connections don't trigger
// Node's "possible EventEmitter memory leak" warning.
sellEventEmitter.setMaxListeners(200);

export default sellEventEmitter;
