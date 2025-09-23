
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
	return res.json();
}

// ギルド設定を保存（一時的にKVに保存）
async function saveGuildSettings(guildId, settings) {
	try {
		const res = await fetch(`${config.BACKEND_API_URL}/api/guild-settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				guildId,
				...settings
			})
		});

		if (!res.ok) {
			throw new Error(`API error: ${res.status}`);
		}

		return await res.json();
	} catch (error) {
		console.error('ギルド設定の保存に失敗:', error);
		throw error;
	}
}

// ギルド設定をSupabaseに最終保存
async function finalizeGuildSettings(guildId) {
	try {
		console.log(`[db] ギルド設定の最終保存開始 - guildId: ${guildId}`);
		console.log(`[db] バックエンドURL: ${config.BACKEND_API_URL}/api/guild-settings/finalize`);
		
		const requestBody = JSON.stringify({ guildId });
		console.log(`[db] リクエストボディ: ${requestBody}`);
		
		const res = await fetch(`${config.BACKEND_API_URL}/api/guild-settings/finalize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: requestBody
		});

		console.log(`[db] 最終保存APIレスポンス - status: ${res.status}, ok: ${res.ok}`);
		console.log(`[db] レスポンスヘッダー:`, Object.fromEntries(res.headers.entries()));

		if (!res.ok) {
			const errorText = await res.text();
			console.error(`[db] 最終保存APIエラー: ${res.status} - ${errorText}`);
			throw new Error(`API error: ${res.status} - ${errorText}`);
		}

		const result = await res.json();
		console.log(`[db] 最終保存成功:`, result);
		return result;
	} catch (error) {
		console.error('ギルド設定の最終保存に失敗:', error);
		console.error('エラーのタイプ:', typeof error);
		console.error('エラーの詳細:', error.stack);
		throw error;
	}
}

// ギルド設定を取得（Supabaseから）
async function getGuildSettings(guildId) {
	try {
		const res = await fetch(`${config.BACKEND_API_URL}/api/guild-settings/${guildId}`);
		
		if (!res.ok) {
			if (res.status === 404) {
				// 設定が見つからない場合はデフォルト値を返す
				return {
					recruit_channel: null,
					notification_role: null,
					defaultTitle: null,
					defaultColor: null,
					update_channel: null
				};
			}
			throw new Error(`API error: ${res.status}`);
		}

		return await res.json();
	} catch (error) {
		console.error('ギルド設定の取得に失敗:', error);
		// エラーの場合もデフォルト値を返す
		return {
			recruit_channel: null,
			notification_role: null,
			defaultTitle: null,
			defaultColor: null,
			update_channel: null
		};
	}
}

// ギルド設定セッションを開始（SupabaseからKVに読み込み）
async function startGuildSettingsSession(guildId) {
	try {
		console.log(`[db] セッション開始API呼び出し - guildId: ${guildId}`);
		
		const res = await fetch(`${config.BACKEND_API_URL}/api/guild-settings/start-session`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ guildId })
		});

		console.log(`[db] セッション開始APIレスポンス - status: ${res.status}, ok: ${res.ok}`);

		if (!res.ok) {
			const errorText = await res.text();
			console.error(`[db] セッション開始APIエラー: ${res.status} - ${errorText}`);
			throw new Error(`API error: ${res.status} - ${errorText}`);
		}

		const result = await res.json();
		console.log(`[db] セッション開始成功:`, result);
		return result;
	} catch (error) {
		console.error('ギルド設定セッション開始に失敗:', error);
		console.error('エラーの詳細:', error.stack);
		throw error;
	}
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
	saveGuildSettings,
	getGuildSettings,
	finalizeGuildSettings,
	startGuildSettingsSession
};
