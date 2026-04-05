import { exec } from "youtube-dl-exec";

async function run() {
  const stream = exec("https://www.youtube.com/watch?v=b68HETiNO98", {
    defaultSearch: "ytsearch",
    format: "bestaudio",
    output: "-"
  }, { stdio: ["ignore", "pipe", "ignore"] });

  let totalStr = 0;
  stream.stdout?.on("data", (chunk) => {
    totalStr += chunk.length;
    console.log("Got chunk!", chunk.length);
  });

  stream.stdout?.on("end", () => console.log("Done!", totalStr));
}
run();
