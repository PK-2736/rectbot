const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, UserSelectMenuBuilder, StringSelectMenuBuilder } = require('discord.js');
const { pendingModalOptions } = require('./data/state');
const { safeReply } = require('../../utils/safeReply');
const { createErrorEmbed } = require('../../utils/embedHelpers');
const { listRecruitsFromRedis, getCooldownRemaining, getGuildSettings, getTemplateByName } = require('../../utils/database');
const backendFetch = require('../../utils/common/backendFetch');
const { EXEMPT_GUILD_IDS } = require('./data/constants');

const START_TIME_REGEX = /^\s*(\d{1,2}):(\d{2})\s*$/;
const START_TIME_NOW_REGEX = /^\s*(今から|now)\s*$/i;

async function enforceGuildCooldown(interaction, skipCooldown = false) {
  try {
    if (EXEMPT_GUILD_IDS.has(String(interaction.guildId))) {
      return true;
    }

    if (skipCooldown) {
      return true;
    }

    const remaining = await getCooldownRemaining(`rect:${interaction.guildId}`);
    if (remaining <= 0) {
      return true;
    }

    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    await safeReply(interaction, {
      content: `⏳ このサーバーの募集コマンドはクールダウン中です。あと ${mm}:${ss.toString().padStart(2, '0')} 待ってから再度お試しください。`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  } catch (e) {
    console.warn('[rect cooldown pre-check] failed:', e?.message || e);
    return true;
  }
}

function logRecruitCount(allRecruits) {
  const count = Array.isArray(allRecruits) ? allRecruits.length : typeof allRecruits;
  console.log('[gameRecruit.execute] listRecruitsFromRedis returned count:', count);
}

function logMatchedRecruits(matched) {
  const recruitIds = matched.map(m => m?.recruitId || m?.message_id || m?.recruit_id || '(no-id)');
  console.log('[gameRecruit.execute] matched active recruits for guild:', recruitIds);
}

function isPremiumEnabled(guildSettings) {
  return !!(guildSettings?.premium_enabled || guildSettings?.enable_dedicated_channel);
}

async function hasPremiumSubscription(userId, guildId) {
  if (!userId) return false;
  try {
    const params = new URLSearchParams({ userId: String(userId) });
    if (guildId) params.set('guildId', String(guildId));

    const status = await backendFetch(`/api/stripe/bot/subscription-status?${params.toString()}`, {
      method: 'GET'
    });

    return !!(
      status?.isPremium ||
      status?.guildSubscription?.premium_enabled ||
      status?.guildSubscription?.enable_dedicated_channel
    );
  } catch (error) {
    console.warn('[gameRecruit.execute] failed to fetch subscription status:', error?.message || error);
    return false;
  }
}

function parseLayoutJsonMaybe(layoutValue) {
  if (!layoutValue) return null;
  if (typeof layoutValue === 'object') return layoutValue;
  if (typeof layoutValue !== 'string') return null;
  try {
    const parsed = JSON.parse(layoutValue);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTemplateForRender(template) {
  if (!template || typeof template !== 'object') return null;

  const layout = parseLayoutJsonMaybe(template.layout_json)
    || parseLayoutJsonMaybe(template.layout)
    || null;

  return {
    ...template,
    layout_json: layout,
    layout,
    text_color: template.text_color || template.textColor || null,
    background_image_url: template.background_image_url || template.backgroundImageUrl || layout?.background_image_url || layout?.backgroundImageUrl || null,
    background_asset_key: template.background_asset_key || template.backgroundAssetKey || layout?.background_asset_key || layout?.backgroundAssetKey || null,
  };
}

async function getTemplateByNameWithFallback(guildId, templateName) {
  let localTemplate = null;
  let backendTemplate = null;

  // 1) Bot直結のDB
  try {
    localTemplate = await getTemplateByName(guildId, templateName);
  } catch (e) {
    console.warn('[gameRecruit.execute] local getTemplateByName failed:', e?.message || e);
  }

  // 2) フォールバック: Worker内部API
  try {
    const params = new URLSearchParams({ guildId: String(guildId || ''), name: String(templateName || '') });
    const resp = await backendFetch(`/api/plus/bot/template?${params.toString()}`, { method: 'GET' });
    backendTemplate = resp?.template || null;
  } catch (e) {
    console.warn('[gameRecruit.execute] backend get template failed:', e?.message || e);
  }

  const normalizedLocal = normalizeTemplateForRender(localTemplate);
  const normalizedBackend = normalizeTemplateForRender(backendTemplate);

  // backend側に画像情報があり、local側に無い場合はbackendを優先
  if (hasTemplateImage(normalizedBackend) && !hasTemplateImage(normalizedLocal)) {
    return normalizedBackend;
  }

  // どちらもあれば、background/layout情報をbackendで上書きマージ
  if (normalizedLocal && normalizedBackend) {
    return {
      ...normalizedLocal,
      ...normalizedBackend,
      layout_json: normalizedBackend.layout_json || normalizedLocal.layout_json || null,
      layout: normalizedBackend.layout || normalizedLocal.layout || null,
      text_color: normalizedBackend.text_color || normalizedLocal.text_color || null,
      background_image_url: normalizedBackend.background_image_url || normalizedLocal.background_image_url || null,
      background_asset_key: normalizedBackend.background_asset_key || normalizedLocal.background_asset_key || null,
    };
  }

  return normalizedLocal || normalizedBackend || null;
}

async function notifyRecruitLimitReached(interaction) {
  console.log('[gameRecruit.execute] blocking create due to 3 active recruits limit');
  await safeReply(interaction, {
    embeds: [createErrorEmbed('このサーバーでは同時に実行できる募集は3件までです。\n既存の募集をいくつか締め切ってから新しい募集を作成してください。', '募集上限到達')],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { roles: [], users: [] }
  });
}

async function enforceActiveRecruitLimit(interaction, guildSettings, premiumEnabled = false) {
  if (EXEMPT_GUILD_IDS.has(String(interaction.guildId))) {
    return true;
  }

  if (premiumEnabled) {
    return true;
  }

  if (isPremiumEnabled(guildSettings)) {
    return true;
  }

  const premiumBySubscription = await hasPremiumSubscription(interaction.user?.id, interaction.guildId);
  if (premiumBySubscription) {
    return true;
  }

  const allRecruits = await listRecruitsFromRedis();
  logRecruitCount(allRecruits);
  
  const guildIdStr = String(interaction.guildId);
  const matched = filterActiveRecruits(allRecruits, guildIdStr);
  
  logMatchedRecruits(matched);
  
  if (matched.length < 3) {
    return true;
  }

  await notifyRecruitLimitReached(interaction);
  return false;
}

function filterActiveRecruits(allRecruits, guildIdStr) {
  if (!Array.isArray(allRecruits)) {
    return [];
  }
  
  return allRecruits.filter(r => {
    const gid = String(r?.guildId ?? r?.guild_id ?? r?.guild ?? r?.metadata?.guildId ?? r?.metadata?.guild ?? '');
    const status = String(r?.status ?? '').toLowerCase();
    return gid === guildIdStr && (status === 'recruiting' || status === 'active');
  });
}

function resolveAllowedChannels(guildSettings) {
  const allowedChannels = Array.isArray(guildSettings.recruit_channels)
    ? guildSettings.recruit_channels.filter(Boolean).map(String)
    : [];
  return {
    allowedChannels,
    primaryRecruitChannel: guildSettings.recruit_channel || null
  };
}

function isChannelAllowed(allowedChannels, primaryRecruitChannel, channelId) {
  if (allowedChannels.length > 0) {
    return allowedChannels.includes(channelId);
  }
  if (primaryRecruitChannel) {
    return primaryRecruitChannel === channelId;
  }
  return true;
}

async function enforceRecruitChannel(interaction, guildSettings) {
  const { allowedChannels, primaryRecruitChannel } = resolveAllowedChannels(guildSettings);
  const allowed = isChannelAllowed(allowedChannels, primaryRecruitChannel, interaction.channelId);
  if (allowed) {
    return true;
  }

  console.log('[gameRecruit.execute] blocking create due to channel mismatch. allowed:', allowedChannels.length > 0 ? allowedChannels : primaryRecruitChannel, 'current:', interaction.channelId);
  const hint = allowedChannels.length > 0
    ? allowedChannels.map(id => `<#${id}>`).join(' / ')
    : `<#${primaryRecruitChannel}>`;
  await safeReply(interaction, {
    content: `❌ 募集はこのチャンネルでは実行できません。\n📍 募集可能チャンネル: ${hint}`,
    flags: MessageFlags.Ephemeral
  });
  return false;
}

function readOption(interaction, kind, name) {
  try {
    if (kind === 'string') return interaction.options.getString(name);
    if (kind === 'integer') return interaction.options.getInteger(name);
    if (kind === 'channel') return interaction.options.getChannel(name);
    return null;
  } catch {
    return null;
  }
}

function parseRecruitOptions(interaction) {
  const titleArg = readOption(interaction, 'string', 'タイトル') ?? readOption(interaction, 'string', 'title');
  const membersArg = readOption(interaction, 'integer', '人数') ?? readOption(interaction, 'integer', 'members');
  const startArg = readOption(interaction, 'string', '開始時間') ?? readOption(interaction, 'string', 'start');
  const voiceArg = readOption(interaction, 'string', '通話有無') ?? readOption(interaction, 'string', 'voice');
  const voiceChannel = readOption(interaction, 'channel', '通話場所');
  const legacyVoicePlace = readOption(interaction, 'string', 'voice_place');
  const templateName = readOption(interaction, 'string', 'テンプレート') ?? readOption(interaction, 'string', 'template');

  const voicePlaceArg = voiceChannel ? voiceChannel.name : (legacyVoicePlace || null);
  const voiceChannelId = voiceChannel?.id || null;
  const selectedColor = interaction.options.getString('色') || undefined;

  return {
    titleArg,
    membersArg,
    startArg,
    voiceArg,
    voicePlaceArg,
    voiceChannelId,
    selectedColor,
    templateName: templateName || null
  };
}

function mergeOptionsWithTemplate(parsedOptions, template) {
  if (!template || typeof template !== 'object') return parsedOptions;

  const imageInfo = extractTemplateImageInfo(template);
  const normalizedTemplate = {
    ...template,
    background_image_url: imageInfo.imageUrl || template.background_image_url || template.backgroundImageUrl || null,
    background_asset_key: imageInfo.assetKey || template.background_asset_key || template.backgroundAssetKey || null,
  };

  const merged = { ...parsedOptions };
  if (!merged.titleArg && normalizedTemplate.title) merged.titleArg = String(normalizedTemplate.title);

  const templateMembers = Number(normalizedTemplate.participants || 0);
  if (!merged.membersArg && Number.isFinite(templateMembers) && templateMembers >= 1) {
    merged.membersArg = Math.min(16, Math.max(1, Math.round(templateMembers)));
  }

  if (!merged.startArg && normalizedTemplate.start_time_text) {
    merged.startArg = String(normalizedTemplate.start_time_text);
  }
  if (!merged.startArg) {
    merged.startArg = '今から';
  }

  if (!merged.voiceArg && normalizedTemplate.voice_option) {
    merged.voiceArg = String(normalizedTemplate.voice_option);
  }
  if (!merged.voicePlaceArg && normalizedTemplate.voice_place) {
    merged.voicePlaceArg = String(normalizedTemplate.voice_place);
  }
  if (!merged.selectedColor && normalizedTemplate.color) {
    merged.selectedColor = String(normalizedTemplate.color).replace(/^#/, '');
  }
  merged.template = normalizedTemplate;
  return merged;
}

function extractTemplateImageInfo(template) {
  if (!template || typeof template !== 'object') {
    return { imageUrl: '', assetKey: '' };
  }

  const layout = (template.layout_json && typeof template.layout_json === 'object')
    ? template.layout_json
    : (template.layout && typeof template.layout === 'object')
      ? template.layout
      : null;

  const imageUrl = String(
    template.background_image_url
    || template.backgroundImageUrl
    || layout?.background_image_url
    || layout?.backgroundImageUrl
    || ''
  ).trim();

  const assetKey = String(
    template.background_asset_key
    || template.backgroundAssetKey
    || layout?.background_asset_key
    || layout?.backgroundAssetKey
    || ''
  ).trim();

  return { imageUrl, assetKey };
}

function hasTemplateImage(template) {
  const { imageUrl, assetKey } = extractTemplateImageInfo(template);
  return Boolean(imageUrl || assetKey);
}

async function validateRecruitInputs(interaction, { titleArg, membersArg, startArg }) {
  if (!titleArg) {
    await safeReply(interaction, { content: '❌ タイトルを指定してください。', flags: MessageFlags.Ephemeral });
    return false;
  }
  if (!membersArg || membersArg < 1 || membersArg > 16) {
    await safeReply(interaction, { content: '❌ 人数は1〜16の範囲で指定してください。', flags: MessageFlags.Ephemeral });
    return false;
  }
  if (!startArg) {
    await safeReply(interaction, { content: '❌ 開始時間（HH:mm）または「今から」を指定してください。', flags: MessageFlags.Ephemeral });
    return false;
  }

  return true;
}

function parseStartTime(startArg) {
  const startText = String(startArg ?? '').trim();
  const isNow = START_TIME_NOW_REGEX.test(startText);
  if (isNow) {
    const now = new Date();
    now.setSeconds(0, 0);
    return {
      isValid: true,
      isNow: true,
      displayStart: '今から',
      startAtISO: now.toISOString()
    };
  }

  const match = startText.match(START_TIME_REGEX);
  if (!match) {
    return {
      isValid: false,
      isNow: false,
      displayStart: startText,
      startAtISO: null
    };
  }

  const hh = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  const now = new Date();
  const startAt = new Date(now);
  startAt.setSeconds(0, 0);
  startAt.setHours(hh, mm, 0, 0);
  if (startAt.getTime() <= now.getTime()) {
    startAt.setDate(startAt.getDate() + 1);
  }

  return {
    isValid: true,
    isNow: false,
    displayStart: startText,
    startAtISO: startAt.toISOString()
  };
}

async function savePendingOptions(interaction, options) {
  try {
    if (interaction.user && interaction.user.id) {
      const prev = pendingModalOptions.get(interaction.user.id) || {};
      pendingModalOptions.set(interaction.user.id, {
        ...prev,
        panelColor: options.selectedColor,
        title: options.titleArg,
        participants: options.membersArg,
        startTime: options.displayStart,
        startAt: options.startAtISO,
        voice: options.voiceArg || null,
        voicePlace: options.voicePlaceArg,
        voiceChannelId: options.voiceChannelId,
        templateName: options.templateName || null,
        template: options.template || null
      });
      console.log('[gameRecruit.execute] saved to pendingModalOptions:', {
        userId: interaction.user.id,
        title: options.titleArg,
        participants: options.membersArg,
        startTime: options.startArg,
        panelColor: options.selectedColor
      });
    }
  } catch (e) {
    console.warn('pendingModalOptions set failed:', e?.message || e);
  }
}

function buildDefaultRoleOptions() {
  return [
    {
      label: '通知ロールなし',
      value: 'none',
      description: '通知ロールを使用せずに募集します',
      default: true
    },
    {
      label: '@everyone',
      value: 'everyone',
      description: 'サーバー全員に通知'
    },
    {
      label: '@here',
      value: 'here',
      description: 'オンライン中のメンバーに通知'
    }
  ];
}

function extractConfiguredRoleIds(guildSettings) {
  const roles = [];
  if (Array.isArray(guildSettings.notification_roles)) roles.push(...guildSettings.notification_roles.filter(Boolean));
  if (guildSettings.notification_role) roles.push(guildSettings.notification_role);
  return [...new Set(roles.map(String))].filter(Boolean);
}

async function fetchRoleOptions(interaction, configuredRoleIds) {
  const roleOptions = [];
  
  for (const roleId of configuredRoleIds.slice(0, 22)) {
    if (roleId === 'everyone' || roleId === 'here') {
      continue;
    }
    try {
      const role = await interaction.guild.roles.fetch(roleId);
      if (role) {
        roleOptions.push({
          label: role.name.slice(0, 100),
          value: roleId,
          description: `通知ロール: ${role.name}`.slice(0, 100)
        });
      }
    } catch (e) {
      console.warn('[gameRecruit.execute] failed to fetch role:', roleId, e?.message);
    }
  }
  
  return roleOptions;
}

async function buildNotificationRoleOptions(interaction, guildSettings) {
  const roleOptions = buildDefaultRoleOptions();
  const configuredRoleIds = extractConfiguredRoleIds(guildSettings);

  if (configuredRoleIds.length > 0) {
    const additionalRoleOptions = await fetchRoleOptions(interaction, configuredRoleIds);
    roleOptions.push(...additionalRoleOptions);
  }

  return roleOptions;
}

function buildRecruitModal(interaction, roleOptions) {
  const modal = new ModalBuilder().setCustomId('recruitModal').setTitle('🎮 募集内容入力');

  const existingMembersSelect = new LabelBuilder()
    .setLabel('既存参加者（任意）')
    .setUserSelectMenuComponent(
      new UserSelectMenuBuilder()
        .setCustomId('existingMembers')
        .setPlaceholder('既に参加しているメンバーを選択')
        .setRequired(false)
        .setMinValues(0)
        .setMaxValues(15)
        .setDefaultUsers([interaction.user.id])
    );

  const notificationRoleSelect = new LabelBuilder()
    .setLabel('通知ロール（任意）')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('notificationRole')
        .setPlaceholder('通知するロールを選択')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(roleOptions)
    );

  const contentInput = new LabelBuilder()
    .setLabel('募集内容')
    .setTextInputComponent(
      new TextInputBuilder()
        .setCustomId('content')
        .setPlaceholder('例: ガチエリア / 初心者歓迎 / 2時間')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
    );

  modal.addComponents(existingMembersSelect, notificationRoleSelect, contentInput);
  return modal;
}

// execute handler split from gameRecruit.js
async function execute(interaction) {
  console.log('[gameRecruit.execute] invoked by', interaction.user?.id, 'command:', interaction.commandName, 'guild:', interaction.guildId, 'channel:', interaction.channelId);

  try {
    // ギルド設定
    const guildSettings = await getGuildSettings(interaction.guildId);
    console.log('[gameRecruit.execute] guildSettings for', interaction.guildId, ':', guildSettings && { recruit_channel: guildSettings.recruit_channel, defaultTitle: guildSettings.defaultTitle });

    const premiumByGuild = isPremiumEnabled(guildSettings);
    const premiumBySubscription = premiumByGuild
      ? false
      : await hasPremiumSubscription(interaction.user?.id, interaction.guildId);
    const premiumEnabled = premiumByGuild || premiumBySubscription;

    // Guild-level cooldown pre-check (2 minutes), except exempt/premium guilds
    const cooldownOk = await enforceGuildCooldown(interaction, premiumEnabled);
    if (!cooldownOk) return;

    const isTemplateCommand = interaction.commandName === 'rect_template';

    if (isTemplateCommand) {
      if (!premiumEnabled) {
        await safeReply(interaction, {
          content: '❌ `/rect_template` はサブスクリプション契約サーバーでのみ利用できます。',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { roles: [], users: [] }
        });
        return;
      }
    }

    const recruitLimitOk = await enforceActiveRecruitLimit(interaction, guildSettings, premiumEnabled);
    if (!recruitLimitOk) return;

    // 募集チャンネル強制（複数対応）
    const channelAllowed = await enforceRecruitChannel(interaction, guildSettings);
    if (!channelAllowed) return;

    // スラッシュ引数の取得（日本語/英語両対応、必須でも例外にしない）
    let parsedOptions = parseRecruitOptions(interaction);

    if (isTemplateCommand && !parsedOptions.templateName) {
      await safeReply(interaction, {
        content: '❌ `/rect_template` では「テンプレート」を指定してください。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (parsedOptions.templateName) {
      try {
        const template = await getTemplateByNameWithFallback(interaction.guildId, parsedOptions.templateName);
        if (!template && isTemplateCommand) {
          await safeReply(interaction, {
            content: `❌ テンプレート「${parsedOptions.templateName}」が見つかりません。`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (template) {
          parsedOptions = mergeOptionsWithTemplate(parsedOptions, template);
        }
      } catch (e) {
        if (isTemplateCommand) {
          await safeReply(interaction, {
            content: '❌ テンプレートの読み込みに失敗しました。しばらくしてから再試行してください。',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        console.warn('[gameRecruit.execute] template preload failed:', e?.message || e);
      }
    }

    const baseValid = await validateRecruitInputs(interaction, parsedOptions);
    if (!baseValid) return;

    const startParse = parseStartTime(parsedOptions.startArg);
    if (!startParse.isValid) {
      await safeReply(interaction, { content: '❌ 開始時間は HH:mm の形式、または「今から」で指定してください（例: 21:00 ／ 今から）。', flags: MessageFlags.Ephemeral });
      return;
    }

    await savePendingOptions(interaction, {
      ...parsedOptions,
      displayStart: startParse.displayStart,
      startAtISO: startParse.startAtISO
    });

    // モーダル表示(内容+既存参加者+通知ロール)
    console.log('[gameRecruit.execute] showing modal for user:', interaction.user?.id);
    const roleOptions = await buildNotificationRoleOptions(interaction, guildSettings);
    const modal = buildRecruitModal(interaction, roleOptions);
    await interaction.showModal(modal);
    console.log('[gameRecruit.execute] showModal called successfully for', interaction.user?.id);
  } catch (error) {
    console.error('Modal display error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'モーダル表示エラーが発生しました。', flags: MessageFlags.Ephemeral, allowedMentions: { roles: [], users: [] } });
    }
  }
}

module.exports = { execute };
