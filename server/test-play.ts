import { getStreamSource } from "./src/services/youtube.service.js";

async function run() {
  try {
    const res = await getStreamSource("b68HETiNO98", "audio");
    console.log("Success:", !!res.stream, res.url);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
