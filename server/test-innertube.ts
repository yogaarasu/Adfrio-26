import { innertubeGetStreams } from "./src/services/innertube.js";

async function run() {
  try {
    const res = await innertubeGetStreams("b68HETiNO98");
    console.log("Audio URL:", res.audioStreams[0]?.url);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
