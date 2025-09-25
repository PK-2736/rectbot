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
	const res = await fetch(`${config.BACKEND_API_URL}/api/guild-settings/finalize`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ guildId, ...settings })
	});
	if (!res.ok) {
		throw new Error(`API error: ${res.status}`);
	}
	return await res.json();
}



const config = require('../config');
const Redis = require('ioredis');

// Redisクライアント初期化
const redis = new Redis({
	host: process.env.REDIS_HOST || 'localhost',
	port: process.env.REDIS_PORT || 6379,
	password: process.env.REDIS_PASSWORD || undefined,
	db: process.env.REDIS_DB || 0
});

// 募集データをRedisに保存
async function saveRecruitToRedis(recruitId, data) {
	await redis.set(`recruit:${recruitId}`, JSON.stringify(data));
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
}

// Worker APIにデータをpushする汎用関数
async function pushRecruitToWebAPI(recruitData) {
	const res = await fetch(`${config.BACKEND_API_URL}/api/recruitment/push`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(recruitData)
	});
	if (!res.ok) {
		throw new Error(`API push error: ${res.status}`);
	}
	return await res.json();
}

// --- Supabase/BackendAPI経由の募集データ保存・取得・削除・更新 ---
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

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
		if (!res.ok) {
			throw new Error(`API error: ${res.status}`);
		}
		return await res.json();
	} catch (error) {
		console.error('募集データの削除に失敗:', error);
		throw error;
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
	supabase,
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
	getGuildSettings: getGuildSettingsFromRedis
};
