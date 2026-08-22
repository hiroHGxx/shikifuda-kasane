#!/usr/bin/env python3
"""生成した台詞音声を、ゲームに載せる形へ揃える。

docs/VOICE.md「後処理（統一ルール）」の実装:
  発声区間検出（10ms RMS包絡・ピーク比6%）→ atempo（上限1.35）→ フェードアウト0.12s → 音量正規化
出力は 24kHz mono wav・最大3.4秒・ピーク0.88。

使い方:
  uv run --no-sync python trim-voice.py <入力(mp3/wav)> <出力.wav>

mp3 の読み込みに ffmpeg を使うので PATH に必要。numpy / soundfile も必要
（tools/Irodori-TTS の環境で動かすのが手軽）。
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 24000          # 出力サンプルレート
MAX_SEC = 3.4       # 収める長さの上限
MAX_TEMPO = 1.35    # 早回しの上限（これ以上は不自然になる）
PEAK = 0.88         # 正規化後のピーク
FADE_SEC = 0.12     # 末尾フェードアウト
FRAME_SEC = 0.010   # RMS包絡の窓
RATIO = 0.06        # 発声とみなすピーク比
PAD_SEC = 0.04      # 検出区間の前後に残す余白


def load_mono(path: Path) -> np.ndarray:
    """任意の音声を 24kHz mono float32 で読む（mp3 は ffmpeg 経由）。"""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path),
         "-ac", "1", "-ar", str(SR), str(tmp_path)],
        check=True,
    )
    data, _ = sf.read(tmp_path, dtype="float32")
    tmp_path.unlink()
    return data


def speech_span(x: np.ndarray) -> tuple[int, int]:
    """RMS包絡がピークの RATIO を超える範囲を発声区間として返す。"""
    frame = max(1, int(SR * FRAME_SEC))
    n = len(x) // frame
    if n == 0:
        return 0, len(x)
    env = np.sqrt((x[: n * frame].reshape(n, frame) ** 2).mean(axis=1))
    loud = np.flatnonzero(env > env.max() * RATIO)
    if loud.size == 0:
        return 0, len(x)
    pad = int(SR * PAD_SEC)
    start = max(0, loud[0] * frame - pad)
    end = min(len(x), (loud[-1] + 1) * frame + pad)
    return start, end


def atempo(x: np.ndarray, rate: float) -> np.ndarray:
    """ffmpeg の atempo で話速だけ変える（音程は保つ）。"""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as a, \
         tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as b:
        src, dst = Path(a.name), Path(b.name)
    sf.write(src, x, SR)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
         "-filter:a", f"atempo={rate:.6f}", str(dst)],
        check=True,
    )
    out, _ = sf.read(dst, dtype="float32")
    src.unlink()
    dst.unlink()
    return out


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])

    x = load_mono(src)
    before = len(x) / SR

    start, end = speech_span(x)
    x = x[start:end]

    # 上限を超えていれば早回しで収める（それでも足りなければ長いまま通す）
    dur = len(x) / SR
    if dur > MAX_SEC:
        rate = min(dur / MAX_SEC, MAX_TEMPO)
        x = atempo(x, rate)

    # 末尾フェードアウト
    fade = min(int(SR * FADE_SEC), len(x))
    if fade > 0:
        x[-fade:] *= np.linspace(1.0, 0.0, fade, dtype="float32")

    peak = float(np.abs(x).max())
    if peak > 0:
        x = x * (PEAK / peak)

    sf.write(dst, x.astype("float32"), SR, subtype="PCM_16")
    print(f"{src.name} -> {dst.name}  {before:.2f}s -> {len(x) / SR:.2f}s")


if __name__ == "__main__":
    main()
