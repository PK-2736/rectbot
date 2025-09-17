
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

// 募集状況を削除
async function deleteRecruitStatus(serverId) {
	const res = await fetch(`${config.BACKEND_API_URL}/api/recruit-status?serverId=${serverId}`, {
		method: 'DELETE'
	});
	return res.json();
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
	getActiveRecruits
};
