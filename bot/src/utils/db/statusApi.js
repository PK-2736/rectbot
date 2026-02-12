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

function normalizeVoiceValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  return lower.includes('あり') || lower.includes('yes') || lower.includes('true');
}

function extractOwnerId(recruitData) {
  const ownerId = recruitData.recruiterId || recruitData.ownerId;
  if (!ownerId) {
    throw new Error('saveRecruitmentData: recruiterId/ownerId is required to persist recruitment');
  }
  return ownerId;
}

function normalizeParticipantsList(recruitData, ownerId) {
  const participantsArray = Array.isArray(recruitData.participantsList)
    ? recruitData.participantsList.filter(Boolean)
    : Array.isArray(recruitData.participants)
      ? recruitData.participants.filter(Boolean)
      : [ownerId];
  
  if (!participantsArray.includes(ownerId)) {
    participantsArray.unshift(ownerId);
  }
  
  return participantsArray.slice(0, 100);
}

function buildRecruitmentPayload(guildId, channelId, messageId, guildName, channelName, recruitData, recruitId, ownerId, participants) {
  return {
    recruitId,
    ownerId,
    title: recruitData.title || '',
    description: recruitData.content || recruitData.description || '',
    game: recruitData.game || '',
    platform: recruitData.platform || '',
    startTime: recruitData.startTime || recruitData.start_time || new Date().toISOString(),
    maxMembers: Number.parseInt(recruitData.participants ?? recruitData.maxMembers ?? participants.length, 10) || undefined,
    voice: normalizeVoiceValue(recruitData.vc ?? recruitData.voice),
    participants,
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
      notificationRoleId: recruitData.notificationRoleId || null,
      raw: recruitData
    }
  };
}

async function saveRecruitmentData(guildId, channelId, messageId, guildName, channelName, recruitData) {
  const recruitId = recruitData.recruitId || String(messageId).slice(-8);
  const ownerId = extractOwnerId(recruitData);
  const participants = normalizeParticipantsList(recruitData, ownerId);
  const payload = buildRecruitmentPayload(guildId, channelId, messageId, guildName, channelName, recruitData, recruitId, ownerId, participants);
  
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

function updateTitleField(updateData, recruitData) {
  if (recruitData.title != null) {
    updateData.title = recruitData.title;
  }
}

function updateDescriptionField(updateData, recruitData) {
  if (recruitData.description != null || recruitData.content != null) {
    const desc = recruitData.description ?? recruitData.content;
    if (desc !== undefined && desc !== null) {
      updateData.description = String(desc);
    }
  }
}

function updateGamePlatformFields(updateData, recruitData) {
  if (recruitData.game != null) updateData.game = recruitData.game;
  if (recruitData.platform != null) updateData.platform = recruitData.platform;
  if (recruitData.status != null) updateData.status = recruitData.status;
}

function updateMaxMembersField(updateData, recruitData) {
  if (recruitData.maxMembers != null || recruitData.participants != null) {
    const val = recruitData.maxMembers ?? (recruitData.participants ? parseInt(recruitData.participants, 10) : null);
    if (val != null && !Number.isNaN(val)) {
      updateData.maxMembers = val;
    }
  }
}

function updateVoiceField(updateData, recruitData) {
  if (recruitData.voice != null || recruitData.vc != null) {
    const v = recruitData.voice ?? recruitData.vc;
    if (typeof v === 'string') {
      updateData.voice = v;
    } else if (typeof v === 'boolean') {
      updateData.voice = v ? 'あり' : 'なし';
    }
  }
}

function buildMetadataUpdates(recruitData) {
  const meta = {};
  if (recruitData.note != null) meta.note = recruitData.note;
  if (recruitData.startTime != null) meta.startLabel = recruitData.startTime;
  if (recruitData.panelColor != null) meta.panelColor = recruitData.panelColor;
  if (recruitData.startTimeNotified !== undefined && recruitData.startTimeNotified !== null) {
    meta.startTimeNotified = recruitData.startTimeNotified === true;
  }
  return meta;
}

function buildUpdateData(recruitData) {
  const updateData = {};
  
  updateTitleField(updateData, recruitData);
  updateDescriptionField(updateData, recruitData);
  updateGamePlatformFields(updateData, recruitData);
  updateMaxMembersField(updateData, recruitData);
  updateVoiceField(updateData, recruitData);
  
  const meta = buildMetadataUpdates(recruitData);
  if (Object.keys(meta).length) {
    updateData.metadata = meta;
  }
  
  return updateData;
}

async function updateRecruitmentData(messageId, recruitData) {
  const updateData = buildUpdateData(recruitData);
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
