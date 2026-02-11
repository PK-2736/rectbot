const { handleModalSubmit: handleRecruitModalSubmit } = require('./recruit-create');
const { hydrateParticipants, loadSavedRecruitData, processJoin, processCancel } = require('./participant-actions');
const { processClose } = require('./recruit-close');
const { processCreateDedicatedChannel } = require('./dedicated-channel');

function resolveDedicatedChannelRecruitId(interaction) {
  if (!interaction.customId.startsWith('create_vc_') && interaction.customId !== 'create_vc_pending') {
    return null;
  }

  let recruitId = interaction.customId.replace('create_vc_', '');
  if (!recruitId || recruitId === 'pending') {
    try {
      recruitId = String(interaction.message.id).slice(-8);
    } catch (_) {
      recruitId = null;
    }
  }

  return recruitId || null;
}

async function handleButton(interaction) {
  const messageId = interaction.message.id;
  const recruitId = resolveDedicatedChannelRecruitId(interaction);
  if (recruitId) {
    await processCreateDedicatedChannel(interaction, recruitId);
    return;
  }

  const participants = await hydrateParticipants(interaction, messageId);
  const savedRecruitData = await loadSavedRecruitData(interaction, messageId);

  const actionHandlers = {
    join: () => processJoin(interaction, messageId, participants, savedRecruitData),
    cancel: () => processCancel(interaction, messageId, participants, savedRecruitData),
    close: () => processClose(interaction, messageId, savedRecruitData)
  };

  const handler = actionHandlers[interaction.customId];
  if (handler) {
    await handler();
  }
}

module.exports = {
  handleModalSubmit: handleRecruitModalSubmit,
  handleButton
};