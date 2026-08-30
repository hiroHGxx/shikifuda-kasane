// 式札かさね — 月蝕綺譚 -Luna Occulta- 二次創作
// 往復する式札をタップで重ね、喰われた月への道を架ける積み上げゲーム。
// 本家Stack風の等角投影（2.5D）。札の天面には御霊の札絵が敷かれ、ずれた分だけ絵が欠けていく。
(() => {
  "use strict";

  // ---- 論理座標・盤面 ----
  const W = 480, H = 720;
  const F0 = 190;           // 札の基本footprint（世界単位・正方形）
  const TH = 30;            // 札の厚み
  const ISO_X = 0.86, ISO_Y = 0.5; // 等角投影の基底
  const CX = W / 2;
  const BASE_Y = 560;       // 世界(0,0,高さ0)の画面y（camY=0のとき）
  const PERFECT_TOL = 7;    // ぴったり判定（アクティブ軸のズレ）
  const MOON_FLOOR = 80;    // 満月成就の段
  const MOON_ZONE = 72;     // ここから満月の階（金の札）

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  function fit() {
    const box = document.querySelector("main").getBoundingClientRect();
    const scale = Math.min(box.width / W, box.height / H);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
  }
  addEventListener("resize", fit);
  fit();

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- 進化の階梯（御霊おとしと同じ並び・五行の内環色） ----
  // 夜の道連れの順。最初は明るい餡音から始まり、深まるにつれ静かな御霊へ移る
  const SPIRITS = [
    { key: "anne",     name: "餡音",     color: "#6FB069" },
    { key: "oto",      name: "於兎",     color: "#C08A3E" },
    { key: "nemu",     name: "ネム",     color: "#5FB4D9" },
    { key: "nekomata", name: "ネコマタ", color: "#C6BFA8" },
    { key: "benten",   name: "弁天",     color: "#5FB4D9" },
    { key: "uka",      name: "宇迦",     color: "#E0562F" },
    { key: "izuna",    name: "イズナ",   color: "#C6BFA8" },
    { key: "shion",    name: "紫苑",     color: "#6FB069" },
    { key: "sakuya",   name: "咲耶",     color: "#E0562F" },
  ];
  // 道しるべの御霊・栞: 72段からは栞が月への道の仕上げを導く
  const SHIORI = { key: "shiori", name: "栞", color: "#F0CE7E" };
  function spiritForLayer(i) {
    return i >= MOON_ZONE ? SHIORI : SPIRITS[Math.min(Math.floor(i / 8), 8)];
  }

  // 称号: そのプレイの最高到達段で決まる
  const TITLES = [
    [0, "宵の口"], [8, "札運びの見習い"], [16, "重ね手の手習い"], [24, "夜風を読む手"],
    [32, "静かなる重ね手"], [40, "五行の律の使い手"], [48, "宵闇の棟梁"], [56, "月導の架け手"],
    [64, "緋桜の同志"], [72, "月白の頂"], [80, "満月成就"],
  ];
  function titleFor(floors) {
    let t = TITLES[0][1];
    for (const [n, name] of TITLES) if (floors >= n) t = name;
    return t;
  }

  // ---- 記録（わいわいSDK・セーブ保全） ----
  // 第三者iframe（わいわいタウンのサイト内プレイ）ではゲーム自身の localStorage が保持されない。
  // 御霊おとしで iPhone の Safari・Chrome の両方に実害を確認している（枠の中から遊ぶと
  // アプリ終了で最高記録がゼロに戻る／Pages を直に開くと残る）。わいわいSDK の save/load は
  // 親ページ側へ代理保存するので主経路にし、SDK が無い・読めない・応答しないときは
  // 今までどおりこのページの localStorage を直に使う（Artifact 版は CSP で sdk.js が読めない
  // ＝window.waiwai がそもそも無い）。仕様の正本: https://waiwai.town/llms.txt
  const SAVE_KEY = "fudakasane_save";
  const SAVE_TIMEOUT_MS = 2500; // 相手を待ちすぎない（SDK自身は握手2秒＋要求5秒待つ）
  const LEGACY_KEYS = {
    best: "fudakasane_best",
    title: "fudakasane_title",
    titleRank: "fudakasane_title_rank",
    sound: "fudakasane_sound",
  };
  const TIMED_OUT = {}; // Promise.race の勝者が「時間切れ」であることの印

  // 記録の実体。best / titleRank は増える一方なので、どの経路から読んでも大きいほうを採る
  // ＝片方が古くても記録が後退しない（移行と自己修復を同じ規則で兼ねる）。
  const saveData = { best: 0, title: "", titleRank: -1, sound: "on" };
  let saveResolve;
  const saveLoaded = new Promise((res) => { saveResolve = res; });
  let saveUseSdk = false;  // わいわい側の記録を読めた夜だけ true（読めていないのに書くと相手を潰す）
  let saveDirty = false;   // 書いていない更新があるか（画面を離れるときに取りこぼさないため）

  // わいわいSDK の呼び出しの芯。例外・拒否・無応答のどれでも { ok:false } を返し、
  // 握りつぶさず warn は残す（「CSPで止まったのに静かに合成音へ落ちていた」の轍を踏まない）。
  function waiwaiTry(fn, label, ms) {
    let call;
    try {
      call = fn();
    } catch (e) {
      console.warn("[waiwai] " + label + " を呼べなかった", e);
      return Promise.resolve({ ok: false });
    }
    const timeout = new Promise((res) => setTimeout(() => res(TIMED_OUT), ms));
    return Promise.race([Promise.resolve(call), timeout]).then(
      (v) => {
        if (v === TIMED_OUT) {
          console.warn("[waiwai] " + label + " が " + ms + "ms 以内に返らなかった");
          return { ok: false };
        }
        return { ok: true, value: v };
      },
      (e) => {
        console.warn("[waiwai] " + label + " が失敗した", e);
        return { ok: false };
      }
    );
  }

  // 記録を束へ取り込む。**「読み取れた"記録の"欄の数」を返す**（-1 は「そもそも記録の形をしていない」）。
  // 数えるのは `best` と `titleRank`+`title` だけ。**`sound` は記録ではなく好み**なので数えない
  // ——数えてしまうと「段は型ちがいで読めなかったが音だけ読めた」夜を「読めた」と誤判定し、
  // 向こうの記録を今夜の低い段で潰す（2026-08-30 検品の追試で実際に潰れた）。
  // 呼び出し側はこれを見て「読めたのか・読めなかったのか」を判断する。0 と -1 を
  // 「初回だ」と読み違えると、**空の値で向こうの記録を上書きする**（2026-08-30 検品指摘）。
  //
  // 段は 0〜MOON_FLOOR(80) の外へは出ない。**上限を超えた値は丸めずに捨てる**——
  // 丸めると壊れた値が「80段＝満月成就」という最上位の誉れに化ける（同・検品指摘）。
  function mergeSave(o) {
    if (!o || typeof o !== "object") return -1;
    let read = 0;
    const floor = (v) => {
      if (typeof v !== "number" || !isFinite(v)) return null;
      const n = Math.floor(v);
      return n >= 0 && n <= MOON_FLOOR ? n : null; // 段の外の値は壊れている
    };
    const b = floor(o.best);
    if (b !== null) { read++; saveData.best = Math.max(saveData.best, b); }
    const r = floor(o.titleRank);
    if (r !== null && typeof o.title === "string" && o.title) {
      read++;
      if (r > saveData.titleRank) {
        saveData.titleRank = r;
        saveData.title = o.title.slice(0, 40);
      }
    }
    if (o.sound === "off" || o.sound === "on") saveData.sound = o.sound; // 好みは後から読んだ側が勝つ（数えない）
    return read;
  }

  // 旧キー（このページ自身の localStorage）。移行元であり、SDK が使えない夜の置き場でもある。
  function readLegacy() {
    const d = {};
    try {
      const raw = {
        best: localStorage.getItem(LEGACY_KEYS.best),
        title: localStorage.getItem(LEGACY_KEYS.title),
        titleRank: localStorage.getItem(LEGACY_KEYS.titleRank),
        sound: localStorage.getItem(LEGACY_KEYS.sound),
      };
      d.__found = Object.keys(raw).some((k) => raw[k] !== null);
      if (raw.best !== null) d.best = +raw.best;
      if (raw.title) d.title = raw.title;
      if (raw.titleRank !== null) d.titleRank = +raw.titleRank;
      if (raw.sound !== null) d.sound = raw.sound === "off" ? "off" : "on";
    } catch (e) {
      console.warn("[save] localStorage を読めなかった", e);
    }
    return d;
  }
  function writeLegacy() {
    try {
      localStorage.setItem(LEGACY_KEYS.best, saveData.best);
      localStorage.setItem(LEGACY_KEYS.sound, saveData.sound);
      if (saveData.title) {
        localStorage.setItem(LEGACY_KEYS.title, saveData.title);
        localStorage.setItem(LEGACY_KEYS.titleRank, saveData.titleRank);
      }
    } catch (e) {
      console.warn("[save] localStorage へ書けなかった", e);
    }
  }
  function dropLegacy() {
    // 公式の推奨手順「旧キーを読む → waiwai.save で書く → 旧キーを消す」の最後の一歩。
    // save が成功したときだけ呼ぶ（先に消すと、書けなかったときに記録が消える）。
    try {
      for (const k of Object.keys(LEGACY_KEYS)) localStorage.removeItem(LEGACY_KEYS[k]);
    } catch (e) {}
  }

  // 記録を書く。呼び出し側は await しない（画面を待たせない）。
  function persistSave() {
    saveDirty = false;
    return saveLoaded.then(() => {
      if (!saveUseSdk) {
        writeLegacy();
        return false;
      }
      return waiwaiTry(
        () => window.waiwai.save(SAVE_KEY, {
          best: saveData.best,
          title: saveData.title,
          titleRank: saveData.titleRank,
          sound: saveData.sound,
        }),
        "save(" + SAVE_KEY + ")",
        SAVE_TIMEOUT_MS
      ).then((r) => {
        if (!r.ok) writeLegacy(); // 書けなかった夜も、せめてこのブラウザには残す
        return r.ok;
      });
    }).catch((e) => {
      console.warn("[save] 書き込みでつまずいた", e);
      return false;
    });
  }

  (function loadSave() {
    const legacy = readLegacy();
    if (!window.waiwai) {
      console.warn("[save] わいわいSDK が読めていないので、このページの localStorage を直に使う");
      mergeSave(legacy);
      saveResolve();
      return;
    }
    waiwaiTry(() => window.waiwai.load(SAVE_KEY), "load(" + SAVE_KEY + ")", SAVE_TIMEOUT_MS).then((r) => {
      if (!r.ok) {
        // 読めていない状態で書くと、向こうにある記録を低い値で潰しかねない。この夜は書かない。
        console.warn("[save] わいわい側の記録を読めなかった。この夜は localStorage だけを使う");
        mergeSave(legacy);
        saveResolve();
        return;
      }
      mergeSave(legacy);   // 旧キー（移行元）
      // わいわい側の記録。数は大きいほうが残り、音の好みは後から読んだこちらが勝つ。
      // r.value が null なら「まだ記録が無い」＝初回。非nullなのに1欄も読み取れなかったときは
      // **形が違う＝読めていない**とみなし、時間切れと同じ扱いにする（この夜は書かない）。
      // 書いてしまうと、向こうにある本物の記録を今夜の低い値で潰す。
      const read = r.value === null || r.value === undefined ? 0 : mergeSave(r.value);
      if (read <= 0 && r.value !== null && r.value !== undefined) {
        console.warn("[save] わいわい側の記録が読み取れない形だった。この夜は localStorage だけを使う", r.value);
        saveResolve();
        return;
      }
      saveUseSdk = true;
      saveResolve();
      if (legacy.__found) persistSave().then((ok) => { if (ok) dropLegacy(); });
    });
  })();

  // ---- 音 ----
  let audioCtx = null;
  let soundOn = true;      // 実際の値は saveLoaded の後に入る（waiwai.load は非同期のため）
  let soundChosen = false; // タイトルの2択や♪で決めたあとは、遅れて届いた記録で上書きしない
  const bgm = new Audio(BGM_DATA);
  bgm.loop = true;
  bgm.volume = 0.16; // BGMは控えめに、効果音を主役にする

  const SFX_BUS = 0.9;   // 効果音バスの素の大きさ
  const SFX_DUCK = 0.45; // 台詞が鳴っている間の倍率（約 -7dB）
  let sfxBus = null;
  let voiceBus = null; // 台詞は sfxBus を通さない（台詞中だけ効果音を沈めるため）
  let kotoMainBuf = null; // 実サンプル琴（単音・基音 KOTO_MAIN_HZ）
  let kotoHighBuf = null; // 実サンプル琴（高音の装飾フレーズ・固定ピッチ）
  const KOTO_MAIN_HZ = 196.5;
  // 音素材のバイト列取得。data URI は fetch を使わず直接デコードする
  // （Artifact ページの CSP が connect-src で data: への fetch を弾くため）
  const byteCache = {};
  function fetchBytes(url) {
    if (byteCache[url]) return byteCache[url];
    const p = url.startsWith("data:")
      ? Promise.resolve().then(() => {
          const bin = atob(url.slice(url.indexOf(",") + 1));
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return arr.buffer;
        })
      : fetch(url).then(r => r.arrayBuffer());
    byteCache[url] = p;
    return p;
  }
  // Pages版は開始ボタンを待たずに取り寄せ始める。開幕の栞の台詞は開始+0.35秒で
  // 鳴るため、クリック時に取り始めると初回訪問では間に合わないことがある。
  // （dataURI版=Artifactは復号が即時なので先読み不要。atobを遅延させたままにする）
  if (!KOTO_MAIN_DATA.startsWith("data:")) {
    [KOTO_MAIN_DATA, KOTO_HIGH_DATA, ...Object.values(VOICE_SRC)].forEach(fetchBytes);
  }
  function initAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        sfxBus = audioCtx.createGain();
        sfxBus.gain.value = SFX_BUS;
        sfxBus.connect(audioCtx.destination);
        voiceBus = audioCtx.createGain();
        voiceBus.gain.value = SFX_BUS; // 台詞の大きさは据え置き（旧: gain 1.0 × sfxBus 0.9）
        voiceBus.connect(audioCtx.destination);
        // **握りつぶさない。**用意できなかった音は、鳴らないまま静かに消える種類の事故になる
        // （琴は合成音へ落ちるので「鳴っているのに実は読めていない」が起きる。台詞は無音になる）。
        // 御霊おとしが2026-08-26にCSPで踏んだのと同じ形なので、こちらも warn を残す。
        const load = (url, set, label) => fetchBytes(url)
          .then(ab => audioCtx.decodeAudioData(ab))
          .then(set)
          .catch(e => console.warn("[audio] " + label + " を用意できなかった", e));
        load(KOTO_MAIN_DATA, b => { kotoMainBuf = b; }, "琴（単音）");
        load(KOTO_HIGH_DATA, b => { kotoHighBuf = b; }, "琴（装飾句）");
        for (const key of Object.keys(VOICE_SRC)) {
          load(VOICE_SRC[key], b => { voiceBufs[key] = b; }, "台詞 " + key);
        }
      }
    }
  }
  // 台詞: 開始（栞）・段替わり（新しく現れた御霊の名乗り）・満願（栞）で鳴る
  const voiceBufs = {};
  const activeVoices = new Set(); // ミュートで途中停止できるよう追跡する
  function voiceLine(key) {
    if (!audioCtx || !soundOn) return;
    const buf = voiceBufs[key];
    if (!buf) return;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.value = 1.0; // 台詞は聞き取りやすさ優先で前に出す
    src.connect(g).connect(voiceBus);
    const t = audioCtx.currentTime + 0.02;
    activeVoices.add(src);
    src.onended = () => activeVoices.delete(src);
    src.start(t);
    duckSfx(t, buf.duration);
  }
  // 琴と木魚は台詞とほぼ同じ大きさで鳴るので、素のままだと名乗りの頭が埋もれる。
  // 一律に効果音を下げるとぴったり浄化の手応えが痩せるため、台詞の間だけ沈める。
  // （測定と考え方は docs/VOICE.md「音量の設計」）
  let duckUntil = 0;
  function duckSfx(startAt, dur) {
    if (!sfxBus) return;
    const end = startAt + dur;
    if (end <= duckUntil) return; // 先に入った台詞のほうが長ければ何もしない
    duckUntil = end;
    const g = sfxBus.gain;
    g.cancelScheduledValues(startAt);
    g.setTargetAtTime(SFX_BUS * SFX_DUCK, startAt, 0.05);                  // 0.15秒ほどで沈む
    g.setTargetAtTime(SFX_BUS, Math.max(startAt + 0.1, end - 0.2), 0.12);  // 語尾にかけて戻す
  }
  const spiritVoice = (key) => voiceLine(key);
  // 合成弦（サンプル到着までの代用）: Karplus-Strong
  const pluckCache = {};
  function pluckBuffer(freq) {
    const key = Math.round(freq);
    if (pluckCache[key]) return pluckCache[key];
    const sr = audioCtx.sampleRate;
    const len = Math.floor(sr * 1.1);
    const buf = audioCtx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    for (let i = N; i < len; i++) d[i] = 0.996 * 0.5 * (d[i - N] + d[i - N + 1]);
    pluckCache[key] = buf;
    return buf;
  }
  function playBuffer(buf, gain, delay) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime + (delay || 0);
    const src = audioCtx.createBufferSource();
    const g = audioCtx.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g).connect(sfxBus);
    src.start(t);
  }
  // 陰旋法（都節音階）
  const SCALE = [0, 1, 5, 7, 8];
  function scaleFreq(step) {
    const oct = Math.floor(step / SCALE.length);
    const semi = SCALE[step % SCALE.length] + oct * 12;
    return 220 * Math.pow(2, semi / 12);
  }
  function noteFreq(step) {
    while (step > 11) step -= SCALE.length; // 弦サンプルの音域上限で折り返す
    return scaleFreq(step);
  }
  function kotoPluck(freq, gain, delay) {
    if (!audioCtx || !soundOn) return;
    if (!kotoMainBuf) { playBuffer(pluckBuffer(freq), gain, delay); return; }
    const t = audioCtx.currentTime + (delay || 0);
    const rate = (freq / KOTO_MAIN_HZ) * (1 + (Math.random() - 0.5) * 0.008);
    const mk = (r, gg) => {
      const src = audioCtx.createBufferSource();
      src.buffer = kotoMainBuf;
      src.playbackRate.value = r;
      const g = audioCtx.createGain();
      g.gain.value = gg * (0.92 + Math.random() * 0.16);
      src.connect(g).connect(sfxBus);
      src.start(t);
    };
    mk(rate, gain);
    if (rate > 2.5) mk(rate / 2, gain * 0.4);
  }
  function kotoKira(gain, delay) {
    if (!audioCtx || !soundOn || !kotoHighBuf) return;
    const t = audioCtx.currentTime + (delay || 0);
    const src = audioCtx.createBufferSource();
    src.buffer = kotoHighBuf;
    src.playbackRate.value = 1.12;
    const g = audioCtx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(sfxBus);
    src.start(t);
  }
  // 拍子木
  function woodblock(delay, gain) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime + (delay || 0);
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, Math.floor(sr * 0.06), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 6;
    const g = audioCtx.createGain();
    g.gain.value = gain || 0.8;
    src.connect(bp).connect(g).connect(sfxBus);
    src.start(t);
  }
  // 削げ落ちの「しゅっ」
  function sliceNoise() {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime;
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, Math.floor(sr * 0.14), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.4);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.13);
    bp.Q.value = 2.5;
    const g = audioCtx.createGain();
    g.gain.value = 0.4;
    src.connect(bp).connect(g).connect(sfxBus);
    src.start(t);
  }
  // 鈴: 満月の階に入ったら薄く鳴る
  function sfxBell() {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime;
    [[2793, 0.030], [4186, 0.016], [5588, 0.008]].forEach(([f, amp]) => {
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.012);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.010);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g).connect(sfxBus);
      o.start(t);
      o.stop(t + 1.25);
    });
  }

  const sfxPlace = () => woodblock(0);
  function sfxPerfect(streak) {
    const step = Math.min(streak, 12);
    kotoPluck(noteFreq(step), 0.95);
    if (streak >= 3) kotoPluck(noteFreq(step + 2), 0.45, 0.06);
    if (streak > 0 && streak % 5 === 0) kotoKira(0.32, 0.12);
  }
  function sfxSlice() { woodblock(0, 0.6); sliceNoise(); }
  function sfxMilestone(idx) {
    const base = 2 + Math.min(Math.floor(idx / 8), 7);
    [0, 2, 4].forEach((s, i) => kotoPluck(noteFreq(base + s), 0.7, i * 0.09));
  }
  function sfxMoonFull() {
    [3, 5, 7, 8, 10].forEach((s, i) => kotoPluck(noteFreq(s), 0.75, i * 0.09));
    kotoKira(0.5, 0.55);
  }
  function sfxOver() {
    woodblock(0);
    woodblock(0.18);
    kotoPluck(scaleFreq(1), 0.9, 0.42);
    kotoPluck(scaleFreq(1) / 2, 0.9, 0.44);
  }

  function applySound() {
    const btn = document.getElementById("mute");
    btn.classList.toggle("off", !soundOn);
    if (!soundOn) { // 再生中の台詞も止める（BGMのpauseと揃える）
      for (const src of activeVoices) { try { src.stop(); } catch (e) {} }
      activeVoices.clear();
    }
    if (started) {
      if (soundOn) bgm.play().catch(() => {});
      else bgm.pause();
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // 夜の途中でアプリを畳まれても最高段を落とさない（従来は1段ごとに書いていた）。
      // ここが実機で「終了させられる直前」に確実に来る最後の機会。
      if (saveDirty) persistSave();
      bgm.pause();
      if (audioCtx) audioCtx.suspend();
    } else {
      if (started && soundOn) bgm.play().catch(() => {});
      if (audioCtx) audioCtx.resume();
    }
  });
  addEventListener("pagehide", () => { bgm.pause(); if (saveDirty) persistSave(); });
  document.getElementById("mute").addEventListener("click", () => {
    soundOn = !soundOn;
    soundChosen = true;
    saveData.sound = soundOn ? "on" : "off";
    persistSave();
    applySound();
  });

  // ---- 札絵の読み込み（天面テクスチャ: 顔が中央上寄りに来る上端の正方形を使う） ----
  const fudaImgs = {};
  for (const key of Object.keys(FUDA_ART)) {
    const img = new Image();
    img.src = FUDA_ART[key];
    fudaImgs[key] = img;
  }

  function updateSpiritFace() {
    // 公式配布の顔アイコン(透過)。栞も揃っているので全キャラ FACE_DATA で出す
    const sp = spiritForLayer(floors);
    const el = document.getElementById("spirit-face");
    el.src = FACE_DATA[sp.key];
    el.style.borderColor = sp.color;
  }

  // ---- HUD ----
  const scoreEl = document.getElementById("score");
  function updateHud() {
    scoreEl.textContent = floors;
    document.getElementById("best").textContent = best;
    scoreEl.classList.remove("bump");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("bump");
  }

  // ---- 状態 ----
  let started = false;
  let over = false;
  let overAt = 0;
  let floors = 0;
  let layers = [];                        // {x, z, w, d, sp}
  let top = { x: -F0 / 2, z: -F0 / 2, w: F0, d: F0 };
  let slab = null;                        // {axis, pos, x, z, w, d, dir, speed}
  // 自動プレイのハッシュ。**これらは稽古ではなく本番ルールで動く**ので、
  // 全国ランキングへの送信は必ずここで塞ぐ（#autotest は全段ぴったり＝理論最大値になる）。
  const autotest = location.hash === "#autotest" || location.hash === "#autotest-sound";
  const autowobble = location.hash.startsWith("#autowobble"); // "-nofloat"等の付加を許す
  let streak = 0;
  let purifyTotal = 0; // その夜の浄化の通算（streak は連続数で、ずれると0に戻るので別に数える）
  let camY = 0;
  let pausedUntil = 0;
  let moonDone = false;
  let cleared = false;   // 満月成就で終えたか（夜明けと結果画面を出し分ける）
  let nextBellAt = 0;
  let best = 0; // 実際の値は saveLoaded の後に入る

  const particles = [];   // {sx, wy, vx, vy, life, color} sx=画面x, wy=世界高さ
  const rings = [];       // {sx, wy, r, life}
  const pieces = [];      // {x, z, w, d, h, vx, vy, life, sp, artCx, artCz} 削げ落ちる札
  const floaters = [];    // {sx, wy, text, color, life}
  const GOLD_GRAINS = ["#F0CE7E", "#D9A94C", "#f6e5ae"];

  // ---- 等角投影 ----
  function px(x, z) { return CX + (x - z) * ISO_X; }
  function py(x, z, h) { return BASE_Y + (x + z) * ISO_Y - h + camY; }
  function hy(wy) { return BASE_Y - wy + camY; } // 中心線上の高さ→画面y（演出用の近似）

  function slabSpeed(f) { return Math.min(170 + f * 4.2, 460); }
  function newSlab() {
    const axis = floors % 2 === 0 ? "x" : "z";
    const dir = Math.random() < 0.5 ? 1 : -1;
    const start = dir === 1 ? top[axis] - F0 - 80 : top[axis] + F0 + 80;
    slab = { axis, pos: start, x: top.x, z: top.z, w: top.w, d: top.d, dir, speed: slabSpeed(floors) };
    slab[axis] = start;
  }

  function goldBurst(sx, wy, n) {
    if (reducedMotion) n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      particles.push({
        sx, wy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + 1,
        life: 1, color: GOLD_GRAINS[(Math.random() * GOLD_GRAINS.length) | 0],
      });
    }
  }
  const noFloat = location.hash.includes("nofloat"); // サムネ撮影用: 文字を出さない
  function addFloater(sx, wy, text, color) {
    if (noFloat) return;
    floaters.push({ sx, wy, text, color, life: 1 });
  }

  function place() {
    if (!started || over || !slab) return;
    if (performance.now() < pausedUntil) return;
    const a = slab.axis;
    const len = a === "x" ? top.w : top.d;
    const t0 = top[a];
    const s1 = slab[a];
    const overlap = len - Math.abs(s1 - t0);
    const hTop = (floors + 1) * TH;
    const sp = spiritForLayer(floors);
    if (overlap <= 4) {
      if (practice) return; // 稽古では空振りしても終わらない（置き直せる）
      // 空振り: 札は夜に落ちる
      pieces.push({ x: slab.x, z: slab.z, w: slab.w, d: slab.d, h: hTop, vx: slab.dir * 60, vy: 40, life: 1.2, sp, artCx: slab.x + slab.w / 2, artCz: slab.z + slab.d / 2, axis: a });
      slab = null;
      over = true;
      overAt = performance.now();
      sfxOver();
      return;
    }
    const offset = s1 - t0;
    if (Math.abs(offset) <= PERFECT_TOL) {
      // ぴったり: 浄化
      streak++;
      purifyTotal++;
      let nw = top.w, nd = top.d, nx = top.x, nz = top.z;
      if (streak >= 5) {
        // 本家準拠: 長い連続ぴったりのご褒美として、わずかに幅を取り戻す
        const gw = Math.min(F0, top.w + 6) - top.w;
        const gd = Math.min(F0, top.d + 6) - top.d;
        nw = top.w + gw; nd = top.d + gd;
        nx = top.x - gw / 2; nz = top.z - gd / 2;
      }
      layers.push({ x: nx, z: nz, w: nw, d: nd, sp });
      top = { x: nx, z: nz, w: nw, d: nd };
      const csx = px(nx + nw / 2, nz + nd / 2);
      rings.push({ sx: csx, wy: hTop, r: 12, life: 1 });
      goldBurst(csx, hTop, 10 + Math.min(streak * 2, 14));
      sfxPerfect(streak); // ぴったりは琴の音のみ（掛け声は段替わりに集約）
      if (streak >= 2) addFloater(csx, hTop + 44, "浄化 ×" + streak, "#F0CE7E");
    } else if (practice) {
      // 稽古: ずれても札は欠けない（80段までの演出確認用）
      streak = 0;
      layers.push({ x: slab.x, z: slab.z, w: slab.w, d: slab.d, sp });
      top = { x: slab.x, z: slab.z, w: slab.w, d: slab.d };
      sfxPlace();
    } else {
      // ずれ: 欠けたぶんは夜に喰われる
      streak = 0;
      const newPos = Math.max(t0, s1);
      const cutLen = len - overlap;
      const cutPos = offset > 0 ? newPos + overlap : s1;
      const artCx = slab.x + slab.w / 2, artCz = slab.z + slab.d / 2;
      const piece = { h: hTop, vy: 20, life: 1.1, sp, artCx, artCz, axis: a,
        vx: (offset > 0 ? 1 : -1) * (40 + Math.random() * 30) };
      const nl = { sp };
      if (a === "x") {
        nl.x = newPos; nl.w = overlap; nl.z = top.z; nl.d = top.d;
        piece.x = cutPos; piece.w = cutLen; piece.z = slab.z; piece.d = slab.d;
      } else {
        nl.z = newPos; nl.d = overlap; nl.x = top.x; nl.w = top.w;
        piece.z = cutPos; piece.d = cutLen; piece.x = slab.x; piece.w = slab.w;
      }
      layers.push(nl);
      top = { x: nl.x, z: nl.z, w: nl.w, d: nl.d };
      pieces.push(piece);
      sfxSlice();
    }
    floors++;
    if (floors > best && !practice) { // 稽古の到達は誉れに残さない
      best = floors;
      saveData.best = best;
      saveDirty = true; // 書くのは夜の終わり（と画面を離れるとき）にまとめて1回
    }
    const ctrX = px(top.x + top.w / 2, top.z + top.d / 2);
    // 段替わり: 新しく現れた御霊が名乗る
    if (floors % 8 === 0 && floors <= MOON_ZONE) {
      const nsp = spiritForLayer(floors);
      addFloater(CX, floors * TH + 76, nsp.name + "の段", nsp.color);
      sfxMilestone(floors);
      // 栞の段だけは専用の登場台詞
      const key = floors >= MOON_ZONE ? "shiori_arrive" : nsp.key;
      setTimeout(() => voiceLine(key), 450);
    }
    // 栞の段のフローターと琴は上の段替わりブロックが出す（ここで重ねて出さない）
    if (floors === MOON_ZONE) nextBellAt = performance.now() + 800;
    if (floors === MOON_FLOOR && !moonDone) {
      // 満月成就でその夜は終わり。少し間を置いて栞の満願のページ（クリア画面）を開き、
      // ページが出たところで栞が讃える
      moonDone = true;
      cleared = true;
      over = true;      // 入力も札の往き来も止める（夜明けとは別の終わり方）
      slab = null;
      overAt = performance.now();
      addFloater(CX, floors * TH + 96, "満月成就", "#F0CE7E");
      goldBurst(ctrX, floors * TH, 40);
      sfxMoonFull();
      setTimeout(() => voiceLine("shiori_goal"), 1500); // ページが開いた直後に栞の声
      updateSpiritFace();
      updateHud();
      sfxPlace();
      return;           // 次の札は出さない
    }
    updateSpiritFace();
    updateHud();
    sfxPlace();
    newSlab();
  }

  // ---- わいわいタウン 全国ランキング・番付（あってもなくても遊びは変わらない） ----
  // SDK は page.html の外部スクリプトで読む。タウンの中（iframe）＝全国ランキングに載る／
  // タウンの外（GitHub Pages 等）＝SDK がこのブラウザだけの自己ベスト保持に自動で落ちる／
  // CSP で読めない（Claude Artifact）＝window.waiwai がそもそも無い。
  // **どの場合も結果カードは今までどおり出る**のが最優先。
  //
  // 送るスコアは合成値 `段 * 100 + その夜の浄化の通算`（2026-08-30 企画裁定）。
  // 本作は80段で上限＝段だけでは到達者が全員同点になるため、この遊びが最初から測っている
  // 「ぴったり重ねる」を従の軸に畳む。浄化回数 ≦ 段数 ≦ 80 < 100 なので、
  // 段が1つ違えば浄化では絶対に逆転しない（桁あふれは構造上起きない・理論最大 8080）。
  // 番付の行は score から段と浄化を復元して出す（getTopScores は meta を返さないため）。
  const RANK_BOARD = "main";
  const RANK_TIMEOUT_MS = 2500; // SDK自身は握手2秒＋要求5秒待つ。結果カードを付き合わせない
  const BANZUKE_LIMIT = 10;     // 番付に載せる上位の人数
  const RANK_SCALE = 100;       // 合成スコアの桁（段 * RANK_SCALE + 浄化）
  let nightId = 0; // 「もう一夜」ごとに増える。応答が返ったとき、まだ同じ夜かを見る印

  const composeScore = (fl, pure) => fl * RANK_SCALE + Math.min(pure, RANK_SCALE - 1);
  const MAX_SCORE = composeScore(MOON_FLOOR, MOON_FLOOR); // 8080
  const rankNum = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.floor(v) : null);
  const scoreNum = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : null);

  // 呼び出しは必ずここを通す。例外・拒否・無応答のどれでも null を返し、握りつぶさず warn は残す。
  function waiwaiCall(fn, label) {
    if (!window.waiwai) return Promise.resolve(null);
    return waiwaiTry(fn, label, RANK_TIMEOUT_MS).then((r) => (r.ok ? r.value : null));
  }

  const rankEls = {
    box: document.getElementById("final-rank"),
    mark: document.getElementById("final-rank-mark"),
    line: document.getElementById("final-rank-line"),
  };
  const bzEls = {
    box: document.getElementById("banzuke"),
    close: document.getElementById("bz-close"),
    sub: document.getElementById("bz-sub"),
    list: document.getElementById("bz-list"),
    gap: document.getElementById("bz-gap"),
    me: document.getElementById("bz-me"),
  };
  const banzuke = { entries: null, total: null, myRank: null, myScore: null };

  // 相手の応答は他人が入れた名前を含むので、必ず textContent で置く（innerHTML を使わない）。
  // 形が崩れている項目は静かに捨てる（1件も残らなければ entries は null ＝入口を出さない）。
  function normalizeEntries(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const e of list) {
      if (!e || typeof e !== "object") continue;
      const rank = rankNum(e.rank);
      const score = scoreNum(e.score);
      // 合成スコアの理論最大は 80段×100 + 浄化80 = 8080。これを超える値は正しい遊びからは
      // 出ないので載せない（丸めると「999段」のような、この遊びに無い段が番付に並ぶ）。
      if (rank === null || score === null || score > MAX_SCORE) continue;
      const raw = typeof e.name === "string" ? e.name.trim() : "";
      out.push({ rank: rank, name: (raw || "ナナシ").slice(0, 20), score: score });
      if (out.length >= BANZUKE_LIMIT) break;
    }
    out.sort((a, b) => a.rank - b.rank);
    return out.length ? out : null;
  }

  function bzRow(rank, name, score, isMe) {
    const li = document.createElement("li");
    li.className = "bz-row" + (rank <= 3 ? " top" : "") + (isMe ? " me" : "");
    if (isMe) li.setAttribute("aria-current", "true");
    const r = document.createElement("span");
    r.className = "bz-rank";
    r.textContent = rank;
    const n = document.createElement("span");
    n.className = "bz-name";
    n.textContent = name;
    const sc = document.createElement("span");
    sc.className = "bz-score";
    sc.textContent = Math.floor(score / RANK_SCALE) + "段";
    const sm = document.createElement("small");
    sm.textContent = "（浄化" + (score % RANK_SCALE) + "）";
    sc.appendChild(sm);
    li.appendChild(r);
    li.appendChild(n);
    li.appendChild(sc);
    return li;
  }

  function renderBanzuke() {
    const rows = banzuke.entries || [];
    bzEls.list.textContent = "";
    const inList = banzuke.myRank !== null && rows.some((e) => e.rank === banzuke.myRank);
    for (const e of rows) bzEls.list.appendChild(bzRow(e.rank, e.name, e.score, e.rank === banzuke.myRank));
    // 上位に居ない夜だけ、間を空けて自分の行を下に足す（居るときは二重に出さない）
    bzEls.me.textContent = "";
    const showMe = !inList && banzuke.myRank !== null && banzuke.myScore !== null;
    if (showMe) bzEls.me.appendChild(bzRow(banzuke.myRank, "あなた", banzuke.myScore, true));
    bzEls.me.hidden = !showMe;
    bzEls.gap.hidden = !showMe;
    // 総数が自分の順位より小さいのは辻褄が合っていない。結果カードの行で伏せたのと同じ理由で、
    // 番付の見出しでも出さない（片方だけ残ると「全国5人」の中の「12位」になる）。
    const totalOk = banzuke.total !== null
      && (banzuke.myRank === null || banzuke.total >= banzuke.myRank);
    if (totalOk) {
      bzEls.sub.textContent = "";
      bzEls.sub.appendChild(document.createTextNode("全国 "));
      const em = document.createElement("em");
      em.textContent = banzuke.total;
      bzEls.sub.appendChild(em);
      bzEls.sub.appendChild(document.createTextNode("人"));
      bzEls.sub.hidden = false;
    } else {
      bzEls.sub.hidden = true;
    }
  }

  function openBanzuke() {
    if (!banzuke.entries) return; // 控えが無いのに開かない（入口も出ていないはずだが念のため）
    renderBanzuke();
    bzEls.box.classList.add("show");
  }
  function closeBanzuke() {
    bzEls.box.classList.remove("show");
  }
  bzEls.close.addEventListener("click", closeBanzuke);
  bzEls.box.addEventListener("click", (e) => { if (e.target === bzEls.box) closeBanzuke(); });

  function clearRankUI() {
    rankEls.box.hidden = true;
    rankEls.mark.hidden = true;
    rankEls.line.hidden = true;
    rankEls.line.textContent = "";
    banzuke.entries = null;
    banzuke.total = null;
    banzuke.myRank = null;
    banzuke.myScore = null;
    closeBanzuke();
  }

  // 取れたものだけ出す。取れなかった行は出さない（「取得できませんでした」も出さない）
  function showRankUI(rank, total, improved, entries, myScore) {
    let any = false;
    if (improved) {
      rankEls.mark.hidden = false;
      any = true;
    }
    if (rank !== null) {
      rankEls.line.textContent = "";
      // 上位の顔ぶれまで取れた夜だけ、行を釦で包んで番付への入口にする。
      // 取れていなければ素の span のまま＝入口ごと存在しない。
      const canOpen = entries !== null;
      const holder = document.createElement(canOpen ? "button" : "span");
      if (canOpen) {
        holder.type = "button";
        holder.className = "rank-open";
        holder.setAttribute("aria-label", "番付を見る");
        holder.addEventListener("click", openBanzuke);
        banzuke.entries = entries;
        banzuke.total = total;
        banzuke.myRank = rank;
        banzuke.myScore = myScore;
      }
      const em = document.createElement("em");
      em.textContent = rank;
      holder.appendChild(document.createTextNode("全国 "));
      holder.appendChild(em);
      holder.appendChild(document.createTextNode(
        " 位" + (total !== null && total >= rank ? " ／ " + total + "人中" : "")
      ));
      if (canOpen) {
        const mark = document.createElement("span");
        mark.className = "rank-open-mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "›";
        holder.appendChild(mark);
      }
      rankEls.line.appendChild(holder);
      rankEls.line.hidden = false;
      any = true;
    }
    rankEls.box.hidden = !any;
  }

  // 応答の形（御霊おとしが2026-08-29に sdk.js と親側 static/play-score.js の実装で確認）:
  //   submitScore  タウン内 { ok, best, rank, improved } / タウン外 { ok, best, local:true, improved }
  //   getTopScores タウン内 { entries, total }           / タウン外 { entries, local:true }（total なし）
  //   getMyScore   タウン外 { best, local:true } または null（タウン内の非 null の形は未確認）
  // 順位は submitScore の rank を正本にする。getMyScore は rank が取れなかったときの保険で、
  // 形が未確認なので「数でなければ捨てる」読み方しかしない。
  async function reportScore(sentScore, title, myNight) {
    if (!window.waiwai) {
      // 画面には何も出さないが、記録には残す。「静かに失敗して誰も気づかない」を作らないため
      console.warn("[waiwai] SDK が読めていないので全国順位は出さない（Artifact の CSP・読み込み失敗など）");
      return;
    }
    const res = await waiwaiCall(
      () => window.waiwai.submitScore(RANK_BOARD, sentScore, { title: title }),
      "submitScore"
    );
    if (nightId !== myNight) return; // もう次の夜が始まっている
    if (!res) return;                // 送れていない＝順位も総数も名乗らない
    let rank = rankNum(res.rank);
    const improved = res.improved === true;
    if (rank === null && !res.local) {
      const mine = await waiwaiCall(() => window.waiwai.getMyScore(RANK_BOARD), "getMyScore");
      if (nightId !== myNight) return;
      if (mine) rank = rankNum(mine.rank);
    }
    // 総数と番付の顔ぶれは同じ1回で取る（結果カードの「◯人中」と番付の中身は同じ応答の別の欄）。
    // 押してから取りにいかない＝開くのを待たせないし、押してから失敗する経路も生えない。
    let total = null;
    let entries = null;
    if (rank !== null) {
      const top = await waiwaiCall(
        () => window.waiwai.getTopScores(RANK_BOARD, BANZUKE_LIMIT),
        "getTopScores"
      );
      if (nightId !== myNight) return;
      if (top) {
        total = rankNum(top.total);
        entries = normalizeEntries(top.entries);
        if (entries === null) console.warn("[waiwai] 上位の顔ぶれが読めなかったので番付への入口は出さない");
      }
    }
    // 順位は自己ベストに対して付くので、自分の行に出す点も送信の応答が返した best を優先する
    const myScore = scoreNum(res.best) !== null ? scoreNum(res.best) : scoreNum(sentScore);
    showRankUI(rank, total, improved, entries, myScore);
  }

  // ---- 称号の保存・表示 ----
  function saveBestTitle() {
    if (floors > saveData.titleRank) {
      saveData.titleRank = floors;
      saveData.title = titleFor(floors);
      saveDirty = true;
    }
  }
  // 「これまでの誉れ」は記録を読み終えてから一度だけ出す（0点を出してから差し替えない）。
  function renderBestTitle() {
    const bt = saveData.title;
    if (!bt) return;
    const el = document.getElementById("best-title");
    el.hidden = false;
    el.append("これまでの誉れ：");
    const em = document.createElement("em");
    em.textContent = bt;
    el.append(em);
  }

  // 全国ランキングへ送ってよい夜か。稽古（practice）は記録に残さない従来の決めごとどおり。
  // 自動プレイ（#autotest / #autocut / #autowobble）は**稽古ではなく本番ルールで動く**ため、
  // 塞がないと検証やPV撮影のたびに本番の番付が汚れる。
  const canSubmitScore = () => !practice && !autotest && !autocut && !autowobble;

  function showGameOver() {
    clearRankUI(); // 前の夜の順位を残さない
    if (!practice) {
      saveBestTitle(); // 稽古の到達は誉れに残さない
      persistSave();   // best と称号をまとめて1回。await しない（カードを待たせない）
    }
    // 満月成就なら道しるべの栞が締める。夜明けならそこまで導いた御霊を出す
    document.getElementById("result-card").classList.toggle("clear", cleared);
    document.getElementById("final-heading").textContent = cleared ? "満月成就" : "札は夜に呑まれた";
    document.getElementById("final-sub").textContent =
      cleared ? "喰われた月へ、道が架かった" : "重ねた道は、ここまで";
    document.getElementById("final-quote").hidden = !cleared;
    document.getElementById("final-title").textContent = titleFor(floors);
    document.getElementById("final-score").innerHTML = floors + "<small>段</small>";
    const reached = (cleared || floors >= MOON_ZONE)
      ? SHIORI
      : SPIRITS[Math.min(Math.floor(Math.max(floors - 1, 0) / 8), 8)];
    const fudaEl = document.getElementById("final-fuda");
    fudaEl.src = FUDA_ART[reached.key];
    fudaEl.alt = reached.name + "の札絵";
    fudaEl.style.display = "block";
    document.getElementById("overlay").classList.add("show");
    // 記録を確定したあとに送る。await しない＝結果カードの表示も「もう一夜」も待たせない
    if (canSubmitScore()) {
      reportScore(composeScore(floors, purifyTotal), titleFor(floors), nightId).catch((e) => {
        // ここに落ちるのは想定外（waiwaiCall は reject しない）。unhandledrejection にはしない
        console.warn("[waiwai] 順位の表示でつまずいた", e);
      });
    }
  }

  function restart() {
    document.getElementById("overlay").classList.remove("show");
    over = false;
    floors = 0;
    layers = [];
    top = { x: -F0 / 2, z: -F0 / 2, w: F0, d: F0 };
    streak = 0;
    purifyTotal = 0;
    nightId++;       // 遅れて返った前の夜の順位が、次の夜のカードに出るのを塞ぐ印
    clearRankUI();   // 前の夜の順位・番付を残さない
    camY = 0;
    moonDone = false;
    cleared = false;
    pausedUntil = performance.now() + 700; // リトライボタンのタップの名残を受けない
    particles.length = rings.length = pieces.length = floaters.length = 0;
    updateSpiritFace();
    updateHud();
    newSlab();
  }
  document.getElementById("retry").addEventListener("click", restart);

  // ---- 入力 ----
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); place(); });
  addEventListener("keydown", (e) => { if (e.code === "Space") place(); });
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 350 && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  // ダブルタップズームは抑止するが、**等倍のときだけ**にする。無条件に塞ぐと、
  // 一度ズームしてしまったあと元へ戻すピンチまで塞いでしまい、出口が無くなる
  // （御霊おとしで実機報告あり）。visualViewport が無い環境は 1 とみなす＝従来どおり常に抑止。
  document.addEventListener("gesturestart", (e) => {
    const s = (window.visualViewport && window.visualViewport.scale) || 1;
    if (s <= 1.01) e.preventDefault();
  });

  // ---- 帳（とばり）の時間割 ----
  const VOICE_AT_MS = 350;   // 栞の台詞の開始
  const DOOR_OPEN_AT = 1650; // = 350 + 1300。「ページを、」の直後＝520msの休符の頭で開きはじめる

  // ---- タイトル画面・開始 ----
  const titleOverlay = document.getElementById("title-overlay");
  {
    const keys = Object.keys(FUDA_ART);
    const pick = FUDA_ART[keys[(Math.random() * keys.length) | 0]];
    document.getElementById("title-bg").style.backgroundImage = "url('" + pick + "')";
    requestAnimationFrame(() => titleOverlay.classList.add("art-in"));
    // カードが出た時点で「これまでの誉れ」は確定している＝差し替わる瞬間を作らない。
    // 待ちは必ず上限つき（loadSave 側が SAVE_TIMEOUT_MS で切る）。5秒の保険だけは無条件。
    setTimeout(() => saveLoaded.then(showTitleCard), 1400);
    setTimeout(showTitleCard, 5000);
  }
  let titleCardShown = false;
  function showTitleCard() {
    if (titleCardShown) return;
    titleCardShown = true;
    best = Math.max(best, saveData.best);
    if (!soundChosen) soundOn = saveData.sound !== "off";
    updateHud();
    renderBestTitle();
    titleOverlay.classList.add("ready");
  }
  function begin(withSound) {
    soundOn = withSound;
    soundChosen = true;
    saveData.sound = soundOn ? "on" : "off";
    persistSave();
    initAudio();
    if (audioCtx) audioCtx.resume();
    titleOverlay.classList.add("hidden");
    started = true;
    // 開始ボタンのタップの名残（iOSのclick合成やダブルタップ）が
    // 即place()にならないよう、直後は入力を受けない
    pausedUntil = performance.now() + 700;
    applySound();
    updateSpiritFace();
    updateHud();
    newSlab();

    // 帳が開く: 閉じた扉を見せ、栞のひと言の**休符の頭**で左右へ開く。
    // 数字を先に決めず、声を聴いてから決める（SHITSURAE §1「幕を足すなら台詞の切れ目に合わせる」）。
    // 台詞「今宵のページを、開きましょう」の刻みは実測（20msのRMS包絡で無音を拾った）:
    // 0.00〜0.62「今宵の」／0.62〜0.72 休符100ms／0.72〜1.30「ページを、」／
    // **1.30〜1.82 休符520ms**／1.82〜2.76「開きましょう」。全長2.757秒。
    // 以前は 1100ms ＝「ページを、」を言っている最中に開いていた。
    // 演出は視覚なので、音なしで入った人にも同じ時間割で開く。
    const door = document.getElementById("door");
    const moveMs = reducedMotion ? 350 : 1500; // 開く速さは CSS 側（.door-half の transition）
    door.classList.remove("open");
    door.classList.add("show");
    // 開ききるまで札は動かさない（開始タップの名残がそのまま入力にならない意味も兼ねる）
    pausedUntil = performance.now() + DOOR_OPEN_AT + moveMs;
    setTimeout(() => voiceLine("shiori_start"), VOICE_AT_MS);
    setTimeout(() => { door.classList.add("open"); woodblock(0, 0.5); }, DOOR_OPEN_AT);
    setTimeout(() => door.classList.remove("show"), DOOR_OPEN_AT + moveMs + 100);
    // 最初の御霊は、栞が言い終えて帳が開ききったあとに名乗る
    setTimeout(() => voiceLine(SPIRITS[0].key), DOOR_OPEN_AT + moveMs + 250);
  }
  document.getElementById("start").addEventListener("click", () => begin(true));
  document.getElementById("start-silent").addEventListener("click", () => begin(false));

  // ---- 稽古（テストモード）----
  // 札が細らず・ずれても切られない。80段までの演出やボイスを通しで確認するための裏モード。
  // タイトルの「式札かさね」を1.5秒以内に3回タップで起動する。
  let practice = false;
  {
    const logo = document.querySelector(".game-title");
    let taps = [];
    // click ではなく pointerdown で数える。iOSのダブルタップズーム抑止（touchendの
    // preventDefault）が2回目以降のclickを打ち消してしまい、3回タップが成立しないため。
    logo.addEventListener("pointerdown", () => {
      const now = performance.now();
      taps = taps.filter(t => now - t < 1500);
      taps.push(now);
      if (taps.length >= 3) {
        taps = [];
        practice = true;
        const el = document.getElementById("best-title");
        el.hidden = false;
        el.innerHTML = "";
        const em = document.createElement("em");
        em.textContent = "稽古（札が欠けない）";
        el.append("／ ", em);
        woodblock(0); // 起動の合図（音ありのときだけ鳴る）
      }
    });
  }

  // ---- 背景 ----
  const stars = [];
  {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 64; i++) {
      stars.push({ x: rnd() * W, y: rnd() * (H - 200), r: 0.5 + rnd() * 1.1, tw: rnd() * Math.PI * 2 });
    }
  }
  const dust = [];
  for (let i = 0; i < 14; i++) {
    dust.push({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 10, r: 0.8 + Math.random() * 1.2, ph: Math.random() * Math.PI * 2 });
  }

  function drawMoon(now) {
    const p = Math.min(floors / MOON_FLOOR, 1);
    const mx = 396, my = 96, mr = 42;
    ctx.save();
    const glow = moonDone ? 0.35 + 0.12 * Math.sin(now / 400) : 0.16 + p * 0.12;
    const grad = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.4);
    grad.addColorStop(0, "rgba(240,206,126," + glow + ")");
    grad.addColorStop(1, "rgba(240,206,126,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fillStyle = "#F0CE7E";
    ctx.fill();
    if (p < 1) {
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(mx - (p * 2.15) * mr, my, mr * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = "#131320";
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- 等角の箱を描く ----
  // topArt: {img, cxw, czw} 天面に敷く札絵（F0×F0基準・中心anchor・欠けた分は見えなくなる）
  function drawBox(x, z, w, d, hTop, th, sp, isMoonZone, topArt, alpha) {
    const A = [px(x, z), py(x, z, hTop)];
    const B = [px(x + w, z), py(x + w, z, hTop)];
    const C = [px(x + w, z + d), py(x + w, z + d, hTop)];
    const D = [px(x, z + d), py(x, z + d, hTop)];
    const Bb = [B[0], B[1] + th];
    const Cb = [C[0], C[1] + th];
    const Db = [D[0], D[1] + th];
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = Math.max(alpha, 0);
    // +X側の側面（右）
    ctx.beginPath();
    ctx.moveTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(Cb[0], Cb[1]); ctx.lineTo(Bb[0], Bb[1]);
    ctx.closePath();
    ctx.fillStyle = isMoonZone ? "#4a3d20" : "#1d1d33";
    ctx.fill();
    // +Z側の側面（左）
    ctx.beginPath();
    ctx.moveTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.lineTo(Db[0], Db[1]); ctx.lineTo(Cb[0], Cb[1]);
    ctx.closePath();
    ctx.fillStyle = isMoonZone ? "#352c17" : "#141426";
    ctx.fill();
    // 側面の五行ライン
    ctx.strokeStyle = sp.color + "66";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(B[0], B[1] + th - 5); ctx.lineTo(C[0], C[1] + th - 5); ctx.lineTo(D[0], D[1] + th - 5);
    ctx.stroke();
    // 天面
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]);
    ctx.closePath();
    ctx.fillStyle = isMoonZone ? "#2e2718" : "#191929";
    ctx.fill();
    if (topArt && topArt.img && topArt.img.complete && topArt.img.naturalWidth > 0) {
      ctx.save();
      ctx.clip(); // 天面の形に絵をクリップ → ずれて削れた分だけ絵が欠ける
      // 等角平面へのアフィン変換: 局所(u,v)=世界(x,z)方向
      ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, A[0], A[1]);
      const img = topArt.img;
      const s = Math.min(img.naturalWidth, img.naturalHeight); // 上端の正方形（顔が中央上寄り）
      const ax = topArt.cxw - x - F0 / 2; // 局所座標でのart左上
      const az = topArt.czw - z - F0 / 2;
      ctx.drawImage(img, 0, 0, s, s, ax, az, F0, F0);
      // 宵闇に沈める薄がけ
      ctx.fillStyle = "rgba(19,19,32,.18)";
      ctx.fillRect(ax - F0, az - F0, F0 * 3, F0 * 3);
      ctx.restore();
    }
    if (isMoonZone && !topArt) {
      // 満月の階: 天面に月の紋
      ctx.save();
      ctx.clip();
      ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, A[0], A[1]);
      const g2 = ctx.createRadialGradient(w / 2, d / 2, 6, w / 2, d / 2, 70);
      g2.addColorStop(0, "rgba(240,206,126,.5)");
      g2.addColorStop(1, "rgba(240,206,126,.06)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(w / 2, d / 2, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 天面の縁（金）
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]);
    ctx.closePath();
    ctx.strokeStyle = isMoonZone ? "#c9a45a" : "#6d5a33";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function render(now) {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#0d0d1a");
    bgGrad.addColorStop(0.55, "#131320");
    bgGrad.addColorStop(1, "#1B1B2E");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(now / 900 + s.tw);
      ctx.fillStyle = "#E8E4D8";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawMoon(now);
    for (const d of dust) {
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now / 700 + d.ph);
      ctx.fillStyle = "#D9A94C";
      ctx.beginPath();
      ctx.arc(d.x + Math.sin(now / 1200 + d.ph) * 8, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 台座（夜の底へ沈む柱）
    drawBox(-F0 / 2, -F0 / 2, F0, F0, 0, 640, { color: "#6d5a33" }, false, null);

    // 積んだ札（画面内のぶんだけ・上の2枚は絵つき）
    const first = Math.max(0, layers.length - 24);
    for (let i = first; i < layers.length; i++) {
      const L = layers[i];
      const hTop = (i + 1) * TH;
      const sy0 = py(L.x, L.z, hTop);
      if (sy0 - 200 > H || sy0 + 260 < 0) continue;
      const withArt = i >= layers.length - 2 && L.sp.key;
      drawBox(L.x, L.z, L.w, L.d, hTop, TH, L.sp, i >= MOON_ZONE,
        withArt ? { img: fudaImgs[L.sp.key], cxw: L.x + L.w / 2, czw: L.z + L.d / 2 } : null);
    }

    // 動いている札
    if (slab && !over) {
      const sp = spiritForLayer(floors);
      const hTop = (floors + 1) * TH;
      drawBox(slab.x, slab.z, slab.w, slab.d, hTop, TH, sp, floors >= MOON_ZONE,
        sp.key ? { img: fudaImgs[sp.key], cxw: slab.x + slab.w / 2, czw: slab.z + slab.d / 2 } : null);
    }

    // 削げ落ちる札
    for (const p of pieces) {
      drawBox(p.x, p.z, p.w, p.d, p.h, TH, p.sp, false,
        p.sp.key ? { img: fudaImgs[p.sp.key], cxw: p.artCx, czw: p.artCz } : null, p.life);
    }

    // ぴったりの環（天面の楕円）
    for (const r of rings) {
      ctx.globalAlpha = r.life * 0.8;
      ctx.strokeStyle = "#F0CE7E";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(r.sx, hy(r.wy), r.r * 1.7, r.r * 0.85, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 金の粒
    for (const p of particles) {
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.sx, hy(p.wy), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 文字
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(f.life, 0);
      ctx.font = "800 20px 'Shippori Mincho B1', serif";
      ctx.fillStyle = f.color;
      ctx.shadowColor = "rgba(0,0,0,.6)";
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, f.sx, hy(f.wy));
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(5,5,14,.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // ---- ループ ----
  const autocut = location.hash === "#autocut"; // わざと少しずらして置く（切断面の確認用）
  // PV素材用: 本番ルールのまま、序盤はぴったり・中盤にかけて少しずつ欠けさせて
  // 「札が細っていく」画を作る自動プレイ。中くらいの細さで落ち着き、72段まで届く
  let wobble = 0;
  function nextWobble() {
    if (floors < 6) return 0;                    // 序盤は気持ちよくぴったり
    if (floors < 32) return Math.random() < 0.5 ? 0
      : (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 8);   // 8〜17pxの欠け
    return Math.random() < 0.8 ? 0
      : (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 4);   // 以降はたまに小さく
  }
  if (autotest || autocut || autowobble) {
    setTimeout(() => saveLoaded.then(() => begin(location.hash === "#autotest-sound")), 600);
  }
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(now - last, 33) / 1000;
    last = now;

    if (started && !over && slab && now >= pausedUntil) {
      slab.pos += slab.dir * slab.speed * dt;
      const a = slab.axis;
      if (slab.dir === 1 && slab.pos > top[a] + F0 + 80) slab.dir = -1;
      if (slab.dir === -1 && slab.pos < top[a] - F0 - 80) slab.dir = 1;
      slab[a] = slab.pos;
      if (autotest && Math.abs(slab.pos - top[a]) < 5) place();
      if (autocut && Math.abs(slab.pos - top[a] - 40) < 5) place();
      if (autowobble && Math.abs(slab.pos - (top[a] + wobble)) < 5) { place(); wobble = nextWobble(); }
    }
    const camTarget = Math.max(0, floors * TH - 300);
    camY += (camTarget - camY) * Math.min(1, dt * 6);
    for (const p of pieces) {
      p.vy += 900 * dt;
      p.h -= p.vy * dt;
      if (p.axis === "x") p.x += p.vx * dt; else p.z += p.vx * dt;
      p.life -= dt * 0.9;
    }
    for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].life <= 0) pieces.splice(i, 1);
    for (const p of particles) {
      p.sx += p.vx;
      p.wy += p.vy * 0.6;
      p.vy -= 0.12;
      p.life -= dt * 1.6;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    for (const r of rings) { r.r += 90 * dt; r.life -= dt * 2; }
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
    for (const f of floaters) { f.wy += 26 * dt; f.life -= dt * 0.8; }
    for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
    for (const d of dust) {
      d.y -= d.v * dt;
      if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; }
    }
    if (started && !over && floors >= MOON_ZONE && now >= nextBellAt) {
      sfxBell();
      nextBellAt = now + 2600 + Math.random() * 900;
    }
    // 夜明けはすぐ、満月成就はほんの少し余韻を置いてから栞のページを開く
    if (over && overAt && now - overAt > (cleared ? 1300 : 950)) {
      overAt = 0;
      showGameOver();
    }
    render(now);
    requestAnimationFrame(loop);
  }
  updateSpiritFace();
  updateHud();
  requestAnimationFrame(loop);
})();
