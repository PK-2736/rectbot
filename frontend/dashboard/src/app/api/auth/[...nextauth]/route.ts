import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const handler = NextAuth({
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || process.env.DISCORD_CLIENT_SECRET,
  callbacks: {
    async session({ session, token, user }) {
      // 管理者IDリスト（必要に応じて追加・外部化可能）
      const adminIds = [
        "1048950201974542477", // 例: あなたのDiscordユーザーID
        // 他の管理者IDをここに追加
      ];
      if (!session.user) session.user = {};
      if (token.sub) {
        session.user.id = token.sub;
        session.user.isAdmin = adminIds.includes(token.sub);
      } else {
        session.user.isAdmin = false;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
