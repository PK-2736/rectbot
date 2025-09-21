
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
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
		note: recruitData.note
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
			throw new Error(`API error: ${res.status} - ${errorText}`);
		}
		
		const result = await res.json();
		console.log(`[updateRecruitmentStatus] 成功:`, result);
		return result;
	} catch (error) {
		console.error('[updateRecruitmentStatus] 募集ステータスの更新に失敗:', error);
		console.error('[updateRecruitmentStatus] エラーの詳細:', error.stack);
		throw error;
	}
}

// 募集データの内容を更新
async function updateRecruitmentData(messageId, recruitData) {
	try {
		console.log(`[updateRecruitmentData] 開始: messageId=${messageId}`);
		
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
	return res.json();
}

module.exports = {
	supabase,
	saveRecruitStatus,
	deleteRecruitStatus,
	getActiveRecruits,
	saveRecruitmentData,
	deleteRecruitmentData,
	updateRecruitmentStatus,
	updateRecruitmentData
};
