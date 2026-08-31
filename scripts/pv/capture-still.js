// 更新告知の静止画（代案）用。文字を焼き込まないため #autowobble-nofloat（floaterのテキストを消す）で撮り、
// floors<6 は本番ルールでも常にぴったり（決め打ちの挙動）になる仕様を利用して、
// 「浄化」の金の粒バーストが確実に出る瞬間を安定して狙う。
const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { html: "text/html", m4a: "audio/mp4", wav: "audio/wav", webp: "image/webp", jpg: "image/jpeg" };

const TARGET_FLOORS = parseInt(process.argv[2] || "5", 10);
const DELAY_MS = parseInt(process.argv[3] || "180", 10);
const OUT_PATH = process.argv[4] || path.join(__dirname, "still-raw.png");

const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": MIME[path.extname(f).slice(1)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

srv.listen(0, async () => {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    args: ["--window-size=720,1280", "--hide-scrollbars", "--mute-audio"],
    defaultViewport: { width: 720, height: 1280, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${srv.address().port}/index.html#autowobble-nofloat`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction((n) => +document.getElementById("score").textContent >= n, { timeout: 30000, polling: 50 }, TARGET_FLOORS);
  await sleep(DELAY_MS);
  await page.screenshot({ path: OUT_PATH, type: "png" });
  await browser.close();
  srv.close();
  console.log("saved", OUT_PATH);
});
