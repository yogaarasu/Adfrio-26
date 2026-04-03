import "./types/express.js";
import { app } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";

const bootstrap = async (): Promise<void> => {
  await connectDb();
  app.listen(env.PORT, () => {
    console.log(`API ready on http://localhost:${env.PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
