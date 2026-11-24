import { Emitter } from "../core/observable";
import { descendants } from "./queries";
import type { Collection, Doc, Endpoint, Item, Ref } from "./types";

export type Patch<C extends Collection> = Partial<Omit<Item<C>, "id">>;

export const EMPTY: Doc = { shapes: [], lines: [], labels: [], texts: [], frames: [] };

/**
 * The document store. Holds one immutable Doc and replaces it on every
 * change. All writes go through `restore`, the single point where undo
 * could hook in later.
 */
export class Diagram extends Emitter {
  private current: Doc = EMPTY;
  private batchDepth = 0;
  private pending = false;

  get doc(): Doc {
    return this.current;
  }

  /** Replaces the whole document, e.g. with a snapshot taken earlier. */
  restore(doc: Doc): void {
    if (doc === this.current) return;
    this.current = doc;
    if (this.batchDepth > 0) this.pending = true;
    else this.emit();
  }

  /** Runs several changes and notifies subscribers once at the end. */
  batch(changes: () => void): void {
    this.batchDepth += 1;
    try {
      changes();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.pending) {
        this.pending = false;
        this.emit();
      }
    }
  }

  get<C extends Collection>(kind: C, id: string): Item<C> | undefined {
    return this.items(kind).find((item) => item.id === id);
  }

  add<C extends Collection>(kind: C, item: Item<C>): void {
    this.replace(kind, [...this.items(kind), item]);
  }

  /** Emits only on a real change, so pointer jitter does not trigger redraws. */
  update<C extends Collection>(kind: C, id: string, patch: Patch<C>): void {
    const item = this.get(kind, id);
    if (!item) return;

    const changed = Object.entries(patch).some(
      ([key, value]) => value !== undefined && !equal(value, item[key as keyof Item<C>]),
    );
    if (!changed) return;

    const next = { ...item, ...patch } as Item<C>;
    this.replace(
      kind,
      this.items(kind).map((i) => (i.id === id ? next : i)),
    );
  }

  /**
   * Removes an item and everything that depends on it: the descendants of
   * a removed rectangle, lines attached to any removed rectangle, and the
   * labels of removed lines.
   */
  remove(ref: Ref): void {
    const doc = this.current;
    const gone = new Set([`${ref.kind}:${ref.id}`]);
    if (ref.kind === "shapes") {
      for (const d of descendants(doc, ref.id)) gone.add(`${d.kind}:${d.id}`);
    }
    const keep = (kind: Collection, id: string) => !gone.has(`${kind}:${id}`);

    const shapes = doc.shapes.filter((s) => keep("shapes", s.id));
    const detached = (e: Endpoint) => e.kind === "anchor" && !shapes.some((s) => s.id === e.shapeId);
    const lines = doc.lines.filter((l) => keep("lines", l.id) && !detached(l.from) && !detached(l.to));
    const labels = doc.labels.filter((l) => keep("labels", l.id) && lines.some((line) => line.id === l.lineId));
    const texts = doc.texts.filter((t) => keep("texts", t.id));
    const frames = doc.frames.filter((f) => keep("frames", f.id));

    const next: Doc = { shapes, lines, labels, texts, frames };
    const unchanged = (Object.keys(next) as Collection[]).every((k) => next[k].length === doc[k].length);
    if (!unchanged) this.restore(next);
  }

  private items<C extends Collection>(kind: C): ReadonlyArray<Item<C>> {
    return this.current[kind] as unknown as ReadonlyArray<Item<C>>;
  }

  private replace<C extends Collection>(kind: C, items: ReadonlyArray<Item<C>>): void {
    this.restore({ ...this.current, [kind]: items });
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Structural equality for the plain values the model holds. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Object.keys(ra);
  return keys.length === Object.keys(rb).length && keys.every((k) => equal(ra[k], rb[k]));
}
