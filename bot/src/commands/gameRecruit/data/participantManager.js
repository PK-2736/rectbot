const { 
  getRecruitDataFromRedis, 
  getParticipantsFromRedis, 
  listAllParticipantsFromRedis 
} = require('../../../utils/database');

async function hydrateParticipants(recruitData) {
  const { guildId, channelId, messageId } = recruitData;
  if (!guildId || !channelId || !messageId) {
    console.warn('[hydrateParticipants] missing IDs, returning empty array');
    return [];
  }

  try {
    const parts = await getParticipantsFromRedis(guildId, channelId, messageId);
    if (Array.isArray(parts) && parts.length > 0) {
      console.log(`[hydrateParticipants] found ${parts.length} participants in Redis`);
      return parts;
    }
  } catch (error) {
    console.warn('[hydrateParticipants] getParticipantsFromRedis failed:', error?.message || error);
  }

  try {
    const allParts = await listAllParticipantsFromRedis();
    if (Array.isArray(allParts) && allParts.length > 0) {
      const matched = allParts.filter(p =>
        String(p?.guildId) === String(guildId) &&
        String(p?.channelId) === String(channelId) &&
        String(p?.messageId) === String(messageId)
      );
      if (matched.length > 0) {
        console.log(`[hydrateParticipants] found ${matched.length} participants in listAllParticipants`);
        return matched;
      }
    }
  } catch (error) {
    console.warn('[hydrateParticipants] listAllParticipantsFromRedis failed:', error?.message || error);
  }

  console.log('[hydrateParticipants] no participants found, returning embedded data');
  return Array.isArray(recruitData.participants) ? recruitData.participants : [];
}

async function loadSavedRecruitData(guild, channel, messageId) {
  try {
    const storedData = await getRecruitDataFromRedis(guild.id, channel.id, messageId);
    if (storedData) {
      const participantsArray = await hydrateParticipants(storedData);
      return {
        ...storedData,
        participants: participantsArray,
        metadata: {
          ...storedData.metadata,
          participants: participantsArray,
          recruitNum: participantsArray.length
        }
      };
    }
  } catch (error) {
    console.warn('[loadSavedRecruitData] failed:', error?.message || error);
  }
  return null;
}

module.exports = {
  hydrateParticipants,
  loadSavedRecruitData
};
