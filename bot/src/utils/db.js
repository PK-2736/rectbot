// db.js — Redis とバックエンド連携ユーティリティ（クリーン版）

// db.js — Redis とバックエンド連携ユーティリティ（完全クリーン）
// Wrapper that delegates to the single clean implementation.
module.exports = require('./db.__fixed');

const config = require('../config');
const Redis = require('ioredis');
const EventEmitter = require('events');
const { createClient } = require('@supabase/supabase-js');

const dbEvents = new EventEmitter();
let lastCleanup = { lastRun: null, deletedRecruitCount: 0, deletedParticipantCount: 0, error: null };

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
});

const RECRUIT_TTL_SECONDS = Number(process.env.REDIS_RECRUIT_TTL_SECONDS || 8 * 60 * 60);

async function saveGuildSettingsToRedis(guildId, settings) {
    const key = `guildsettings:${guildId}`;
    let current = await getGuildSettingsFromRedis(guildId);
    if (!current) current = {};
    const merged = { ...current, ...settings };
    // db.js wrapper — load the cleaned single-definition implementation
    module.exports = require('./db.__fixed');
    module.exports = require('./db.__fixed');

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
});

const RECRUIT_TTL_SECONDS = Number(process.env.REDIS_RECRUIT_TTL_SECONDS || 8 * 60 * 60);

async function saveGuildSettingsToRedis(guildId, settings) {
    const key = `guildsettings:${guildId}`;
    let current = await getGuildSettingsFromRedis(guildId);
    if (!current) current = {};
    const merged = { ...current, ...settings };
    // db.js wrapper — load the cleaned single-definition implementation
    module.exports = require('./db.__fixed');
        }

        async function updateRecruitmentData(messageId, recruitData) {
            const updateData = { title: recruitData.title || null, content: recruitData.content, participants_count: parseInt(recruitData.participants), start_game_time: recruitData.startTime, vc: recruitData.vc, note: recruitData.note || null };
            const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
            const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
            if (!res.ok) {
                const errorText = await res.text();
                if (res.status === 404) { return { warning: 'Recruitment data not found' }; }
                throw new Error(`API error: ${res.status} - ${errorText}`);
            }
            return await res.json();
        }

        async function getActiveRecruits() { const res = await fetch(`${config.BACKEND_API_URL}/api/active-recruits`); return await res.json(); }

        // Lightweight wrapper: load the fixed single-definition implementation
        module.exports = require('./db.__fixed');
// we scan for keys and ensure any keys without values are removed.
async function cleanupExpiredRecruits() {
    const result = { deletedRecruitCount: 0, deletedParticipantCount: 0, timestamp: new Date().toISOString(), error: null };
    try {
        // Find all recruit keys
        const recruitKeys = await listRecruitIdsFromRedis();
        for (const key of recruitKeys) {
            const ttl = await redis.ttl(key);
            // ttl === -2 means key does not exist, -1 means no expire
            if (ttl === -2) {
                continue;
            }
            if (ttl === -1) {
                await redis.expire(key, RECRUIT_TTL_SECONDS);
                continue;
            }
            if (ttl <= 0) {
                await redis.del(key);
                result.deletedRecruitCount += 1;
                // emit per-recruit deletion with id derived from key
                try { const rid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('recruitDeleted', { recruitId: rid, key, timestamp: new Date().toISOString() }); } catch (e) {}
            }
        }

        // Participants keys
        const participantKeys = await redis.keys('participants:*');
        for (const key of participantKeys) {
            const ttl = await redis.ttl(key);
            if (ttl === -2) continue;
            if (ttl === -1) {
                await redis.expire(key, RECRUIT_TTL_SECONDS);
                continue;
            }
            if (ttl <= 0) {
                await redis.del(key);
                result.deletedParticipantCount += 1;
                try { const mid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('participantsDeleted', { messageId: mid, key, timestamp: new Date().toISOString() }); } catch (e) {}
            }
        }
        console.log('[db.js] cleanupExpiredRecruits: completed', result);
        lastCleanup = { lastRun: result.timestamp, deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: null };
        try { dbEvents.emit('cleanup', lastCleanup); } catch (e) {}
        return result;
    } catch (e) {
        console.warn('[db.js] cleanupExpiredRecruits failed:', e?.message || e);
        lastCleanup = { lastRun: new Date().toISOString(), deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: e?.message || String(e) };
        try { dbEvents.emit('cleanup', lastCleanup); } catch (e2) {}
        return { ...result, error: e?.message || String(e) };
    }
}

// Run one-time cleanup at startup (non-blocking)
cleanupExpiredRecruits().catch(() => {});

// Periodic cleanup runner: run every hour by default
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 1000 * 60 * 60);
setInterval(() => {
    cleanupExpiredRecruits().catch(e => console.warn('periodic cleanup failed:', e?.message || e));
}, CLEANUP_INTERVAL_MS);

// Allow manual trigger
async function runCleanupNow() {
    return await cleanupExpiredRecruits();
}

function getLastCleanupStatus() {
    return lastCleanup;
}

