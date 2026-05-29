# Light Bicycle Dash

スマホのブラウザだけで遊べる、軽量な3D自転車ランゲームです。Three.jsで自転車、ライダー、道路、障害物、アイテムをプロシージャル描画するため、画像素材や外部3Dモデルは不要です。

## 起動

```bash
python3 -m http.server 4173
```

ブラウザで `http://localhost:4173` を開きます。

## 公開

このアプリはビルド不要の静的サイトです。`index.html`、`src/`、`vendor/`、`.github/`、`.nojekyll` をそのままホスティングすれば、URLを知っている人はスマホのブラウザで遊べます。

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

- 軽量な自転車とライダーの3D表示
- スマホ向けの大きな左右移動、ジャンプ操作
- スコア、コンボ、距離、速度、ライフ、タブを閉じるまで残るベストスコア表示
- コイン、シールド、ライフ回復アイテム
- ニアミス、ジャンプ回避、シールド防御でコンボが伸びるスコアシステム
- スコア上昇に応じて速度、出現間隔、複数レーン封鎖が激しくなる難易度カーブ
- 画面操作に影響されにくい固定寄りのプレイカメラ

Three.jsは `vendor/` 配下にローカル配置しています。
