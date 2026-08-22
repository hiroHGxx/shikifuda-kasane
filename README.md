# 式札かさね（しきふだかさね）

『月蝕綺譚 -Luna Occulta-』の**非公式二次創作**ファンゲームです。
月が蝕まれる夜、宵闇を往き来する式札をとどめて重ね、喰われた月への道を架けます。

ずれた分は夜に喰われて札が細り、空振りすれば夜明け。
八十段を積み上げると、満月が成就します。

積み上げ式のパズル。スマホのブラウザでそのまま遊べます。

**▶ 遊ぶ: https://hirohgxx.github.io/shikifuda-kasane/**

## 遊び方

- 往き来する札に合わせて画面をタップすると、その位置で札がとまります
- ずれた分は切り落とされ、次の札が細くなります
- 空振りすると夜明け（ゲームオーバー）
- ぴったり重ねると浄化。五回続けば札の幅が少し戻ります
- **八十段を積み上げれば満月成就。そこでクリアです**

### 御霊の階梯

八段ごとに導き手が替わります。

餡音 → 於兎 → ネム → ネコマタ → 弁天 → 宇迦 → イズナ → 紫苑 → 咲耶 → 栞（七十二段〜）

七十二段からは金縁の「栞の段」。八十段まで届くと満月が成就し、道しるべの栞が締めくくります。

## ドキュメント

- [仕様書（SPEC.md）](docs/SPEC.md) — 盤面・物理・段位・演出・音・ビルド構成
- [ボイス制作記録（VOICE.md）](docs/VOICE.md) — 台詞一覧・制作環境・つまずいた点と対処

## 開発

```bash
# 単一ファイル版を dist/ に生成（Pages用 index.html / Artifact用 artifact.html）
node scripts/build-dist.js

# ボイス帖（試聴ページ）を assets/audio の wav から生成
node scripts/build-voice-page.js

# 生成した台詞音声をゲーム用に整える（トリム・話速・フェード・正規化）
python3 scripts/trim-voice.py <入力.mp3> <出力.wav>
```

- `index.html#autotest` で自動プレイ、`#autocut` でわざとずらすデバッグモード
- タイトルの「式札かさね」を1.5秒以内に3回タップすると稽古モード（札が欠けない）

## 二次創作について・クレジット

本作は『月蝕綺譚 -Luna Occulta-』（Studio VIBE / CryptoNinja 外伝）の
[二次創作ガイドライン](https://vibe.co.jp/luna-occulta/fanworks)および
[CryptoNinja ガイドライン](https://www.ninja-dao.com/guidelines)に基づくファンメイド作品で、**公式とは関係ありません**。

- **札絵・必殺カットイン**: 公式[素材蔵](https://vibe.co.jp/luna-occulta/fanworks/assets)配布の札絵（fuda）・必殺カットイン（cutin）を使用（「二次創作のゲーム・画像作品に組み込んでOK」のお約束に基づく）
- **栞の札絵**: 公式正典シートを参照資料として Lovart で生成（ガイドラインの「AIによるイラスト生成OK」「正典シートのAI利用OK」に基づく）
- **BGM**: 公式素材蔵配布のキャラクターソング「Freehand」（ネムのテーマ）を使用（「作品に組み込んで公開するのはOK」のお約束に基づく）。楽曲の単体利用・再配布はできません
- **キャラクターボイス**: 公式ガイドライン「声のお約束」に基づき、公式配布ボイスを参照音声とした [Irodori-TTS](https://huggingface.co/Aratako/Irodori-TTS-v4.1-Small) と、公式が指定する ElevenLabs の Voice ID から制作（詳細は [docs/VOICE.md](docs/VOICE.md)）
- **琴の音**: Lovart で生成した琴独奏曲から切り出したワンショットを変速して使用（自作素材）
- **拍子木・鈴・削げ音**: WebAudio による自作合成
- **帳の金襴帯**: 自作 SVG（公式素材は使用していません）
- 正典シートの原本はこのリポジトリには含めていません

キャラクター・楽曲および原作の権利は原権利者（Studio VIBE / CryptoNinja）に帰属します。
本作は無料で公開しており、収益化はしていません。
