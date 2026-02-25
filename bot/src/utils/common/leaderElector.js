const Redis = require('ioredis');
const nodeCrypto = require('crypto');

const LOCK_KEY = process.env.LEADER_LOCK_KEY || 'rectbot:leader';
const HB_PREFIX = process.env.HB_PREFIX || 'rectbot:hb:';
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || 90_000);
const RENEW_INTERVAL_MS = Math.max(10_000, Math.floor(LOCK_TTL_MS / 3));
const HB_TTL_SEC = Number(process.env.HB_TTL_SEC || 90);
const HB_INTERVAL_MS = 20_000;

function makeInstanceId() {
  return `${process.env.SITE_ID || 'oci'}:${process.pid}:${Date.now()}:${nodeCrypto.randomBytes(4).toString('hex')}`;
}

function createRedis() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true
  });
  redis.on('error', (e) => console.error('[leader][redis][error]', e?.message || e));
  return redis;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function readLock(redis) {
  const v = await redis.get(LOCK_KEY);
  try { return v ? JSON.parse(v) : null; } catch { return { raw: v }; }
}

async function shouldStepDownForXserver(redis, siteId) {
  if (siteId === 'xserver') return false;
  const xhb = await redis.get(`${HB_PREFIX}xserver`);
  return !!(xhb && Date.now() - Number(xhb) < HB_TTL_SEC * 1000);
}

async function runLeadership({ siteId = 'oci', onAcquire, onRelease }) {
  const instanceId = makeInstanceId();
  const redis = createRedis();
  await redis.connect();
  console.log(`[leader] connected to Redis, instance=${instanceId}, site=${siteId}`);

  let leader = false;
  let renewTimer = null;

  async function writeHeartbeat() {
    try {
      await redis.set(`${HB_PREFIX}${siteId}`, String(Date.now()), 'EX', HB_TTL_SEC);
    } catch (e) {
      console.warn('[leader] heartbeat failed:', e?.message || e);
    }
  }

  async function acquire() {
    const value = JSON.stringify({ owner: instanceId, site: siteId, ts: Date.now() });
    const ok = await redis.set(LOCK_KEY, value, 'PX', LOCK_TTL_MS, 'NX');
    return ok === 'OK';
  }

  async function renew(value) {
    const cur = await readLock(redis);
    if (!cur || cur.owner !== JSON.parse(value).owner) return false;
    const ok = await redis.set(LOCK_KEY, value, 'PX', LOCK_TTL_MS, 'XX');
    return ok === 'OK';
  }

  function isOwnedByCurrentInstance(cur, instanceId) {
    if (!cur || !cur.owner) return false;
    const instancePrefix = instanceId.split(':').slice(0, 2).join(':');
    return String(cur.owner).startsWith(instancePrefix);
  }

  async function release() {
    const cur = await readLock(redis);
    if (isOwnedByCurrentInstance(cur, instanceId)) {
      await redis.del(LOCK_KEY).catch(() => {});
    }
  }

  async function stepDown(reason) {
    console.log(reason);
    await release();
    if (leader) {
      leader = false;
      onRelease && (await onRelease());
    }
  }

  function startRenewLoop(value) {
    if (renewTimer) clearInterval(renewTimer);
    renewTimer = setInterval(async () => {
      try {
        if (await shouldStepDownForXserver(redis, siteId)) {
          await stepDown('[leader] xserver heartbeat is fresh; stepping down to prefer xserver');
          return;
        }
        const ok = await renew(value);
        if (!ok) {
          await stepDown('[leader] lost lock during renew; stepping down');
        }
      } catch (e) {
        console.warn('[leader] renew failed:', e?.message || e);
      }
    }, RENEW_INTERVAL_MS);
  }

  setInterval(writeHeartbeat, HB_INTERVAL_MS);
  await writeHeartbeat();

  // main loop
  while (true) {
    try {
      if (!leader) {
        const value = JSON.stringify({ owner: instanceId, site: siteId, ts: Date.now() });
        const ok = await acquire();
        if (ok) {
          console.log('[leader] acquired');
          leader = true;
          onAcquire && (await onAcquire());
          startRenewLoop(value);
        } else {
          // not acquired; if site is xserver and current holder is oci but stale, wait; else sleep
          // lenient backoff
        }
      }
    } catch (e) {
      console.warn('[leader] loop error:', e?.message || e);
    }
    await sleep(5000);
  }
}

module.exports = { runLeadership };
