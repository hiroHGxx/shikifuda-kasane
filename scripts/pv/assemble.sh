#!/bin/zsh
# 式札かさねPV組み立て（縦型720x1280・約29秒・公式BGM「Freehand」＋ボイス3本）
# 素材は #autowobble（本番ルールで中くらいの細さを保つ自動プレイ）で撮る。
# クリア画面はPVでは見せない——72段の栞「最後のページは、わたくしが」で引きを作る。
# カット点は events.json の実測（撮り直したら要調整）:
#   door_open 1.07 / 1段 4.09 / 8段 14.0 / 24段 32.34 / 72段 67.84 / (80段 72.54 直前で素材終了)
set -e
V="-c:v libx264 -crf 20 -pix_fmt yuv420p -r 30"
S2_SS=0.3;  S2_T=6.4    # 帳が開く→序盤の重ね（ほぼぴったり）
S3_SS=30.5; S3_T=4.2    # 細り始めた塔→24段「ネコマタの段」
S4_SS=66.4; S4_T=5.7    # 70段→72段 栞の段（金の札）。満月成就の手前で切る
BGM="../../assets/audio/kasane_bgm.m4a"
V_START="../../assets/audio/voice_shiori_start.wav"    # 今宵のページを、開きましょう
V_NEKO="../../assets/audio/voice_nekomata.wav"         # あたいの番かい。なら、しくじるんじゃないよ
V_ARRIVE="../../assets/audio/voice_shiori_arrive.wav"  # 最後のページは、わたくしが

# S1: シネマ導入（栞の札絵・ゆっくり寄り）
ffmpeg -y -v error -loop 1 -i s1.png -t 3.2 -vf "scale=1440:2560,zoompan=z='min(1+0.0011*on,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=30" ${=V} seg1.mp4
# S2: 帳が開く＋序盤プレイ＋ジャンルテロップ（静止画にfade alphaを使うので -loop 1 必須）
ffmpeg -y -v error -ss $S2_SS -t $S2_T -i gameplay.mp4 -loop 1 -framerate 30 -i telop.png -filter_complex "[1]format=rgba,fade=in:st=2.3:d=0.4:alpha=1,fade=out:st=5.4:d=0.5:alpha=1[t];[0][t]overlay=0:0:shortest=1,fps=30,format=yuv420p" ${=V} seg2.mp4
# S3: 欠けて細る塔→段替わりの名乗り
ffmpeg -y -v error -ss $S3_SS -t $S3_T -i gameplay.mp4 -vf "fps=30,format=yuv420p" ${=V} seg3.mp4
# S4: 栞の段（金の札・鈴）——クリアは見せずに引きで終える
ffmpeg -y -v error -ss $S4_SS -t $S4_T -i gameplay.mp4 -vf "fps=30,format=yuv420p" ${=V} seg4.mp4
# S5: 札絵モンタージュ（階梯順・締めは栞）＋コピー
ffmpeg -y -v error -f concat -safe 0 -i mlist.txt -loop 1 -framerate 30 -i m_copy.png -filter_complex "[1]format=rgba,fade=in:st=0.25:d=0.4:alpha=1[t];[0][t]overlay=0:0:shortest=1,fps=30,format=yuv420p" -t 4.4 ${=V} seg5.mp4
# S6: エンドカード（寄り＋フェードアウト）
ffmpeg -y -v error -loop 1 -i s6.png -t 5.0 -vf "scale=1440:2560,zoompan=z='min(1+0.0005*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280,fps=30,fade=out:st=4.3:d=0.7" ${=V} seg6.mp4

# 尺とボイス位置（最終タイムライン秒）。ゲーム内の再生時刻から換算:
#   開幕の栞 = begin+0.35s（素材の0.32s）／名乗り = 段替わり+0.45s
TOTAL=$(echo "3.2 + $S2_T + $S3_T + $S4_T + 4.4 + 5.0" | bc)
FADE_ST=$(echo "$TOTAL - 2.4" | bc)
T_VS=$(echo "3.2 + 0.32 - $S2_SS" | bc)
T_VN=$(echo "3.2 + $S2_T + 32.79 - $S3_SS" | bc)
T_VA=$(echo "3.2 + $S2_T + $S3_T + 68.29 - $S4_SS" | bc)
VS_MS=$(printf '%.0f' $(echo "$T_VS*1000" | bc)); VN_MS=$(printf '%.0f' $(echo "$T_VN*1000" | bc)); VA_MS=$(printf '%.0f' $(echo "$T_VA*1000" | bc))
VS_END=$(echo "$T_VS + 3.0" | bc); VA_END=$(echo "$T_VA + 3.1" | bc)

ffmpeg -y -v error -f concat -safe 0 -i clist.txt -c copy silent.mp4
# BGMはボイスの間だけ沈める（本体のダッキングと同じ考え方）。ネコマタ〜栞は窓をつなげる
ffmpeg -y -v error -i silent.mp4 -i "$BGM" -i "$V_START" -i "$V_NEKO" -i "$V_ARRIVE" -filter_complex \
"[1:a]atrim=0:$TOTAL,afade=t=in:st=0:d=0.6,afade=t=out:st=$FADE_ST:d=2.4,volume='0.8-0.4*(between(t,$T_VS,$VS_END)+between(t,$T_VN,$VA_END))':eval=frame[bg];\
[2:a]adelay=${VS_MS}|${VS_MS},volume=1.3[vs];\
[3:a]adelay=${VN_MS}|${VN_MS},volume=1.3[vn];\
[4:a]adelay=${VA_MS}|${VA_MS},volume=1.3[va];\
[bg][vs][vn][va]amix=inputs=4:duration=first:normalize=0[a]" \
-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -movflags +faststart kasane-pv.mp4
echo "done: kasane-pv.mp4 (${TOTAL}s) / voices at ${T_VS}s(栞), ${T_VN}s(ネコマタ), ${T_VA}s(栞)"
