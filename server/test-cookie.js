import play from "play-dl";
import { env } from "./src/config/env.js";

async function test() {
  try {
    console.log("Setting token with cookie length:", env.YOUTUBE_COOKIE?.length || 0);
    if (env.YOUTUBE_COOKIE) {
      await play.setToken({
        youtube: {
          cookie: env.YOUTUBE_COOKIE
        }
      });
    }
    
    console.log("Testing search...");
    const results = await play.search("tamil songs", { limit: 1 });
    console.log("Search success! Found:", results[0]?.title);
    process.exit(0);
  } catch (err) {
    console.error("Play-dl test failure:", err.message);
    process.exit(1);
  }
}

test();
