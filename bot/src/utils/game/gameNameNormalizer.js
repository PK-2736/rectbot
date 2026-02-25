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

let OFFICIAL_NAMES = Object.keys(GAME_DICTIONARY);
const OFFICIAL_SET = new Set(OFFICIAL_NAMES);
const ALIAS_LOOKUP = new Map(
  Object.entries(GAME_DICTIONARY).flatMap(([officialName, aliases]) =>
    aliases.map(alias => [alias.toLowerCase(), officialName])
  )
);

function cleanInputValue(input) {
  if (!input || typeof input !== 'string') return null;
  return input.trim().toLowerCase();
}

function matchOfficialExact(cleanInput) {
  return OFFICIAL_SET.has(cleanInput) ? cleanInput : null;
}

function matchAliasExact(cleanInput) {
  return ALIAS_LOOKUP.get(cleanInput) || null;
}

function findMatch(cleanInput, options) {
  const { matchOfficial, matchAlias, officialConfidence, aliasConfidence } = options;

  for (const officialName of OFFICIAL_NAMES) {
    if (matchOfficial(officialName, cleanInput)) {
      return { normalized: officialName, confidence: officialConfidence };
    }

    const aliases = GAME_DICTIONARY[officialName] || [];
    const matchedAlias = aliases.find(alias => matchAlias(alias, cleanInput));
    if (matchedAlias) {
      return { normalized: officialName, confidence: aliasConfidence };
    }
  }

  return null;
}

/**
 * 入力されたゲーム名を正規化
 * @param {string} input - ユーザー入力のゲーム名
 * @returns {Object} { normalized: string, confidence: number }
 */
function normalizeGameName(input) {
  const cleanInput = cleanInputValue(input);
  if (!cleanInput) return { normalized: null, confidence: 0 };
  
  // 1. 完全一致チェック（正式名称）
  const exactOfficial = matchOfficialExact(cleanInput);
  if (exactOfficial) return { normalized: exactOfficial, confidence: 1.0 };
  
  // 2. エイリアス完全一致チェック
  const exactAlias = matchAliasExact(cleanInput);
  if (exactAlias) return { normalized: exactAlias, confidence: 0.95 };
  
  // 3. 部分一致チェック（前方一致優先）
  const prefixMatch = findMatch(cleanInput, {
    matchOfficial: (officialName, input) => officialName.startsWith(input) || input.startsWith(officialName),
    matchAlias: (alias, input) => {
      const lowered = alias.toLowerCase();
      return lowered.startsWith(input) || input.startsWith(lowered);
    },
    officialConfidence: 0.85,
    aliasConfidence: 0.8
  });
  if (prefixMatch) return prefixMatch;
  
  // 4. 含まれているかチェック（あいまい検索）
  const containsMatch = findMatch(cleanInput, {
    matchOfficial: (officialName, input) => officialName.includes(input) || input.includes(officialName),
    matchAlias: (alias, input) => {
      const lowered = alias.toLowerCase();
      return lowered.includes(input) || input.includes(lowered);
    },
    officialConfidence: 0.7,
    aliasConfidence: 0.65
  });
  if (containsMatch) return containsMatch;
  
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
  const cleanInput = cleanInputValue(input);
  if (!cleanInput) return [];
  const suggestions = new Set();
  
  for (const officialName of OFFICIAL_NAMES) {
    const aliases = GAME_DICTIONARY[officialName] || [];
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
    OFFICIAL_SET.add(lowerName);
    OFFICIAL_NAMES = Object.keys(GAME_DICTIONARY);
  }
  const aliases = Array.isArray(newAliases) ? newAliases : [newAliases];
  GAME_DICTIONARY[lowerName].push(...aliases);
  aliases.forEach(alias => {
    if (alias) ALIAS_LOOKUP.set(String(alias).toLowerCase(), lowerName);
  });
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
