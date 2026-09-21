# seiseisai-archives

開発環境ではBunとBiome(VSCode拡張機能)が必要です。
これらのツールがインストールされている状態でF5キーを押して起動します。

本番環境ではCloudflare Pagesへのデプロイを想定しています。
Cloudflare Pagesの設定は次のとおりです。

- Build command: `node scripts/build-pages.mjs`
- Build output directory: `dist`

## 公開するURL

- `/`、`/map/`、`/blog/`など: 2026年版を年なしURL用に生成した静的ファイル
- `/2026/`: 2026年の保存版
- `/2025/`、`/2024/`など: 各年度の保存版

年なしURL用のファイルと`2026/`は、同じ保存版の内容をそれぞれのURLに合わせて出力しています。
閲覧時のページ生成や本番APIへの接続は行いません。画像・PDFなどの内容も共通です。
25MiBを超える高画質パンフレットは、保存版と同じGitHubの固定コミットURLを参照します。

## ディレクトリ構成

- `current/`: 年なしURL（`/`、`/map/`、`/blog/`など）へ配信する2026年版の静的出力
- `2026/`: 2026年の保存版
- `2025/`、`2024/`など: 各年度の保存版
- `scripts/build-pages.mjs`: `current/`、年度ディレクトリ、Worker設定を`dist/`へ組み立てるスクリプト
- `dist/`: Cloudflare Pagesへ渡す生成先（Git管理外）

`_routes.json`により、Workerが実行されるのは`/20*`の年度付きURLだけです。
年なしURLはPagesの静的配信を使い、年度付きURLでは既存の転送・404処理を維持します。

翌年度の公開時は年なしURL用の生成物を入れ替え、`2026/`以下の保存版を残します。
生成済みファイルを手作業で編集せず、元サイトから対象URLに合わせて再出力してください。