// Worker APIにデータをpushする汎用関数
async function pushRecruitToWebAPI(recruitData) {
    const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment`;
    try {
        const payload = JSON.stringify(recruitData);
        console.log('[pushRecruitToWebAPI] POST', url);
        console.log('[pushRecruitToWebAPI] payload sample:', Object.keys(recruitData).slice(0,10));
        // send
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        const status = res.status;
        const ok = res.ok;
        let text = '';
        try { text = await res.text(); } catch (e) { text = ''; }
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }

        console.log(`[pushRecruitToWebAPI] response status=${status}, ok=${ok}`);
        console.log('[pushRecruitToWebAPI] response body:', typeof body === 'string' ? body.slice(0,200) : body);

        if (!ok) {
            // 404 は警告扱いで呼び出し側に状況を返す
            return { ok: false, status, body };
        }
        return { ok: true, status, body };
    } catch (err) {
        console.error('pushRecruitToWebAPI error:', err?.message || err);
        return { ok: false, status: null, error: err?.message || String(err) };
    }
}

// --- Supabase/BackendAPI経由の募集データ保存・取得・削除・更新 ---
const { createClient } = require('@supabase/supabase-js');
// Lazy supabase client: create only when needed to avoid throwing at module load time
let _supabaseClient = null;
function getSupabase() {
    if (_supabaseClient) return _supabaseClient;
    try {
        if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('getSupabase: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
            return null;
        }
        _supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
        return _supabaseClient;
    } catch (e) {
        console.warn('getSupabase: failed to create client', e?.message || e);
        return null;
    }
}

// 募集状況を保存
async function saveRecruitStatus(serverId, channelId, messageId, startTime) {
    const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, channelId, messageId, startTime })
    });
    return res.json();
}

// 新しい募集データをAPIに保存
async function saveRecruitmentData(guildId, channelId, messageId, guildName, channelName, recruitData) {
    // recruitIdがなければ自動付与
    const recruitId = recruitData.recruitId || String(messageId).slice(-8);
    const data = {
        guild_id: guildId,
        channel_id: channelId,
        message_id: messageId,
        guild_name: guildName,
        channel_name: channelName,
        status: 'recruiting',
        start_time: new Date().toISOString(),
        content: recruitData.content,
        participants_count: parseInt(recruitData.participants),
        start_game_time: recruitData.startTime,
        vc: recruitData.vc,
        note: recruitData.note,
        recruiterId: recruitData.recruiterId, // 募集主IDを追加
        recruitId // 必ずrecruitIdを保存
    };

    try {
        const res = await fetch(`${config.BACKEND_API_URL}/api/recruitment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        console.error('募集データの保存に失敗:', error);
        throw error;
    }
}

// 募集状況を削除
async function deleteRecruitStatus(serverId) {
    const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status?serverId=${serverId}`, {
        method: 'DELETE'
    });
    return res.json();
}

// 管理ページ用の募集データを削除
async function deleteRecruitmentData(messageId) {
    try {
        const res = await fetch(`${config.BACKEND_API_URL}/api/recruitment/${messageId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const status = res.status;
        let body = null;
        try { body = await res.json(); } catch (_) { body = await res.text().catch(()=>null); }

        if (!res.ok) {
            // 404 は警告扱いで処理を続行できるように結果を返す
            if (status === 404) {
                console.warn(`deleteRecruitmentData: Recruitment not found (404) for messageId=${messageId}`);
                return { ok: false, status, body, warning: 'Recruitment not found' };
            }
            // 5xx やその他のエラーは詳細を返し、呼び出し元が処理できるようにする
            console.error('deleteRecruitmentData: API error', { status, body });
            return { ok: false, status, body, error: typeof body === 'string' ? body : (body && body.error) || JSON.stringify(body) };
        }

        return { ok: true, status, body: body || null };
    } catch (error) {
        console.error('募集データの削除に失敗:', error);
        // ネットワーク等の致命的なエラーは呼び出し元が処理できるよう詳細を返す
        return { ok: false, error: error?.message || String(error) };
    }
}

// 管理ページ用の募集データのステータスを更新
async function updateRecruitmentStatus(messageId, status, endTime = null) {
    try {
        console.log(`[updateRecruitmentStatus] 開始: messageId=${messageId}, status=${status}, endTime=${endTime}`);
        console.log(`[updateRecruitmentStatus] Backend URL: ${config.BACKEND_API_URL}`);

        const updateData = { 
            status: status,
            ...(endTime && { end_time: endTime })
        };
        
        console.log(`[updateRecruitmentStatus] 送信データ:`, updateData);
        
        const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
        console.log(`[updateRecruitmentStatus] リクエストURL: ${url}`);
        
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        console.log(`[updateRecruitmentStatus] レスポンス: status=${res.status}, ok=${res.ok}`);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[updateRecruitmentStatus] APIエラー詳細: ${errorText}`);
            
            // 404エラーの場合は警告レベルで処理を続行（募集データが見つからない場合）
            if (res.status === 404) {
                console.warn(`[updateRecruitmentStatus] 募集データが見つかりません（messageId: ${messageId}）- 処理を続行します`);
                return { warning: "Recruitment data not found", messageId };
            }
            
            throw new Error(`API error: ${res.status} - ${errorText}`);
        }
        
        const result = await res.json();
        console.log(`[updateRecruitmentStatus] 成功:`, result);
        return result;
    } catch (error) {
        console.error('[updateRecruitmentStatus] 募集ステータスの更新に失敗:', error);
        console.error('[updateRecruitmentStatus] エラーの詳細:', error.stack);
        
        // 404エラーの場合は例外を再発生させない
        if (error.message && error.message.includes('404')) {
            console.warn(`[updateRecruitmentStatus] 募集データが見つからないため処理をスキップします`);
            return { warning: "Recruitment data not found" };
        }
        
        throw error;
    }
}

// 募集データの内容を更新
async function updateRecruitmentData(messageId, recruitData) {
    try {
        console.log(`[updateRecruitmentData] 開始: messageId=${messageId}`);
        console.log(`[updateRecruitmentData] リクエストデータ:`, recruitData);
        
        const updateData = {
            title: recruitData.title || null,
            content: recruitData.content,
            participants_count: parseInt(recruitData.participants),
            start_game_time: recruitData.startTime,
            vc: recruitData.vc,
            note: recruitData.note || null
        };
        
        console.log(`[updateRecruitmentData] 送信データ:`, updateData);
        
        const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
        console.log(`[updateRecruitmentData] リクエストURL: ${url}`);
        
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        console.log(`[updateRecruitmentData] レスポンス: status=${res.status}, ok=${res.ok}`);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[updateRecruitmentData] APIエラー詳細: ${errorText}`);
            
            // 404エラーの場合は特別な処理
            if (res.status === 404) {
                console.warn(`[updateRecruitmentData] 募集データがデータベースに見つかりません。メッセージID: ${messageId}`);
                console.warn(`[updateRecruitmentData] これは正常な場合があります（メモリ上の募集など）`);
            }
            
            throw new Error(`API error: ${res.status} - ${errorText}`);
        }
        
        const result = await res.json();
        console.log(`[updateRecruitmentData] 成功:`, result);
        return result;
    } catch (error) {
        console.error('[updateRecruitmentData] 募集データの更新に失敗:', error);
        console.error('[updateRecruitmentData] エラーの詳細:', error.stack);
        throw error;
    }
}

