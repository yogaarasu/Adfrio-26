import { Innertube } from "youtubei.js";

async function run() {
  try {
    const yt = await Innertube.create();
    const info = await yt.getBasicInfo("WpAMw4zt87Q", "ANDROID");
    
    const audio = info.streaming_data?.adaptive_formats?.filter(f => f.has_audio && !f.has_video);
    if (!audio || audio.length === 0) {
      console.log("No audio formats found.");
      return;
    }
    
    // Check if the first format has a url
    console.log("Audio URL:", audio[0].decipher(yt.session.player));
    // youtubei handles decrypting the signature internally!
  } catch (err) {
    console.error("Innertube error:", err);
  }
}

run();
