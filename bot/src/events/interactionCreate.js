// --- interactionCreate event handler ---
// P0修正: 共通エラーハンドラーを使用し、deferReplyを標準化
const { MessageFlags } = require('discord.js');
const { safeRespond, handleCommandSafely, handleComponentSafely } = require('../utils/interactionHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      console.log(
        `[interaction] received: type=${interaction.type}` +
          `${interaction.isChatInputCommand && interaction.isChatInputCommand() ? ` command=${interaction.commandName}` : ''}` +
          `${interaction.isButton && interaction.isButton() ? ` button=${interaction.customId}` : ''}` +
          `${interaction.isStringSelectMenu && interaction.isStringSelectMenu() ? ` select=${interaction.customId}` : ''}`
      );
    } catch (_) {}

    // デデュープ: すでに処理済みのインタラクションIDなら無視
    try {
      const hasSet = client && client.processedInteractions && typeof client.processedInteractions.has === 'function' && client.processedInteractions.has(interaction.id);
      if (hasSet) {
        console.log(`[interactionCreate] Skipping already-processed interaction id=${interaction.id}`);
        return;
      }
      if (client && client.processedInteractions && typeof client.processedInteractions.add === 'function') {
        client.processedInteractions.add(interaction.id);
        setTimeout(() => {
          try {
            client.processedInteractions.delete(interaction.id);
          } catch (e) {
            console.warn('[interactionCreate] Failed to remove interaction id from processedInteractions', e?.message || e);
          }
        }, client.DEDUPE_TTL_MS || 3000);
      }
    } catch (e) {
      console.error('[interactionCreate] Error during dedupe check:', e);
    }

    // 注意: safeRespond は共通ユーティリティからインポートしたものを使用する（ローカル定義しない）

    // ギルド設定コマンド解決ヘルパー（setting が優先）
    const getGuildSettingsCommand = () => client.commands.get('setting') || client.commands.get('rect-setting');

    // オートコンプリート（タイトル候補など）
    if (interaction.isAutocomplete && interaction.isAutocomplete()) {
      try {
        // コマンド別のオートコンプリート処理
        const command = client.commands.get(interaction.commandName);
        if (command && typeof command.autocomplete === 'function') {
          await command.autocomplete(interaction);
          return;
        }

        const focused = interaction.options.getFocused(true);
        const name = focused?.name;
        const value = (focused?.value || '').toString();
        const choices = [];
        // タイトルのオートコンプリート: 既定タイトルを提示
        if (name === 'タイトル') {
          try {
            const { getGuildSettings } = require('../utils/db');
            const settings = await getGuildSettings(interaction.guildId).catch(() => null);
            const def = settings?.defaultTitle;
            if (def && (!value || def.includes(value))) {
              choices.push({ name: `既定: ${def}`, value: def });
            }
          } catch (_) {}
        }
        // 開始時間のオートコンプリート: 「今から」を候補に
        if (name === '開始時間') {
          const label = '今から';
          // 入力が空、または「いま」「ima」「now」などに近い時に提示
          const v = (value || '').toLowerCase();
          const shouldSuggest = !v || ['いま','今','ima','now'].some(k => v.includes(k));
          if (shouldSuggest) {
            choices.push({ name: label, value: label });
          }
        }
        await interaction.respond(choices.slice(0, 10));
      } catch (e) {
        console.warn('[interactionCreate] autocomplete error:', e?.message || e);
      }
      return;
    }

    // P0修正: スラッシュコマンドの処理を統一ハンドラーでラップ
    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        try {
          console.warn(`[interactionCreate] Command handler not found for '${interaction.commandName}'. Available commands: ${[...client.commands.keys()].join(', ')}`);
        } catch (e) {
          console.warn('[interactionCreate] Command handler not found and failed to list available commands');
        }
        return;
      }
      
      // 統一エラーハンドリング: deferReply + try/catch + 安全な返信
      const deferNeeded = !(command && command.noDefer === true);
      await handleCommandSafely(interaction, async (inter) => {
        console.log(`[interactionCreate] about to call execute for command=${interaction.commandName}, executeType=${typeof command.execute}`);
        await command.execute(inter);
        console.log(`[interactionCreate] execute returned for command=${interaction.commandName}`);
      }, { defer: deferNeeded, deferOptions: { ephemeral: true } });
      return;
    }

    // P0修正: セレクトメニューの処理を統一ハンドラーでラップ
    if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
      // ギルド設定のセレクトメニュー（カテゴリ選択含む）
      if (interaction.customId && (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_') || interaction.customId === 'settings_category_menu')) {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (select) - found=${Boolean(guildSettings)}`);
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          await handleComponentSafely(interaction, () => guildSettings.handleSelectMenuInteraction(interaction));
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for select menu. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond(interaction, { content: '設定ハンドラが見つかりませんでした。', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      // 募集クローズ用セレクトメニュー
      if (interaction.customId === 'rect_close_select') {
        const closeCmd = client.commands.get('rect-close');
        if (closeCmd && typeof closeCmd.handleSelectMenu === 'function') {
          await handleComponentSafely(interaction, () => closeCmd.handleSelectMenu(interaction));
        }
        return;
      }

      // ヘルプコマンドのセレクトメニュー
      if (interaction.customId === 'help_command_select') {
        const helpCommand = client.commands.get('help');
        if (helpCommand && typeof helpCommand.handleSelectMenu === 'function') {
          await handleComponentSafely(interaction, () => helpCommand.handleSelectMenu(interaction));
        }
      }
      return;
    }

    // ロールセレクト/チャンネルセレクトの処理 (role/channel select)
    if ((interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) || (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu())) {
      console.log(`[interactionCreate] Role/Channel select menu - customId: ${interaction.customId}, type: ${interaction.type}`);
      if (interaction.customId && (interaction.customId.startsWith('channel_select_') || interaction.customId.startsWith('role_select_'))) {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (role/channel select) - found=${Boolean(guildSettings)}`);
        if (guildSettings && typeof guildSettings.handleSelectMenuInteraction === 'function') {
          try {
            await guildSettings.handleSelectMenuInteraction(interaction);
          } catch (error) {
            console.error('ギルド設定セレクトメニュー処理中にエラー:', error);
            await safeRespond(interaction, { content: 'メニュー処理でエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for role/channel select. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond(interaction, { content: '設定ハンドラが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
      }
      return;
    }

    // モーダル送信(type=5)の処理
    if ((interaction.isModalSubmit && interaction.isModalSubmit()) || interaction.type === 5) {
      console.log('[interactionCreate] Modal submit detected, customId:', interaction.customId);
      
      // ギルド設定のモーダル処理
      if (interaction.customId === 'default_title_modal' || interaction.customId === 'default_color_modal') {
        const guildSettings = getGuildSettingsCommand();
        console.log(`[interactionCreate] routing to guildSettings (modal) - found=${Boolean(guildSettings)}`);
        if (guildSettings && typeof guildSettings.handleModalSubmit === 'function') {
          try {
            await guildSettings.handleModalSubmit(interaction);
          } catch (error) {
            console.error('ギルド設定モーダル処理中にエラー:', error);
            await safeRespond(interaction, { content: `モーダル処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        } else {
          console.warn('[interactionCreate] guildSettings handler not found for modal. Available commands:', [...client.commands.keys()].join(', '));
          await safeRespond(interaction, { content: '設定ハンドラが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      // editRecruitコマンドのモーダル処理
      if (interaction.customId && interaction.customId.startsWith('editRecruitModal_')) {
        console.log('[interactionCreate] Routing to rect-edit handleModalSubmit');
        const editRecruit = client.commands.get('rect-edit');
        console.log('[interactionCreate] editRecruit command found:', Boolean(editRecruit), 'has handleModalSubmit:', editRecruit && typeof editRecruit.handleModalSubmit === 'function');
        if (editRecruit && typeof editRecruit.handleModalSubmit === 'function') {
          try {
            await editRecruit.handleModalSubmit(interaction);
          } catch (error) {
            console.error('編集モーダル送信処理中にエラー:', error);
            await safeRespond(interaction, { content: `編集モーダル送信処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        }
        return;
      }

      // フレンドコード登録のモーダル処理
      if (interaction.customId === 'friend_code_add_modal') {
        const linkAdd = client.commands.get('link-add');
        if (linkAdd && typeof linkAdd.handleModalSubmit === 'function') {
          try {
            await linkAdd.handleModalSubmit(interaction);
          } catch (error) {
            console.error('フレンドコード登録モーダル処理中にエラー:', error);
            await safeRespond(interaction, { content: `フレンドコード登録処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
          }
        }
        return;
      }

      // gameRecruitコマンドのモーダルのみ処理
      const gameRecruit = client.commands.get('rect');
      if (gameRecruit && typeof gameRecruit.handleModalSubmit === 'function') {
        try {
          await gameRecruit.handleModalSubmit(interaction);
        } catch (error) {
          console.error('モーダル送信処理中にエラー:', error);
          await safeRespond(interaction, { content: `モーダル送信処理でエラー: ${error.message || error}`, flags: require('discord.js').MessageFlags.Ephemeral }).catch(() => {});
        }
      }
      return;
    }

    // P0修正: ボタンインタラクションの処理を統一ハンドラーでラップ
    if (interaction.isButton && interaction.isButton()) {
      // まずはシステムボタン（ロール付与・招待URL発行など）を処理
      try {
        const id = interaction.customId || '';
        // アップデート通知ロール付与/削除
        if (id.startsWith('grant_role_') || id.startsWith('remove_role_')) {
          await handleComponentSafely(interaction, async () => {
            const isGrant = id.startsWith('grant_role_');
            const roleId = id.replace(isGrant ? 'grant_role_' : 'remove_role_', '');
            if (!interaction.guild) {
              await safeRespond(interaction, { content: '❌ ギルド外では実行できません。', flags: require('discord.js').MessageFlags.Ephemeral });
              return;
            }
            const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
              await safeRespond(interaction, { content: '❌ 対象ロールが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral });
              return;
            }
            const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (!member) {
              await safeRespond(interaction, { content: '❌ メンバー情報を取得できませんでした。', flags: require('discord.js').MessageFlags.Ephemeral });
              return;
            }
            try {
              if (isGrant) {
                if (member.roles.cache.has(role.id)) {
                  await safeRespond(interaction, { content: 'ℹ️ そのロールは既に付与されています。', flags: require('discord.js').MessageFlags.Ephemeral });
                } else {
                  await member.roles.add(role.id, 'Recrubo: update notification self-assign');
                  await safeRespond(interaction, { content: '✅ ロールを付与しました。', flags: require('discord.js').MessageFlags.Ephemeral });
                }
              } else {
                if (!member.roles.cache.has(role.id)) {
                  await safeRespond(interaction, { content: 'ℹ️ そのロールは付与されていません。', flags: require('discord.js').MessageFlags.Ephemeral });
                } else {
                  await member.roles.remove(role.id, 'Recrubo: update notification self-remove');
                  await safeRespond(interaction, { content: '✅ ロールを外しました。', flags: require('discord.js').MessageFlags.Ephemeral });
                }
              }
            } catch (e) {
              console.error('[interactionCreate] role assign/remove failed:', e?.message || e);
              await safeRespond(interaction, { content: '❌ ロールの変更に失敗しました。ボット権限をご確認ください。', flags: require('discord.js').MessageFlags.Ephemeral });
            }
          });
          return;
        }

        // サポート招待URLのワンタイム発行（Worker 経由で Bot 招待の一回限りURLを生成）
        if (id === 'one_time_support_invite') {
          await handleComponentSafely(interaction, async () => {
            try {
              const backendFetch = require('../utils/backendFetch');
              console.log('[interactionCreate] one_time_support_invite button clicked');
              let resp;
              try {
                resp = await backendFetch('/api/bot-invite/one-time', { method: 'POST' });
                console.log('[interactionCreate] Backend response:', { ok: resp?.ok, url: resp?.url ? resp.url.slice(0, 60) + '...' : undefined });
              } catch (err) {
                // 認証不足（SERVICE_TOKEN未設定や不一致）・ネットワークエラーの扱い
                const status = err?.status;
                console.error('[interactionCreate] backendFetch error:', { status, message: err?.message });
                if (status === 401) {
                  await safeRespond(interaction, { content: '❌ 招待URLを発行できません（認証エラー）。管理者に連絡してください。', flags: require('discord.js').MessageFlags.Ephemeral });
                  return;
                }
                throw err;
              }
              if (!resp?.ok || !resp?.url) {
                console.error('[interactionCreate] Invalid response:', resp);
                await safeRespond(interaction, { content: '❌ 招待URLの発行に失敗しました。しばらくして再試行してください。', flags: require('discord.js').MessageFlags.Ephemeral });
                return;
              }
              // ランディング（ワンタイム）URLを返す（クリック時に消費 → Discord OAuth2 へリダイレクト）
              console.log('[interactionCreate] Sending invite URL to user');
              await safeRespond(interaction, { content: `✅ 一回限りの招待リンクを発行しました。
<${resp.url}>`, flags: require('discord.js').MessageFlags.Ephemeral });
            } catch (e) {
              console.error('[interactionCreate] one-time bot invite generate failed:', e?.message || e);
              await safeRespond(interaction, { content: '❌ 招待URLの発行中にエラーが発生しました。', flags: require('discord.js').MessageFlags.Ephemeral });
            }
          });
          return;
        }

        // helpコマンドのボタンを処理
        if (id === 'help_back') {
          const helpCommand = client.commands.get('help');
          if (helpCommand && typeof helpCommand.handleButton === 'function') {
            await handleComponentSafely(interaction, () => helpCommand.handleButton(interaction));
            return;
          }
        }
      } catch (e) {
        console.error('[interactionCreate] system button handling error:', e?.message || e);
      }

      try {
        const id = interaction.customId || '';
        const guildSettingsButtons = new Set([
          'set_recruit_channel',
          'set_recruit_channels',
          'set_notification_role',
          'set_notification_roles',
          'toggle_everyone',
          'toggle_here',
          'toggle_recruit_style',
          'toggle_dedicated_channel',
          'set_dedicated_category',
          'set_default_title',
          'set_default_color',
          'set_update_channel',
          'reset_all_settings',
          'finalize_settings'
        ]);

        if (guildSettingsButtons.has(id)) {
          const guildSettings = getGuildSettingsCommand();
          if (guildSettings && typeof guildSettings.handleButtonInteraction === 'function') {
            await handleComponentSafely(interaction, () => guildSettings.handleButtonInteraction(interaction));
            return;
          }
          await safeRespond(interaction, { content: '⚠️ 募集設定ボタンのハンドラが見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral });
          return;
        }
      } catch (buttonRouteError) {
        console.error('[interactionCreate] guild settings button routing error:', buttonRouteError?.message || buttonRouteError);
      }

      // 次に、gameRecruitコマンドのボタンを処理（参加者管理・UI更新はgameRecruit.jsに一元化）
      const gameRecruit = client.commands.get('rect');
      if (gameRecruit && typeof gameRecruit.handleButton === 'function') {
        await handleComponentSafely(interaction, () => gameRecruit.handleButton(interaction));
        return;
      }

      // どのハンドラにも該当しない場合、エフェメラルで案内（サイレント失敗を防止）
      try {
        await safeRespond(interaction, { content: '⚠️ このボタンの処理が見つかりませんでした。', flags: require('discord.js').MessageFlags.Ephemeral });
      } catch (_) {}
      return;
    }
  },
};

