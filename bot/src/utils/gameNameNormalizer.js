/**
 * ゲーム名を正規化するユーティリティ
 * Workers AI/KVを使用する代わりに、ローカル辞書とパターンマッチングで実装
 */

// ゲーム名辞書（拡張可能）
const GAME_DICTIONARY = {
  'valorant': ['valo', 'val', 'ばろらんと', 'ヴァロ', 'valorant', 'valolant'],
  'apex legends': ['apex', 'えぺ', 'エーペックス', 'apexlegends', 'apex legends'],
  'fortnite': ['fn', 'fort', 'フォトナ', 'フォートナイト', 'fortnite'],
  'minecraft': ['mc', 'マイクラ', 'まいくら', 'minecraft', 'マインクラフト'],
  'league of legends': ['lol', 'ろる', 'リーグオブレジェンド', 'league', 'leagueoflegends'],
  'overwatch': ['ow', 'オーバーウォッチ', 'overwatch', 'over watch'],
  'call of duty': ['cod', 'コールオブデューティー', 'callofduty', 'call of duty'],
  'pokemon': ['ポケモン', 'ぽけもん', 'pokemon', 'pokémon'],
  'splatoon': ['スプラ', 'すぷら', 'splatoon', 'スプラトゥーン'],
  'monster hunter': ['モンハン', 'もんはん', 'mh', 'mhw', 'monster hunter', 'モンスターハンター'],
  'genshin impact': ['原神', 'げんしん', 'genshin', 'genshin impact'],
  'final fantasy xiv': ['ff14', 'ffxiv', 'ファイナルファンタジー14', 'final fantasy 14'],
  'dead by daylight': ['dbd', 'デッドバイデイライト', 'dead by daylight'],
  'rainbow six siege': ['r6s', 'レインボーシックス', 'rainbow six', 'siege'],
  'destiny 2': ['destiny', 'destiny2', 'デスティニー', 'デスティニー2'],
  'rust': ['rust', 'ラスト'],
  'pubg': ['pubg', 'ぱぶじー', 'playerunknown'],
  'among us': ['among', 'amongus', 'アマングアス', 'アモングアス'],
  'fall guys': ['fallguys', 'フォールガイズ', 'fall guys'],
  'rocket league': ['rl', 'rocketleague', 'ロケットリーグ', 'rocket league']
};

/**
 * 入力されたゲーム名を正規化
 * @param {string} input - ユーザー入力のゲーム名
 * @returns {Object} { normalized: string, confidence: number }
 */
function normalizeGameName(input) {
  if (!input || typeof input !== 'string') {
    return { normalized: null, confidence: 0 };
  }

  const cleanInput = input.trim().toLowerCase();
  
  // 1. 完全一致チェック（正式名称）
  for (const [officialName, aliases] of Object.entries(GAME_DICTIONARY)) {
    if (cleanInput === officialName) {
      return { normalized: officialName, confidence: 1.0 };
    }
  }
  
  // 2. エイリアス完全一致チェック
  for (const [officialName, aliases] of Object.entries(GAME_DICTIONARY)) {
    if (aliases.some(alias => alias.toLowerCase() === cleanInput)) {
      return { normalized: officialName, confidence: 0.95 };
    }
  }
  
  // 3. 部分一致チェック（前方一致優先）
  for (const [officialName, aliases] of Object.entries(GAME_DICTIONARY)) {
    // 正式名称の前方一致
    if (officialName.startsWith(cleanInput) || cleanInput.startsWith(officialName)) {
      return { normalized: officialName, confidence: 0.85 };
    }
    
    // エイリアスの前方一致
    const matchedAlias = aliases.find(alias => 
      alias.toLowerCase().startsWith(cleanInput) || 
      cleanInput.startsWith(alias.toLowerCase())
    );
    if (matchedAlias) {
      return { normalized: officialName, confidence: 0.8 };
    }
  }
  
  // 4. 含まれているかチェック（あいまい検索）
  for (const [officialName, aliases] of Object.entries(GAME_DICTIONARY)) {
    if (officialName.includes(cleanInput) || cleanInput.includes(officialName)) {
      return { normalized: officialName, confidence: 0.7 };
    }
    
    const containsAlias = aliases.find(alias => 
      alias.toLowerCase().includes(cleanInput) || 
      cleanInput.includes(alias.toLowerCase())
    );
    if (containsAlias) {
      return { normalized: officialName, confidence: 0.65 };
    }
  }
  
  // 5. 見つからない場合は入力値をそのまま使用（小文字化して統一）
  return { normalized: cleanInput, confidence: 0.5 };
}

/**
 * ゲーム名候補を提案
 * @param {string} input - 部分入力
 * @param {number} limit - 候補数上限
 * @returns {Array<string>} 候補リスト
 */
function suggestGameNames(input, limit = 10) {
  if (!input || typeof input !== 'string') return [];
  
  const cleanInput = input.trim().toLowerCase();
  const suggestions = new Set();
  
  for (const [officialName, aliases] of Object.entries(GAME_DICTIONARY)) {
    // 正式名称が一致
    if (officialName.includes(cleanInput)) {
      suggestions.add(officialName);
    }
    
    // エイリアスが一致
    if (aliases.some(alias => alias.toLowerCase().includes(cleanInput))) {
      suggestions.add(officialName);
    }
    
    if (suggestions.size >= limit) break;
  }
  
  return Array.from(suggestions).slice(0, limit);
}

/**
 * 新しいゲーム名エイリアスを辞書に追加（動的拡張用）
 * @param {string} officialName - 正式ゲーム名
 * @param {Array<string>} newAliases - 追加するエイリアス
 */
function addGameAliases(officialName, newAliases) {
  const lowerName = officialName.toLowerCase();
  if (!GAME_DICTIONARY[lowerName]) {
    GAME_DICTIONARY[lowerName] = [];
  }
  GAME_DICTIONARY[lowerName].push(...newAliases);
}

/**
 * ゲーム辞書の全ゲーム名を取得
 */
function getAllGameNames() {
  return Object.keys(GAME_DICTIONARY).sort();
}

module.exports = {
  normalizeGameName,
  suggestGameNames,
  addGameAliases,
  getAllGameNames,
  GAME_DICTIONARY
};
