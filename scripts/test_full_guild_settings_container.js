const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

function buildSettingsContainer(isAdmin) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('⚙️✨ **ギルド募集設定' + (isAdmin ? '' : ' (閲覧モード)') + '** ✨⚙️'));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  const recruitChannelValue = '<#123>'; 
  // Section 1
  if (isAdmin) {
    const section1 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`📍 **募集チャンネル**\n${recruitChannelValue}`));
    const btn = new ButtonBuilder().setCustomId('set_recruit_channel').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    section1.setButtonAccessory(btn);
    container.addSectionComponents(section1);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📍 **募集チャンネル**\n${recruitChannelValue}`));
  }

  // Section 2
  const notificationRoleValue = '未設定';
  if (isAdmin) {
    const section2 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔔 **通知ロール**\n${notificationRoleValue}`));
    const btn = new ButtonBuilder().setCustomId('set_notification_role').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    section2.setButtonAccessory(btn);
    container.addSectionComponents(section2);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔔 **通知ロール**\n${notificationRoleValue}`));
  }

  // Section 3
  const defaultTitleValue = '未設定';
  if (isAdmin) {
    const section3 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`📝 **既定タイトル**\n${defaultTitleValue}`));
    const btn = new ButtonBuilder().setCustomId('set_default_title').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    section3.setButtonAccessory(btn);
    container.addSectionComponents(section3);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📝 **既定タイトル**\n${defaultTitleValue}`));
  }

  // Section 4
  const defaultColorValue = '未設定';
  if (isAdmin) {
    const section4 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎨 **既定カラー**\n${defaultColorValue}`));
    const btn = new ButtonBuilder().setCustomId('set_default_color').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    section4.setButtonAccessory(btn);
    container.addSectionComponents(section4);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎨 **既定カラー**\n${defaultColorValue}`));
  }

  // Section 5
  const updateChannelValue = '<#456>';
  if (isAdmin) {
    const section5 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`📢 **アップデート通知チャンネル**\n${updateChannelValue}`));
    const btn = new ButtonBuilder().setCustomId('set_update_channel').setLabel('設定変更').setStyle(ButtonStyle.Primary);
    section5.setButtonAccessory(btn);
    container.addSectionComponents(section5);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📢 **アップデート通知チャンネル**\n${updateChannelValue}`));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('powered by Recrubo'));

  return container;
}

function test() {
  console.log('Admin container toJSON:');
  try { console.log(JSON.stringify(buildSettingsContainer(true).toJSON(), null, 2)); } catch (err) { console.error('Admin container failed toJSON', err); }
  console.log('\nNon-admin container toJSON:');
  try { console.log(JSON.stringify(buildSettingsContainer(false).toJSON(), null, 2)); } catch (err) { console.error('Non-admin container failed toJSON', err); }
}

test();
