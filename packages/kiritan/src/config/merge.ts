const MERGE_ARRAY = Symbol.for("kiritan.mergeArray");

interface MergeArrayMarker<T> {
  [MERGE_ARRAY]: true;
  values: T[];
}

/**
 * Wraps an array so that, when used as an override in `deepMerge`, it is concatenated onto the base array instead of replacing it (the default).
 */
export function mergeArray<T>(values: T[]): MergeArrayMarker<T> {
  return { [MERGE_ARRAY]: true, values };
}

function isMergeArrayMarker(
  value: unknown
): value is MergeArrayMarker<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[MERGE_ARRAY] === true
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isMergeArrayMarker(value)
  );
}

/**
 * Deep-merges `override` onto `base`. Plain objects are merged key by key; arrays are replaced wholesale unless `override` is wrapped in `mergeArray(...)`, in which case it is concatenated onto the base array.
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base;

  if (isMergeArrayMarker(override)) {
    const baseArray = Array.isArray(base) ? base : [];
    return [...baseArray, ...override.values] as unknown as T;
  }

  if (Array.isArray(override)) {
    return override as unknown as T;
  }

  if (isPlainObject(override) && isPlainObject(base)) {
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      result[key] = deepMerge((base as Record<string, unknown>)[key], value);
    }
    return result as T;
  }

  return override as T;
}

/** Merges any number of partial config layers, left to right (later layers win). */
export function mergeConfigs<T>(
  ...layers: Array<Partial<T> | undefined>
): Partial<T> {
  let result: Partial<T> = {};
  for (const layer of layers) {
    if (layer === undefined) continue;
    result = deepMerge(result, layer) as Partial<T>;
  }
  return result;
}
