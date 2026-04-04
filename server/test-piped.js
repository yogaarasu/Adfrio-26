import { getStreamData, normalizeStreams } from "./src/services/piped.js";

async function test(id) {
  try {
    const data = await getStreamData(id);
    const normalized = normalizeStreams(data);
    console.log("Piped Streams found! Audio count:", normalized.audio.length);
    console.log("First Audio URL:", normalized.audio[0]?.url);
    process.exit(0);
  } catch (err) {
    console.error("Piped Error:", err.message);
    process.exit(1);
  }
}

test("wkCJi6vmdiw");
