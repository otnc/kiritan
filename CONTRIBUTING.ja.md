# Contributing

[English](CONTRIBUTING.md) | **日本語**

Kiritan の改善に興味を持っていただきありがとうございます。
このガイドでは、開発環境のセットアップ方法とプロジェクトの構成を説明します。
分かりにくい点があれば、Issue で質問していただいて構いません。

## セットアップ

Node.js >= 22.7 が必要です。
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
| `@kiritan/deepl` | `packages/deepl` | `translate.middlewares` 用のDeepL翻訳ミドルウェア |
| `@kiritan/google-translate` | `packages/google-translate` | `translate.middlewares` 用のGoogle Cloud Translationミドルウェア |
| `otoneko1102.kiritan` | `extensions/vscode` | VS Code拡張機能(`:::kiritan{...}` ブロックのシンタックスハイライト)。npm workspaceのメンバーではない — 詳細は後述の「リリース」を参照。 |
| — | `extensions/vim` | Vim/Neovimプラグイン(同じディレクティブハイライトに加え、`*.kiritanconfig` のfiletype判定)。どこにも公開せず、プラグインマネージャーの`rtp`オプションでこのリポジトリから直接インストールする。 |

上記すべての設計と理由は [docs/DESIGN.md](./docs/DESIGN.md) にまとまっています。構造を変更する前に読んでください。

## 生成ドキュメント

ルートの README/CONTRIBUTING/DESIGN、および各パッケージの README は、Kiritan自身によって `base/*.base.md` ソース(例: `base/README.base.md`、`packages/kiritan/base/README.base.md`)から生成されています。中で使われている `:::kiritan{locale=...}` ブロック記法は [docs/DESIGN.md](./docs/DESIGN.md) 4.2章を参照してください。`base/*.base.md` を編集したら、出力を再生成して変更と一緒にコミットしてください。

```sh
npm run docs:build
```

`npm run docs:check` は、何も書き込まずに未翻訳・stale(前回生成後にソースが変更された)なソースを報告します。コミット前に実行しておくと安心です。生成は後述の `release` ワークフローの一部としても自動的に行われるため、`base/*.base.md` の変更がバージョンアップと同時にリリースされる場合は事前の手動再生成が必須というわけではありませんが、自分で実行しておくとPRの差分が正確でレビューしやすくなります。

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
| `npm run docs:build` | `base/*.base.md` から生成される全ドキュメントを再生成する(上記「生成ドキュメント」参照) |
| `npm run docs:check` | 何も書き込まずに、未翻訳・staleな生成ドキュメントを報告する |
| `npm run docs:verify` | 生成済みの全ドキュメントが`docs:build`の出力と(ハッシュで)一致するか、何も書き込まずに確認する |

`build` と `typecheck` は `packages/*` 配下の全パッケージに展開されます。`test` / `format` / `lint` はルートから既にワークスペース全体に対して実行されます。

プルリクエストを開く前に、一式が通ることを確認してください。

```sh
npm run ci && npm run typecheck && npm run test && npm run build
```

## 規約

- **フォーマットは Prettier**(既定設定のまま上書きなし)、**リントは ESLint** を使用します(`eslint.config.js` — `typescript-eslint` の推奨ルールに、Prettier のフォーマットと衝突する ESLint ルールを無効化する `eslint-config-prettier` を組み合わせています)。コミット前に `npm run check` を実行すれば両方まとめて対応できます。
- **テストはコードの隣に** `*.test.ts` として置き、vitest で実行します。
- **コメントとドキュメントは英語**で、簡潔に保ちます。
- **型のみの import には `import type` を使用**します(`verbatimModuleSyntax` が有効です)。

## プルリクエスト

各変更は焦点を絞り、新しい振る舞いにはテストを追加してください。changesetのような追加ファイルは不要です — バージョニングはPRごとではなく、リリース実行時(後述)にまとめて行います。

## リリース(メンテナー向け)

