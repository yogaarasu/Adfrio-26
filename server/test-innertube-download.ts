import { Innertube, UniversalCache } from "youtubei.js";

async function run() {
  const client = await Innertube.create({ generate_session_locally: true });
  try {
    const stream = await client.download("b68HETiNO98", {
      type: "audio",
      quality: "best"
    });
    console.log("Stream:", !!stream);
  } catch (err) {
    console.error("Download failed:", err);
  }
}
run();