// 現在の募集状況一覧を取得
async function getActiveRecruits() {
    const res = await fetch(`${config.BACKEND_API_URL}/api/active-recruits`);
    const json = await res.json();
    console.log('[db.js/getActiveRecruits] APIレスポンス:', JSON.stringify(json));
    return json;
}

module.exports = {
    getSupabase,
    saveRecruitStatus,
    deleteRecruitStatus,
    getActiveRecruits,
    saveRecruitmentData,
    deleteRecruitmentData,
    updateRecruitmentStatus,
    updateRecruitmentData,
    saveRecruitToRedis,
    getRecruitFromRedis,
    listRecruitIdsFromRedis,
    listRecruitsFromRedis,
    deleteRecruitFromRedis,
    pushRecruitToWebAPI,
    saveGuildSettingsToRedis,
    getGuildSettingsFromRedis,
    finalizeGuildSettings,
    getGuildSettings: getGuildSettingsFromRedis,
    // 参加者リスト永続化
    saveParticipantsToRedis,
    getParticipantsFromRedis,
    deleteParticipantsFromRedis,
    // TTL / cleanup utilities
    RECRUIT_TTL_SECONDS,
    cleanupExpiredRecruits
    ,
    dbEvents,
    runCleanupNow,
    getLastCleanupStatus
};
// Use the cleaned single-definition version
// --- ギルド設定 Redis一時保存・取得 ---
// ギルド設定をRedisに一時保存
async function saveGuildSettingsToRedis(guildId, settings) {
    const key = `guildsettings:${guildId}`;
    // 既存設定を取得してマージ
    let current = await getGuildSettingsFromRedis(guildId);
    if (!current) current = {};
    const merged = { ...current, ...settings };
    await redis.set(key, JSON.stringify(merged));
    return merged;
}

// ギルド設定をRedisから取得
async function getGuildSettingsFromRedis(guildId) {
    const key = `guildsettings:${guildId}`;
    const val = await redis.get(key);
    return val ? JSON.parse(val) : {};
}

