/**
 * ゲーム名辞書を自動生成してVectorizeに登録するスクリプト
 * Workers AI を使用して人気ゲームリストを生成し、embeddingを作成
 */

// このスクリプトは wrangler で実行するため、ESM 形式
export default {
  async scheduled(event, env, ctx) {
    await generateGameDatabase(env);
  }
};

// 手動実行用
export async function generateGameDatabase(env) {
  console.log('[Game Database Generator] Starting...');

  // 1. LLM で人気ゲームリストを生成
  const gameList = await generatePopularGamesList(env.AI);
  console.log(`[Generator] Generated ${gameList.length} games`);

  // 2. 各ゲームを Vectorize に登録
  let successCount = 0;
  for (const game of gameList) {
    try {
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
        const aliasEmbedding = await generateEmbedding(env.AI, alias);
        await env.VECTORIZE.upsert([
          {
            id: `${game.name.toLowerCase().replace(/\s+/g, '-')}-alias-${alias.toLowerCase()}`,
            values: aliasEmbedding,
            metadata: {
              gameName: game.name,
              alias: alias,
              isAlias: true,
              indexed_at: new Date().toISOString()
            }
          }
        ]);
      }

      successCount++;
      console.log(`[Generator] Indexed: ${game.name} (${game.aliases?.length || 0} aliases)`);

    } catch (error) {
      console.error(`[Generator] Failed to index ${game.name}:`, error);
    }
  }

  console.log(`[Generator] Complete: ${successCount}/${gameList.length} games indexed`);
  return { success: true, indexed: successCount, total: gameList.length };
}

/**
 * LLM で人気ゲームリストを生成
 */
async function generatePopularGamesList(ai) {
  const prompt = `Generate a comprehensive list of popular video games across all platforms (PC, Console, Mobile).

Include:
- Game title (official English name)
- Common aliases/abbreviations
- Category (fps, moba, rpg, battle-royale, etc.)

Format as JSON array:
[
  {
    "name": "Valorant",
    "aliases": ["valo", "val"],
    "category": "fps"
  },
  ...
]

Include at least 50 popular games. Focus on multiplayer games commonly used for friend codes.`;

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 4000,
      temperature: 0.5
    });

    const text = response.response || response.text || JSON.stringify(response);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const gameList = JSON.parse(jsonMatch[0]);
      return gameList;
    }

    // フォールバック: ハードコードされたリスト
    return getFallbackGameList();

  } catch (error) {
    console.error('[LLM Game List Generation Failed]', error);
    return getFallbackGameList();
  }
}

/**
 * フォールバックゲームリスト
 */
function getFallbackGameList() {
  return [
    { name: 'Valorant', aliases: ['valo', 'val', 'ばろらんと', 'ヴァロ'], category: 'fps' },
    { name: 'Apex Legends', aliases: ['apex', 'えぺ', 'エーペックス'], category: 'battle-royale' },
    { name: 'Fortnite', aliases: ['fn', 'fort', 'フォトナ'], category: 'battle-royale' },
    { name: 'Minecraft', aliases: ['mc', 'マイクラ', 'まいくら'], category: 'sandbox' },
    { name: 'League of Legends', aliases: ['lol', 'ろる', 'リーグ'], category: 'moba' },
    { name: 'Overwatch', aliases: ['ow', 'オーバーウォッチ'], category: 'fps' },
    { name: 'Call of Duty', aliases: ['cod', 'コールオブデューティー'], category: 'fps' },
    { name: 'Pokemon', aliases: ['ポケモン', 'ぽけもん'], category: 'rpg' },
    { name: 'Splatoon', aliases: ['スプラ', 'すぷら', 'スプラトゥーン'], category: 'shooter' },
    { name: 'Monster Hunter', aliases: ['モンハン', 'もんはん', 'mh'], category: 'action' },
    { name: 'Genshin Impact', aliases: ['原神', 'げんしん', 'genshin'], category: 'rpg' },
    { name: 'Final Fantasy XIV', aliases: ['ff14', 'ffxiv', 'ファイナルファンタジー'], category: 'mmorpg' },
    { name: 'Dead by Daylight', aliases: ['dbd', 'デッドバイデイライト'], category: 'horror' },
    { name: 'Rainbow Six Siege', aliases: ['r6s', 'レインボーシックス', 'siege'], category: 'fps' },
    { name: 'Destiny 2', aliases: ['destiny', 'destiny2', 'デスティニー'], category: 'fps' },
    { name: 'Rust', aliases: ['ラスト'], category: 'survival' },
    { name: 'PUBG', aliases: ['pubg', 'ぱぶじー'], category: 'battle-royale' },
    { name: 'Among Us', aliases: ['among', 'amongus', 'アマングアス'], category: 'social' },
    { name: 'Fall Guys', aliases: ['fallguys', 'フォールガイズ'], category: 'party' },
    { name: 'Rocket League', aliases: ['rl', 'rocketleague', 'ロケットリーグ'], category: 'sports' },
    { name: 'Counter-Strike', aliases: ['cs', 'csgo', 'cs2'], category: 'fps' },
    { name: 'Dota 2', aliases: ['dota', 'dota2'], category: 'moba' },
    { name: 'Street Fighter', aliases: ['sf', 'ストリートファイター'], category: 'fighting' },
    { name: 'Tekken', aliases: ['鉄拳', 'てっけん'], category: 'fighting' },
    { name: 'Super Smash Bros', aliases: ['smash', 'スマブラ', 'すまぶら'], category: 'fighting' },
    { name: 'Mario Kart', aliases: ['マリカ', 'まりか'], category: 'racing' },
    { name: 'Animal Crossing', aliases: ['あつ森', 'どうぶつの森'], category: 'simulation' },
    { name: 'Stardew Valley', aliases: ['stardew', 'スターデューバレー'], category: 'simulation' },
    { name: 'Terraria', aliases: ['テラリア'], category: 'sandbox' },
    { name: 'Roblox', aliases: ['ロブロックス'], category: 'platform' }
  ];
}

/**
 * embedding 生成
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
