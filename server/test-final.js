import { getStreamSource } from "./src/services/youtube.service.js";

async function test(id) {
  try {
    const stream = await getStreamSource(id, "audio");
    console.log("SUCCESS: Stream found!");
    process.exit(0);
  } catch (err) {
    console.error("FINAL ERROR:", err.message);
    process.exit(1);
  }
}

test("q3yUYEkNUQU");
