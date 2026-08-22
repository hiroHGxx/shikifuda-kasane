// ボイス帖（試聴ページ）を assets/audio の wav から組み立てる。
// 出力: dist/voice-book.html（単一ファイル・全音声埋め込み）
// 音声は Artifact の CSP で fetch(data:) が通らないため、atob() → decodeAudioData で鳴らす。
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const AUDIO = path.join(ROOT, "assets", "audio");

// docs/VOICE.md の台詞一覧と game.js の SPIRITS 五行色に対応
const LINES = [
  { key: "shiori_start",  floor: "帳",  name: "栞",       color: "#F0CE7E", text: "今宵のページを、開きましょう",                         src: "ElevenLabs Mini（公式指定）" },
  { key: "anne",          floor: "一",  name: "餡音",     color: "#6FB069", text: "わたしがお供するねえ。えへへ、いってみよう",       src: "公式配布wav（Irodori）" },
  { key: "oto",           floor: "八",  name: "於兎",     color: "#C08A3E", text: "ここからは任せて！どんどん重ねちゃおう",           src: "ElevenLabs Lola（公式指定）" },
  { key: "nemu",          floor: "十六", name: "ネム",     color: "#5FB4D9", text: "ん、ネムの番。ねむいけど、やる",                   src: "呂屯の声（代役・Irodori）" },
  { key: "nekomata",      floor: "廿四", name: "ネコマタ", color: "#C6BFA8", text: "あたいの番かい。なら、しくじるんじゃないよ",       src: "オロチの声（代役・Irodori）" },
  { key: "benten",        floor: "卅二", name: "弁天",     color: "#5FB4D9", text: "ここからはわっちが。ぬしさん、手元にお気をつけなんし", src: "公式配布wav（Irodori）" },
  { key: "uka",           floor: "四十", name: "宇迦",     color: "#E0562F", text: "ふふん、あたしの番ね。あんた、ついてきなさいよ",   src: "公式配布wav（Irodori）" },
  { key: "izuna",         floor: "四八", name: "イズナ",   color: "#C6BFA8", text: "私の番ね。あなたなら、まだ登れるかしら",           src: "公式配布wav（Irodori）" },
  { key: "shion",         floor: "五六", name: "紫苑",     color: "#6FB069", text: "私の番だ。お前の手を、見せてみろ",                 src: "ElevenLabs Rose（公式指定）" },
  { key: "sakuya",        floor: "六四", name: "咲耶",     color: "#E0562F", text: "お待たせ。ここからはあたしが持ってく。あんたも気合い入れて", src: "公式配布wav（Irodori）" },
  { key: "shiori_arrive", floor: "七二", name: "栞",       color: "#F0CE7E", text: "最後のページは、わたくしが",     src: "ElevenLabs Mini（公式指定）" },
  { key: "shiori_goal",   floor: "満願", name: "栞",       color: "#F0CE7E", text: "月に、届きました。お見事ですこと、あるじどの",     src: "ElevenLabs Mini（公式指定）" },
];

// 段のガターに出す補助表記（数字そのものは進行の情報なので残す）
const ARABIC = { "帳": "開幕", "一": "1段", "八": "8段", "十六": "16段", "廿四": "24段", "卅二": "32段",
                 "四十": "40段", "四八": "48段", "五六": "56段", "六四": "64段", "七二": "72段", "満願": "80段" };

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const b64 = {};
for (const l of LINES) {
  const f = path.join(AUDIO, `voice_${l.key}.wav`);
  if (!fs.existsSync(f)) throw new Error(`音源が見つかりません: ${f}`);
  b64[l.key] = fs.readFileSync(f).toString("base64");
}

const rows = LINES.map((l, i) => `
    <li class="leaf" data-key="${l.key}" style="--go:${l.color}">
      <div class="gutter">
        <span class="floor">${esc(l.floor)}</span>
        <span class="floor-sub">${esc(ARABIC[l.floor])}</span>
      </div>
      <div class="body">
        <p class="who"><span class="dot" aria-hidden="true"></span>${esc(l.name)}</p>
        <p class="line">${esc(l.text)}</p>
        <p class="src">${esc(l.src)}</p>
      </div>
      <button class="fuda" type="button" data-key="${l.key}" aria-label="${esc(l.name)}の台詞を聴く">
        <span class="glyph" aria-hidden="true"></span>
      </button>
      <span class="sweep" aria-hidden="true"></span>
    </li>`).join("");

