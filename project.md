# プロジェクト記録

## 目的と成功条件

スマートフォンのブラウザでプレイできる弾幕シューティングゲームを作り、`hiyasinnsu/test_HY_Hy4` で GitHub Pages 公開する。

成功条件:

- 公開 URL `https://hiyasinnsu.github.io/test_HY_Hy4/` でゲームが起動し、スマホのタッチ操作で移動・射撃・ボムが使える。
- PC のキーボードでも遊べる。
- リポジトリに再現可能なソース、単体テスト、Pages デプロイ設定がある。
- 外部アセット・外部通信なしで動作する。

## 重要な設計判断と理由

| 判断 | 理由 |
| --- | --- |
| ビルド不要の静的サイト（HTML + CSS + ES Modules） | GitHub Pages は静的配信のみ。依存を増やさず公開手順を単純にする。 |
| Canvas 2D + `requestAnimationFrame` + 弾プール | 類似 OSS で実績のある構成。スマホでも数百発の敵弾を扱える。 |
| 論理解像度 360×640、letterbox で拡大縮小 | 縦画面のスマホを主対象にしつつ、PC や横画面でも崩れない。 |
| 固定タイムステップ 1/60 + accumulator | 端末のフレームレート差で弾速・難易度が変わらないようにする。 |
| 相対ドラッグ＋自動射撃 | 指で自機や弾が隠れず、片手で回避に集中できる。 |
| シード付き RNG | 弾幕パターンとテストを再現可能にする。 |
| 音はデフォルトオフ、Web Audio で合成 | モバイルブラウザの自動再生制限を避け、外部ファイルを不要にする。 |
| Pages のソースは GitHub Actions | `main` への push でテスト→デプロイを自動化。リポジトリは当初空だった。 |

### 類似 OSS 調査

- `andyp123/canvas_danmaku`: HTML5 Canvas + JS の弾幕。2014 年更新、キーボード操作のみ、ライセンス表示なし。
- `takahirox/toho-like-js`: 197 stars。WebGL / WebRTC を含む。2017 年更新。
- `selenebun/bullethell`: HTML5 + JS。Public archive。

いずれもメンテナンスが止まっているかスマホ対応・ライセンスが不明なため、コードはコピーせず構成のみ参考にした。

## 完了した主要工程

- 対象リポジトリが空であること、Pages が未設定であることを確認。
- GitHub Pages を `workflow` ビルドで有効化。公開 URL を確定。
- `.github/workflows/deploy-pages.yml` を作成（テスト → 静的ファイル収集 → `upload-pages-artifact` → `deploy-pages`）。
- `README.md` を作成（遊び方、開発手順、構成、デプロイ、参考調査）。
- ゲーム本体（`index.html`, `styles.css`, `src/`, `tests/`, `package.json`）を実装。5 種類のボス弾幕、3 フェーズ、相対ドラッグ、ボム、かすり、ハイスコア、Web Audio 合成音を含む。
- ローカル検証: `node --test` 29 件全通過、`node --check` 11 ファイル全通過、外部 URL 参照なし。390×844 のスマホ相当ビューポートで開始・スコア加算・ボム消費・ポーズ/再開・リスタート・ドラッグ入力を確認し、コンソールエラーなし。
- `git ls-remote` を `http.sslBackend=openssl` + 明示 CA で成功（exit 0）。push の疎通を確認。

## 進行中・未解決事項

- 対象リポジトリへの初回コミットと push。
- GitHub Actions のデプロイ完了と、公開 URL での動作確認。

## 再発する可能性のある問題と対策

- ローカルの `git` は Windows の schannel で `SEC_E_NO_CREDENTIALS` になり HTTPS 認証が通らない。原因は認証ではなく TLS バックエンド。対策は `git -c http.sslBackend=openssl -c "http.sslCAInfo=C:/Program Files/Git/mingw64/etc/ssl/certs/ca-bundle.crt"` を付けること。環境変数 `GIT_CONFIG_PARAMETERS` が GitHub 用の有効な basic 認証ヘッダを既に供給しているため、`-c http.extraHeader` を追加して二重送信しない。詳細は `push-notes.md`。git が使えない場合は REST Git Data API で初期コミットを作り、`workflow_dispatch` でデプロイする。
- システムの `init.defaultBranch` は `master`。Pages ワークフローは `main` トリガなので、`git init -b main` を明示する。
- ES Modules は `file://` では読み込めない。検証時は必ずローカル HTTP サーバを使う。
