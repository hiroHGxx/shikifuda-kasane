// 式札かさね 通し検証。80段クリア(#autotest)・夜明け(#autocut)・稽古（記録が残らないこと）・
// 自動プレイと稽古が全国ランキングへ送らないことを、実時間の自動プレイで確認し、
// 結果画面の状態とスクリーンショットを吐く。
//
// 使い方:
//   npm i --no-save puppeteer-core   # 初回のみ（リポジトリには残さない）
//   node scripts/playtest.js         # → /tmp/kasane-clear.png ほか
//
// 注意: Chrome の --virtual-time-budget では rAF 駆動のループが進まない。
// 実時間で待つこと（80段到達まで約80秒かかる）。
const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = { html: "text/html", js: "text/javascript", m4a: "audio/mp4", wav: "audio/wav",
  webp: "image/webp", png: "image/png", jpg: "image/jpeg" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).slice(1)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, () => resolve(srv)); // 空きポートに任せる
  });
}

async function run(base, hash, opts) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
    args: ["--window-size=480,860"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 860 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    // 外部の sdk.js（waiwai.town）は取れなくてよい。取れないことを織り込んだ作りなので、
    // ネットワーク由来の失敗を検証の赤にしない（本体の誤りだけを見る）。
    if (m.type() === "error" && !/sdk\.js|ERR_(CONNECTION|NAME|INTERNET|NETWORK)/.test(m.text())) {
      errors.push("console: " + m.text());
    }
  });
  // 全国ランキングへの送信を数える。稽古と自動プレイからは1回も呼ばれてはいけない
  // （#autotest は全段ぴったり＝理論最大値。塞がないと検証のたびに本番の番付が汚れる）。
  await page.evaluateOnNewDocument(() => {
    window.__submits = [];
    Object.defineProperty(window, "waiwai", { configurable: true, value: {
      mode: "bridged",
      load: () => Promise.resolve(null),
      // 本物のSDKが standalone で置くのと同じ場所に書く（記録が残ることまで検証で見るため）
      save: (k, v) => { try { localStorage.setItem("waiwai:" + k, JSON.stringify(v)); } catch (e) {} return Promise.resolve(true); },
      submitScore: (b, sc, meta) => { window.__submits.push([b, sc, meta]); return Promise.resolve({ ok: true, best: sc, rank: 1, improved: true }); },
      getMyScore: () => Promise.resolve(null),
      getTopScores: () => Promise.resolve({ entries: [{ rank: 1, name: "ヒロ", score: sc0() }], total: 1 }),
    } });
    function sc0() { return 8080; }
  });
  const t0 = Date.now();
  await page.goto(base + hash, { waitUntil: "load" });
  if (opts.practice) {
    // タイトルロゴ3回タップで稽古モードに入る（autotestのbegin(600ms)より先に済ませる）
    await page.evaluate(() => {
      const logo = document.querySelector(".game-title");
      for (let i = 0; i < 3; i++) logo.dispatchEvent(new PointerEvent("pointerdown"));
    });
  }
  await page.waitForFunction(
    () => document.getElementById("overlay").classList.contains("show"),
    { timeout: opts.timeout, polling: 500 });
  const state = await page.evaluate(() => ({
    floors: document.getElementById("score").textContent,
    hudBest: document.getElementById("best").textContent,
    heading: document.getElementById("final-heading").textContent,
    titleName: document.getElementById("final-title").textContent,
    quoteShown: !document.getElementById("final-quote").hidden,
    clearCard: document.getElementById("result-card").classList.contains("clear"),
    fuda: (document.getElementById("final-fuda").src.match(/fuda_\w+/) || [""])[0],
    // 記録は1キーの束（SPEC §7-a）。SDKが読めているときは waiwai: 接頭辞つきで置かれる
    saved: localStorage.getItem("waiwai:fudakasane_save") || localStorage.getItem("fudakasane_save"),
    legacyBest: localStorage.getItem("fudakasane_best"),
    submits: window.__submits.length,
  }));
  await page.screenshot({ path: opts.shot });
  await browser.close();
  return { hash, practice: !!opts.practice, sec: +((Date.now() - t0) / 1000).toFixed(1), state, errors };
}