npmパッケージ(`kiritan`・`@kiritan/runtime`・`@kiritan/deepl`・`@kiritan/google-translate`)はそれぞれ専用の `workflow_dispatch` ワークフロー(`release.yml` / `release-runtime.yml` / `release-deepl.yml` / `release-google-translate.yml`)を持っており、1つをリリースしても他のパッケージに誤って影響することはありません。いずれも実際の処理を行う共通の再利用可能ワークフロー(`_release-package.yml`。単体では実行不可)への薄いラッパーです。

Actions タブから対象パッケージのワークフロー(例: `release-runtime`)を、2つの入力で実行してください:

- `version`: semverのbump種別(`patch` / `minor` / `major` / `prerelease`)、または明示的なバージョン(例: `0.2.0`)。そのまま `npm version` に渡されます。
- `dist_tag`: 公開先のnpm dist-tag。空なら自動判定(プレリリースならそのタグ、例えば `0.2.0-beta.0` なら `beta`。安定版なら `latest`)。

ワークフローは対象パッケージの `package.json` を更新し(changelogファイルは無く、代わりにマージ済みPRから生成されるGitHubの自動リリースノートを使用)、`base/*.base.md` から生成される全ドキュメントを再生成し(`kiritan build`。バージョンアップと同じコミットにまとめられます)、**trusted publishing**(OIDC。`NPM_TOKEN` 不要)で npm に provenance 付きで公開し、バージョンコミットと `<package>@<version>` タグを push した上で、GitHub Release を作成します。

trusted publishing は npmjs.com 上でパッケージごとに一度だけ設定が必要です。
パッケージの **Settings → Publishing access → Trusted publishers → GitHub** から、そのパッケージ自身のワークフローファイル(例: `kiritan` なら `release.yml`、`@kiritan/deepl` なら `release-deepl.yml`)を指定してください。

`kiritan` は `@kiritan/runtime` に依存している(現在 `^0.1.0`)ため、runtimeのminor/majorバージョンを上げても Kiritan 側の依存範囲は自動更新されません。これは意図的な仕様で、runtime単体のリリースが Kiritan の `package.json` に触れることが無いようにするためです。該当する場合は別途手動でPRを出してください。

VS Code拡張機能(`extensions/vscode`)はnpmに公開しないため、代わりに専用の `release-vscode.yml` を持っています。入力は `version` のみで、`vsce` で `.vsix` をパッケージし、`kiritan-vscode@<version>` としてタグを打ってGitHub Releaseを作成し(`.vsix` を添付)、`VSCE_PAT` リポジトリシークレットが設定されている場合のみVS Code Marketplaceへの公開も行います(Marketplace公開はまだ未設定のため、現状はダウンロード可能な `.vsix` を生成するだけです)。

`extensions/vscode` は `packages/` の外にあるため、ルートの `"workspaces": ["packages/*"]` には拾われません(`package.json` の `"name"` が `"kiritan"` のため、同名のCLIパッケージと衝突してしまいます — npm workspaceは同名パッケージを2つ持てません)。ビルド・テストに必要なツール(`@vscode/vsce`・`vscode-textmate`・`vscode-oniguruma`)はルートの `package.json` の `devDependencies` に置いており、`tsc`/`vitest`/`vsce` を実行する際にNode.jsの通常の解決方法で見つかります — このパッケージ用に別途 `npm install` を行う必要はありません。

Vim/Neovimプラグイン(`extensions/vim`)にはビルド・公開すべきものが何もありません — ユーザーはプラグインマネージャーの`rtp`オプション経由でこのリポジトリから直接インストールするため、`release-vim.yml` はテストスイートを実行した後、コミットに `kiritan-vim@<version>` というタグを打ちGitHub Releaseを作成するだけです(添付ファイルなし)。`main`を追従する代わりに特定バージョンにピン留めしたいユーザー向けです。`package.json` が無くバンプ元となる現在のバージョンを保持していないため、既存の `kiritan-vim@*` タグのうち最新のものを起点にし、使い捨ての `package.json` で `npm version` のsemverロジックを借用する形で、`release.yml` と同じく `version` 入力に `patch`/`minor`/`major`/`prerelease` キーワードと明示的なバージョン文字列の両方を受け付けます。

## ライセンス

コントリビュートすることで、あなたの貢献が [WTFPL License](./LICENSE) の下でライセンスされることに同意したものとみなします。
