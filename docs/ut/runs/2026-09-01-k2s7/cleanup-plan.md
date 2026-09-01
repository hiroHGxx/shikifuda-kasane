# 後片付け（dry-run と結果） — 2026-09-01 / run k2s7

## 作られたもの

| 対象 | 種類 | 場所 | 操作 | 復元可否 |
|---|---|---|---|---|
| `fudakasane_best` / `_title` / `_title_rank` / `_sound` | localStorage | origin `http://127.0.0.1:8972`（UT専用・sdk.js遮断時の旧キー） | 作成 | context を閉じた時点で消滅 |
| `waiwai:fudakasane_save` / `waiwai:score:main`（score 0） | localStorage | file:// の artifact.html（本物SDKが standalone で書いた） | 作成 | 同上（context 使い捨て） |
| 観察スクリプト | ファイル | セッションの scratchpad | 作成 | リポジトリ外・そのまま |
| `obs*.json`・`screenshots/` | ファイル | この run ディレクトリ | 作成 | 成果物なので残す |

## 触らなかったもの

- **本番 origin（github.io）の記録**: 最初から触れていない
- **わいわいタウンの番付 `main`**: sdk.js を遮断／stub で実施。`get_top_scores` で**読んだだけ**（4行・0 の行は無し）
- ゲーム本体（`index.html` / `src/` / `assets/`）: 1行も変えていない（`git status` は `docs/ut/` と `ut.config.yaml` の新規のみ）

## 結果

puppeteer の browser context はすべて閉じ、配信サーバー（8972）もスクリプト終了時に閉じた。
baseline との差は `docs/ut/`・`ut.config.yaml` の新規追加のみ。**cleanup: completed**。
