const { handleModalSubmit: handleRecruitModalSubmit } = require('./recruit-create');
const { hydrateParticipants, loadSavedRecruitData, processJoin, processCancel } = require('./participant-actions');
const { processClose } = require('./recruit-close');
const { processCreateDedicatedChannel } = require('./dedicated-channel');

async function handleButton(interaction) {
  const messageId = interaction.message.id;

  if (interaction.customId.startsWith('create_vc_') || interaction.customId === 'create_vc_pending') {
    let recruitId = interaction.customId.replace('create_vc_', '');
    if (!recruitId || recruitId === 'pending') {
      try {
        recruitId = String(interaction.message.id).slice(-8);
      } catch (_) {
        recruitId = null;
      }
    }
    if (recruitId) {
      await processCreateDedicatedChannel(interaction, recruitId);
      return;
    }
  }

  const participants = await hydrateParticipants(interaction, messageId);
  const savedRecruitData = await loadSavedRecruitData(interaction, messageId);

  const action = interaction.customId;
  if (action === 'join') {
    await processJoin(interaction, messageId, participants, savedRecruitData);
    return;
  }
  if (action === 'cancel') {
    await processCancel(interaction, messageId, participants, savedRecruitData);
    return;
  }
  if (action === 'close') {
    await processClose(interaction, messageId, savedRecruitData);
  }
}

module.exports = {
  handleModalSubmit: handleRecruitModalSubmit,
  handleButton
};