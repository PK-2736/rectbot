const config = require('../../config');
const backendFetch = require('../backendFetch');
const { normalizeRecruitId } = require('./utils');

async function saveRecruitStatus(serverId, channelId, messageId, startTime) {
  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruit-status`, {
      method: 'POST',
      body: JSON.stringify({ serverId, channelId, messageId, startTime })
    });
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function deleteRecruitStatus(serverId) {
  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruit-status?serverId=${serverId}`, { method: 'DELETE' });
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function getActiveRecruits() {
  try {
     const response = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/active-recruits`);
     // backendFetch already returns { ok: true, body: [...] }, so we return it directly
     return response;
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function saveRecruitmentData(guildId, channelId, messageId, guildName, channelName, recruitData) {
  const recruitId = recruitData.recruitId || String(messageId).slice(-8);
  const ownerId = recruitData.recruiterId || recruitData.ownerId;
  if (!ownerId) {
    throw new Error('saveRecruitmentData: recruiterId/ownerId is required to persist recruitment');
  }
  const normalizeVoice = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return false;
    const lower = value.toLowerCase();
    return lower.includes('あり') || lower.includes('yes') || lower.includes('true');
  };

  const participantsArray = Array.isArray(recruitData.participantsList)
    ? recruitData.participantsList.filter(Boolean)
    : Array.isArray(recruitData.participants)
      ? recruitData.participants.filter(Boolean)
      : [ownerId];
  if (!participantsArray.includes(ownerId)) participantsArray.unshift(ownerId);

  const payload = {
    recruitId,
    ownerId,
    title: recruitData.title || '',
    description: recruitData.content || recruitData.description || '',
    game: recruitData.game || '',
    platform: recruitData.platform || '',
    startTime: recruitData.startTime || recruitData.start_time || new Date().toISOString(),
    maxMembers: Number.parseInt(recruitData.participants ?? recruitData.maxMembers ?? participantsArray.length, 10) || undefined,
    voice: normalizeVoice(recruitData.vc ?? recruitData.voice),
    participants: participantsArray.slice(0, 100),
    status: (recruitData.status || 'recruiting'),
    metadata: {
      guildId,
      guildName: guildName ?? null,
      channelId,
      channelName: channelName ?? null,
      messageId,
      panelColor: recruitData.panelColor || null,
      vc: recruitData.vc ?? recruitData.voice ?? null,
      note: recruitData.note ?? null,
      startLabel: recruitData.startTime || null,
      raw: recruitData
    }
  };
  try {
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return { ok: true, status: 201, body };
  } catch (error) {
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function deleteRecruitmentData(messageId, requesterId = null) {
  try {
    const rid = normalizeRecruitId(messageId);
    const body = await backendFetch(`${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitments/${encodeURIComponent(rid)}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: requesterId })
    });
    return { ok: true, status: 200, body: body || null };
  } catch (error) {
    if (error?.status === 404) {
      return { ok: false, status: 404, body: error.body || null, warning: 'Recruitment not found' };
    }
    return { ok: false, status: error?.status ?? null, error: error?.body ?? error?.message ?? String(error) };
  }
}

async function updateRecruitmentStatus(messageId, status, endTime = null) {
  const updateData = { status: status, ...(endTime && { end_time: endTime }) };
  const rid = normalizeRecruitId(messageId);
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/${encodeURIComponent(rid)}`;
  try {
    const body = await backendFetch(url, { method: 'PATCH', body: JSON.stringify(updateData) });
    return { ok: true, body };
  } catch (error) {
    if (error?.status === 404) {
      return { ok: false, status: 404, warning: 'Recruitment data not found', messageId };
    }
    throw error;
  }
}

async function updateRecruitmentData(messageId, recruitData) {
  const updateData = { 
    title: recruitData.title || null, 
    content: recruitData.content || null, 
    participants_count: recruitData.participants ? parseInt(recruitData.participants) : null, 
    start_game_time: recruitData.startTime || null, 
    vc: recruitData.vc || null, 
    note: recruitData.note || null,
    startTimeNotified: recruitData.startTimeNotified === true ? true : (recruitData.startTimeNotified === false ? false : null)
  };
  const rid = normalizeRecruitId(messageId);
  const url = `${config.BACKEND_API_URL.replace(/\/$/, '')}/api/recruitment/${encodeURIComponent(rid)}`;
  try {
    const body = await backendFetch(url, { method: 'PATCH', body: JSON.stringify(updateData) });
    return { ok: true, body };
  } catch (error) {
    if (error?.status === 404) return { ok: false, status: 404, warning: 'Recruitment data not found' };
    throw error;
  }
}

module.exports = {
  saveRecruitStatus,
  deleteRecruitStatus,
  getActiveRecruits,
  saveRecruitmentData,
  deleteRecruitmentData,
  updateRecruitmentStatus,
  updateRecruitmentData,
};
