# @kiritan/runtime

> The minimal runtime i18n half of [kiritan](https://www.npmjs.com/package/kiritan) — `t(key, params)`, with no build-time dependencies (no remark, no CLI). Safe to use on its own, in any project, without pulling in the rest of kiritan.

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fruntime)](https://www.npmjs.com/package/@kiritan/runtime)

## Install

```sh
npm install @kiritan/runtime
```

## Usage

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

`t()`'s key argument is typed from whatever object you pass to `createT` — a typo is a compile error, no code generation needed. See [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 9章 for the full picture, including the `colocated` / `split` / `centralized` / `embedded` resource placement strategies and `%{name}` interpolation.

## Requirements

- Node.js >= 22

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
