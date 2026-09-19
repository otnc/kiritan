/**
 * Every string the CLI itself owns and prints directly (command/option descriptions, and the plain-text success/no-op lines each command logs) — as opposed to strings a pipeline function (`packages/kiritan/src/pipeline/*.ts`) generates itself, like a `CheckIssue.detail`, which stay in English regardless of `--lang`, the same way a library's thrown `Error.message` would. This file is itself a `colocated`-strategy runtime resource (see the root `.kiritanconfig`), so `kiritan check`/`kiritan typegen` cover it against the same i18n-key-mismatch rules any other project's own resources get (docs/DESIGN.md chapter 9.7).
 */
export default {
  description: {
    en: "In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents",
    ja: "通常の範囲に加え、マークダウンやその他平文ドキュメントのための国際化(i18n)ユーティリティ",
  },

  "option.lang": {
    en: "CLI display language",
    ja: "CLIの表示言語",
  },
  "option.mode": {
    en: "Config mode layer to apply (<mode>.kiritanconfig)",
    ja: "適用する設定モードレイヤー(<mode>.kiritanconfig)",
  },
  "option.config": {
    en: "Extra config file layered on top of the cascade",
    ja: "カスケードに重ねる追加の設定ファイル",
  },
  "option.locale": {
    en: "Restrict to this locale instead of every locale in locales.list",
    ja: "locales.list 全体ではなくこのロケールに絞る",
  },
  "option.force": {
    en: "Overwrite files that already exist",
    ja: "既存のファイルを上書きする",
  },
  "option.json": {
    en: "Print machine-readable JSON instead (for editor tooling) — includes interpolationVariableNames and delimiters alongside the usual issues/failed",
    ja: "人間向けではなく機械可読なJSONを出力する(エディタツール向け) — 通常の issues/failed に加え interpolationVariableNames と delimiters も含む",
  },

  "command.init.describe": {
    en: "Scaffold .kiritanconfig, base/README.base.md, and a .gitignore entry for local.kiritanconfig",
    ja: ".kiritanconfig・base/README.base.md・local.kiritanconfig の .gitignore への追記を生成する",
  },
  "command.build.describe": {
    en: "Build localized documents from every configured source",
    ja: "設定済みの全ソースからローカライズされたドキュメントをビルドする",
  },
  "command.check.describe": {
    en: "Check for missing/stale/machine-translated content (CI-friendly)",
    ja: "missing/stale/機械翻訳のコンテンツを確認する(CI向け)",
  },
  "command.verify.describe": {
    en: "Check that generated documents match what build would write (CI-friendly, writes nothing)",
    ja: "生成済みドキュメントがbuildの出力と一致するか確認する(CI向け、何も書き込まない)",
  },
  "command.translate.describe": {
    en: "Fill in missing/stale translations via translate.middlewares",
    ja: "translate.middlewares でmissing/staleな訳文を埋める",
  },
  "command.extract.describe": {
    en: "Scaffold catalog files with any new ids from the base file",
    ja: "baseファイルの新規idでcatalogファイルをスキャフォールドする",
  },
  "command.typegen.describe": {
    en: "Generate types for an aggregated runtime.sources t() call",
    ja: "runtime.sources を集約した t() 呼び出し向けの型を生成する",
  },

  "output.wrote": {
    en: "wrote %{path}",
    ja: "%{path} を書き込みました",
  },
  "output.init.created": {
    en: "created %{path}",
    ja: "%{path} を作成しました",
  },
  "output.init.skipped": {
    en: "skipped %{path} (already exists)",
    ja: "%{path} をスキップしました(既に存在します)",
  },
  "output.check.issue": {
    en: "[%{kind}] %{source} (%{locale}): %{detail}",
    ja: "[%{kind}] %{source} (%{locale}): %{detail}",
  },
  "output.check.noIssues": {
    en: "kiritan check: no issues found",
    ja: "kiritan check: 問題は見つかりませんでした",
  },
  "output.verify.entry": {
    en: "[%{status}] %{path} (%{locale}, from %{source}): expected %{expected}, found %{actual}",
    ja: "[%{status}] %{path} (%{locale}、元: %{source}): 期待 %{expected}、実際 %{actual}",
  },
  "output.verify.allOk": {
    en: "kiritan verify: %{count} generated document(s) up to date",
    ja: "kiritan verify: 生成済みの %{count} 件のドキュメントは最新です",
  },
  "output.translate.entry": {
    en: "[%{locale}] %{source}: %{detail}",
    ja: "[%{locale}] %{source}: %{detail}",
  },
  "output.translate.autoOff": {
    en: "kiritan translate: translate.middlewares are configured for %{count} source(s), but translate.auto is not true, so they did not run (set translate: { auto: true } to enable them)",
    ja: "kiritan translate: %{count} 件のソースに translate.middlewares が設定されていますが、translate.auto が true ではないため実行されませんでした(有効にするには translate: { auto: true } を設定してください)",
  },
  "output.translate.none": {
    en: "kiritan translate: nothing to do",
    ja: "kiritan translate: 何もすることがありません",
  },
  "output.extract.entry": {
    en: "[%{locale}] %{source}: %{detail}",
    ja: "[%{locale}] %{source}: %{detail}",
  },
  "output.extract.none": {
    en: "kiritan extract: nothing to do",
    ja: "kiritan extract: 何もすることがありません",
  },
  "output.typegen.wrote": {
    en: "wrote %{dataPath} and %{typesPath} (%{keyCount} keys)",
    ja: "%{dataPath} と %{typesPath} を書き込みました(%{keyCount} 件のキー)",
  },
};
