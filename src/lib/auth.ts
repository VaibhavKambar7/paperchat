import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma";
import { requireEnv, requireEnvs } from "@/lib/env";

requireEnvs(
  ["NEXTAUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  "auth",
);

export const authOptions: NextAuthOptions = {
  secret: requireEnv("NEXTAUTH_SECRET"),
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email) {
        console.error("SignIn callback: No profile email found.");
        return false;
      }

      try {
        await prisma.user.upsert({
          where: { email: profile.email },
          create: {
            email: profile.email,
            name: profile.name || "",
            ip: `oauth:${profile.email}`,
          },
          update: {
            name: profile.name,
          },
        });
        return true;
      } catch (error) {
        console.error("Error during signIn callback:", error);
        return false;
      }
    },
    async jwt({ token, profile }) {
      if (profile?.email && !token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { email: profile.email },
        });
        if (dbUser) {
          token.id = dbUser.id;
        }
      } else if (token.email && !token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
        });
        if (dbUser) {
          token.id = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as any).id = token.id;
      }
      return session;
    },
  },
};
