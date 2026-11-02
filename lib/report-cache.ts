/** Bounded, account-scoped cache with single-flight reads and stale fallback. */
export type CacheOptions = { ttlMs: number; staleMs?: number; maxEntries?: number };
type Entry<T> = { value: T; at: number };

export class ReportCache<T> {
  private entries = new Map<string, Entry<T>>();
  private pending = new Map<string, Promise<T>>();
  private version = 0;
  constructor(private options: CacheOptions) {}

  private prune() {
    const now = Date.now();
    const maxAge = this.options.ttlMs + (this.options.staleMs ?? 0);
    for (const [key, entry] of this.entries) {
      if (now - entry.at > maxAge) this.entries.delete(key);
    }
    const max = this.options.maxEntries ?? 32;
    while (this.entries.size > max) this.entries.delete(this.entries.keys().next().value!);
  }

  peek(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Refresh insertion order for a small, predictable LRU cache.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { ...entry, fresh: Date.now() - entry.at < this.options.ttlMs };
  }

  async read(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.peek(key);
    if (hit?.fresh) return hit.value;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const version = this.version;
    const promise = (async () => {
      try {
        const value = await load();
        if (version === this.version) this.entries.set(key, { value, at: Date.now() });
        this.prune();
        return value;
      } catch (error) {
        // A transient outage should not replace a usable report with zeros.
        if (hit) return hit.value;
        throw error;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, promise);
    return promise;
  }

  /** Store an explicitly fetched value, e.g. a lazily resolved media source. */
  write(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, { value, at: Date.now() });
    this.prune();
  }

  invalidate(key: string) {
    this.version++;
    this.entries.delete(key);
  }

  clear(prefix = "") {
    this.version++;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
    // An in-flight read may finish, but must not repopulate an invalidated cache.
  }

  get size() { return this.entries.size; }
  get inFlight() { return this.pending.size; }
}
