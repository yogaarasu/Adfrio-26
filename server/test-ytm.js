import { searchMusics } from "node-youtube-music";

async function test() {
  try {
    const results = await searchMusics("lofi");
    console.log("Results count:", results.length);
    process.exit(0);
  } catch (err) {
    console.error("Test Error:", err);
    process.exit(1);
  }
}

test();
