import type { Root } from "mdast";

/**
 * Type contracts from docs/DESIGN.md.
 */

export interface LocalesConfig {
  default: string;
  list: string[];
}

export type NamingPreset = "dot" | "dash" | "prefix" | "folder";

export interface NamingConfig {
  /** Shorthand for a common `template` (docs/DESIGN.md chapter 3.3). */
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

/** docs/DESIGN.md chapter 7. */
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

/** docs/DESIGN.md chapter 9.1. */
export interface ResourceSourceConfig {
  glob: string;
  strategy: ResourceStrategy;
  /** Named export to read for the 'embedded' strategy. Default: "i18n". */
  exportName?: string;
  /** Custom namespace override. Not wired into aggregation yet — reserved for `kiritan typegen`. */
  namespace?: (filePath: string) => string;
}

export interface RuntimeConfig {
  sources?: ResourceSourceConfig[];
  fallbackLocale?: string;
  /**
   * Basename `kiritan typegen` writes its output under (docs/DESIGN.md chapter 9.6). Default: "kiritan.runtime".
   * Two files are written: "<typegenOutput>.mjs" (the merged runtime data) and "<typegenOutput>.d.ts" (its type declaration).
   */
  typegenOutput?: string;
}

export type CheckFailOn = "missing" | "stale" | "machine" | "i18n-key-mismatch";

export interface CheckConfig {
  /** Default: ["missing", "stale", "i18n-key-mismatch"]. */
  failOn?: CheckFailOn[];
}

export type StoreStrategy = "sidecar" | "inline" | "catalog" | string;

/** docs/DESIGN.md chapter 4. Not implemented yet — declared for config type-checking. */
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

/**
 * docs/DESIGN.md chapter 6. A renderer is one file format's parse/stringify pair over the mdast tree every pipeline stage (directive resolution, interpolation, switcher insertion) already operates on — a non-Markdown format parses into the same `Root` shape, it doesn't get a parallel pipeline.
 */
export interface Renderer {
  id: string;
  /** Extensions (lowercase, with the leading dot) this renderer handles when a source doesn't name one via `renderer`. */
  extensions?: string[];
  /** The built-in strategies (`sidecar`/`inline`/`catalog`) this format can support. A custom `plugins.stores` strategy name isn't checked against this. */
  strategies: StoreStrategy[];
  /** Whether `:::kiritan{...}` directives and the switcher apply to this format. Default: true. */
  supportsDirectives?: boolean;
  parse(sourceText: string): Root;
  stringify(tree: Root): string;
  /**
   * Wraps text as a comment that's invisible in the rendered output, used for the `kiritan:hash`/`kiritan:untranslated` markers. A format with no such syntax leaves this out, and gets neither marker (so no staleness detection either).
   */
  comment?(text: string): string;
}

export interface SourceConfig {
  glob: string;
  strategy: StoreStrategy;
  /** A renderer id, from `plugins.renderers` or the built-ins. Default: chosen by the file's extension, falling back to `markdown`. */
  renderer?: string;
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

/** docs/DESIGN.md chapter 6.1. */
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

/** Formatting of the Markdown that `kiritan build` writes. */
export interface MarkdownConfig {
  /**
   * How many trailing spaces to put on the blank continuation lines of GitHub-style alerts (`> [!NOTE]`): `3` writes `>` followed by three spaces instead of a bare `>`. Default: 0 (a bare `>`, which is what the serializer produces and what GitHub itself renders identically).
   */
  alertBlankLineSpaces?: number;
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
  markdown?: MarkdownConfig;
  plugins?: PluginsConfig;
}

/** A `KiritanConfig` as authored: everything except `locales`/`sources` may be omitted. */
export type KiritanUserConfig = Partial<
  Omit<KiritanConfig, "locales" | "sources">
> &
  Pick<KiritanConfig, "locales" | "sources">;
