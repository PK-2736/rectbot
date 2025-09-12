module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    // 募集画像の参加/取り消し/締めなどの処理は後で実装
    // ここでは仮のログ出力のみ
    console.log(`${user.tag} reacted with ${reaction.emoji.name}`);
  },
};