// finalizeGuildSettings: RedisからSupabase/BackendAPIに保存
async function finalizeGuildSettings(guildId) {
    const settings = await getGuildSettingsFromRedis(guildId);
    // ここでSupabase/BackendAPIに保存するAPIを呼び出す
    // 例: /api/guild-settings/finalize
    const config = require('../config');
    const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/guild-settings/finalize`;
    // Build payload but exclude null/undefined values to avoid overwriting existing DB values with null
    const payload = { guildId };
    const allowedKeys = ['update_channel', 'recruit_channel', 'defaultColor', 'notification_role', 'defaultTitle'];
    for (const k of allowedKeys) {
        if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
            const v = settings[k];
            if (v !== undefined && v !== null) payload[k] = v;
        }
    }
    try {
        console.log('[finalizeGuildSettings] POST', url);
        console.log('[finalizeGuildSettings] payload sample:', Object.keys(payload));
        try {
            console.log('[finalizeGuildSettings] payload json:', JSON.stringify(payload));
        } catch (e) {
            console.log('[finalizeGuildSettings] payload json: <unable to stringify>');
        }

        const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
        const headers = { 'Content-Type': 'application/json' };
        if (svc) headers['Authorization'] = `Bearer ${svc}`;
        console.log('[finalizeGuildSettings] svc present=', !!svc);
        console.log('[finalizeGuildSettings] headers keys=', Object.keys(headers));

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        let text = '';
        try { text = await res.text(); } catch (e) { text = ''; }
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }

        console.log(`[finalizeGuildSettings] response status=${res.status}, ok=${res.ok}`);
        console.log('[finalizeGuildSettings] response body:', typeof body === 'string' ? body.slice(0,200) : body);

        if (!res.ok) {
            throw new Error(`API error: ${res.status} - ${text}`);
        }

        return body;
    } catch (err) {
        console.error('[finalizeGuildSettings] failed:', err?.message || err);
        throw err;
    }
}



const config = require('../config');
const Redis = require('ioredis');
const EventEmitter = require('events');

// Event emitter for cleanup / delete notifications
const dbEvents = new EventEmitter();

// Cleanup status tracking
let lastCleanup = {
    lastRun: null,
    deletedRecruitCount: 0,
    deletedParticipantCount: 0,
    error: null
};

// Redisクライアント初期化
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0
});

// TTL for recruit and participants keys (seconds). Default: 8 hours
const RECRUIT_TTL_SECONDS = Number(process.env.REDIS_RECRUIT_TTL_SECONDS || 8 * 60 * 60);

// 募集データをRedisに保存（TTLを設定）
async function saveRecruitToRedis(recruitId, data) {
    const key = `recruit:${recruitId}`;
    const value = JSON.stringify(data);
    // EX オプションで TTL を設定（秒）
    await redis.set(key, value, 'EX', RECRUIT_TTL_SECONDS);
}

// 募集データをRedisから取得
async function getRecruitFromRedis(recruitId) {
    const val = await redis.get(`recruit:${recruitId}`);
    return val ? JSON.parse(val) : null;
}

// Redisから全募集データのID一覧を取得
async function listRecruitIdsFromRedis() {
    return await redis.keys('recruit:*');
}

// Redisから募集データを全件取得
async function listRecruitsFromRedis() {
    const keys = await listRecruitIdsFromRedis();
    if (keys.length === 0) return [];
    const vals = await redis.mget(keys);
    return vals.map(v => v ? JSON.parse(v) : null).filter(Boolean);
}

// Redisから募集データを削除
async function deleteRecruitFromRedis(recruitId) {
    await redis.del(`recruit:${recruitId}`);
    try {
        dbEvents.emit('recruitDeleted', { recruitId, timestamp: new Date().toISOString() });
    } catch (e) { /* emit best-effort */ }
}

// 参加者リストをRedisに保存（TTLを設定）
async function saveParticipantsToRedis(messageId, participants) {
    const key = `participants:${messageId}`;
    const value = JSON.stringify(participants);
    // 参加者リストも募集と同じ TTL を付与
    await redis.set(key, value, 'EX', RECRUIT_TTL_SECONDS);
}

// 参加者リストをRedisから取得
async function getParticipantsFromRedis(messageId) {
    const val = await redis.get(`participants:${messageId}`);
    return val ? JSON.parse(val) : [];
}

// 参加者リストをRedisから削除
async function deleteParticipantsFromRedis(messageId) {
    await redis.del(`participants:${messageId}`);
    try {
        dbEvents.emit('participantsDeleted', { messageId, timestamp: new Date().toISOString() });
    } catch (e) { }
}

// Cleanup: remove recruit and participant keys that are expired or stale.
// Note: Redis will usually evict expired keys automatically, but for safety
// we scan for keys and ensure any keys without values are removed.
async function cleanupExpiredRecruits() {
    const result = { deletedRecruitCount: 0, deletedParticipantCount: 0, timestamp: new Date().toISOString(), error: null };
    try {
        // Find all recruit keys
        const recruitKeys = await listRecruitIdsFromRedis();
        for (const key of recruitKeys) {
            const ttl = await redis.ttl(key);
            // ttl === -2 means key does not exist, -1 means no expire
            if (ttl === -2) {
                continue;
            }
            if (ttl === -1) {
                await redis.expire(key, RECRUIT_TTL_SECONDS);
                continue;
            }
            if (ttl <= 0) {
                await redis.del(key);
                result.deletedRecruitCount += 1;
                // emit per-recruit deletion with id derived from key
                try { const rid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('recruitDeleted', { recruitId: rid, key, timestamp: new Date().toISOString() }); } catch (e) {}
            }
        }

        // Participants keys
        const participantKeys = await redis.keys('participants:*');
        for (const key of participantKeys) {
            const ttl = await redis.ttl(key);
            if (ttl === -2) continue;
            if (ttl === -1) {
                await redis.expire(key, RECRUIT_TTL_SECONDS);
                continue;
            }
            if (ttl <= 0) {
                await redis.del(key);
                result.deletedParticipantCount += 1;
                try { const mid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('participantsDeleted', { messageId: mid, key, timestamp: new Date().toISOString() }); } catch (e) {}
            }
        }
        console.log('[db.js] cleanupExpiredRecruits: completed', result);
        lastCleanup = { lastRun: result.timestamp, deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: null };
        try { dbEvents.emit('cleanup', lastCleanup); } catch (e) {}
        return result;
    } catch (e) {
        console.warn('[db.js] cleanupExpiredRecruits failed:', e?.message || e);
        lastCleanup = { lastRun: new Date().toISOString(), deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: e?.message || String(e) };
        try { dbEvents.emit('cleanup', lastCleanup); } catch (e2) {}
        return { ...result, error: e?.message || String(e) };
    }
}

// Run one-time cleanup at startup (non-blocking)
cleanupExpiredRecruits().catch(() => {});

// Periodic cleanup runner: run every hour by default
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 1000 * 60 * 60);
setInterval(() => {
    cleanupExpiredRecruits().catch(e => console.warn('periodic cleanup failed:', e?.message || e));
}, CLEANUP_INTERVAL_MS);

// Allow manual trigger
async function runCleanupNow() {
    return await cleanupExpiredRecruits();
}

function getLastCleanupStatus() {
    return lastCleanup;
}

// Worker APIにデータをpushする汎用関数
async function pushRecruitToWebAPI(recruitData) {
    const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment`;
    try {
        const payload = JSON.stringify(recruitData);
        console.log('[pushRecruitToWebAPI] POST', url);
        console.log('[pushRecruitToWebAPI] payload sample:', Object.keys(recruitData).slice(0,10));
        // send
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        const status = res.status;
        const ok = res.ok;
        let text = '';
        try { text = await res.text(); } catch (e) { text = ''; }
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }

        console.log(`[pushRecruitToWebAPI] response status=${status}, ok=${ok}`);
        console.log('[pushRecruitToWebAPI] response body:', typeof body === 'string' ? body.slice(0,200) : body);

        if (!ok) {
            // 404 は警告扱いで呼び出し側に状況を返す
            return { ok: false, status, body };
        }
        return { ok: true, status, body };
    } catch (err) {
        console.error('pushRecruitToWebAPI error:', err?.message || err);
        return { ok: false, status: null, error: err?.message || String(err) };
    }
}

// --- Supabase/BackendAPI経由の募集データ保存・取得・削除・更新 ---
const { createClient } = require('@supabase/supabase-js');
// Lazy supabase client: create only when needed to avoid throwing at module load time
let _supabaseClient = null;
function getSupabase() {
    if (_supabaseClient) return _supabaseClient;
    try {
        if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('getSupabase: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
            return null;
        }
        _supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
        return _supabaseClient;
    } catch (e) {
        console.warn('getSupabase: failed to create client', e?.message || e);
        return null;
    }
}

// 募集状況を保存
async function saveRecruitStatus(serverId, channelId, messageId, startTime) {
    const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, channelId, messageId, startTime })
    });
    return res.json();
}

