type Listener = () => void;

/** Observer pattern in its smallest form. */
export class Emitter {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** A value that notifies its subscribers when it changes. */
export class Observable<T> extends Emitter {
  constructor(
    private value: T,
    private readonly equals: (a: T, b: T) => boolean = Object.is,
  ) {
    super();
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    if (this.equals(this.value, value)) return;
    this.value = value;
    this.emit();
  }
}
