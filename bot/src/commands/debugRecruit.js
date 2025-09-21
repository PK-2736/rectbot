const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');



// gameRecruitから募集データをインポート

const gameRecruit = require('./gameRecruit');

// gameRecruitから募集データをインポート// gameRecruitから募集データをインポート

module.exports = {

  data: new SlashCommandBuilder()const gameRecruit = require('./gameRecruit');const gameRecruit = require('./gameRecruit');

    .setName('debugrecruit')

    .setDescription('募集のデバッグ情報を表示します（開発者用）'),



  async execute(interaction) {module.exports = {module.exports = {

    try {

      // 現在のメモリ上の募集データを取得  data: new SlashCommandBuilder()  data: new SlashCommandBuilder()

      const allRecruitData = gameRecruit.getAllRecruitData ? gameRecruit.getAllRecruitData() : {};

          .setName('debugrecruit')    .setName('debugrecruit')

      // チャンネル内の最近のbotメッセージを確認

      const messages = await interaction.channel.messages.fetch({ limit: 50 });    .setDescription('募集のデバッグ情報を表示します（開発者用）'),    .setDescription('募集のデバッグ情報を表示します（開発者用）'),

      const botMessages = [];

      

      for (const [messageId, message] of messages) {

        if (message.author.id === interaction.client.user.id &&   async execute(interaction) {  async execute(interaction) {

            message.components && message.components.length > 0) {

          const recruitId = messageId.slice(-8);    try {    try {

          const hasRecruitData = !!gameRecruit.getRecruitData(messageId);

                // 現在のメモリ上の募集データを取得      // 現在のメモリ上の募集データを取得

          botMessages.push({

            messageId,      const allRecruitData = gameRecruit.getAllRecruitData ? gameRecruit.getAllRecruitData() : {};      const allRecruitData = gameRecruit.getAllRecruitData ? gameRecruit.getAllRecruitData() : {};

            recruitId,

            hasRecruitData,            

            createdAt: message.createdAt.toISOString(),

            displayedRecruitId: extractRecruitIdFromMessage(message)      // チャンネル内の最近のbotメッセージを確認      // チャンネル内の最近のbotメッセージを確認

          });

        }      const messages = await interaction.channel.messages.fetch({ limit: 50 });      const messages = await interaction.channel.messages.fetch({ limit: 50 });

      }

      const botMessages = [];      const botMessages = [];

      const embed = new EmbedBuilder()

        .setTitle('🔧 募集デバッグ情報')            

        .setColor(0x00FF00)

        .addFields(      for (const [messageId, message] of messages) {      for (const [messageId, message] of messages) {

          {

            name: '📊 メモリ上の募集データ',        if (message.author.id === interaction.client.user.id &&         if (message.author.id === interaction.client.user.id && 

            value: Object.keys(allRecruitData).length > 0 

              ? Object.entries(allRecruitData).map(([msgId, data]) =>             message.components && message.components.length > 0) {            message.components && message.components.length > 0) {

                  `• ID: \`${data.recruitId}\` - ${data.title} (${data.recruiterId})`

                ).join('\n')          const recruitId = messageId.slice(-8);          const recruitId = messageId.slice(-8);

              : '募集データなし',

            inline: false          const hasRecruitData = !!gameRecruit.getRecruitData(messageId);          const hasRecruitData = !!gameRecruit.getRecruitData(messageId);

          },

          {                    

            name: '💬 チャンネル内のbotメッセージ',

            value: botMessages.length > 0          botMessages.push({          botMessages.push({

              ? botMessages.map(msg => 

                  `• ID: \`${msg.recruitId}\` - ${msg.hasRecruitData ? '✅' : '❌'} データあり`            messageId,            messageId,

                ).join('\n')

              : 'botメッセージなし',            recruitId,            recruitId,

            inline: false

          }            hasRecruitData,            hasRecruitData,

        )

        .setTimestamp();            createdAt: message.createdAt.toISOString(),            createdAt: message.createdAt.toISOString(),



      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });            // 実際に表示されている募集IDを取得（コンポーネントから）            // 実際に表示されている募集IDを取得（コンポーネントから）

    } catch (error) {

      console.error('Debug recruit error:', error);            displayedRecruitId: extractRecruitIdFromMessage(message)            displayedRecruitId: extractRecruitIdFromMessage(message)

      await interaction.reply({ 

        content: `デバッグ実行エラー: ${error.message}`,           });          });

        flags: MessageFlags.Ephemeral 

      });        }        }

    }

  }      }      }

};



function extractRecruitIdFromMessage(message) {

  try {      const embed = new EmbedBuilder()      const embed = new EmbedBuilder()

    if (!message.components || message.components.length === 0) return null;

            .setTitle('🔧 募集デバッグ情報')        .setTitle('🔧 募集デバッグ情報')

    for (const actionRow of message.components) {

      if (actionRow.components) {        .setColor(0x00FF00)        .setColor(0x00FF00)

        for (const component of actionRow.components) {

          if (component.type === 'TEXT_DISPLAY' && component.content) {        .addFields(        .addFields(

            const match = component.content.match(/募集ID：`(\w+)`/);

            if (match) {          {          {

              return match[1];

            }            name: '📊 メモリ上の募集データ',            name: '📊 メモリ上の募集データ',

          }

        }            value: Object.keys(allRecruitData).length > 0             value: Object.keys(allRecruitData).length > 0 

      }

    }              ? Object.entries(allRecruitData).map(([msgId, data]) =>               ? Object.entries(allRecruitData).map(([msgId, data]) => 

    return null;

  } catch (error) {                  `• ID: \`${data.recruitId}\` - ${data.title} (${data.recruiterId})`                  `• ID: \`${data.recruitId}\` - ${data.title} (${data.recruiterId})`

    console.error('募集ID抽出エラー:', error);

    return null;                ).join('\n')                ).join('\n')

  }

}              : '募集データなし',              : '募集データなし',

            inline: false            inline: false

          },          },

          {          {

            name: '💬 チャンネル内のbotメッセージ',            name: '💬 チャンネル内のbotメッセージ',

            value: botMessages.length > 0            value: botMessages.length > 0

              ? botMessages.map(msg =>               ? botMessages.map(msg => 

                  `• ID: \`${msg.recruitId}\` - ${msg.hasRecruitData ? '✅' : '❌'} データあり ${msg.displayedRecruitId && msg.displayedRecruitId !== msg.recruitId ? `(表示ID: \`${msg.displayedRecruitId}\`)` : ''}`                  `• ID: \`${msg.recruitId}\` - ${msg.hasRecruitData ? '✅' : '❌'} データあり ${msg.displayedRecruitId && msg.displayedRecruitId !== msg.recruitId ? `(表示ID: \`${msg.displayedRecruitId}\`)` : ''}`

                ).join('\n')                ).join('\n')

              : 'botメッセージなし',              : 'botメッセージなし',

            inline: false            inline: false

          }          }

        )        )

        .setTimestamp();        .setTimestamp();



      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {    } catch (error) {

      console.error('Debug recruit error:', error);      console.error('Debug recruit error:', error);

      await interaction.reply({       await interaction.reply({ 

        content: `デバッグ実行エラー: ${error.message}`,         content: `デバッグ実行エラー: ${error.message}`, 

        flags: MessageFlags.Ephemeral         flags: MessageFlags.Ephemeral 

      });      });

    }    }

  }  }

};};



// メッセージコンポーネントから実際に表示されている募集IDを抽出// メッセージコンポーネントから実際に表示されている募集IDを抽出

function extractRecruitIdFromMessage(message) {function extractRecruitIdFromMessage(message) {

  try {  try {

    if (!message.components || message.components.length === 0) return null;    if (!message.components || message.components.length === 0) return null;

        

    // Components v2の構造を探索    // Components v2の構造を探索

    for (const actionRow of message.components) {    for (const actionRow of message.components) {

      if (actionRow.components) {      if (actionRow.components) {

        for (const component of actionRow.components) {        for (const component of actionRow.components) {

          // TextDisplayコンポーネントを探す          // TextDisplayコンポーネントを探す

          if (component.type === 'TEXT_DISPLAY' && component.content) {          if (component.type === 'TEXT_DISPLAY' && component.content) {

            const match = component.content.match(/募集ID：`(\w+)`/);            const match = component.content.match(/募集ID：`(\w+)`/);

            if (match) {            if (match) {

              return match[1];              return match[1];

            }            }

          }          }

        }        }

      }      }

    }    }

    return null;    return null;

  } catch (error) {  } catch (error) {

    console.error('募集ID抽出エラー:', error);    console.error('募集ID抽出エラー:', error);

    return null;    return null;

  }  }

}}
          
          botMessages.push({
            messageId,
            recruitId,
            hasRecruitData,
            createdAt: message.createdAt.toISOString(),
            // 実際に表示されている募集IDを取得（コンポーネントから）
            displayedRecruitId: extractRecruitIdFromMessage(message)
          });
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🔧 募集デバッグ情報')
        .setColor(0x00FF00)
        .addFields(
          {
            name: '📊 メモリ上の募集データ',
            value: Object.keys(allRecruitData).length > 0 
              ? Object.entries(allRecruitData).map(([msgId, data]) => 
                  `• ID: \`${data.recruitId}\` - ${data.title} (${data.recruiterId})`
                ).join('\n')
              : '募集データなし',
            inline: false
          },
          {
            name: '💬 チャンネル内のbotメッセージ',
            value: botMessages.length > 0
              ? botMessages.map(msg => 
                  `• ID: \`${msg.recruitId}\` - ${msg.hasRecruitData ? '✅' : '❌'} データあり`
                ).join('\n')
              : 'botメッセージなし',
            inline: false
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error('debugRecruit error:', error);
      await interaction.reply({
        content: 'デバッグ情報の取得中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};