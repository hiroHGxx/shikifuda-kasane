// 更新告知動画（浄化ハイライト）用キャプチャ。
// 本文が名指しする「浄化」（ぴったり重ねた回数）の瞬間だけを撮る。番付・クリア画面は撮らない
// （本番の番付はまだ空なので、作り値を映さないため）。
// #autowobble（本番ルールで少し崩す。細って→ぴったりで幅が戻る対比を狙える）で撮り、
// canvasのfillTextをフックして「浄化 ×n」が描かれた時刻をpurify.jsonに残す。
const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, process.argv[5] || "frames2");
const MIME = { html: "text/html", m4a: "audio/mp4", wav: "audio/wav", webp: "image/webp", jpg: "image/jpeg" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HASH = process.argv[2] || "#autowobble";
const MAX_FLOORS = parseInt(process.argv[3] || "26", 10);
const MAX_MS = parseInt(process.argv[4] || "45000", 10);

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

  // 「浄化 ×n」の描画をフック（Node側のDate.now()と同じ時計に揃えるため performance.now() は使わない）
  await page.evaluateOnNewDocument(() => {
    window.__purify = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      if (typeof text === "string" && text.indexOf("浄化 ×") === 0) {
        window.__purify.push({ t: Date.now() / 1000, text });
      }
      return orig.call(this, text, x, y, ...rest);
    };
  });

  await page.goto(`http://localhost:${srv.address().port}/index.html${HASH}`, { waitUntil: "networkidle2", timeout: 60000 });

  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", async (ev) => {
    frames.push({ ts: ev.metadata.timestamp, data: ev.data });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 2 });

  const events = [];
  let lastFloors = -1, doorSeen = false;
  const poll = setInterval(async () => {
    try {
      const st = await page.evaluate(() => ({
        floors: +document.getElementById("score").textContent,
        doorOpen: document.getElementById("door").classList.contains("open"),
      }));
      const now = Date.now() / 1000;
      if (st.floors !== lastFloors) { events.push({ t: now, ev: "floors", n: st.floors }); lastFloors = st.floors; }
      if (st.doorOpen && !doorSeen) { doorSeen = true; events.push({ t: now, ev: "door_open" }); }
    } catch (e) {}
  }, 100);

  await page.waitForFunction((maxF) => +document.getElementById("score").textContent >= maxF,
    { timeout: MAX_MS, polling: 200 }, MAX_FLOORS).catch(() => {});
  await sleep(1500);
  clearInterval(poll);
  await cdp.send("Page.stopScreencast");

  const purify = await page.evaluate(() => window.__purify);
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

  const t0 = frames[0].ts;
  const relEvents = events.map((e) => ({ ...e, t: +(e.t - t0).toFixed(2) }));
  const relPurify = purify.map((e) => ({ ...e, t: +(e.t - t0).toFixed(2) }));
  fs.writeFileSync(path.join(OUT, "events.json"), JSON.stringify(relEvents, null, 1));
  fs.writeFileSync(path.join(OUT, "purify.json"), JSON.stringify(relPurify, null, 1));
  console.log(`captured ${frames.length} frames over ${(frames.at(-1).ts - t0).toFixed(1)}s, floors reached ${lastFloors}, purify events: ${relPurify.length}`);
  console.log(relPurify.map((e) => `${e.t}s ${e.text}`).join("\n"));
});
