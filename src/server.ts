import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app";
import { connectDb } from "./config/db";
import { env } from "./config/env";

async function main() {
  await connectDb();

  const app = createApp();
  const server = http.createServer(app);

  // Real-time layer (Technical Guide §12). Rooms are named `branch:<branchId>`
  // so the counter-tablet's GenerateQRPage can react instantly to a scan
  // instead of polling. Emit `stamp:earned` to this room from the customer
  // controller once you wire it up (kept minimal here to avoid a hard
  // dependency for teams that skip real-time in their MVP).
  const io = new SocketIOServer(server, {
    cors: { origin: env.clientOrigin.split(","), credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("join:branch", (branchId: string) => {
      socket.join(`branch:${branchId}`);
    });
    socket.on("join:customer", (customerId: string) => {
      socket.join(`customer:${customerId}`);
    });
  });

  // Make io available to controllers that want to emit events.
  app.set("io", io);

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Thappa API listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server] fatal startup error", err);
  process.exit(1);
});
