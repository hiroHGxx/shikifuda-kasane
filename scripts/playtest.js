// 式札かさね 通し検証。80段クリア(#autotest)・夜明け(#autocut)・稽古（記録が残らないこと）を
// 実時間の自動プレイで確認し、結果画面の状態とスクリーンショットを吐く。
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
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
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
    storedBest: localStorage.getItem("fudakasane_best"),
    storedTitle: localStorage.getItem("fudakasane_title"),
  }));
  await page.screenshot({ path: opts.shot });
  await browser.close();
  return { hash, practice: !!opts.practice, sec: +((Date.now() - t0) / 1000).toFixed(1), state, errors };
}

(async () => {
  const srv = await serve();
  const base = "http://localhost:" + srv.address().port + "/index.html";
  let failed = false;
  const check = (name, ok, r) => {
    console.log((ok ? "✅" : "❌") + " " + name + " " + JSON.stringify(r));
    if (!ok) failed = true;
  };

  const clear = await run(base, "#autotest", { timeout: 120000, shot: "/tmp/kasane-clear.png" });
  check("満月成就", clear.state.floors === "80" && clear.state.clearCard && clear.state.quoteShown
    && clear.state.fuda === "fuda_shiori" && clear.state.storedTitle === "満月成就"
    && clear.errors.length === 0, clear);

  const over = await run(base, "#autocut", { timeout: 60000, shot: "/tmp/kasane-over.png" });
  check("夜明け", !over.state.clearCard && !over.state.quoteShown
    && over.state.heading === "札は夜に呑まれた" && over.errors.length === 0, over);

  const prac = await run(base, "#autotest", { timeout: 120000, shot: "/tmp/kasane-practice.png", practice: true });
  check("稽古は記録を残さない", prac.state.floors === "80" && prac.state.hudBest === "0"
    && prac.state.storedBest === null && prac.state.storedTitle === null
    && prac.errors.length === 0, prac);

  srv.close();
  process.exit(failed ? 1 : 0);
})();
