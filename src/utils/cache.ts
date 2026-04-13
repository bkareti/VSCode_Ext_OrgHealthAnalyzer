/**
 * Analysis Cache — Phase 5
 *
 * Persists per-file analysis results keyed by a content hash so that
 * unchanged Apex classes/triggers are not re-fetched on every run.
 *
 * Key design:
 *   - hash = SHA-256-like djb2 of file content (no Node crypto needed)
 *   - stored in context.globalState under 'sfHealthAnalyzer.cache.*'
 *   - TTL: 24 hours (configurable); stale entries are evicted on read
 *   - cache.invalidate(filePath) removes a single entry (called by watcher)
 *   - cache.clear() wipes everything (exposed as a VS Code command)
 */

import * as vscode from 'vscode';
import { logInfo } from './logger';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T> {
  hash:      string;
  timestamp: number;   // Date.now()
  data:      T;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_PREFIX = 'sfHealthAnalyzer.cache.';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Hash (djb2 — fast, no crypto dependency)
// ============================================================================

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return hash.toString(16);
}

// ============================================================================
// AnalysisCache
// ============================================================================

export class AnalysisCache {
  private store: vscode.Memento;
  private ttlMs: number;

  constructor(globalState: vscode.Memento, ttlMs = DEFAULT_TTL_MS) {
    this.store = globalState;
    this.ttlMs = ttlMs;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Get a cached result for `key` if it exists, is fresh, and matches `content`.
   * Returns undefined on miss / stale / hash mismatch.
   */
  public get<T>(key: string, content: string): T | undefined {
    const entry = this.store.get<CacheEntry<T>>(CACHE_PREFIX + key);
    if (!entry) { return undefined; }

    // TTL check
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.update(CACHE_PREFIX + key, undefined);
      return undefined;
    }

    // Hash check — content changed since last cache
    if (entry.hash !== djb2Hash(content)) { return undefined; }

    return entry.data;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Store `data` in the cache for `key`, keyed by `content` hash. */
  public async set<T>(key: string, content: string, data: T): Promise<void> {
    const entry: CacheEntry<T> = {
      hash:      djb2Hash(content),
      timestamp: Date.now(),
      data,
    };
    await this.store.update(CACHE_PREFIX + key, entry);
  }

  // ── Invalidation ──────────────────────────────────────────────────────────

  /** Remove a single cache entry by key (e.g. when a file changes). */
  public async invalidate(key: string): Promise<void> {
    await this.store.update(CACHE_PREFIX + key, undefined);
  }

  /**
   * Invalidate cache by file URI path.
   * Uses the file path as the cache key (same convention as analyzers).
   */
  public async invalidateFile(uri: vscode.Uri): Promise<void> {
    await this.invalidate(uri.fsPath);
    logInfo(`Cache invalidated: ${uri.fsPath}`);
  }

  /** Wipe all cache entries. */
  public async clear(): Promise<void> {
    const keys = this.store.keys().filter(k => k.startsWith(CACHE_PREFIX));
    await Promise.all(keys.map(k => this.store.update(k, undefined)));
    logInfo(`Cache cleared (${keys.length} entries removed)`);
  }

  /** Return number of non-expired cache entries. */
  public size(): number {
    return this.store
      .keys()
      .filter(k => k.startsWith(CACHE_PREFIX))
      .filter(k => {
        const e = this.store.get<CacheEntry<unknown>>(k);
        return e !== undefined && Date.now() - e.timestamp <= this.ttlMs;
      }).length;
  }
}

// ============================================================================
// Singleton + factory
// ============================================================================

let _cache: AnalysisCache | null = null;

export function initCache(globalState: vscode.Memento): AnalysisCache {
  _cache = new AnalysisCache(globalState);
  return _cache;
}

export function getCache(): AnalysisCache | null {
  return _cache;
}

// ============================================================================
// File watcher factory
// ============================================================================

/**
 * Create a FileSystemWatcher that invalidates cache entries for every
 * .cls and .trigger file that changes in the workspace.
 */
export function createApexFileWatcher(
  cache: AnalysisCache
): vscode.FileSystemWatcher {
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{cls,trigger}'
  );

  const onUri = (uri: vscode.Uri) => {
    cache.invalidateFile(uri).catch(() => { /* ignore */ });
  };

  watcher.onDidChange(onUri);
  watcher.onDidCreate(onUri);
  watcher.onDidDelete(onUri);

  return watcher;
}
