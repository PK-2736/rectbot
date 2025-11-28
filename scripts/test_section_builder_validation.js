const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');

function test(isAdmin) {
  const container = new ContainerBuilder();
  container.setAccentColor(0x5865F2);

  const section1 = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Recruit channel: #general'));
  if (isAdmin) {
    const btn = new ButtonBuilder().setCustomId('set_recruit_channel').setLabel('Set Channel').setStyle(ButtonStyle.Primary);
    console.log('Will set accessory with', btn);
    try {
      section1.setButtonAccessory(btn);
    } catch (e) {
      console.warn('Section accessory set failed', e);
    }
  }

  console.log('Section1 toJSON building...');
  try {
    console.log('section1.toJSON:', section1.toJSON());
  } catch (e) {
    console.error('section1.toJSON error:', e);
  }

  container.addSectionComponents(section1);

  console.log('Container toJSON building...');
  try {
    console.log('container.toJSON:', container.toJSON());
  } catch (e) {
    console.error('container.toJSON error:', e);
  }
}

console.log('Test as admin:');
try { test(true); } catch (e) { console.error(e); }

console.log('\nTest as non-admin:');
try { test(false); } catch (e) { console.error(e); }
