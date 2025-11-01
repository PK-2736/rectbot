const Redis = require('ioredis');
const crypto = require('crypto');

const LOCK_KEY = process.env.LEADER_LOCK_KEY || 'rectbot:leader';
const HB_PREFIX = process.env.HB_PREFIX || 'rectbot:hb:';
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || 90_000);
const RENEW_INTERVAL_MS = Math.max(10_000, Math.floor(LOCK_TTL_MS / 3));
const HB_TTL_SEC = Number(process.env.HB_TTL_SEC || 90);
const HB_INTERVAL_MS = 20_000;

function makeInstanceId() {
  return `${process.env.SITE_ID || 'oci'}:${process.pid}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
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

async function runLeadership({ siteId = 'oci', onAcquire, onRelease }) {
  const instanceId = makeInstanceId();
  const redis = createRedis();
  await redis.connect();
  console.log(`[leader] connected to Redis, instance=${instanceId}, site=${siteId}`);

  let leader = false;
  let renewTimer = null;
  let hbTimer = null;

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

  async function readLock() {
    const v = await redis.get(LOCK_KEY);
    try { return v ? JSON.parse(v) : null; } catch { return { raw: v }; }
  }

  async function renew(value) {
    // renew only if we still own the lock
    const cur = await readLock();
    if (!cur || cur.owner !== JSON.parse(value).owner) return false;
    const ok = await redis.set(LOCK_KEY, value, 'PX', LOCK_TTL_MS, 'XX');
    return ok === 'OK';
  }

  async function release() {
    const cur = await readLock();
    if (cur && cur.owner && String(cur.owner).startsWith(instanceId.split(':').slice(0,2).join(':'))) {
      await redis.del(LOCK_KEY).catch(() => {});
    }
  }

  function startRenewLoop(value) {
    if (renewTimer) clearInterval(renewTimer);
    renewTimer = setInterval(async () => {
      try {
        // Prefer Xserver when its heartbeat is fresh and we are OCI
        if (siteId !== 'xserver') {
          const xhb = await redis.get(`${HB_PREFIX}xserver`);
          if (xhb && Date.now() - Number(xhb) < HB_TTL_SEC * 1000) {
            console.log('[leader] xserver heartbeat is fresh; stepping down to prefer xserver');
            await release();
            if (leader) { leader = false; onRelease && (await onRelease()); }
            return; // next loop will try to reacquire if needed
          }
        }
        const ok = await renew(value);
        if (!ok) {
          console.warn('[leader] lost lock during renew; stepping down');
          if (leader) { leader = false; onRelease && (await onRelease()); }
        }
      } catch (e) {
        console.warn('[leader] renew failed:', e?.message || e);
      }
    }, RENEW_INTERVAL_MS);
  }

  hbTimer = setInterval(writeHeartbeat, HB_INTERVAL_MS);
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
    await new Promise(r => setTimeout(r, 5000));
  }
}

module.exports = { runLeadership };
