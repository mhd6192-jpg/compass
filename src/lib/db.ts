import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * SAFETY RAIL — do not remove.
 *
 * `vercel env pull` writes the *production* Neon credentials into `.env.local`,
 * which is exactly the file `next dev` loads. That means a plain `npm run dev`
 * silently points localhost at the LIVE tournament database: seeding or
 * resetting from "local" destroys real event data with no warning.
 *
 * So refuse to start a dev server against the production database unless the
 * operator has explicitly opted in for this shell:
 *
 *   ALLOW_PROD_DB_IN_DEV=1 npm run dev
 *
 * Production on Vercel sets NODE_ENV=production and is unaffected.
 */
if (process.env.NODE_ENV !== "production" && process.env.ALLOW_PROD_DB_IN_DEV !== "1") {
  const url = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL ?? "";
  const looksRemote = /neon\.tech|vercel-storage|supabase|amazonaws/i.test(url);
  if (looksRemote) {
    throw new Error(
      "Refusing to run in development against what looks like the PRODUCTION database " +
        "(.env.local holds the live Neon credentials). Writing here would modify the live tournament. " +
        "Use a separate dev database, or set ALLOW_PROD_DB_IN_DEV=1 if you really intend read/write access to live data."
    );
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
