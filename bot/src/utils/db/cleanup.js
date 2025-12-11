const { ensureRedisConnection, RECRUIT_TTL_SECONDS, scanKeys } = require('./redis');
const { dbEvents, setLastCleanupStatus } = require('./events');
const { getRecruitFromRedis } = require('./recruits');
const { getDedicatedChannel, deleteDedicatedChannel } = require('./dedicatedChannels');

async function cleanupExpiredRecruits(client = null) {
  const result = { deletedRecruitCount: 0, deletedParticipantCount: 0, timestamp: new Date().toISOString(), error: null };
  try {
    const redis = await ensureRedisConnection();
    const recruitKeys = await scanKeys('recruit:*');
    for (const key of recruitKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redis.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) {
        // TTL切れ前に募集データを取得して通知を送信
        const recruitId = key.includes(':') ? key.split(':')[1] : key;
        const recruitData = await getRecruitFromRedis(recruitId).catch(() => null);
        
        if (recruitData && client && client.isReady()) {
          try {
            const channelId = recruitData.channelId || recruitData.metadata?.channelId;
            const messageId = recruitData.message_id || recruitData.metadata?.messageId;
            
            if (channelId && messageId) {
              const channel = await client.channels.fetch(channelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                  .setTitle('⏰ 期限切れのため、募集を締め切りました。')
                  .setDescription(`**${recruitData.title || '募集'}** の有効期限（3日）が経過したため、自動的に締め切られました。`)
                  .setColor('#808080')
                  .setFooter({ text: 'Recrubo' })
                  .setTimestamp();
                
                await channel.send({ embeds: [embed], allowedMentions: { roles: [], users: [] } }).catch(() => null);
                console.log(`[cleanup] TTL expired notification sent for recruit ${recruitId}`);
              }
            }
            
            // 専用チャンネルを削除
            const dedicatedChannelId = await getDedicatedChannel(recruitId).catch(() => null);
            if (dedicatedChannelId) {
              try {
                const guild = await client.guilds.fetch(recruitData.guildId || recruitData.metadata?.guildId).catch(() => null);
                if (guild) {
                  const dedicatedChannel = await guild.channels.fetch(dedicatedChannelId).catch(() => null);
                  if (dedicatedChannel) {
                    await dedicatedChannel.delete();
                    console.log(`[cleanup] Deleted dedicated channel ${dedicatedChannelId} for expired recruit ${recruitId}`);
                  }
                }
              } catch (e) {
                console.warn(`[cleanup] Failed to delete dedicated channel:`, e?.message || e);
              }
              await deleteDedicatedChannel(recruitId);
            }
          } catch (e) {
            console.warn(`[cleanup] Failed to send TTL expired notification for ${recruitId}:`, e?.message || e);
          }
        }
        
        await redis.del(key);
        result.deletedRecruitCount += 1;
        try {
          dbEvents.emit('recruitDeleted', { recruitId, key, timestamp: new Date().toISOString() });
        } catch (_) {}
      }
    }
    const participantKeys = await scanKeys('participants:*');
    for (const key of participantKeys) {
      const ttl = await redis.ttl(key);
      if (ttl === -2) continue;
      if (ttl === -1) { await redis.expire(key, RECRUIT_TTL_SECONDS); continue; }
      if (ttl <= 0) {
        await redis.del(key);
        result.deletedParticipantCount += 1;
        try {
          dbEvents.emit('participantsDeleted', { key, timestamp: new Date().toISOString() });
        } catch (_) {}
      }
    }
    setLastCleanupStatus({ lastRun: result.timestamp, deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: null });
    return result;
  } catch (e) {
    setLastCleanupStatus({ lastRun: new Date().toISOString(), deletedRecruitCount: result.deletedRecruitCount, deletedParticipantCount: result.deletedParticipantCount, error: e?.message || String(e) });
    return { ...result, error: e?.message || String(e) };
  }
}

async function runCleanupNow() { return cleanupExpiredRecruits(); }

module.exports = { cleanupExpiredRecruits, runCleanupNow };
