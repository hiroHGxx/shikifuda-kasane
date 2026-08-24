#!/bin/zsh
# わいわいタウン用プレビュー動画（640x640・14秒・無音・冒頭からプレー画面）
# タイルhover再生: 最初の1-2秒が勝負なので序盤の「重ね」から始める
set -e
CROP="crop=720:720:0:150,scale=640:640,fps=30,format=yuv420p"
V="-c:v libx264 -crf 21 -pix_fmt yuv420p -r 30 -an"
ffmpeg -y -v error -ss 4.3  -t 3.0 -i gameplay.mp4 -vf "$CROP" ${=V} p1.mp4   # 序盤の重ね
ffmpeg -y -v error -ss 19.8 -t 4.0 -i gameplay.mp4 -vf "$CROP" ${=V} p2.mp4   # 欠けて細る
ffmpeg -y -v error -ss 31.3 -t 3.0 -i gameplay.mp4 -vf "$CROP" ${=V} p3.mp4   # ネコマタの段
ffmpeg -y -v error -ss 67.6 -t 4.0 -i gameplay.mp4 -vf "$CROP" ${=V} p4.mp4   # 栞の段・ほぼ満月
printf "file 'p1.mp4'\nfile 'p2.mp4'\nfile 'p3.mp4'\nfile 'p4.mp4'\n" > plist.txt
ffmpeg -y -v error -f concat -safe 0 -i plist.txt -c copy waiwai-preview.mp4
echo "done: waiwai-preview.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 waiwai-preview.mp4)s)"
