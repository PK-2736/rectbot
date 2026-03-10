const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const backendFetch = require('../utils/common/backendFetch');
const { safeReply } = require('../utils/safeReply');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.recrubo.net';
const STRIPE_PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID || process.env.STRIPE_PRICE_ID || null;

// 起動時に環境変数の状態をログ出力（デバッグ用）
console.log('[subscription] Environment variables check:', {
  STRIPE_PREMIUM_PRICE_ID_exists: !!process.env.STRIPE_PREMIUM_PRICE_ID,
  STRIPE_PRICE_ID_exists: !!process.env.STRIPE_PRICE_ID,
  resolved_value: STRIPE_PREMIUM_PRICE_ID ? `${STRIPE_PREMIUM_PRICE_ID.slice(0, 15)}...` : 'null',
  DASHBOARD_URL_exists: !!process.env.DASHBOARD_URL
});

function getStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return '有効';
  if (normalized === 'trialing') return 'トライアル中';
  if (normalized === 'canceled') return 'キャンセル済み';
  if (normalized === 'past_due') return '支払い失敗';
  if (normalized === 'none') return '未契約';
  return status || '不明';
}

async function createCheckoutLink(userId, guildId) {
  const payload = {
    userId,
    guildId,
    priceId: STRIPE_PREMIUM_PRICE_ID
  };

  return backendFetch('/api/stripe/bot/create-checkout-link', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function fetchSubscriptionStatus(userId) {
  const params = new URLSearchParams({ userId });
  return backendFetch(`/api/stripe/bot/subscription-status?${params.toString()}`, {
    method: 'GET'
  });
}

async function createPortalLink(userId) {
  return backendFetch('/api/stripe/bot/create-portal-link', {
    method: 'POST',
    body: JSON.stringify({ userId, returnUrl: DASHBOARD_URL })
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('subscription')
    .setDescription('サブスクリプションの契約・状態確認・管理を行います')
    .addSubcommand(sub =>
      sub
        .setName('pay')
        .setDescription('Stripe決済ページURLを発行します'))
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('現在のサブスクリプション状態を確認します'))
    .addSubcommand(sub =>
      sub
        .setName('manage')
        .setDescription('Stripeの契約管理ページURLを発行します')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'pay') {
        if (!STRIPE_PREMIUM_PRICE_ID) {
          console.error('[subscription pay] STRIPE_PREMIUM_PRICE_ID not set:', {
            STRIPE_PREMIUM_PRICE_ID: process.env.STRIPE_PREMIUM_PRICE_ID,
            STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID
          });
          await safeReply(interaction, {
            content: '❌ `STRIPE_PREMIUM_PRICE_ID` または `STRIPE_PRICE_ID` が未設定です。管理者に連絡してください。\n\n環境変数を `.env` に追加後、Botを再起動してください。',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const result = await createCheckoutLink(interaction.user.id, interaction.guildId || 'dm');
        if (!result?.checkoutUrl) {
          throw new Error('checkoutUrl is missing');
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('💳 サブスクリプション決済')
          .setDescription('以下のボタンからStripeの決済ページへ進んでください。')
          .addFields(
            { name: 'プラン', value: 'プレミアムプラン', inline: true },
            { name: '決済方式', value: 'Stripe Checkout', inline: true }
          )
          .setFooter({ text: '決済完了後、Webhook経由で自動反映されます。' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('決済ページを開く')
            .setURL(result.checkoutUrl)
        );

        await safeReply(interaction, {
          embeds: [embed],
          components: [row],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (subcommand === 'status') {
        const status = await fetchSubscriptionStatus(interaction.user.id);
        const label = getStatusLabel(status?.status);

        const embed = new EmbedBuilder()
          .setColor(status?.isPremium ? 0x22C55E : 0xF97316)
          .setTitle('📊 サブスクリプション状態')
          .addFields(
            { name: '状態', value: label, inline: true },
            { name: 'プレミアム', value: status?.isPremium ? '有効' : '無効', inline: true }
          )
          .setTimestamp();

        await safeReply(interaction, {
          embeds: [embed],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (subcommand === 'manage') {
        try {
          const portal = await createPortalLink(interaction.user.id);
          if (!portal?.portalUrl) throw new Error('portalUrl is missing');

          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🛠️ サブスクリプション管理')
            .setDescription('以下のボタンからStripeの管理ページを開けます。')
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel('管理ページを開く')
              .setURL(portal.portalUrl)
          );

          await safeReply(interaction, {
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
          });
        } catch (error) {
          if (error?.status === 404) {
            await safeReply(interaction, {
              content: 'ℹ️ 契約中のサブスクリプションが見つかりません。先に `/subscription pay` を実行してください。',
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          throw error;
        }
      }
    } catch (error) {
      console.error('[subscription] command error:', error);
      await safeReply(interaction, {
        content: '❌ サブスクリプション処理中にエラーが発生しました。時間をおいて再度お試しください。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
