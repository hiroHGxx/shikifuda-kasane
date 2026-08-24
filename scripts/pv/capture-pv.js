// 式札かさねPV用 縦型720x1280キャプチャ。
// #autotest（ぴったり自動プレイ）で帳の開幕〜80段〜栞のページまでを通しで撮り、
// カット点探しのために段替わり・クリア等のイベント時刻も events.json に残す。
const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, "frames");
const MIME = { html: "text/html", m4a: "audio/mp4", wav: "audio/wav", webp: "image/webp", jpg: "image/jpeg" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": MIME[path.extname(f).slice(1)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

srv.listen(0, async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    args: ["--window-size=720,1280", "--hide-scrollbars", "--mute-audio"],
    defaultViewport: { width: 720, height: 1280, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${srv.address().port}/index.html#autowobble`, { waitUntil: "networkidle2", timeout: 60000 });

  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", async (ev) => {
    frames.push({ ts: ev.metadata.timestamp, data: ev.data });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 2 });

  // イベント記録: 段数の変わり目とページ表示を epoch 秒で拾う
  const events = [];
  let lastFloors = -1, overlaySeen = false;
  const poll = setInterval(async () => {
    try {
      const st = await page.evaluate(() => ({
        floors: +document.getElementById("score").textContent,
        overlay: document.getElementById("overlay").classList.contains("show"),
        doorOpen: document.getElementById("door").classList.contains("open"),
      }));
      const now = Date.now() / 1000;
      if (st.floors !== lastFloors) { events.push({ t: now, ev: "floors", n: st.floors }); lastFloors = st.floors; }
      if (st.doorOpen && !events.some((e) => e.ev === "door_open")) events.push({ t: now, ev: "door_open" });
      if (st.overlay && !overlaySeen) { overlaySeen = true; events.push({ t: now, ev: "overlay" }); }
    } catch (e) {}
  }, 120);

  // 76段（栞の段のただ中）まで撮って締める。クリア画面はPVでは見せない
  await page.waitForFunction(() => +document.getElementById("score").textContent >= 76,
    { timeout: 150000, polling: 300 });
  await sleep(2500);
  clearInterval(poll);
  await cdp.send("Page.stopScreencast");
  await browser.close();
  srv.close();

  let list = "";
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(4, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, "base64"));
    const dur = i < frames.length - 1 ? frames[i + 1].ts - f.ts : 1 / 15;
    list += `file '${name}'\nduration ${Math.max(dur, 0.01).toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(4, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, "list.txt"), list);

  // gameplay.mp4 の先頭からの秒に換算して保存
  const t0 = frames[0].ts;
  const rel = events.map((e) => ({ ...e, t: +(e.t - t0).toFixed(2) }));
  fs.writeFileSync(path.join(__dirname, "events.json"), JSON.stringify(rel, null, 1));
  console.log(`captured ${frames.length} frames over ${(frames.at(-1).ts - t0).toFixed(1)}s`);
  const key = (ev, n) => rel.find((e) => e.ev === ev && (n === undefined || e.n === n));
  for (const [label, e] of [["door_open", key("door_open")], ["1段", key("floors", 1)],
    ["8段", key("floors", 8)], ["24段", key("floors", 24)], ["72段", key("floors", 72)],
    ["80段", key("floors", 80)], ["栞のページ", key("overlay")]]) {
    if (e) console.log(`  ${label}: ${e.t}s`);
  }
});