// 新しい募集データをAPIに保存
async function saveRecruitmentData(guildId, channelId, messageId, guildName, channelName, recruitData) {
    // recruitIdがなければ自動付与
    const recruitId = recruitData.recruitId || String(messageId).slice(-8);
    const data = {
        guild_id: guildId,
        channel_id: channelId,
        message_id: messageId,
        guild_name: guildName,
        channel_name: channelName,
        status: 'recruiting',
        start_time: new Date().toISOString(),
        content: recruitData.content,
        participants_count: parseInt(recruitData.participants),
        start_game_time: recruitData.startTime,
        vc: recruitData.vc,
        note: recruitData.note,
        recruiterId: recruitData.recruiterId, // 募集主IDを追加
        recruitId // 必ずrecruitIdを保存
    };

    try {
        const res = await fetch(`${config.BACKEND_API_URL}/api/recruitment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        console.error('募集データの保存に失敗:', error);
        throw error;
    }
}

// 募集状況を削除
async function deleteRecruitStatus(serverId) {
    const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status?serverId=${serverId}`, {
        method: 'DELETE'
    });
    return res.json();
}

// 管理ページ用の募集データを削除
async function deleteRecruitmentData(messageId) {
    try {
        const res = await fetch(`${config.BACKEND_API_URL}/api/recruitment/${messageId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const status = res.status;
        let body = null;
        try { body = await res.json(); } catch (_) { body = await res.text().catch(()=>null); }

        if (!res.ok) {
            // 404 は警告扱いで処理を続行できるように結果を返す
            if (status === 404) {
                console.warn(`deleteRecruitmentData: Recruitment not found (404) for messageId=${messageId}`);
                return { ok: false, status, body, warning: 'Recruitment not found' };
            }
            // 5xx やその他のエラーは詳細を返し、呼び出し元が処理できるようにする
            console.error('deleteRecruitmentData: API error', { status, body });
            return { ok: false, status, body, error: typeof body === 'string' ? body : (body && body.error) || JSON.stringify(body) };
        }

        return { ok: true, status, body: body || null };
    } catch (error) {
        console.error('募集データの削除に失敗:', error);
        // ネットワーク等の致命的なエラーは呼び出し元が処理できるよう詳細を返す
        return { ok: false, error: error?.message || String(error) };
    }
}

// 管理ページ用の募集データのステータスを更新
async function updateRecruitmentStatus(messageId, status, endTime = null) {
    try {
        console.log(`[updateRecruitmentStatus] 開始: messageId=${messageId}, status=${status}, endTime=${endTime}`);
        console.log(`[updateRecruitmentStatus] Backend URL: ${config.BACKEND_API_URL}`);

        const updateData = { 
            status: status,
            ...(endTime && { end_time: endTime })
        };
        
        console.log(`[updateRecruitmentStatus] 送信データ:`, updateData);
        
        const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
        console.log(`[updateRecruitmentStatus] リクエストURL: ${url}`);
        
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        console.log(`[updateRecruitmentStatus] レスポンス: status=${res.status}, ok=${res.ok}`);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[updateRecruitmentStatus] APIエラー詳細: ${errorText}`);
            
            // 404エラーの場合は警告レベルで処理を続行（募集データが見つからない場合）
            if (res.status === 404) {
                console.warn(`[updateRecruitmentStatus] 募集データが見つかりません（messageId: ${messageId}）- 処理を続行します`);
                return { warning: "Recruitment data not found", messageId };
            }
            
            throw new Error(`API error: ${res.status} - ${errorText}`);
        }
        
        const result = await res.json();
        console.log(`[updateRecruitmentStatus] 成功:`, result);
        return result;
    } catch (error) {
        console.error('[updateRecruitmentStatus] 募集ステータスの更新に失敗:', error);
        console.error('[updateRecruitmentStatus] エラーの詳細:', error.stack);
        
        // 404エラーの場合は例外を再発生させない
        if (error.message && error.message.includes('404')) {
            console.warn(`[updateRecruitmentStatus] 募集データが見つからないため処理をスキップします`);
            return { warning: "Recruitment data not found" };
        }
        
        throw error;
    }
}

