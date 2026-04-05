import { getStreamData, normalizeStreams } from "./src/services/piped.js";

async function run() {
  try {
    const res = await getStreamData("b68HETiNO98");
    const normalized = normalizeStreams(res);
    console.log("Piped URL:", normalized.audio[0]?.url);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
