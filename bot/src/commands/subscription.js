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
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://recrubo.net';
const TERMS_URL = process.env.TERMS_URL || `${SITE_BASE_URL}/terms`;
const PRIVACY_POLICY_URL = process.env.PRIVACY_POLICY_URL || `${SITE_BASE_URL}/privacy`;
const COMMERCE_POLICY_URL = process.env.COMMERCE_POLICY_URL || TERMS_URL;
const STRIPE_PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID || process.env.STRIPE_PRICE_ID || null;

// Price IDは最終的にbackend側の環境変数を正とする（test/live不一致対策）。
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

function formatDateTime(value) {
  if (!value) return '未記録';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '未記録';
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function formatAmount(amount, currency) {
  if (amount == null) return '未記録';
  const value = Number(amount) / 100;
  const upperCurrency = String(currency || 'JPY').toUpperCase();
  return `${value.toLocaleString('ja-JP')} ${upperCurrency}`;
}

function buildPreCheckoutEmbed() {
  return new EmbedBuilder()
    .setColor(0x1D4ED8)
    .setTitle('📘 ご確認ください')
    .setDescription('決済ページへ進む前に、以下の内容をご確認ください。')
    .addFields(
      { name: '確認必須', value: '・商品取り扱い\n・利用規約\n・プライバシーポリシー' },
      { name: '同意方法', value: '内容確認後に「同意して決済ページへ進む」を押してください。' }
    )
    .setFooter({ text: '同意ボタン押下後にStripe Checkout URLを発行します。' })
    .setTimestamp();
}

function buildPreCheckoutComponents(userId) {
  const links = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('商品取り扱い').setURL(COMMERCE_POLICY_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('利用規約').setURL(TERMS_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('プライバシーポリシー').setURL(PRIVACY_POLICY_URL)
  );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`subscription_pay_agree_${userId}`)
      .setStyle(ButtonStyle.Success)
      .setLabel('同意して決済ページへ進む'),
    new ButtonBuilder()
      .setCustomId(`subscription_pay_cancel_${userId}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('キャンセル')
  );

  return [links, actions];
}

function buildCheckoutEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('💳 サブスクリプション決済')
    .setDescription('以下のボタンからStripeの決済ページへ進んでください。')
    .addFields(
      { name: 'プラン', value: 'プレミアムプラン', inline: true },
      { name: '決済方式', value: 'Stripe Checkout', inline: true }
    )
    .setFooter({ text: '決済完了後、Webhook経由で自動反映されます。' })
    .setTimestamp();
}

async function handlePayAgreement(interaction) {
  const ownerUserId = String(interaction.customId || '').replace('subscription_pay_agree_', '');
  if (!ownerUserId || ownerUserId !== interaction.user.id) {
    await interaction.reply({
      content: '⚠️ このボタンはコマンド実行者のみ操作できます。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const result = await createCheckoutLink(interaction.user.id, interaction.guildId || 'dm');
  if (!result?.checkoutUrl) {
    throw new Error('checkoutUrl is missing');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('決済ページを開く')
      .setURL(result.checkoutUrl)
  );

  await interaction.update({
    embeds: [buildCheckoutEmbed()],
    components: [row]
  });
}

async function handlePayCancel(interaction) {
  const ownerUserId = String(interaction.customId || '').replace('subscription_pay_cancel_', '');
  if (!ownerUserId || ownerUserId !== interaction.user.id) {
    await interaction.reply({
      content: '⚠️ このボタンはコマンド実行者のみ操作できます。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.update({
    content: '⛔ 決済手続きをキャンセルしました。',
    embeds: [],
    components: []
  });
}

async function createCheckoutLink(userId, guildId) {
  const payload = {
    userId,
    guildId
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
        await safeReply(interaction, {
          embeds: [buildPreCheckoutEmbed()],
          components: buildPreCheckoutComponents(interaction.user.id),
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (subcommand === 'status') {
        const status = await fetchSubscriptionStatus(interaction.user.id);
        const label = getStatusLabel(status?.status);
        const subscription = status?.subscription || null;
        const latestPurchase = status?.latestPurchase || null;

        const fields = [
          { name: '状態', value: label, inline: true },
          { name: 'プレミアム', value: status?.isPremium ? '有効' : '無効', inline: true }
        ];

        if (subscription?.current_period_end) {
          fields.push({ name: '次回更新日', value: formatDateTime(subscription.current_period_end), inline: false });
        }

        if (latestPurchase) {
          fields.push({
            name: '最終購入',
            value: `${formatDateTime(latestPurchase.purchased_at)}\n金額: ${formatAmount(latestPurchase.amount, latestPurchase.currency)}\nプラン: ${latestPurchase.billing_interval || '未記録'}`,
            inline: false
          });
        }

        if (subscription?.stripe_subscription_id) {
          fields.push({ name: 'Subscription ID', value: subscription.stripe_subscription_id, inline: false });
        }

        const embed = new EmbedBuilder()
          .setColor(status?.isPremium ? 0x22C55E : 0xF97316)
          .setTitle('📊 サブスクリプション状態')
          .addFields(fields)
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

module.exports.handleButton = async function handleButton(interaction) {
  if (!interaction?.isButton?.()) return;

  if (interaction.customId?.startsWith('subscription_pay_agree_')) {
    await handlePayAgreement(interaction);
    return;
  }

  if (interaction.customId?.startsWith('subscription_pay_cancel_')) {
    await handlePayCancel(interaction);
  }
};
