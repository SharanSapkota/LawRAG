import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const NEST_API_URL = process.env.NEST_API_URL ?? "http://localhost:3001";

interface GoogleSyncResponse {
  accessToken: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string;
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  callbacks: {
    // Runs server-side only. On initial sign-in (`account` is only present
    // that one time), exchange the Google id_token for a Nest-issued JWT
    // and fold it into the NextAuth token, which NextAuth stores in its own
    // encrypted, httpOnly session cookie.
    async jwt({ token, account }) {
      if (account?.id_token) {
        // TEMPORARY diagnostic logging — remove once the admin-role issue
        // is confirmed fixed. Prints to the terminal running `next dev`.
        console.log("[auth.jwt] fresh sign-in detected, calling", `${NEST_API_URL}/auth/google/sync`);

        let res: Response;
        try {
          res = await fetch(`${NEST_API_URL}/auth/google/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: account.id_token }),
          });
        } catch (err) {
          console.error("[auth.jwt] sync fetch threw:", err);
          return token;
        }

        console.log("[auth.jwt] sync response status:", res.status);

        if (res.ok) {
          const data = (await res.json()) as GoogleSyncResponse;
          console.log("[auth.jwt] sync response user:", data.user);
          token.nestAccessToken = data.accessToken;
          token.nestRole = data.user.role;
        } else {
          const errorBody = await res.text().catch(() => "<unreadable>");
          console.error("[auth.jwt] sync call failed, body:", errorBody);
        }
        // If the sync call fails, we deliberately don't throw here — the
        // NextAuth sign-in still succeeds, just without a Nest token. There's
        // no UI wired up yet to surface this (out of scope for this step).
      }
      return token;
    },
    // Exposes the Nest token/role on the session object returned by
    // useSession()/getServerSession(), so it's usable for outgoing
    // Authorization headers once chat/admin calls are built.
    async session({ session, token }) {
      session.nestAccessToken = token.nestAccessToken;
      session.nestRole = token.nestRole;
      return session;
    },
  },
};
