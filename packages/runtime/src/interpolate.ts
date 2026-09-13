export type InterpolationParams = Record<string, string | number>;

export type OnMissingInterpolation = "error" | "keep" | "empty";

export interface InterpolateOptions {
  /** Opening/closing delimiter pair. Defaults to kiritan's `%{name}` syntax. */
  delimiters?: [string, string];
  /** What to do when a placeholder has no matching param. Defaults to "keep". */
  onMissing?: OnMissingInterpolation;
}

const DEFAULT_DELIMITERS: [string, string] = ["%{", "}"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Expands `%{name}`-style placeholders in `template` using `params`.
 * `\%{literal}` escapes a placeholder — the backslash is stripped, the placeholder is left untouched.
 * Shared by both `t()` here and kiritan's document-side interpolation.
 */
export function interpolate(
  template: string,
  params: InterpolationParams = {},
  options: InterpolateOptions = {}
): string {
  const [open, close] = options.delimiters ?? DEFAULT_DELIMITERS;
  const onMissing = options.onMissing ?? "keep";
  const openPattern = escapeRegExp(open);
  const closePattern = escapeRegExp(close);
  const pattern = new RegExp(
    `\\\\(${openPattern}[^]*?${closePattern})|${openPattern}([^]*?)${closePattern}`,
    "g"
  );

  return template.replace(
    pattern,
    (match, escaped: string | undefined, name: string | undefined) => {
      if (escaped !== undefined) return escaped;
      const key = (name ?? "").trim();
      if (!Object.hasOwn(params, key)) {
        switch (onMissing) {
          case "error":
            throw new Error(`kiritan: missing interpolation variable "${key}"`);
          case "empty":
            return "";
          case "keep":
          default:
            return match;
        }
      }
      return String(params[key]);
    }
  );
}
