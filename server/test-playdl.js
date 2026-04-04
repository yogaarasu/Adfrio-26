import play from "play-dl";

async function test(id) {
  console.log("Play-dl type:", typeof play);
  console.log("Play-dl stream type:", typeof play.stream);
  try {
    const url = "https://www.youtube.com/watch?v=" + id;
    console.log("Fetching stream for:", url);
    const stream = await play.stream(url);
    console.log("Stream found! Type:", typeof stream.stream);
    process.exit(0);
  } catch (err) {
    console.error("Play-dl Stream Error:", err);
    process.exit(1);
  }
}

test("q3yUYEkNUQU");
