#!/bin/zsh
# 式札かさね 更新告知（浄化ハイライト）動画の組み立て・実音版。
#
# build-update-video.sh（旧）は koto_pluck_main.m4a を素のまま並べて音量だけ変えた
# 近似音だった（7回とも196.5Hzの素の基音のまま＝ゲームの実物と違う）。
# こちらは capture-purify-sound.js で「同じ1回の走行」から画と音を両方録り、
# ゲームが本当に鳴らしている音（陰旋法で駆け上がる主音・×3からの副音・×5の装飾句）を
# そのまま使う。本体（src/game.js）は一切変更していない。
#
# 手順:
#   1. node capture-purify-sound.js <MAX_FLOORS> <出力フォルダ名>
#        → #autotest-sound（音ありの自動ぴったりプレイ）で撮る。
#          出力フォルダに f####.jpg・list.txt・audio.webm・meta.json・purify.json ができる
#   2. 本スクリプトで concat → 音ズレ補正（meta.jsonのaudioOffsetSecを読む）→ 見せ場だけ trim
set -e
FF=/opt/homebrew/bin/ffmpeg
cd "$(dirname "$0")"

IN=${1:-frames_sound}       # 手順1の出力フォルダ
OUT=${2:-update-20260831-b.mp4}
START=${3:-2.6}             # 帳が完全に開いたあと（1コマ目が黒くならない地点）
DUR=${4:-12.0}              # 10〜16秒の範囲で。streak 1〜8前後を収める

if [[ ! -f "$IN/list.txt" || ! -f "$IN/meta.json" ]]; then
  echo "先に: node capture-purify-sound.js <MAX_FLOORS> $IN" >&2
  exit 1
fi

$FF -y -v error -f concat -safe 0 -i "$IN/list.txt" -fps_mode cfr -r 30 -pix_fmt yuv420p "$IN/raw.mp4"
$FF -y -v error -i "$IN/audio.webm" "$IN/audio.wav"

# meta.json の audioOffsetSec = audioStartAt - videoT0（秒）。
#   正なら音の方が後から始まった → adelay で音を遅らせる
#   負なら音の方が先に始まった   → atrim で音の頭を削って詰める
OFFSET=$(jq -r '.audioOffsetSec' "$IN/meta.json")
echo "audioOffsetSec = ${OFFSET}s"
ABS=$(python3 -c "print(abs(${OFFSET}))")
if python3 -c "exit(0 if ${OFFSET} < 0 else 1)"; then
  AFILT="atrim=start=${ABS},asetpts=PTS-STARTPTS"
else
  MS=$(python3 -c "print(round(${ABS}*1000))")
  AFILT="adelay=${MS}|${MS}"
fi

$FF -y -v error -i "$IN/raw.mp4" -i "$IN/audio.wav" \
  -filter_complex "[1:a]${AFILT}[a]" \
  -map 0:v -map "[a]" -ss "$START" -t "$DUR" \
  -c:v libx264 -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -movflags +faststart -shortest \
  "$OUT"

echo "done: $OUT"