const html = `<title>式札かさね ボイス帖</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=M+PLUS+Rounded+1c:wght@500;800&display=swap">
<style>
  /* 公式トンマナ「宵闇に金」の実装トークンに準拠（ゲーム本体・御霊おとしと共通）。
     宵の世界にひとつだけ寄せた単一テーマなので、色は全て明示して host の地色を借りない。 */
  :root {
    --night: #131320;
    --night-2: #1B1B2E;
    --line: #4a4468;
    --ink: #E8E4D8;
    --ink-dim: #9D93B5;
    --moon: #F0CE7E;
    --kindei: #D9A94C;
    --mincho: "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif;
    --rounded: "M PLUS Rounded 1c", "Hiragino Sans", sans-serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--night);
    color: var(--ink);
    font-family: var(--mincho);
    line-height: 1.85;
    -webkit-font-smoothing: antialiased;
  }
  /* 昇る金の塵（ゲーム背景と同じ気配）を極薄で */
  body::before {
    content: "";
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background:
      radial-gradient(1100px 620px at 50% -12%, rgba(240,206,126,.10), transparent 68%),
      radial-gradient(700px 420px at 88% 104%, rgba(142,107,158,.14), transparent 70%);
  }
  .wrap { position: relative; z-index: 1; max-width: 46rem; margin: 0 auto; padding: 4.5rem 1.5rem 5rem; }

  header { display: flex; flex-direction: column; gap: .9rem; }
  .eyebrow {
    font-family: var(--rounded); font-weight: 500; font-size: .74rem;
    letter-spacing: .22em; color: var(--ink-dim);
  }
  h1 {
    font-weight: 800; font-size: clamp(2rem, 7vw, 2.9rem); line-height: 1.3;
    text-wrap: balance; color: var(--ink);
  }
  h1 .kin { color: var(--moon); }
  .lead { color: var(--ink-dim); font-size: 1rem; max-width: 34rem; text-wrap: pretty; }

  .bar { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-top: 1.7rem; }
  .ctl {
    font-family: var(--rounded); font-weight: 800; font-size: .84rem; letter-spacing: .06em;
    color: var(--night); background: var(--kindei);
    border: 0; border-radius: 999px; padding: .58rem 1.25rem; cursor: pointer;
    transition: background .18s ease, transform .18s ease;
  }
  .ctl:hover { background: var(--moon); }
  .ctl:active { transform: translateY(1px); }
  .ctl.ghost { background: transparent; color: var(--ink-dim); border: 1px solid var(--line); }
  .ctl.ghost:hover { color: var(--ink); border-color: var(--kindei); background: transparent; }
  .ctl[disabled] { opacity: .38; cursor: default; }
  .ctl:focus-visible, .fuda:focus-visible { outline: 2px solid var(--moon); outline-offset: 3px; }

  .scroll { list-style: none; margin-top: 2.6rem; display: flex; flex-direction: column; }

  .leaf {
    position: relative;
    display: grid;
    grid-template-columns: 4.25rem 1fr auto;
    align-items: start;
    gap: 1.15rem;
    padding: 1.6rem 0;
    border-top: 1px solid rgba(74,68,104,.55);
  }
  .leaf:last-child { border-bottom: 1px solid rgba(74,68,104,.55); }

  .gutter { display: flex; flex-direction: column; align-items: flex-end; gap: .1rem; padding-top: .25rem; }
  .floor {
    font-family: var(--mincho); font-weight: 700; font-size: 1.28rem;
    color: var(--kindei); line-height: 1.25;
  }
  .floor-sub {
    font-family: var(--rounded); font-weight: 500; font-size: .66rem;
    letter-spacing: .08em; color: var(--ink-dim); font-variant-numeric: tabular-nums;
  }

  .body { min-width: 0; display: flex; flex-direction: column; gap: .3rem; }
  .who {
    font-family: var(--rounded); font-weight: 800; font-size: .8rem; letter-spacing: .1em;
    color: var(--ink-dim); display: flex; align-items: center; gap: .5rem;
  }
  .dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--go); flex: 0 0 auto; }
  .line {
    font-size: clamp(1.06rem, 3.4vw, 1.3rem); font-weight: 500; color: var(--ink);
    text-wrap: pretty;
  }
  .src { font-family: var(--rounded); font-weight: 500; font-size: .7rem; color: var(--ink-dim); opacity: .75; }

  /* 再生ボタンは札のかたち（天面に五行色の縁） */
  .fuda {
    margin-top: .2rem;
    width: 3.1rem; height: 2.5rem; flex: 0 0 auto;
    background: var(--night-2);
    border: 1px solid var(--line);
    border-bottom: 3px solid color-mix(in srgb, var(--go) 55%, var(--night));
    border-radius: 5px;
    display: grid; place-items: center; cursor: pointer;
    transition: border-color .18s ease, background .18s ease;
  }
  .fuda:hover { border-color: var(--kindei); background: #22223a; }
  .glyph {
    width: 0; height: 0;
    border-left: 10px solid var(--moon);
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
    margin-left: 3px;
  }
  .leaf.playing .fuda { border-color: var(--moon); }
  .leaf.playing .glyph {
    border: 0; margin-left: 0;
    width: 9px; height: 13px; background: var(--moon);
    -webkit-mask: linear-gradient(#000 0 0) 0/3px 100% no-repeat, linear-gradient(#000 0 0) 100%/3px 100% no-repeat;
    mask: linear-gradient(#000 0 0) 0/3px 100% no-repeat, linear-gradient(#000 0 0) 100%/3px 100% no-repeat;
  }
  /* 琴の余韻のように、再生中の頁を金の線がひとすじ渡る */
  .sweep {
    position: absolute; left: 0; bottom: -1px; height: 1px; width: 100%;
    transform: scaleX(var(--p, 0)); transform-origin: left center;
    background: linear-gradient(90deg, transparent, var(--moon));
    opacity: 0; transition: opacity .2s ease;
  }
  .leaf.playing .sweep { opacity: 1; }

  footer {
    margin-top: 3.2rem; padding-top: 1.6rem; border-top: 1px solid rgba(74,68,104,.4);
    color: var(--ink-dim); font-size: .84rem; display: flex; flex-direction: column; gap: .5rem;
  }
  footer b { color: var(--ink); font-weight: 700; }

  @media (max-width: 33rem) {
    .wrap { padding: 3rem 1.15rem 4rem; }
    .leaf { grid-template-columns: 3.1rem 1fr; gap: .85rem; padding: 1.35rem 0; }
    .fuda { grid-column: 2; justify-self: start; margin-top: .55rem; }
    .floor { font-size: 1.1rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sweep { display: none; }
    .ctl, .fuda { transition: none; }
  }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">月蝕綺譚 -Luna Occulta- 二次創作</p>
    <h1>式札かさね <span class="kin">ボイス帖</span></h1>
    <p class="lead">札が新しい御霊に替わったとき、その御霊が名乗ります。開幕の帳から満願まで、全12場面。</p>
    <div class="bar">
      <button class="ctl" id="all" type="button">通しで聴く</button>
      <button class="ctl ghost" id="stop" type="button" disabled>止める</button>
    </div>
  </header>

  <ol class="scroll">${rows}
  </ol>

  <footer>
    <p>声は公式ガイドライン「声のお約束」に沿って、<b>公式配布ボイス</b>（Irodori-TTS）と<b>公式指定 Voice ID</b>（ElevenLabs）から制作しています。ネム・ネコマタは指定 Voice ID が現行サービスから削除済みのため、公式配布ボイスで代役を立てました。</p>
    <p>台詞は公式 MCP <b>kitan-lore</b> の口調データ（voice.tone / samples / firstPerson / address）に沿って書き起こしたものです。</p>
  </footer>
</div>

<script>
const B64 = ${JSON.stringify(b64)};
const ORDER = ${JSON.stringify(LINES.map(l => l.key))};

let ctx = null;
const bufs = {};
let cur = null;      // { src, leaf, until, raf }
let chain = false;   // 通し再生中か

const stopBtn = document.getElementById("stop");

// Artifact の CSP は fetch(data:) を通さない。atob() で直接 ArrayBuffer にして渡す。
function toArrayBuffer(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function decode(key) {
  if (bufs[key]) return bufs[key];
  bufs[key] = await ctx.decodeAudioData(toArrayBuffer(B64[key]));
  return bufs[key];
}

function clearPlaying() {
  if (!cur) return;
  cancelAnimationFrame(cur.raf);
  cur.leaf.classList.remove("playing");
  cur.leaf.style.removeProperty("--p");
  try { cur.src.onended = null; cur.src.stop(); } catch (e) {}
  cur = null;
  stopBtn.disabled = true;
}

function stopAll() {
  chain = false;
  clearPlaying();
}

async function play(key, onEnd) {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  clearPlaying();

  const buf = await decode(key);
  const leaf = document.querySelector('.leaf[data-key="' + key + '"]');
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 0.95;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);

  const started = ctx.currentTime;
  leaf.classList.add("playing");
  stopBtn.disabled = false;

  const tick = () => {
    if (!cur) return;
    const p = Math.min((ctx.currentTime - started) / buf.duration, 1);
    leaf.style.setProperty("--p", p.toFixed(3));
    cur.raf = requestAnimationFrame(tick);
  };

  src.onended = () => {
    if (!cur || cur.src !== src) return;
    clearPlaying();
    if (onEnd) onEnd();
  };

  src.start();
  cur = { src, leaf, raf: requestAnimationFrame(tick) };
}

document.querySelectorAll(".fuda").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.key;
    const wasPlaying = cur && cur.leaf.dataset.key === key;
    stopAll();
    if (!wasPlaying) play(key);
  });
});

document.getElementById("all").addEventListener("click", async () => {
  stopAll();
  chain = true;
  let i = 0;
  const next = () => {
    if (!chain) return;
    i++;
    if (i >= ORDER.length) { chain = false; return; }
    setTimeout(() => { if (chain) play(ORDER[i], next); }, 420); // 頁をめくる間
  };
  play(ORDER[0], next);
});

stopBtn.addEventListener("click", stopAll);
</script>
`;

const out = path.join(ROOT, "dist", "voice-book.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`書き出し: ${out}  (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB / ${LINES.length}本)`);
