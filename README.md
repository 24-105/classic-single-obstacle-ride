# Classic Single Obstacle Ride

ダークグレーのクラシック単気筒バイクを題材にした、スマホ向け障害物回避型の3Dライドゲームです。画像や第三者モデルは同梱せず、Three.jsで軽量なプロシージャル3Dモデルを描画しています。

## 起動

```bash
python3 -m http.server 4173
```

ブラウザで `http://localhost:4173` を開きます。

## 公開

このアプリはビルド不要の静的サイトです。`index.html`、`src/`、`vendor/` をそのままホスティングすれば、URLを知っている人はスマホのブラウザだけで遊べます。

### GitHub Pagesで公開する

1. このフォルダをGitHubリポジトリにpushします。
2. GitHubのリポジトリ設定で `Settings > Pages` を開きます。
3. `Source` を `GitHub Actions` にします。
4. `main` ブランチへpushすると `.github/workflows/pages.yml` が自動で公開します。

公開後は `https://<ユーザー名>.github.io/<リポジトリ名>/` で遊べます。

### Netlify / Cloudflare Pagesで公開する

- Build command: 空欄
- Publish directory: `.`

サーバー処理は不要です。

## できること

- スマホ向けに軽量化したクラシック単気筒風バイクとライダー
- 画面下の大きな左右移動、ジャンプ操作で障害物を回避
- スコア、距離、速度、ライフ表示
- スコア上昇に応じて速度、出現間隔、複数レーン封鎖が激しくなる難易度カーブ
- ドラッグ、ピンチで視点調整

Three.jsは `vendor/` 配下にローカル配置しています。

## 3Dモデル生成

Blenderが入っている環境では、次のコマンドで高精細GLBを再生成できます。ただしスマホ版の通常表示では、このGLBは読み込まず、軽量なThree.jsモデルを使います。

```bash
blender --background --factory-startup --python tools/create_classic_single_model.py
```
