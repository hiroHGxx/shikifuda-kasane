# baseline — 2026-09-01 / run k2s7

UT開始前に控えた状態。**本番 origin（https://hirohgxx.github.io/）とわいわいタウンには一切触れていない。**

| 対象 | 開始前 | 取得方法 |
|---|---|---|
| localStorage（http://127.0.0.1:8972 origin） | `{}`（空）— 観察スクリプトが新しい browser context で開くため、開始時点で必ず空 | 開いた直後に `Object.entries(localStorage)` を各ルートで記録 |
| localStorage（本番 origin） | **未取得・未変更**（本番では実施しないため触れていない） | — |
| わいわいタウンの番付 `main` | **未取得・未変更**（sdk.js を遮断して実施） | — |
| リポジトリの作業ツリー | `docs/ut/` と `ut.config.yaml` 以外は無改変（09-01 の安全余白 commit 8f94d48 済み） | `git status` |
| 配信 | 観察スクリプトが `http://127.0.0.1:8972/` でこのリポジトリを配信し、終了時に閉じる | 起動時に 200 を確認 |

作られるデータは UT 用 origin の localStorage（`fudakasane_save` の束）だけで、context を閉じれば消える。
**不可逆・外部影響の操作は存在しない。**
