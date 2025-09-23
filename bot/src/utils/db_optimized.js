const config = require('../config');

// 最適化されたギルド設定保存（セッション不要）
async function saveGuildSettingsOptimized(guildId, settings) {
	try {
		console.log(`[db-opt] saveGuildSettingsOptimized - guildId: ${guildId}, settings:`, settings);
		
		const res = await fetch(`${config.BACKEND_API_URL}/api/guild-settings/${guildId}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(settings)
		});

		if (!res.ok) {
			const errorText = await res.text();
			throw new Error(`API error: ${res.status} - ${errorText}`);
		}

		const result = await res.json();
		console.log(`[db-opt] 設定保存成功:`, result);
		return result;
	} catch (error) {
		console.error('[db-opt] 設定保存エラー:', error);
		throw error;
	}
}

// キャッシュ付きギルド設定取得
const settingsCache = new Map();
const CACHE_TTL = 30000; // 30秒

async function getGuildSettingsOptimized(guildId, useCache = true) {
	try {
		// キャッシュチェック
		if (useCache && settingsCache.has(guildId)) {
			const cached = settingsCache.get(guildId);
			if (Date.now() - cached.timestamp < CACHE_TTL) {
				console.log(`[db-opt] キャッシュヒット - guildId: ${guildId}`);
				return cached.data;
			}
		}

		console.log(`[db-opt] getGuildSettingsOptimized - guildId: ${guildId}`);
		
		const res = await fetch(`${config.BACKEND_API_URL}/api/guild-settings/${guildId}`);
		
		if (!res.ok) {
			if (res.status === 404) {
				// 設定が見つからない場合はデフォルト値を返す
				const defaultSettings = {
					recruit_channel: null,
					notification_role: null,
					defaultTitle: null,
					defaultColor: null,
					update_channel: null
				};
				
				// デフォルト値もキャッシュ
				settingsCache.set(guildId, {
					data: defaultSettings,
					timestamp: Date.now()
				});
				
				return defaultSettings;
			}
			throw new Error(`API error: ${res.status}`);
		}

		const settings = await res.json();
		
		// キャッシュに保存
		settingsCache.set(guildId, {
			data: settings,
			timestamp: Date.now()
		});
		
		console.log(`[db-opt] 設定取得成功:`, settings);
		return settings;
	} catch (error) {
		console.error('[db-opt] ギルド設定の取得に失敗:', error);
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

// キャッシュクリア
function clearSettingsCache(guildId = null) {
	if (guildId) {
		settingsCache.delete(guildId);
		console.log(`[db-opt] キャッシュクリア - guildId: ${guildId}`);
	} else {
		settingsCache.clear();
		console.log(`[db-opt] 全キャッシュクリア`);
	}
}

// 設定の検証
function validateGuildSettings(settings) {
	const errors = [];
	
	// カラーコードの検証
	if (settings.defaultColor && !/^#[0-9A-Fa-f]{6}$/.test(settings.defaultColor)) {
		errors.push('defaultColor: 無効なカラーコード形式');
	}
	
	// タイトルの長さ検証
	if (settings.defaultTitle && settings.defaultTitle.length > 100) {
		errors.push('defaultTitle: 100文字以下で入力してください');
	}
	
	return {
		isValid: errors.length === 0,
		errors
	};
}

// 設定のマージ（部分更新対応）
async function mergeGuildSettings(guildId, newSettings) {
	try {
		// 現在の設定を取得
		const currentSettings = await getGuildSettingsOptimized(guildId, false);
		
		// 新しい設定をマージ
		const mergedSettings = { ...currentSettings, ...newSettings };
		
		// 検証
		const validation = validateGuildSettings(mergedSettings);
		if (!validation.isValid) {
			throw new Error(`設定検証エラー: ${validation.errors.join(', ')}`);
		}
		
		// 保存
		const result = await saveGuildSettingsOptimized(guildId, mergedSettings);
		
		// キャッシュクリア
		clearSettingsCache(guildId);
		
		return result;
	} catch (error) {
		console.error('[db-opt] 設定マージエラー:', error);
		throw error;
	}
}

module.exports = {
	saveGuildSettingsOptimized,
	getGuildSettingsOptimized,
	clearSettingsCache,
	validateGuildSettings,
	mergeGuildSettings
};