// 募集データの内容を更新
async function updateRecruitmentData(messageId, recruitData) {
    try {
        console.log(`[updateRecruitmentData] 開始: messageId=${messageId}`);
        console.log(`[updateRecruitmentData] リクエストデータ:`, recruitData);
        
        const updateData = {
            title: recruitData.title || null,
            content: recruitData.content,
            participants_count: parseInt(recruitData.participants),
            start_game_time: recruitData.startTime,
            vc: recruitData.vc,
            note: recruitData.note || null
        };
        
        console.log(`[updateRecruitmentData] 送信データ:`, updateData);
        
        const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
        console.log(`[updateRecruitmentData] リクエストURL: ${url}`);
        
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        console.log(`[updateRecruitmentData] レスポンス: status=${res.status}, ok=${res.ok}`);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[updateRecruitmentData] APIエラー詳細: ${errorText}`);
            
            // 404エラーの場合は特別な処理
            if (res.status === 404) {
                console.warn(`[updateRecruitmentData] 募集データがデータベースに見つかりません。メッセージID: ${messageId}`);
                console.warn(`[updateRecruitmentData] これは正常な場合があります（メモリ上の募集など）`);
            }
            
            throw new Error(`API error: ${res.status} - ${errorText}`);
        }
        
        const result = await res.json();
        console.log(`[updateRecruitmentData] 成功:`, result);
        return result;
    } catch (error) {
        console.error('[updateRecruitmentData] 募集データの更新に失敗:', error);
        console.error('[updateRecruitmentData] エラーの詳細:', error.stack);
        throw error;
    }
}

// 現在の募集状況一覧を取得
async function getActiveRecruits() {
    const res = await fetch(`${config.BACKEND_API_URL}/api/active-recruits`);
    const json = await res.json();
    console.log('[db.js/getActiveRecruits] APIレスポンス:', JSON.stringify(json));
    return json;
}

module.exports = {
    getSupabase,
    saveRecruitStatus,
    deleteRecruitStatus,
    getActiveRecruits,
    saveRecruitmentData,
    deleteRecruitmentData,
    updateRecruitmentStatus,
    updateRecruitmentData,
    saveRecruitToRedis,
    getRecruitFromRedis,
    listRecruitIdsFromRedis,
    listRecruitsFromRedis,
    deleteRecruitFromRedis,
    pushRecruitToWebAPI,
    saveGuildSettingsToRedis,
    getGuildSettingsFromRedis,
    finalizeGuildSettings,
    getGuildSettings: getGuildSettingsFromRedis,
    // 参加者リスト永続化
    saveParticipantsToRedis,
    getParticipantsFromRedis,
    deleteParticipantsFromRedis,
    // TTL / cleanup utilities
    RECRUIT_TTL_SECONDS,
    cleanupExpiredRecruits
    ,
    dbEvents,
    runCleanupNow,
    getLastCleanupStatus
};
// --- ギルド設定 Redis一時保存・取得 ---
// ギルド設定をRedisに一時保存
async function saveGuildSettingsToRedis(guildId, settings) {
	const key = `guildsettings:${guildId}`;
	// 既存設定を取得してマージ
	let current = await getGuildSettingsFromRedis(guildId);
	if (!current) current = {};
	const merged = { ...current, ...settings };
	await redis.set(key, JSON.stringify(merged));
	return merged;
}

// ギルド設定をRedisから取得
async function getGuildSettingsFromRedis(guildId) {
	const key = `guildsettings:${guildId}`;
	const val = await redis.get(key);
	return val ? JSON.parse(val) : {};
}

// finalizeGuildSettings: RedisからSupabase/BackendAPIに保存
async function finalizeGuildSettings(guildId) {
	const settings = await getGuildSettingsFromRedis(guildId);
	// ここでSupabase/BackendAPIに保存するAPIを呼び出す
	// 例: /api/guild-settings/finalize
	const config = require('../config');
		const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/guild-settings/finalize`;
		// Build payload but exclude null/undefined values to avoid overwriting existing DB values with null
		const payload = { guildId };
		const allowedKeys = ['update_channel', 'recruit_channel', 'defaultColor', 'notification_role', 'defaultTitle'];
		for (const k of allowedKeys) {
			if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
				const v = settings[k];
				if (v !== undefined && v !== null) payload[k] = v;
			}
		}
	try {
		console.log('[finalizeGuildSettings] POST', url);
		console.log('[finalizeGuildSettings] payload sample:', Object.keys(payload));
		try {
			console.log('[finalizeGuildSettings] payload json:', JSON.stringify(payload));
		} catch (e) {
			console.log('[finalizeGuildSettings] payload json: <unable to stringify>');
		}

		const svc = process.env.SERVICE_TOKEN || process.env.BACKEND_SERVICE_TOKEN || '';
		const headers = { 'Content-Type': 'application/json' };
		if (svc) headers['Authorization'] = `Bearer ${svc}`;
		console.log('[finalizeGuildSettings] svc present=', !!svc);
		console.log('[finalizeGuildSettings] headers keys=', Object.keys(headers));

		const res = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload)
		});

		let text = '';
		try { text = await res.text(); } catch (e) { text = ''; }
		let body = null;
		try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }

		console.log(`[finalizeGuildSettings] response status=${res.status}, ok=${res.ok}`);
		console.log('[finalizeGuildSettings] response body:', typeof body === 'string' ? body.slice(0,200) : body);

		if (!res.ok) {
			throw new Error(`API error: ${res.status} - ${text}`);
		}

		return body;
	} catch (err) {
		console.error('[finalizeGuildSettings] failed:', err?.message || err);
		throw err;
	}
}



const config = require('../config');
const Redis = require('ioredis');
const EventEmitter = require('events');

// Event emitter for cleanup / delete notifications
const dbEvents = new EventEmitter();

// Cleanup status tracking
let lastCleanup = {
	lastRun: null,
	deletedRecruitCount: 0,
	deletedParticipantCount: 0,
	error: null
};

// Redisクライアント初期化
const redis = new Redis({
	host: process.env.REDIS_HOST || 'localhost',
	port: process.env.REDIS_PORT || 6379,
	password: process.env.REDIS_PASSWORD || undefined,
	db: process.env.REDIS_DB || 0
});

// TTL for recruit and participants keys (seconds). Default: 8 hours
const RECRUIT_TTL_SECONDS = Number(process.env.REDIS_RECRUIT_TTL_SECONDS || 8 * 60 * 60);

// 募集データをRedisに保存（TTLを設定）
async function saveRecruitToRedis(recruitId, data) {
	const key = `recruit:${recruitId}`;
	const value = JSON.stringify(data);
	// EX オプションで TTL を設定（秒）
	await redis.set(key, value, 'EX', RECRUIT_TTL_SECONDS);
}

// 募集データをRedisから取得
async function getRecruitFromRedis(recruitId) {
	const val = await redis.get(`recruit:${recruitId}`);
	return val ? JSON.parse(val) : null;
}

// Redisから全募集データのID一覧を取得
async function listRecruitIdsFromRedis() {
	return await redis.keys('recruit:*');
}

// Redisから募集データを全件取得
async function listRecruitsFromRedis() {
	const keys = await listRecruitIdsFromRedis();
	if (keys.length === 0) return [];
	const vals = await redis.mget(keys);
	return vals.map(v => v ? JSON.parse(v) : null).filter(Boolean);
}

// Redisから募集データを削除
async function deleteRecruitFromRedis(recruitId) {
	await redis.del(`recruit:${recruitId}`);
	try {
		dbEvents.emit('recruitDeleted', { recruitId, timestamp: new Date().toISOString() });
	} catch (e) { /* emit best-effort */ }
}

// 参加者リストをRedisに保存（TTLを設定）
async function saveParticipantsToRedis(messageId, participants) {
	const key = `participants:${messageId}`;
	const value = JSON.stringify(participants);
	// 参加者リストも募集と同じ TTL を付与
	await redis.set(key, value, 'EX', RECRUIT_TTL_SECONDS);
}

// 参加者リストをRedisから取得
async function getParticipantsFromRedis(messageId) {
	const val = await redis.get(`participants:${messageId}`);
	return val ? JSON.parse(val) : [];
}

// 参加者リストをRedisから削除
async function deleteParticipantsFromRedis(messageId) {
	await redis.del(`participants:${messageId}`);
	try {
		dbEvents.emit('participantsDeleted', { messageId, timestamp: new Date().toISOString() });
	} catch (e) { }
}

