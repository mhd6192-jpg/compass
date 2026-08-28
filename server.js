const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || 3000;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Shared with API route handlers via src/lib/socket.ts (same Node process).
  globalThis.io = io;

  io.on("connection", (socket) => {
    socket.emit("connected", { ok: true });
  });

  httpServer.listen(PORT, () => {
    console.log(`> Compass Draw ready on http://localhost:${PORT}`);
  });
});
