import play from "play-dl";

async function test(id) {
  try {
    const url = "https://www.youtube.com/watch?v=" + id;
    console.log("Fetching info for:", url);
    const info = await play.video_info(url);
    console.log("Title found:", info.video_details.title);
    process.exit(0);
  } catch (err) {
    console.error("Play-dl Info Error:", err);
    process.exit(1);
  }
}

test("q3yUYEkNUQU");
