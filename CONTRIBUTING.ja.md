# Contributing

[English](CONTRIBUTING.md) | **日本語**

kiritan の改善に興味を持っていただきありがとうございます。
このガイドでは、開発環境のセットアップ方法とプロジェクトの構成を説明します。
分かりにくい点があれば、Issue で質問していただいて構いません。

## セットアップ

Node.js >= 22 が必要です。
その後、依存関係をインストールします。

```sh
npm install
```

パッケージマネージャー(`npm`)が生成するロックファイルはコミットしてください。

## プロジェクト構成

これは npm workspaces によるモノレポです([docs/DESIGN.md](./docs/DESIGN.md) 2.1章を参照)。

| パッケージ | パス | 内容 |
| --- | --- | --- |
| `kiritan` | `packages/kiritan` | CLI とビルドパイプライン(設定・翻訳ストア・レンダラー・翻訳ミドルウェア) |
| `@kiritan/runtime` | `packages/runtime` | ビルド時依存を持たない、最小限の `t(key, params)` ランタイム |

上記すべての設計と理由は [docs/DESIGN.md](./docs/DESIGN.md) にまとまっています。構造を変更する前に読んでください。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run build` | tsdown で ESM/CJS と型定義をビルド |
| `npm run test` | vitest でテストを一度だけ実行(`npm run test:watch` で監視実行) |
| `npm run test:coverage` | カバレッジ付きでテストを実行 |
| `npm run typecheck` | `tsc --noEmit` で型チェック |
| `npm run format` | コードをフォーマットして修正を書き込む(Prettier) |
| `npm run format:check` | 書き込まずにフォーマットをチェック(Prettier) |
| `npm run lint` | 修正を書き込まずにコードをリント(ESLint) |
| `npm run lint:fix` | 修正を書き込みながらコードをリント(ESLint) |
| `npm run check` | フォーマットとリントの修正を書き込む(Prettier + ESLint) |
| `npm run ci` | 書き込みなしで同じチェックを実行(CI が実行するもの) |

`build` と `typecheck` は `packages/*` 配下の全パッケージに展開されます。`test` / `format` / `lint` はルートから既にワークスペース全体に対して実行されます。

プルリクエストを開く前に、一式が通ることを確認してください。

```sh
npm run ci && npm run typecheck && npm run test && npm run build
```

変更をリリースに含めたい場合は、PR を開く前に changeset も追加してください(詳細は後述)。

## 規約

- **フォーマットは Prettier**(既定設定のまま上書きなし)、**リントは ESLint** を使用します(`eslint.config.js` — `typescript-eslint` の推奨ルールに、Prettier のフォーマットと衝突する ESLint ルールを無効化する `eslint-config-prettier` を組み合わせています)。コミット前に `npm run check` を実行すれば両方まとめて対応できます。
- **テストはコードの隣に** `*.test.ts` として置き、vitest で実行します。
- **コメントとドキュメントは英語**で、簡潔に保ちます。
- **型のみの import には `import type` を使用**します(`verbatimModuleSyntax` が有効です)。

## プルリクエスト

各変更は焦点を絞り、新しい振る舞いにはテストを追加してください。

### changeset の追加

PR が `kiritan` や `@kiritan/runtime` の振る舞いを、利用者が知っておくべき形で変更する場合は、以下を実行してください。

```sh
npx changeset
```

影響を受けるパッケージ・バージョンの上げ方(patch/minor/major)・一行の要約を選択・記入します。生成された `.changeset/` 配下のファイルは PR に含めてコミットしてください。これがリリース時の各パッケージのバージョンと CHANGELOG エントリの元になります(docs/DESIGN.md 2.1章)。リリースを伴わない内部的な変更(ドキュメント・CI・テストのみ)ではこの手順は不要です。

## リリース(メンテナー向け)

リリースは今も手動のステップですが、バージョンはリポジトリ全体で単一ではなく、([Changesets](https://github.com/changesets/changesets) による)パッケージごとの管理になっています。
Actions タブから `release` ワークフロー(`workflow_dispatch`)を実行してください。`main` に蓄積された changeset を適用し(`changeset version`: 影響を受ける各パッケージの `package.json` と `CHANGELOG.md` を更新)、変更のあったパッケージのみを **trusted publishing**(OIDC。`NPM_TOKEN` 不要)で npm に provenance 付きで公開し、バージョンコミットとパッケージごとの `<package>@<version>` タグを push した上で、それぞれについて GitHub Release を作成します。
保留中の changeset が無い場合、このワークフローは何も行いません。

trusted publishing は npmjs.com 上でパッケージごとに一度だけ設定が必要です。
パッケージの **Settings → Publishing access → Trusted publishers → GitHub** から、このリポジトリの `release.yml` ワークフローを指定してください。

## ライセンス

コントリビュートすることで、あなたの貢献が [WTFPL License](./LICENSE) の下でライセンスされることに同意したものとみなします。
