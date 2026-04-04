const play = require("play-dl");

(async () => {
  try {
    const info = await play.video_info("https://www.youtube.com/watch?v=WpAMw4zt87Q");
    console.log("Got info formats:", info.format.length);
    
    // play-dl looks for an audio format. Let's see what formats are available!
    info.format.forEach(f => {
      console.log(f.quality, f.mimeType, f.url ? "HAS_URL" : "NO_URL");
    });

  } catch (err) {
    console.error(err);
  }
})();
