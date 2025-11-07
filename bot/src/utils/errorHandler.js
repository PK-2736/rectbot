/**
 * 統一エラーハンドラー
 * Sentry連携とDiscord通知を提供
 */

const Sentry = require('./sentry');

class ErrorHandler {
  /**
   * エラーハンドリングのメイン処理
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - 追加コンテキスト情報
   */
  static async handle(error, context = {}) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: new Date().toISOString(),
      ...context
    };
    
    // コンソール出力
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Error Occurred');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`Message: ${error.message}`);
    console.error(`Type: ${error.name}`);
    if (context.command) console.error(`Command: ${context.command}`);
    if (context.userId) console.error(`User ID: ${context.userId}`);
    if (context.guildId) console.error(`Guild ID: ${context.guildId}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Sentry送信
    if (process.env.SENTRY_DSN) {
      try {
        Sentry.captureException(error, {
          extra: errorInfo,
          tags: {
            component: context.component || 'bot',
            severity: context.severity || 'error'
          }
        });
      } catch (sentryError) {
        console.error('Failed to send error to Sentry:', sentryError);
      }
    }
    
    // 重大エラーの場合はDiscord通知
    if (this.isCritical(error, context)) {
      await this.notifyDiscord(error, errorInfo);
    }
  }
  
  /**
   * エラーが重大かどうかを判定
   */
  static isCritical(error, context) {
    return (
      context.severity === 'critical' ||
      error.name === 'FatalError' ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('Authentication failed')
    );
  }
  
  /**
   * Discordへエラー通知を送信
   */
  static async notifyDiscord(error, errorInfo) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    
    try {
      const embed = {
        title: '🚨 Critical Error Detected',
        description: `\`\`\`${error.message}\`\`\``,
        color: 0xFF0000,
        fields: [
          {
            name: 'Error Type',
            value: error.name,
            inline: true
          },
          {
            name: 'Component',
            value: errorInfo.component || 'bot',
            inline: true
          },
          {
            name: 'Timestamp',
            value: errorInfo.timestamp,
            inline: false
          }
        ],
        footer: {
          text: 'Rectbot Error Monitor'
        }
      };
      
      if (errorInfo.command) {
        embed.fields.push({
          name: 'Command',
          value: errorInfo.command,
          inline: true
        });
      }
      
      if (errorInfo.guildId) {
        embed.fields.push({
          name: 'Guild ID',
          value: errorInfo.guildId,
          inline: true
        });
      }
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });
      
      if (!response.ok) {
        console.error('Failed to send Discord notification:', response.statusText);
      }
    } catch (notifyError) {
      console.error('Error sending Discord notification:', notifyError);
    }
  }
  
  /**
   * Interactionエラー用のヘルパー
   */
  static async handleInteractionError(interaction, error, context = {}) {
    await this.handle(error, {
      ...context,
      component: 'bot',
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });
    
    // ユーザーへのフィードバック
    const errorMessage = this.getUserFriendlyMessage(error);
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          flags: (require('discord.js').MessageFlags).Ephemeral
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: (require('discord.js').MessageFlags).Ephemeral
        });
      }
    } catch (replyError) {
      console.error('Failed to send error message to user:', replyError);
    }
  }
  
  /**
   * ユーザーフレンドリーなエラーメッセージを生成
   */
  static getUserFriendlyMessage(error) {
    const defaultMessage = '❌ エラーが発生しました。しばらく待ってから再度お試しください。';
    
    const errorMessages = {
      'ECONNREFUSED': '🔌 サーバーとの接続に失敗しました。',
      'Authentication failed': '🔑 認証に失敗しました。',
      'Rate limit': '⏱️ リクエストが多すぎます。少し待ってから再試行してください。',
      'Missing permissions': '🚫 必要な権限がありません。'
    };
    
    for (const [key, message] of Object.entries(errorMessages)) {
      if (error.message.includes(key)) {
        return message;
      }
    }
    
    return defaultMessage;
  }
}

module.exports = ErrorHandler;
