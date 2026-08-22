# 式札かさね ボイス制作記録

公式ガイドライン（https://vibe.co.jp/luna-occulta/fanworks/assets の「声のお約束」）に基づき、
公式配布ボイスと公式指定 Voice ID からキャラボイスを制作した記録。

## 台詞一覧（12場面）

札が新しい御霊に替わったときに、その御霊が**名乗る**。ぴったり浄化は琴の音のみ。

| 場面 | 話者 | 台詞 | 声の出どころ |
|---|---|---|---|
| 帳が開くとき | 栞 | 今宵のページを、開きましょう | ElevenLabs Mini（公式指定） |
| 一段目から | 餡音 | わたしがお供するねえ。えへへ、いってみよう | 公式配布wav（Irodori） |
| 8段 | 於兎 | ここからは任せて！どんどん重ねちゃおう | ElevenLabs Lola（公式指定） |
| 16段 | ネム | ん、ネムの番。ねむいけど、やる | 呂屯の声（代役・Irodori） |
| 24段 | ネコマタ | あたいの番かい。なら、しくじるんじゃないよ | オロチの声（代役・Irodori） |
| 32段 | 弁天 | ここからはわっちが。ぬしさん、手元にお気をつけなんし | 公式配布wav（Irodori） |
| 40段 | 宇迦 | ふふん、あたしの番ね。あんた、ついてきなさいよ | 公式配布wav（Irodori） |
| 48段 | イズナ | 私の番ね。あなたなら、まだ登れるかしら | 公式配布wav（Irodori） |
| 56段 | 紫苑 | 私の番だ。お前の手を、見せてみろ | ElevenLabs Rose（公式指定） |
| 64段 | 咲耶 | お待たせ。ここからはあたしが持ってく。あんたも気合い入れて | 公式配布wav（Irodori） |
| 72段 | 栞 | 最後のページは、わたくしが | ElevenLabs Mini（公式指定） |
| 満願（80段） | 栞 | 月に、届きました。お見事ですこと、あるじどの | ElevenLabs Mini（公式指定） |

台詞は公式MCP `kitan-lore` の `get_spirit` の口調データ（voice.tone / samples / firstPerson / address）に沿って書き起こした。

## 制作環境

### Irodori-TTS（無料・ローカル）
- 導入先: `Products/game/tools/Irodori-TTS`（uv・MPS動作。1本4〜8秒）
- 実行例:
```bash
export PATH="$HOME/.local/bin:$PATH"
uv run --no-sync python infer.py --hf-checkpoint Aratako/Irodori-TTS-v4.1-Small \
  --text "台詞" --ref-wav <公式配布wav> --caption "<公式の声質説明文>" \
  --model-device mps --codec-device mps --seed 42 --output-wav out.wav
```
- 公式配布wav: `https://vibe.co.jp/luna-occulta/media/voice/<id>_sample.wav`（24キャラ分）
- **参照音声の話速を強く引き継ぐ**。caption で「速く」と書いても変わらない。
  テンポを変えたいときは**参照音声そのものを別キャラに差し替える**のが唯一有効だった

### ElevenLabs（無料プラン）
- キー: `~/.secrets/elevenlabs.env`
- **無料プランは API からライブラリボイスを使えない**（402 paid_plan_required）。
  ブラウザUI（Claude in Chrome で自動操作）からのみ利用可能
- 公式指定 Voice ID: 於兎=Lola `mHX7OoPk2G45VMAuinIt` / 紫苑=Rose `8PfKHL4nZToWC3pbz9U9` / 栞=Mini `hO2yZ8lxM3axUxL8OeKX`
- ネム=Aria `9BWtsMINqrJLrRacOk9x` / ネコマタ=Charlotte `XB0fDUnXU5powFXDhCwa` は
  **現行 ElevenLabs から削除済みで新規アカウントでは使用不可** → 公式配布ボイスから代役を立てた
- モデルは Eleven v3。推奨タグを台詞の先頭に付ける（例 `[japanese][calm][mysterious]`）

## つまずいた点と対処（重要）

1. **「……」が「てんてん点」と読まれる**（ElevenLabs）
   → 三点リーダを使わず、句読点だけで間を作る

2. **漢字の読み間違い**「第一夜」→いちい、「八十段」→ぱちじゅう
   → ひらがなで書くと読みは直るが**イントネーションが崩れる**。
   助詞を足して読みを一意にするのが正解（第一**の**夜 / 八十**の**段）。
   最終的には数字を使わない台詞に変更した

3. **単語だけの掛け声はイントネーションが破綻する**
   → 「それっ！」が指示語の抑揚になる等。**文にすると自然になる**。
   これが「掛け声」→「登場の台詞」へ設計変更した理由

4. **1キャラで声の出どころが混在すると別人に聞こえる**
   → 1キャラ＝1音源に統一すること

5. **常用外の漢字は読みが崩壊する**「頁」→ イーラーショー／ユーポー（ElevenLabs）
   → 同じ字でも文ごとに違う音を当ててくるので、崩れ方から原因を推測しない。
   外来語は**カタカナで書く**のが確実（「頁」→「ページ」）。#2 のように助詞で読みを
   一意にする手は、そもそも字を読めていない場合には効かない

6. **カタカナ語でも子音の立ち上がりが弱いことがある**
   → 「ページ」が Whisper に「ていじ／提示」と認識される個体差あり。
   テイクごとに揺れるので**複数テイク引いて耳で選ぶ**。ASR は崩壊の検出には使えるが、
   微妙な子音の判定は当てにならない（採否は必ず人の耳で決める）

## 検証方法

生成後は必ず音声認識（Whisper）で読み上げ内容を確認する。

```bash
export PATH="$HOME/.local/bin:$PATH"
cd Products/game/tools/Irodori-TTS
uv run --no-sync python -c "
from transformers import pipeline
asr = pipeline('automatic-speech-recognition', model='openai/whisper-small', device='mps')
print(asr('/tmp/x.wav', generate_kwargs={'language':'japanese','task':'transcribe'})['text'])
"
```
漢字の変換揺れは認識側の癖なので、**読み（音）が合っているか**で判断する。

## 後処理（統一ルール）

無音・余韻をトリムし、最大3.4秒に収め、ピーク0.88へ正規化。24kHz mono wav。
```
発声区間検出（10ms RMS包絡・ピーク比6%）→ atempo（上限1.35）→ フェードアウト0.12s → 音量正規化
```

## ボイス帖（試聴ページ）

`assets/audio/voice_*.wav` から単一HTMLを組み立てる。台詞・話者・五行色・声の出どころは
`scripts/build-voice-page.js` の `LINES` が正本（本書の表と対応）。

```bash
node scripts/build-voice-page.js   # → dist/voice-book.html（約2.7MB）
```

- 公開先: Claude Artifact `c7500fd9-fb59-4d3e-8c13-91108370e2a6`
- ゲーム本体と同じ公式トンマナ・トークン（宵闇に金）と Shippori Mincho B1 を使用
- 再生はゲームと同じ `atob()` → `decodeAudioData`。**`<audio src="data:">` や `fetch(data:)` は Artifact の CSP で鳴らない**
