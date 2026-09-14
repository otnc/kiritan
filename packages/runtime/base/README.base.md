<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/runtime

</div>

:::kiritan{locale=en}
> The minimal runtime i18n half of [Kiritan](https://www.npmjs.com/package/kiritan) — `t(key, params)`, with no build-time dependencies (no remark, no CLI). Safe to use on its own, in any project, without pulling in the rest of Kiritan.
:::
:::kiritan{locale=ja}
> [Kiritan](https://www.npmjs.com/package/kiritan) のうち、ランタイム側の最小限の半分 — `t(key, params)` を、ビルド時依存(remarkやCLI)無しで提供する。Kiritan本体を引き込まずに、単体でどんなプロジェクトでも安全に使える。
:::

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fruntime)](https://www.npmjs.com/package/@kiritan/runtime)

:::kiritan{locale=en}
## Install
:::
:::kiritan{locale=ja}
## インストール
:::

```sh
npm install @kiritan/runtime
```

:::kiritan{locale=en}
## Usage
:::
:::kiritan{locale=ja}
## 使い方
:::

```ts
// src/components/Button/Button.i18n.ts
export default {
  submit: { en: "Submit", ja: "送信" },
  cancel: { en: "Cancel", ja: "キャンセル" },
};
```

```ts
import messages from "./Button.i18n";
import { createT } from "@kiritan/runtime";

const { t, setLocale } = createT(messages, { locale: "en", fallbackLocale: "en" });

t("submit"); // "Submit"
setLocale("ja");
t("submit"); // "送信"
```

:::kiritan{locale=en}
`t()`'s key argument is typed from whatever object you pass to `createT` — a typo is a compile error, no code generation needed. See [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 9 for the full picture, including the `colocated` / `split` / `centralized` / `embedded` resource placement strategies and `%{name}` interpolation.
:::
:::kiritan{locale=ja}
`t()` のキー引数は `createT` に渡したオブジェクトから型付けされる — typo はコンパイルエラーになり、コード生成は不要。`colocated` / `split` / `centralized` / `embedded` のリソース配置戦略や `%{name}` 補間を含む全体像は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 9章を参照。
:::

:::kiritan{locale=en}
## Requirements

- Node.js >= 22

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## 動作環境

- Node.js >= 22

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::
