/**
 * Tiny validation toolkit for untrusted input such as imported files.
 * A check returns the value typed when it is valid and throws a
 * ValidationError naming the path of the first problem otherwise.
 * Objects come out with only the declared keys, so unknown or hostile
 * keys never reach the app.
 */

export class ValidationError extends Error {}

export type Check<T> = (value: unknown, path: string) => T;

function fail(path: string, problem: string): never {
  throw new ValidationError(`${path}: ${problem}`);
}

export function num(min: number, max: number): Check<number> {
  return (v, path) => {
    if (typeof v !== "number" || !Number.isFinite(v)) fail(path, "expected a number");
    if (v < min || v > max) fail(path, `expected a number from ${min} to ${max}`);
    return v;
  };
}

export function str(maxLength: number, pattern?: RegExp): Check<string> {
  return (v, path) => {
    if (typeof v !== "string") fail(path, "expected text");
    if (v.length > maxLength) fail(path, `text longer than ${maxLength} characters`);
    if (pattern && !pattern.test(v)) fail(path, "text has an invalid format");
    return v;
  };
}

export function oneOf<const T extends string | number>(...allowed: T[]): Check<T> {
  return (v, path) => {
    if (!allowed.includes(v as T)) fail(path, `expected one of ${allowed.join(", ")}`);
    return v as T;
  };
}

export const bool: Check<boolean> = (v, path) => {
  if (typeof v !== "boolean") fail(path, "expected true or false");
  return v;
};

/** The value checked by `check`, or null. */
export function nullable<T>(check: Check<T>): Check<T | null> {
  return (v, path) => (v === null ? null : check(v, path));
}

export function arr<T>(item: Check<T>, maxItems: number): Check<T[]> {
  return (v, path) => {
    if (!Array.isArray(v)) fail(path, "expected a list");
    if (v.length > maxItems) fail(path, `more than ${maxItems} entries`);
    return v.map((entry, i) => item(entry, `${path}[${i}]`));
  };
}

export function obj<T>(shape: { readonly [K in keyof T]-?: Check<T[K]> }): Check<T> {
  return (v, path) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "expected an object");
    const record = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape) as Array<keyof T & string>) {
      if (!Object.hasOwn(record, key)) fail(`${path}.${key}`, "missing");
      out[key] = shape[key](record[key], `${path}.${key}`);
    }
    return out as T;
  };
}
