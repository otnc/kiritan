/**
 * Type contracts from docs/DESIGN.md. Only `config/*` is implemented so far (see packages/kiritan/README.md); the other modules referenced here (stores, renderers, translate middlewares, runtime resource sources) are future work and only exist here as the interfaces they'll implement.
 */

export interface LocalesConfig {
  default: string;
  list: string[];
}

export type NamingPreset = "dot" | "dash" | "prefix" | "folder";

export interface NamingConfig {
  /** Shorthand for a common `template` (docs/DESIGN.md 3.3章). */
  preset?: NamingPreset;
  /** Default: "{dir}/{base}.{locale}.{ext}" (overrides `preset` when set). */
  template?: string;
  /** Template used for the default locale only, if it should differ. */
  defaultTemplate?: string;
  /** Default: true. Only applies when `defaultTemplate` is unset. */
  omitDefaultLocaleSuffix?: boolean;
  /** Default: ".base" — how a base file is recognized (e.g. README.base.md). */
  baseSuffix?: string;
  /** Explicit per-locale output path overrides, e.g. `{ ja: "i18n/ja/README.md" }`. */
  outputs?: Record<string, string>;
}

export type OnMissingVariable = "error" | "keep" | "empty";

export interface InterpolationConfig {
  /** Default: ["%{", "}"]. */
  delimiters?: [string, string];
  variables?:
    | Record<string, string | Record<string, string>>
    | ((ctx: BuildContext) => Record<string, string>);
  /** Default: "error". */
  onMissing?: OnMissingVariable;
  /** Default: true. */
  skipCodeBlocks?: boolean;
}

export interface BuildContext {
  locale: string;
  defaultLocale: string;
}

/** docs/DESIGN.md 7章. Not implemented yet — declared for config type-checking. */
export interface TranslateContext {
  text: string;
  from: string;
  to: string;
  source: SourceConfig;
  segmentId?: string;
}

export type TranslateMiddleware = (
  ctx: TranslateContext,
  next: () => Promise<string | null>
) => Promise<string | null>;

export interface BatchTranslateMiddleware {
  batch: true;
  handle: (
    ctxs: TranslateContext[],
    next: () => Promise<(string | null)[]>
  ) => Promise<(string | null)[]>;
}

export interface TranslateConfig {
  /** Default: []. */
  middlewares?: Array<TranslateMiddleware | BatchTranslateMiddleware>;
  /** Default: false. Auto-translation never runs unless this is true. */
  auto?: boolean;
}

export type ResourceStrategy =
  "colocated" | "split" | "centralized" | "embedded" | string;

/** docs/DESIGN.md 9.1章. Not implemented yet — declared for config type-checking. */
export interface ResourceSourceConfig {
  glob: string;
  strategy: ResourceStrategy;
  /** Named export to read for the 'embedded' strategy. Default: "i18n". */
  exportName?: string;
  namespace?: (filePath: string) => string;
}

export interface RuntimeConfig {
  sources?: ResourceSourceConfig[];
  fallbackLocale?: string;
}

export type CheckFailOn = "missing" | "stale" | "machine" | "i18n-key-mismatch";

export interface CheckConfig {
  /** Default: ["missing", "stale", "i18n-key-mismatch"]. */
  failOn?: CheckFailOn[];
}

export type StoreStrategy = "sidecar" | "inline" | "catalog" | string;

/** docs/DESIGN.md 4章. Not implemented yet — declared for config type-checking. */
export interface TranslatedContentFullText {
  kind: "full-text";
  text: string;
  machine?: boolean;
}

export interface TranslatedContentSegments {
  kind: "segments";
  segments: Record<string, { text: string; machine?: boolean }>;
}

export type TranslatedContent =
  TranslatedContentFullText | TranslatedContentSegments;

export type StoreStatus = "missing" | "partial" | "complete" | "stale";

export interface StoreContext {
  source: SourceConfig;
  filePath: string;
}

export interface TranslationStore {
  id: string;
  read(ctx: StoreContext, locale: string): Promise<TranslatedContent | null>;
  write?(
    ctx: StoreContext,
    locale: string,
    content: TranslatedContent
  ): Promise<void>;
  status(ctx: StoreContext, locale: string): Promise<StoreStatus>;
}

/** docs/DESIGN.md 6章. Not implemented yet — declared for config type-checking. */
export interface ParsedDocument {
  raw: string;
}

export interface Renderer {
  id: string;
  strategies: StoreStrategy[];
  parse(sourceText: string): ParsedDocument;
  reassemble(
    doc: ParsedDocument,
    translated: Record<string, string> | string
  ): string;
}

export interface SourceConfig {
  glob: string;
  strategy: StoreStrategy;
  /** Overrides the top-level `naming` entirely for this source. */
  naming?: NamingConfig;
  /** Overrides the top-level `translate` entirely for this source. */
  translate?: TranslateConfig;
  /** Overrides the top-level `switcher` entirely for this source. */
  switcher?: SwitcherConfig;
}

export interface PluginsConfig {
  stores?: Record<string, TranslationStore>;
  renderers?: Record<string, Renderer>;
}

/** docs/DESIGN.md 6.1章. */
export interface SwitcherLink {
  locale: string;
  label: string;
  href: string;
  isCurrent: boolean;
}

export interface SwitcherRenderContext {
  locale: string;
  links: SwitcherLink[];
}

export interface SwitcherConfig {
  /** Default: true. Only controls automatic insertion when no explicit marker exists. */
  enabled?: boolean;
  /** Default: "after-heading". */
  position?: "top" | "after-heading" | "none";
  /** Default: " | ". */
  separator?: string;
  /**
   * Per-locale label overrides. Unset locales fall back to `Intl.DisplayNames`'s autonym (or the locale code itself if that fails). `false` excludes the locale from the switcher entirely.
   */
  labels?: Record<string, string | false>;
  /** Default: false. */
  currentLocaleLink?: boolean;
  /** Fully overrides how the whole line is rendered. */
  render?: (ctx: SwitcherRenderContext) => string;
}

export interface KiritanConfig {
  locales: LocalesConfig;
  sources: SourceConfig[];
  naming?: NamingConfig;
  interpolation?: InterpolationConfig;
  translate?: TranslateConfig;
  runtime?: RuntimeConfig;
  check?: CheckConfig;
  switcher?: SwitcherConfig;
  plugins?: PluginsConfig;
}

/** A `KiritanConfig` as authored: everything except `locales`/`sources` may be omitted. */
export type KiritanUserConfig = Partial<
  Omit<KiritanConfig, "locales" | "sources">
> &
  Pick<KiritanConfig, "locales" | "sources">;