// Cleanup: remove recruit and participant keys that are expired or stale.
// Note: Redis will usually evict expired keys automatically, but for safety
// we scan for keys and ensure any keys without values are removed.
async function cleanupExpiredRecruits() {
	const result = { deletedRecruitCount: 0, deletedParticipantCount: 0, timestamp: new Date().toISOString(), error: null };
	try {
		// Find all recruit keys
		const recruitKeys = await listRecruitIdsFromRedis();
		for (const key of recruitKeys) {
			const ttl = await redis.ttl(key);
			// ttl === -2 means key does not exist, -1 means no expire
			if (ttl === -2) {
				continue;
			}
			if (ttl === -1) {
				await redis.expire(key, RECRUIT_TTL_SECONDS);
				continue;
			}
			if (ttl <= 0) {
				await redis.del(key);
				result.deletedRecruitCount += 1;
				// emit per-recruit deletion with id derived from key
				try { const rid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('recruitDeleted', { recruitId: rid, key, timestamp: new Date().toISOString() }); } catch (e) {}
			}
		}

		// Participants keys
		const participantKeys = await redis.keys('participants:*');
		for (const key of participantKeys) {
			const ttl = await redis.ttl(key);
			if (ttl === -2) continue;
			if (ttl === -1) {
				await redis.expire(key, RECRUIT_TTL_SECONDS);
				continue;
			}
			if (ttl <= 0) {
				await redis.del(key);
				result.deletedParticipantCount += 1;
				try { const mid = key.includes(':') ? key.split(':')[1] : key; dbEvents.emit('participantsDeleted', { messageId: mid, key, timestamp: new Date().toISOString() }); } catch (e) {}
			}
		}
		console.log('[db.js] cleanupExpiredRecruits: completed', result);
		lastCleanup = { lastRun: result.timestamp, deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: null };
		try { dbEvents.emit('cleanup', lastCleanup); } catch (e) {}
		return result;
	} catch (e) {
		console.warn('[db.js] cleanupExpiredRecruits failed:', e?.message || e);
		lastCleanup = { lastRun: new Date().toISOString(), deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: e?.message || String(e) };
		try { dbEvents.emit('cleanup', lastCleanup); } catch (e2) {}
		return { ...result, error: e?.message || String(e) };
	}
}

// Run one-time cleanup at startup (non-blocking)
cleanupExpiredRecruits().catch(() => {});

// Periodic cleanup runner: run every hour by default
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 1000 * 60 * 60);
setInterval(() => {
	cleanupExpiredRecruits().catch(e => console.warn('periodic cleanup failed:', e?.message || e));
}, CLEANUP_INTERVAL_MS);

// Allow manual trigger
async function runCleanupNow() {
	return await cleanupExpiredRecruits();
}

function getLastCleanupStatus() {
	return lastCleanup;
}

// Worker APIにデータをpushする汎用関数
async function pushRecruitToWebAPI(recruitData) {
	const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment`;
	try {
		const payload = JSON.stringify(recruitData);
		console.log('[pushRecruitToWebAPI] POST', url);
		console.log('[pushRecruitToWebAPI] payload sample:', Object.keys(recruitData).slice(0,10));
		// send
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: payload
		});
		const status = res.status;
		const ok = res.ok;
		let text = '';
		try { text = await res.text(); } catch (e) { text = ''; }
		let body = null;
		try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }

		console.log(`[pushRecruitToWebAPI] response status=${status}, ok=${ok}`);
		console.log('[pushRecruitToWebAPI] response body:', typeof body === 'string' ? body.slice(0,200) : body);

		if (!ok) {
			// 404 は警告扱いで呼び出し側に状況を返す
			return { ok: false, status, body };
		}
		return { ok: true, status, body };
	} catch (err) {
		console.error('pushRecruitToWebAPI error:', err?.message || err);
		return { ok: false, status: null, error: err?.message || String(err) };
	}
}

// --- Supabase/BackendAPI経由の募集データ保存・取得・削除・更新 ---
const { createClient } = require('@supabase/supabase-js');
// Lazy supabase client: create only when needed to avoid throwing at module load time
let _supabaseClient = null;
function getSupabase() {
	if (_supabaseClient) return _supabaseClient;
	try {
		if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
			console.warn('getSupabase: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
			return null;
		}
		_supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
		return _supabaseClient;
	} catch (e) {
		console.warn('getSupabase: failed to create client', e?.message || e);
		return null;
	}
}

// 募集状況を保存
async function saveRecruitStatus(serverId, channelId, messageId, startTime) {
	const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ serverId, channelId, messageId, startTime })
	});
	return res.json();
}

// 新しい募集データをAPIに保存
async function saveRecruitmentData(guildId, channelId, messageId, guildName, channelName, recruitData) {
	// recruitIdがなければ自動付与
	const recruitId = recruitData.recruitId || String(messageId).slice(-8);
	const data = {
		guild_id: guildId,
		channel_id: channelId,
		message_id: messageId,
		guild_name: guildName,
		channel_name: channelName,
		status: 'recruiting',
		start_time: new Date().toISOString(),
		content: recruitData.content,
		participants_count: parseInt(recruitData.participants),
		start_game_time: recruitData.startTime,
		vc: recruitData.vc,
		note: recruitData.note,
		recruiterId: recruitData.recruiterId, // 募集主IDを追加
		recruitId // 必ずrecruitIdを保存
	};

	try {
		const res = await fetch(`${config.BACKEND_API_URL}/api/recruitment`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) {
			throw new Error(`API error: ${res.status}`);
		}
		return await res.json();
	} catch (error) {
		console.error('募集データの保存に失敗:', error);
		throw error;
	}
}

// 募集状況を削除
async function deleteRecruitStatus(serverId) {
	const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status?serverId=${serverId}`, {
		method: 'DELETE'
	});
	return res.json();
}

