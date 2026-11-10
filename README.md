# 星屑弾幕 / Hoshikuzu Danmaku

スマートフォンのブラウザで遊べる、縦画面の弾幕シューティングゲームです。ビルド不要・依存パッケージなしの静的サイトで、GitHub Pages から配信します。

**公開 URL:** https://hiyasinnsu.github.io/test_HY_Hy4/

## 遊び方

| 操作 | スマホ | PC |
| --- | --- | --- |
| 移動 | 画面をドラッグ（指と自機の位置関係を保つ相対ドラッグ） | 矢印キー / WASD |
| 低速移動・集中 | — | Shift |
| ショット | 自動発射 | Z / Space（自動発射もあり） |
| ボム | 「ボム」ボタン | X / B |
| ポーズ | 「ポーズ」ボタン | Esc / P |
| 開始・リトライ | 画面のボタン | Enter / Space |

- 自機の当たり判定は中心の小さな光点だけです。敵弾をかすると「かすり」スコアが入ります。
- ボムは敵弾を消し、ボスにダメージを与え、短時間無敵になります。残機 3・ボム 3 から開始します。
- ハイスコアはブラウザの `localStorage` に保存されます。
- 音はデフォルトでオフです。「音」ボタンで Web Audio API による効果音を有効にできます。

## 開発

```sh
node --test          # ロジックの単体テスト（Node.js 20 以降）
python -m http.server 8000
# http://localhost:8000/ を開く
```

ES Modules を使うため、`file://` で直接開かず、必ず HTTP サーバ経由で起動してください。外部アセット・外部通信はありません。

### 構成

```
index.html          画面・HUD・オーバーレイ
styles.css          レイアウト（letterbox / safe-area / touch-action）
src/                ゲームロジック、描画、入力、音
tests/              node:test による単体テスト
.github/workflows/  GitHub Pages へのデプロイ
```

論理解像度は 360×640 で、端末に合わせてアスペクト比を保って拡大縮小します。更新は 1/60 秒の固定タイムステップ、敵弾はプール管理で上限 600 発です。

## デプロイ

`main` ブランチへの push で GitHub Actions がテストを実行し、`index.html` / `styles.css` / `src/` だけを `site/` に集めて Pages に公開します。リポジトリ設定の Pages は **GitHub Actions** をソースにしてください。

## 参考にした設計

既存の HTML5 Canvas 弾幕実装（[andyp123/canvas_danmaku](https://github.com/andyp123/canvas_danmaku)、[takahirox/toho-like-js](https://github.com/takahirox/toho-like-js)、[selenebun/bullethell](https://github.com/selenebun/bullethell)）を調査し、Canvas 2D + `requestAnimationFrame` + 弾プールという構成を参考にしました。いずれも更新が止まっているかスマホ操作・ライセンスが不明なため、コードのコピーは行っていません。スマホ向けの相対ドラッグ、固定タイムステップ、パターン設計は本リポジトリで独自に実装しています。
