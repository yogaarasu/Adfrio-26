import "./types/express.js";
import { createServer } from "node:http";
import { app } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { attachRealtimeServer } from "./services/realtime.js";

const bootstrap = async (): Promise<void> => {
  // Prevent third-party streaming libraries (youtubei, ytdl-core) from fatally crashing the server
  process.on("uncaughtException", (err) => {
    console.error("[Uncaught Exception]", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Unhandled Rejection]", reason);
  });

  await connectDb();
  const server = createServer(app);
  attachRealtimeServer(server);

  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API ready on http://localhost:${env.PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