// 管理ページ用の募集データを削除
async function deleteRecruitmentData(messageId) {
	try {
		const res = await fetch(`${config.BACKEND_API_URL}/api/recruitment/${messageId}`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' }
		});

		const status = res.status;
		let body = null;
		try { body = await res.json(); } catch (_) { body = await res.text().catch(()=>null); }

		if (!res.ok) {
			// 404 は警告扱いで処理を続行できるように結果を返す
			if (status === 404) {
				console.warn(`deleteRecruitmentData: Recruitment not found (404) for messageId=${messageId}`);
				return { ok: false, status, body, warning: 'Recruitment not found' };
			}
			// 5xx やその他のエラーは詳細を返し、呼び出し元が処理できるようにする
			console.error('deleteRecruitmentData: API error', { status, body });
			return { ok: false, status, body, error: typeof body === 'string' ? body : (body && body.error) || JSON.stringify(body) };
		}

		return { ok: true, status, body: body || null };
	} catch (error) {
		console.error('募集データの削除に失敗:', error);
		// ネットワーク等の致命的なエラーは呼び出し元が処理できるよう詳細を返す
		return { ok: false, error: error?.message || String(error) };
	}
}

// 管理ページ用の募集データのステータスを更新
async function updateRecruitmentStatus(messageId, status, endTime = null) {
	try {
		console.log(`[updateRecruitmentStatus] 開始: messageId=${messageId}, status=${status}, endTime=${endTime}`);
		console.log(`[updateRecruitmentStatus] Backend URL: ${config.BACKEND_API_URL}`);
		
		const updateData = { 
			status: status,
			...(endTime && { end_time: endTime })
		};
		
		console.log(`[updateRecruitmentStatus] 送信データ:`, updateData);
		
		const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
		console.log(`[updateRecruitmentStatus] リクエストURL: ${url}`);
		
		const res = await fetch(url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updateData)
		});
		
		console.log(`[updateRecruitmentStatus] レスポンス: status=${res.status}, ok=${res.ok}`);
		
		if (!res.ok) {
			const errorText = await res.text();
			console.error(`[updateRecruitmentStatus] APIエラー詳細: ${errorText}`);
			
			// 404エラーの場合は警告レベルで処理を続行（募集データが見つからない場合）
			if (res.status === 404) {
				console.warn(`[updateRecruitmentStatus] 募集データが見つかりません（messageId: ${messageId}）- 処理を続行します`);
				return { warning: "Recruitment data not found", messageId };
			}
			
			throw new Error(`API error: ${res.status} - ${errorText}`);
		}
		
		const result = await res.json();
		console.log(`[updateRecruitmentStatus] 成功:`, result);
		return result;
	} catch (error) {
		console.error('[updateRecruitmentStatus] 募集ステータスの更新に失敗:', error);
		console.error('[updateRecruitmentStatus] エラーの詳細:', error.stack);
		
		// 404エラーの場合は例外を再発生させない
		if (error.message && error.message.includes('404')) {
			console.warn(`[updateRecruitmentStatus] 募集データが見つからないため処理をスキップします`);
			return { warning: "Recruitment data not found" };
		}
		
		throw error;
	}
}

// 募集データの内容を更新
async function updateRecruitmentData(messageId, recruitData) {
	try {
		console.log(`[updateRecruitmentData] 開始: messageId=${messageId}`);
		console.log(`[updateRecruitmentData] リクエストデータ:`, recruitData);
		
		const updateData = {
			title: recruitData.title || null,
			content: recruitData.content,
			participants_count: parseInt(recruitData.participants),
			start_game_time: recruitData.startTime,
			vc: recruitData.vc,
			note: recruitData.note || null
		};
		
		console.log(`[updateRecruitmentData] 送信データ:`, updateData);
		
		const url = `${config.BACKEND_API_URL}/api/recruitment/${messageId}`;
		console.log(`[updateRecruitmentData] リクエストURL: ${url}`);
		
		const res = await fetch(url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updateData)
		});
		
		console.log(`[updateRecruitmentData] レスポンス: status=${res.status}, ok=${res.ok}`);
		
		if (!res.ok) {
			const errorText = await res.text();
			console.error(`[updateRecruitmentData] APIエラー詳細: ${errorText}`);
			
			// 404エラーの場合は特別な処理
			if (res.status === 404) {
				console.warn(`[updateRecruitmentData] 募集データがデータベースに見つかりません。メッセージID: ${messageId}`);
				console.warn(`[updateRecruitmentData] これは正常な場合があります（メモリ上の募集など）`);
			}
			
			throw new Error(`API error: ${res.status} - ${errorText}`);
		}
		
		const result = await res.json();
		console.log(`[updateRecruitmentData] 成功:`, result);
		return result;
	} catch (error) {
		console.error('[updateRecruitmentData] 募集データの更新に失敗:', error);
		console.error('[updateRecruitmentData] エラーの詳細:', error.stack);
		throw error;
	}
}

// 現在の募集状況一覧を取得
async function getActiveRecruits() {
	const res = await fetch(`${config.BACKEND_API_URL}/api/active-recruits`);
	const json = await res.json();
	console.log('[db.js/getActiveRecruits] APIレスポンス:', JSON.stringify(json));
	return json;
}


module.exports = {
	getSupabase,
	saveRecruitStatus,
	deleteRecruitStatus,
	getActiveRecruits,
	saveRecruitmentData,
	deleteRecruitmentData,
	updateRecruitmentStatus,
	updateRecruitmentData,
	saveRecruitToRedis,
	getRecruitFromRedis,
	listRecruitIdsFromRedis,
	listRecruitsFromRedis,
	deleteRecruitFromRedis,
	pushRecruitToWebAPI,
	saveGuildSettingsToRedis,
	getGuildSettingsFromRedis,
	finalizeGuildSettings,
	getGuildSettings: getGuildSettingsFromRedis,
	// 参加者リスト永続化
	saveParticipantsToRedis,
	getParticipantsFromRedis,
	deleteParticipantsFromRedis,
	// TTL / cleanup utilities
	RECRUIT_TTL_SECONDS,
	cleanupExpiredRecruits
,
	dbEvents,
	runCleanupNow,
	getLastCleanupStatus
};


