import { Observable } from "./core/observable";

/** Editor preferences. Not part of the diagram, never exported. */
export interface Settings {
  /** Visibility of the grid dots, 0 (hidden) to 100 (black). */
  readonly gridSaturation: number;
}

const DEFAULTS: Settings = {
  // Close to the former light grey dots.
  gridSaturation: 40,
};

const STORAGE_KEY = "visu.settings";

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

/** Stored values are untrusted: only known keys with valid values are taken. */
function load(): Settings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const stored = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const saturation = stored["gridSaturation"];
    return {
      gridSaturation:
        typeof saturation === "number" && saturation >= 0 && saturation <= 100
          ? saturation
          : DEFAULTS.gridSaturation,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Read, write and watch one setting, e.g. for a control in the settings menu. */
export function bind<K extends keyof Settings>(store: Observable<Settings>, key: K) {
  return {
    read: () => store.get()[key],
    write: (value: Settings[K]) => store.set({ ...store.get(), [key]: value }),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}
