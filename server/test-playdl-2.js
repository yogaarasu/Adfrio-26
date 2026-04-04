import play from "play-dl";

async function test(id) {
  try {
    const url = "https://www.youtube.com/watch?v=" + id;
    console.log("Fetching info for:", url);
    const info = await play.video_info(url);
    console.log("Fetching stream from info for:", url);
    const stream = await play.stream_from_info(info);
    console.log("Stream found! Type:", typeof stream.stream);
    process.exit(0);
  } catch (err) {
    if (err.message?.includes("Sign in")) {
        console.error("BLOCK DETECTED: Cookies required.");
    } else {
        console.error("Play-dl Stream Error:", err);
    }
    process.exit(1);
  }
}

test("q3yUYEkNUQU");
