// A throwaway local Postgres for development, so `npm run dev:local` never
// touches the live Neon database (see the safety rail in src/lib/db.ts).
//
// PGlite is Postgres compiled to WASM; pglite-socket exposes it on a real TCP
// port so Prisma connects to it like any other Postgres. Data persists in
// .pglite-dev/ (gitignored) — delete the folder for a clean slate.
//
//   node scripts/devDb.mjs        # start the DB on 127.0.0.1:5433
//   npm run dev:local             # dev server pointed at it
//
// One quirk, worth knowing before it wastes your afternoon: every connection
// shares ONE underlying PGlite session, so session state outlives the client
// that created it. Two symptoms, one fix:
//   - a schema push failing with `prepared statement "s0" already exists`
//   - a second run of a DB-backed check script dying on connect with
//     "Server has closed the connection"
// Restart this process. The state belongs to it, not to the data in
// .pglite-dev/, so nothing is lost. For the same reason, do not run the dev
// server and a check script against it at the same time.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = Number(process.env.DEV_DB_PORT || 5433);

const db = await PGlite.create("./.pglite-dev");
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: "127.0.0.1",
  // Next dev + Prisma open several sockets; queries are queued per-statement.
  maxConnections: 20,
});
await server.start();
console.log(`Dev Postgres (PGlite) listening on postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`);
console.log(`Data dir: .pglite-dev  ·  delete it for a clean slate`);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