// 手で遊ぶ流れ（ハッシュ無し）: 「月夜に入る」を押してから t ms にタップする。
// 目付 k2s7 で出た2件の回帰確認——①帳が消えた直後（札が台に届く前）のタップは無かったことになる
// ②0段で終わった夜は全国ランキングへ送らない。
async function runManual(base, taps, opts) {
  opts = opts || {};
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--window-size=480,860"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 860 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.evaluateOnNewDocument(() => {
    window.__submits = [];
    Object.defineProperty(window, "waiwai", { configurable: true, value: {
      mode: "bridged", load: (k) => Promise.resolve(window.__withRecord && /fudakasane_save$/.test(k) ? { best: 9, title: "札運びの見習い", titleRank: 9, sound: "on" } : null),
      save: (k, v) => { try { localStorage.setItem("waiwai:" + k, JSON.stringify(v)); } catch (e) {} return Promise.resolve(true); },
      submitScore: (b, sc, meta) => { window.__submits.push([b, sc, meta]); return Promise.resolve({ ok: true, best: sc, rank: 1, improved: true }); },
      getMyScore: () => Promise.resolve(null),
      getTopScores: () => Promise.resolve({ entries: [{ rank: 1, name: "ヒロ", score: 1104 }], total: 1 }),
    } });
  });
  if (opts.withRecord) await page.evaluateOnNewDocument(() => { window.__withRecord = true; });
  await page.goto(base, { waitUntil: "load" });
  // 案内カードが押せるまで（ready かつ opacity≥0.95。pointer-events:none のうちに押すと何も起きない）
  await page.waitForFunction(() => { const ov = document.getElementById("title-overlay"), c = ov.querySelector(".card");
    return ov.classList.contains("ready") && +getComputedStyle(c).opacity >= 0.95; }, { polling: 50, timeout: 15000 });
  const t0 = Date.now();
  await page.click("#start");
  const tap = async () => { const r = await page.$eval("#game", (e) => { const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }); await page.mouse.click(r.x, r.y); };
  const trace = [];
  for (const t of taps) {
    await new Promise((r) => setTimeout(r, Math.max(0, t - (Date.now() - t0))));
    await tap();
    await new Promise((r) => setTimeout(r, 150));
    trace.push({ t, floors: await page.$eval("#score", (e) => e.textContent) });
  }
  await new Promise((r) => setTimeout(r, opts.settle || 1500));
  const state = await page.evaluate(() => ({
    floors: document.getElementById("score").textContent,
    over: document.getElementById("overlay").classList.contains("show"),
    heading: document.getElementById("final-heading").textContent,
    rankLineHidden: (r => !r || r.hidden || getComputedStyle(r).display === "none")(document.getElementById("final-rank-line")),
    submits: window.__submits,
  }));
  await page.screenshot({ path: opts.shot });
  await browser.close();
  return { taps: trace, state, errors };
}

(async () => {
  const srv = await serve();
  const base = "http://localhost:" + srv.address().port + "/index.html";
  let failed = false;
  const check = (name, ok, r) => {
    console.log((ok ? "✅" : "❌") + " " + name + " " + JSON.stringify(r));
    if (!ok) failed = true;
  };

  const saved = (s) => { try { return JSON.parse(s.saved || "null"); } catch (e) { return null; } };

  const clear = await run(base, "#autotest", { timeout: 120000, shot: "/tmp/kasane-clear.png" });
  check("満月成就", clear.state.floors === "80" && clear.state.clearCard && clear.state.quoteShown
    && clear.state.fuda === "fuda_shiori" && (saved(clear.state) || {}).title === "満月成就"
    && clear.errors.length === 0, clear);

  const over = await run(base, "#autocut", { timeout: 60000, shot: "/tmp/kasane-over.png" });
  check("夜明け", !over.state.clearCard && !over.state.quoteShown
    && over.state.heading === "札は夜に呑まれた" && over.errors.length === 0, over);

  const prac = await run(base, "#autotest", { timeout: 120000, shot: "/tmp/kasane-practice.png", practice: true });
  // 稽古でも音の好み（begin の2択）は束に書かれる。それは記録ではなく好みなので構わない。
  // 見るのは「到達が残っていないこと」＝ best と称号が空のまま、旧キーも生えていないこと。
  const pracSaved = saved(prac.state) || { best: 0, title: "" };
  check("稽古は記録を残さない", prac.state.floors === "80" && prac.state.hudBest === "0"
    && pracSaved.best === 0 && !pracSaved.title && prac.state.legacyBest === null
    && prac.errors.length === 0, prac);

  // 自動プレイ（本番ルールで動く）と稽古から、全国ランキングへ1回も送っていないこと
  check("番付を汚さない（自動プレイ・稽古から送信0回）",
    clear.state.submits === 0 && over.state.submits === 0 && prac.state.submits === 0,
    { 満月成就: clear.state.submits, 夜明け: over.state.submits, 稽古: prac.state.submits });

  // ⑤ 帳が消えた直後（+3400ms）のタップは無かったことになり、札が届いてから（+4000ms）置ける
  const early = await runManual(base, [3400, 4000], { shot: "/tmp/kasane-early-tap.png" });
  check("早押しは無かったことになる（+3400 は段0・夜明けなし／+4000 で段1）",
    early.taps[0].floors === "0" && early.taps[1].floors === "1" && !early.state.over && early.errors.length === 0, early);

  // ⑥ 札が台を通り過ぎた側で押して0段の夜明け（+6300ms＝進入後・反対側の外）→ 番付へは送らない
  const zero = await runManual(base, [6300], { shot: "/tmp/kasane-zero-night.png", settle: 1800 });
  check("0段の夜は番付へ送らない（夜明けは出る・順位の行は無い・送信0回）",
    zero.state.over && zero.state.floors === "0" && zero.state.rankLineHidden && zero.state.submits.length === 0 && zero.errors.length === 0, zero);

  // ⑦ 記録を持つ人の0段は送る（番付は自己ベストしか持たないので記録は下がらない・順位の行が出る）
  const zeroRec = await runManual(base, [6300], { shot: "/tmp/kasane-zero-night-with-record.png", settle: 1800, withRecord: true });
  check("記録を持つ人の0段は送る（送信1回・順位の行あり）",
    zeroRec.state.over && zeroRec.state.floors === "0" && !zeroRec.state.rankLineHidden && zeroRec.state.submits.length === 1 && zeroRec.errors.length === 0, zeroRec);

  srv.close();
  process.exit(failed ? 1 : 0);
})();
