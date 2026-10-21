# Strikefront

Strikefrontは、Counter-Strike 2に着想を得つつ、名称・アセット・UIをオリジナルに設計した日本語対応の3DタクティカルFPSプロトタイプです。短いラウンドで市街地マップへ侵入し、サイトA/Bへ爆弾を設置して、防衛ボットを退けながら爆発まで守ります。

## 操作

- `WASD`: 移動
- マウス: 視点操作（作戦開始後にポインターロック）
- 左クリック: 射撃
- `R`: リロード
- `E` 長押し: 爆弾の設置 / 解除
- `Shift`: スプリント
- `Esc`: 一時停止

## 開発

```bash
pnpm install
PORT=3000 HOST=0.0.0.0 pnpm dev
```

ビルド・検証:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

ゲームはThree.js + TypeScript + Viteで構成され、低ポリの都市マップ、ラウンドタイマー、敵ボット、射撃、爆弾サイト、ミニマップ、HUDを含みます。決済やオンライン対戦はこのローカルプロトタイプでは使用していません。

## 構成

- `src/game/game.ts`: 一人称カメラ、都市マップ、敵ボット、射撃、爆弾サイト、ラウンドルール
- `src/ui/ui.ts` / `src/styles/main.css`: 日本語のタイトル、HUD、ポーズ、結果画面
- `src/engine/input.ts`: キーボード、マウス、ゲームパッド入力
- `assets.lock.json`: Manus管理アセットの復元情報
- `game-sharing.json`: faviconと共有用メタデータ

フォントはManusCC0（CC0 1.0）、3Dレンダリングはthree.js（MIT）を使用しています。生成された爆弾モデルは、ゲーム用の高速3D生成設定で作成したオリジナル素材です。
