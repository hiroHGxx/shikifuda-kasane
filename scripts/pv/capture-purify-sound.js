// 更新告知動画（浄化ハイライト）用キャプチャ・音つき版。
// 前便は音をffmpegの近似合成で作っていた（実物と違うピッチで鳴っていた）。
// 今回は「同じ1回の走行で画も音も録る」——CDPのPage.startScreencast（実時間）と、
// WebAudioの出力をteeしたMediaStreamをMediaRecorderで録る音を、同じDate.now()の時計で揃える。
//
// 音を録る仕組み（本体=src/game.jsは一切変更しない）:
//  - AudioNode.prototype.connect をフックし、audioCtx.destination へ繋がる接続を見つけたら
//    MediaStreamAudioDestinationNode にも分岐させる（sfxBus・voiceBus が対象）
//  - BGMは <audio> 要素（new Audio(BGM_DATA)）で別経路のため、window.Audio を差し替えて
//    生成された要素を捕まえ、audioCtx ができた瞬間に createMediaElementSource で同じ経路へ入れる
//  - #autotest-sound は音ありの自動プレイ（本体側で begin(true) が呼ばれる）。#autotest（無音）と
//    違い、ぴったり配置を続けるので浄化の連奏（×1→×7…）がそのまま録れる
const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, process.argv[3] || "frames_sound");
const MIME = { html: "text/html", m4a: "audio/mp4", wav: "audio/wav", webp: "image/webp", jpg: "image/jpeg" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAX_FLOORS = parseInt(process.argv[2] || "14", 10);
const MAX_MS = 35000;

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
    args: [
      "--window-size=720,1280",
      "--hide-scrollbars",
      "--mute-audio", // 出力デバイスを黙らせるだけ。WebAudioの処理・MediaStream録音は止まらない
      "--autoplay-policy=no-user-gesture-required", // begin()が内部setTimeoutから呼ばれる＝実ジェスチャーではないため必須
    ],
    defaultViewport: { width: 720, height: 1280, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    window.__purify = [];
    window.__audioEls = [];
    window.__audioBlobs = [];
    window.__audioStartAt = null;

    // 「浄化 ×n」の描画をフック（Node側のDate.now()と同じ時計に揃える）
    const origFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      if (typeof text === "string" && text.indexOf("浄化 ×") === 0) {
        window.__purify.push({ t: Date.now() / 1000, text });
      }
      return origFillText.call(this, text, x, y, ...rest);
    };

    // BGM用 <audio> 要素の捕獲（new Audio(...) はDOMに現れないため、生成をフックするしかない）
    const OrigAudio = window.Audio;
    function PatchedAudio(...args) {
      const el = new OrigAudio(...args);
      window.__audioEls.push(el);
      return el;
    }
    PatchedAudio.prototype = OrigAudio.prototype;
    window.Audio = PatchedAudio;

    // WebAudioの出力をteeする。sfxBus/voiceBus が audioCtx.destination に繋がる瞬間を捉え、
    // 同じ内容を MediaStreamAudioDestinationNode にも流し、MediaRecorderをその場で開始する
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (typeof AudioDestinationNode !== "undefined" && dest instanceof AudioDestinationNode) {
        const ctx = dest.context;
        if (!ctx.__streamDest) {
          ctx.__streamDest = ctx.createMediaStreamDestination();
          (window.__audioEls || []).forEach((el) => {
            if (el.__routed) return;
            el.__routed = true;
            try {
              const src = ctx.createMediaElementSource(el);
              src.connect(ctx.destination); // この呼び出しも同じフックを通り、streamDestへも繋がる
            } catch (e) { console.warn("[capture] bgm routing failed", e); }
          });
          try {
            const rec = new MediaRecorder(ctx.__streamDest.stream, { mimeType: "audio/webm;codecs=opus" });
            rec.ondataavailable = (e) => { if (e.data && e.data.size) window.__audioBlobs.push(e.data); };
            window.__audioStartAt = Date.now() / 1000;
            rec.start(200);
            window.__mediaRecorder = rec;
          } catch (e) { console.warn("[capture] MediaRecorder start failed", e); }
        }
        origConnect.call(this, ctx.__streamDest, ...rest);
      }
      return origConnect.apply(this, [dest, ...rest]);
    };
  });

  await page.goto(`http://localhost:${srv.address().port}/index.html#autotest-sound`, { waitUntil: "networkidle2", timeout: 60000 });

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

  // 音: レコーダーを止めて、貯めた Blob を1本に結合してから base64 化（途中経過を都度変換しない）
  const audio = await page.evaluate(async () => {
    if (window.__mediaRecorder && window.__mediaRecorder.state !== "inactive") {
      await new Promise((resolve) => {
        window.__mediaRecorder.addEventListener("stop", resolve, { once: true });
        window.__mediaRecorder.stop();
      });
    }
    const blob = new Blob(window.__audioBlobs || [], { type: "audio/webm" });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return { b64: btoa(binary), startAt: window.__audioStartAt, bytes: bytes.length };
  });

  const purify = await page.evaluate(() => window.__purify);
  await browser.close();
  srv.close();

  if (!frames.length) throw new Error("フレームが1枚も撮れなかった");
  let list = "";
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(4, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, "base64"));
    const dur = i < frames.length - 1 ? frames[i + 1].ts - f.ts : 1 / 15;
    list += `file '${name}'\nduration ${Math.max(dur, 0.01).toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(4, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, "list.txt"), list);

  fs.writeFileSync(path.join(OUT, "audio.webm"), Buffer.from(audio.b64, "base64"));

  const t0 = frames[0].ts;
  const relEvents = events.map((e) => ({ ...e, t: +(e.t - t0).toFixed(2) }));
  const relPurify = purify.map((e) => ({ ...e, t: +(e.t - t0).toFixed(2) }));
  const audioOffset = audio.startAt != null ? +(audio.startAt - t0).toFixed(3) : null;
  fs.writeFileSync(path.join(OUT, "events.json"), JSON.stringify(relEvents, null, 1));
  fs.writeFileSync(path.join(OUT, "purify.json"), JSON.stringify(relPurify, null, 1));
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({
    videoT0: t0, audioStartAt: audio.startAt, audioOffsetSec: audioOffset, audioBytes: audio.bytes,
  }, null, 1));

  console.log(`captured ${frames.length} frames over ${(frames.at(-1).ts - t0).toFixed(1)}s, floors reached ${lastFloors}, purify events: ${relPurify.length}`);
  console.log(`audio: ${audio.bytes} bytes, offset(video基準) = ${audioOffset}s`);
  console.log(relPurify.map((e) => `${e.t}s ${e.text}`).join("\n"));
});
