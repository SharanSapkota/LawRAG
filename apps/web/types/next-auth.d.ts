import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session extends DefaultSession {
    nestAccessToken?: string;
    nestRole?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    nestAccessToken?: string;
    nestRole?: string;
  }
}
