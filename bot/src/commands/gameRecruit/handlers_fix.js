// 修正部分: handleButton 関数の前に async キーワードを追加
// 1023行目付近を以下に修正：

async function handleButton(interaction) {
  const messageId = interaction.message.id;
  console.log('=== ボタンクリック処理開始 ===', messageId, interaction.customId);

  // 専用チャンネル作成ボタン
  if (interaction.customId.startsWith('create_vc_')) {
    const recruitId = interaction.customId.replace('create_vc_', '');
    await processCreateDedicatedChannel(interaction, recruitId);
    return;
  }

  // hydrate participants if needed
  let participants = await hydrateParticipants(interaction, messageId);
  const savedRecruitData = await loadSavedRecruitData(interaction, messageId);

  const action = interaction.customId;
  if (action === 'join') {
    await processJoin(interaction, messageId, participants, savedRecruitData);
    return;
  }
  if (action === 'cancel') {
    participants = await processCancel(interaction, messageId, participants, savedRecruitData);
    return;
  }
  if (action === 'close') {
    await processClose(interaction, messageId, savedRecruitData);
    return;
  }
}
