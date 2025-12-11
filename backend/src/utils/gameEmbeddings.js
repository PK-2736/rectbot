/**
 * ゲーム辞書生成ユーティリティ
 * Vectorizeにゲーム名とエイリアスをインデックス
 */

/**
 * ゲーム辞書を生成してVectorizeに登録
 */
export async function generateGameEmbeddings(env) {
  console.log('[Game Embeddings] Starting generation...');

  const gameList = getFallbackGameList();
  console.log(`[Game Embeddings] Indexing ${gameList.length} games`);

  let successCount = 0;
  let failedGames = [];

  for (const game of gameList) {
    try {
      // メインゲーム名をインデックス
      const embedding = await generateEmbedding(env.AI, game.name);
      
      await env.GAME_VECTORIZE.upsert([
        {
          id: game.name.toLowerCase().replace(/\s+/g, '-'),
          values: embedding,
          metadata: {
            gameName: game.name,
            aliases: game.aliases || [],
            category: game.category || 'other',
            indexed_at: new Date().toISOString()
          }
        }
      ]);

      // エイリアスもインデックス
      for (const alias of (game.aliases || [])) {
        try {
          const aliasEmbedding = await generateEmbedding(env.AI, alias);
          await env.GAME_VECTORIZE.upsert([
            {
              id: `${game.name.toLowerCase().replace(/\s+/g, '-')}-alias-${alias.toLowerCase().replace(/\s+/g, '-')}`,
              values: aliasEmbedding,
              metadata: {
                gameName: game.name,
                alias: alias,
                isAlias: true,
                indexed_at: new Date().toISOString()
              }
            }
          ]);
        } catch (aliasError) {
          console.warn(`[Game Embeddings] Failed to index alias "${alias}" for ${game.name}:`, aliasError.message);
        }
      }

      successCount++;
      console.log(`[Game Embeddings] ✓ ${game.name} (+${game.aliases?.length || 0} aliases)`);

    } catch (error) {
      console.error(`[Game Embeddings] ✗ ${game.name}:`, error.message);
      failedGames.push(game.name);
    }
  }

  const result = {
    success: true,
    indexed: successCount,
    total: gameList.length,
    failed: failedGames.length,
    failedGames: failedGames
  };

  console.log(`[Game Embeddings] Complete: ${successCount}/${gameList.length} games indexed`);
  return result;
}

/**
 * embedding生成
 */
async function generateEmbedding(ai, text) {
  const response = await ai.run('@cf/baai/bge-base-en-v1.5', {
    text: [text]
  });

  if (response.data && response.data[0]) {
    return response.data[0];
  }

  throw new Error('Failed to generate embedding');
}

/**
 * 人気ゲームリスト（日本語エイリアス含む）
 */
function getFallbackGameList() {
  return [
    { name: 'Valorant', aliases: ['valo', 'val', 'ばろらんと', 'ヴァロ'], category: 'fps' },
    { name: 'Apex Legends', aliases: ['apex', 'えぺ', 'エーペックス', 'エペ'], category: 'battle-royale' },
    { name: 'Fortnite', aliases: ['fn', 'fort', 'フォトナ', 'フォートナイト'], category: 'battle-royale' },
    { name: 'Minecraft', aliases: ['mc', 'マイクラ', 'まいくら', 'minecraft'], category: 'sandbox' },
    { name: 'League of Legends', aliases: ['lol', 'ろる', 'リーグ', 'LoL'], category: 'moba' },
    { name: 'Overwatch', aliases: ['ow', 'オーバーウォッチ', 'OW', 'overwatch'], category: 'fps' },
    { name: 'Call of Duty', aliases: ['cod', 'コールオブデューティー', 'COD', 'warzone'], category: 'fps' },
    { name: 'Pokemon', aliases: ['ポケモン', 'ぽけもん', 'pokemon', 'ポケットモンスター'], category: 'rpg' },
    { name: 'Splatoon', aliases: ['スプラ', 'すぷら', 'スプラトゥーン', 'splatoon'], category: 'shooter' },
    { name: 'Monster Hunter', aliases: ['モンハン', 'もんはん', 'mh', 'mhw', 'モンスターハンター'], category: 'action' },
    { name: 'Genshin Impact', aliases: ['原神', 'げんしん', 'genshin', '原神インパクト'], category: 'rpg' },
    { name: 'Final Fantasy XIV', aliases: ['ff14', 'ffxiv', 'ファイナルファンタジー', 'ff'], category: 'mmorpg' },
    { name: 'Dead by Daylight', aliases: ['dbd', 'デッドバイデイライト', 'デドバ'], category: 'horror' },
    { name: 'Rainbow Six Siege', aliases: ['r6s', 'レインボーシックス', 'siege', 'r6'], category: 'fps' },
    { name: 'Destiny 2', aliases: ['destiny', 'destiny2', 'デスティニー', 'd2'], category: 'fps' },
    { name: 'Rust', aliases: ['ラスト', 'rust'], category: 'survival' },
    { name: 'PUBG', aliases: ['pubg', 'ぱぶじー', 'PUBG', 'battlegrounds'], category: 'battle-royale' },
    { name: 'Among Us', aliases: ['among', 'amongus', 'アマングアス', 'アモアス'], category: 'social' },
    { name: 'Fall Guys', aliases: ['fallguys', 'フォールガイズ', 'fall'], category: 'party' },
    { name: 'Rocket League', aliases: ['rl', 'rocketleague', 'ロケットリーグ', 'rocket'], category: 'sports' },
    { name: 'Counter-Strike', aliases: ['cs', 'csgo', 'cs2', 'カウンターストライク'], category: 'fps' },
    { name: 'Dota 2', aliases: ['dota', 'dota2', 'ドタ'], category: 'moba' },
    { name: 'Street Fighter', aliases: ['sf', 'ストリートファイター', 'sf6', 'スト'], category: 'fighting' },
    { name: 'Tekken', aliases: ['鉄拳', 'てっけん', 'tekken'], category: 'fighting' },
    { name: 'Super Smash Bros', aliases: ['smash', 'スマブラ', 'すまぶら', 'スマッシュブラザーズ'], category: 'fighting' },
    { name: 'Mario Kart', aliases: ['マリカ', 'まりか', 'mariokart', 'mk'], category: 'racing' },
    { name: 'Animal Crossing', aliases: ['あつ森', 'どうぶつの森', 'あつまれどうぶつの森', 'acnh'], category: 'simulation' },
    { name: 'Stardew Valley', aliases: ['stardew', 'スターデューバレー', 'スタバレ'], category: 'simulation' },
    { name: 'Terraria', aliases: ['テラリア', 'terraria'], category: 'sandbox' },
    { name: 'Roblox', aliases: ['ロブロックス', 'roblox'], category: 'platform' },
    { name: 'Palworld', aliases: ['パルワールド', 'ぱるわーるど', 'pal'], category: 'survival' },
    { name: 'Elden Ring', aliases: ['エルデンリング', 'えるでん', 'elden'], category: 'rpg' },
    { name: 'Dark Souls', aliases: ['ダークソウル', 'ダクソ', 'darksouls'], category: 'rpg' },
    { name: 'Bloodborne', aliases: ['ブラッドボーン', 'ブラボ', 'bloodborne'], category: 'rpg' }
  ];
}
