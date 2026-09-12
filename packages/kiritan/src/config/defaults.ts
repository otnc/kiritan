import type {
  CheckConfig,
  InterpolationConfig,
  NamingConfig,
  SwitcherConfig,
  TranslateConfig,
} from "./types.js";

export const DEFAULT_NAMING: Required<
  Pick<NamingConfig, "template" | "omitDefaultLocaleSuffix" | "baseSuffix">
> = {
  template: "{dir}/{base}.{locale}.{ext}",
  omitDefaultLocaleSuffix: true,
  baseSuffix: ".base",
};

export const NAMING_PRESETS: Record<
  NonNullable<NamingConfig["preset"]>,
  string
> = {
  dot: "{dir}/{base}.{locale}.{ext}",
  dash: "{dir}/{base}-{locale}.{ext}",
  prefix: "{dir}/{locale}.{base}.{ext}",
  folder: "{dir}/{locale}/{base}.{ext}",
};

export const DEFAULT_INTERPOLATION: Required<
  Pick<InterpolationConfig, "delimiters" | "onMissing" | "skipCodeBlocks">
> = {
  delimiters: ["%{", "}"],
  onMissing: "error",
  skipCodeBlocks: true,
};

export const DEFAULT_TRANSLATE: Required<
  Pick<TranslateConfig, "middlewares" | "auto">
> = {
  middlewares: [],
  auto: false,
};

export const DEFAULT_CHECK: Required<Pick<CheckConfig, "failOn">> = {
  failOn: ["missing", "stale", "i18n-key-mismatch"],
};

export const DEFAULT_SWITCHER: Required<
  Pick<
    SwitcherConfig,
    "enabled" | "position" | "separator" | "currentLocaleLink"
  >
> = {
  enabled: true,
  position: "after-heading",
  separator: " | ",
  currentLocaleLink: false,
};
