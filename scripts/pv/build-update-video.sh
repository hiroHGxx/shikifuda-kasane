#!/bin/zsh
# 【非推奨・2026-08-31】この台本の音はゲームの実物ではない。koto_pluck_main.m4a を
# 素のまま7回置いて音量だけ変えていたため、7回とも196.5Hz（素の基音）のまま鳴っていた
# （本来は陰旋法で streak ごとに駆け上がり、×3から二声、×5で装飾句が入る。
#   src/game.js の sfxPerfect(streak) 参照）。
# 代わりに capture-purify-sound.js + build-update-video-real.sh を使うこと
# （同じ1回の走行で画も音もゲームの実物から録る。本体は無改変）。
# 以下は経緯を残すためだけに置いてある。
#
# 式札かさね 更新告知（浄化ハイライト）動画の組み立て。
# 素材: frames_wobble/raw.mp4（#autowobbleで撮った実際のプレイ。番付・クリア画面は映さない）
# 音: 公式配布BGM「Freehand」を薄く敷き、浄化の瞬間だけ実サンプル（koto_pluck_*）を鳴らす。
# Xは無音自動再生なので、音を切っても画だけで伝わる前提（金の粒バースト＋「浄化 ×n」の文字）。
set -e
FF=/opt/homebrew/bin/ffmpeg
cd "$(dirname "$0")"

SRC=frames_wobble/raw.mp4
START=1.1
DUR=13.2
OUT=update-20260831.mp4
BGM=../../assets/audio/kasane_bgm.m4a
PMAIN=../../assets/audio/koto_pluck_main.m4a
PHIGH=../../assets/audio/koto_pluck_high.m4a

# 浄化イベント（frames_wobble/purify.json 実測。開始1.1sを引いた相対秒）:
#   floor1配置(streak1・フローターなし) 3.55 / ×2 5.02 / ×3 6.52 / ×4 7.97
#   ×5 9.40 / ×6 10.79 / ×7 12.15（ここで幅回復が効き始める）
$FF -y -v error -ss $START -t $DUR -i $SRC -i $BGM -i $PMAIN -i $PHIGH -filter_complex "
[1:a]atrim=0:$DUR,afade=t=in:st=0:d=0.4,afade=t=out:st=11.3:d=1.8,volume=0.15[bg];
[2:a]atrim=0:0.5,afade=t=out:st=0.35:d=0.15,volume=0.75,adelay=3750|3750[p1];
[2:a]atrim=0:0.5,afade=t=out:st=0.35:d=0.15,volume=0.8,adelay=5220|5220[p2];
[2:a]atrim=0:0.5,afade=t=out:st=0.35:d=0.15,volume=0.85,adelay=6720|6720[p3];
[2:a]atrim=0:0.5,afade=t=out:st=0.35:d=0.15,volume=0.9,adelay=8170|8170[p4];
[3:a]atrim=0:0.5,afade=t=out:st=0.35:d=0.15,volume=1.0,adelay=9600|9600[p5];
[3:a]atrim=0:0.5,afade=t=out:st=0.35:d=0.15,volume=1.05,adelay=10990|10990[p6];
[3:a]atrim=0:0.5,afade=t=out:st=0.35:d=0.15,volume=1.1,adelay=12350|12350[p7];
[bg][p1][p2][p3][p4][p5][p6][p7]amix=inputs=8:duration=first:normalize=0[a]
" -map 0:v -map "[a]" -c:v libx264 -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -movflags +faststart -shortest "$OUT"

echo "done: $OUT"
