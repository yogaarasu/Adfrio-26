import ytdl from "@distube/ytdl-core";

async function test(id) {
  try {
    const url = "https://www.youtube.com/watch?v=" + id;
    console.log("Fetching stream with distube/ytdl-core for:", url);
    const stream = ytdl(url, { filter: 'audioonly' });
    
    stream.on('response', (res) => {
        console.log("Response headers received! Status:", res.statusCode);
        process.exit(0);
    });

    stream.on('error', (err) => {
        console.error("Ytdl Error:", err);
        process.exit(1);
    });
  } catch (err) {
    console.error("Ytdl Catch Error:", err);
    process.exit(1);
  }
}

test("q3yUYEkNUQU");
