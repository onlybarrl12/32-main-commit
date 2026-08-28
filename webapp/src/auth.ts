import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

// NextAuth v5 (Auth.js) — see CLAUDE.md §3/§9 for why v5-beta instead of
// stable v4 (Next 16 / React 19 compatibility). Credentials provider only;
// AD/SSO deferred per CLAUDE.md §3.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = typeof credentials?.username === "string" ? credentials.username : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!username || !password) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.username };
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname.startsWith("/login");
      if (isLoginPage) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.userId && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
