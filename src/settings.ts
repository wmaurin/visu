import { GRID_SIZES, type GridSize } from "./core/geometry";
import { Observable } from "./core/observable";

/** Editor preferences. Not part of the diagram, never exported with it. */
export interface Settings {
  /** Snap step and dot spacing in px. */
  readonly gridSize: GridSize;
  /** Visibility of the grid dots, 0 (hidden) to 100 (black). */
  readonly gridSaturation: number;
  /** Keeps the diagram in this browser, so it survives a reload. */
  readonly autosave: boolean;
}

const DEFAULTS: Settings = {
  gridSize: 16,
  // Close to the former light grey dots.
  gridSaturation: 40,
  autosave: true,
};

/** Validation per setting. The single source of what a valid value is. */
const VALID: { readonly [K in keyof Settings]: (value: unknown) => boolean } = {
  gridSize: (v) => GRID_SIZES.includes(v as GridSize),
  gridSaturation: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100,
  autosave: (v) => typeof v === "boolean",
};

const STORAGE_KEY = "visu.settings";
/** Version of the settings file format. Bump on incompatible changes. */
const FILE_VERSION = 1;
/** Settings files are tiny. Anything larger is not one. */
const MAX_FILE_BYTES = 64 * 1024;

export const SETTINGS_FILE = {
  name: "settings.json",
  type: "application/json",
  accept: ".json,application/json",
  maxBytes: MAX_FILE_BYTES,
};

/**
 * Takes the known keys with valid values from untrusted input and the rest
 * from `base`. Unknown keys are ignored, invalid values are reported.
 */
function merge(base: Settings, input: unknown): { settings: Settings; rejected: string[] } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("The file does not contain a settings object.");
  }
  const record = input as Record<string, unknown>;
  const next: Record<string, unknown> = { ...base };
  const rejected: string[] = [];

  for (const key of Object.keys(VALID) as Array<keyof Settings>) {
    if (!Object.hasOwn(record, key)) continue;
    if (VALID[key](record[key])) next[key] = record[key];
    else rejected.push(key);
  }
  return { settings: next as unknown as Settings, rejected };
}

/**
 * Settings store, persisted in the browser. Storage may be missing or
 * blocked (private mode, cleared data), so reads and writes never throw
 * and the app falls back to the defaults.
 */
export function createSettings(): Observable<Settings> {
  const store = new Observable<Settings>(load());
  store.subscribe(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.get()));
    } catch {
      // Not persisted this time, the setting still applies.
    }
  });
  return store;
}

function load(): Settings {
  try {
    return merge(DEFAULTS, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).settings;
  } catch {
    return DEFAULTS;
  }
}

/** The settings as a versioned, readable JSON file. */
export function exportSettings(store: Observable<Settings>): string {
  return `${JSON.stringify({ version: FILE_VERSION, ...store.get() }, null, 2)}\n`;
}

/**
 * Applies a settings file. Keys missing from the file keep their current
 * value. Throws with a readable message when the file cannot be used.
 * Returns the keys whose values were invalid and therefore skipped.
 */
export function importSettings(store: Observable<Settings>, text: string): string[] {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const version = (input as { version?: unknown } | null)?.version;
  if (version !== undefined && version !== FILE_VERSION) {
    throw new Error(`Settings file version ${String(version)} is not supported.`);
  }
  const { settings, rejected } = merge(store.get(), input);
  store.set(settings);
  return rejected;
}

/** Read, write and watch one setting, e.g. for a control in the settings menu. */
export function bind<K extends keyof Settings>(store: Observable<Settings>, key: K) {
  return {
    read: () => store.get()[key],
    write: (value: Settings[K]) => store.set({ ...store.get(), [key]: value }),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}
