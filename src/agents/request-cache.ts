/**
 * Request Cache for OpenClaw
 * 
 * Caches similar LLM requests to avoid redundant API calls and reduce token costs.
 * Uses semantic hashing for request matching with configurable TTL and size limits.
 * 
 * @see https://github.com/openclaw/openclaw
 * @license MIT
 */

import { createDedupeCache, type DedupeCache } from "../infra/dedupe.js";
import { simpleHash, normalizeMessagesForComparison } from "./cost-optimization-config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("request-cache");

/**
 * Cached result entry
 */
export interface CachedResult {
  /** The cached response content */
  response: string;
  /** Timestamp when the result was cached */
  timestamp: number;
  /** Token count of the original request */
  requestTokens: number;
  /** Token count of the cached response */
  responseTokens: number;
  /** Additional metadata */
  metadata?: {
    model?: string;
    provider?: string;
    sessionId?: string;
  };
}

/**
 * Request cache configuration
 */
export interface RequestCacheConfig {
  /** Cache TTL in milliseconds (default: 1 hour) */
  ttlMs?: number;
  /** Maximum cache entries (default: 10000) */
  maxSize?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Enable semantic similarity check */
  semanticSimilarity?: boolean;
  /** Similarity threshold for semantic matching (0-1) */
  similarityThreshold?: number;
}

/**
 * Request Cache class for caching LLM responses
 */
export class RequestCache {
  private cache: Map<string, CachedResult>;
  private dedupeCache: DedupeCache;
  private config: Required<RequestCacheConfig>;
  private hitCount = 0;
  private missCount = 0;

  constructor(config?: RequestCacheConfig) {
    this.config = {
      ttlMs: config?.ttlMs ?? 60 * 60 * 1000, // 1 hour
      maxSize: config?.maxSize ?? 10000,
      verbose: config?.verbose ?? false,
      semanticSimilarity: config?.semanticSimilarity ?? false,
      similarityThreshold: config?.similarityThreshold ?? 0.95,
    };

    this.cache = new Map();
    this.dedupeCache = createDedupeCache({
      ttlMs: this.config.ttlMs,
      maxSize: this.config.maxSize,
    });
  }

  /**
   * Generate a hash key for the given messages
   */
  private generateKey(messages: Array<{ role?: string; content?: unknown }>): string {
    const normalized = normalizeMessagesForComparison(messages);
    return simpleHash(normalized);
  }

  /**
   * Check if a request is in the cache
   * 
   * @param messages - The request messages
   * @returns Cached result or null if not found/expired
   */
  async check(
    messages: Array<{ role?: string; content?: unknown }>,
  ): Promise<CachedResult | null> {
    const key = this.generateKey(messages);
    
    // Check dedupe cache first (faster)
    const isDuplicate = this.dedupeCache.check(key);
    if (!isDuplicate) {
      this.missCount++;
      if (this.config.verbose) {
        log.verbose(`[cache] MISS (key: ${key.slice(0, 8)}...)`);
      }
      return null;
    }

    // Check main cache
    const result = this.cache.get(key);
    if (!result) {
      this.missCount++;
      if (this.config.verbose) {
        log.verbose(`[cache] MISS - not in cache (key: ${key.slice(0, 8)}...)`);
      }
      return null;
    }

    // Check expiration
    if (Date.now() - result.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      this.missCount++;
      if (this.config.verbose) {
        log.verbose(`[cache] MISS - expired (key: ${key.slice(0, 8)}...)`);
      }
      return null;
    }

    this.hitCount++;
    if (this.config.verbose) {
      log.verbose(`[cache] HIT (key: ${key.slice(0, 8)}..., tokens saved: ${result.responseTokens})`);
    }
    return result;
  }

  /**
   * Store a result in the cache
   * 
   * @param messages - The request messages
   * @param response - The LLM response
   * @param metadata - Optional metadata
   */
  async set(
    messages: Array<{ role?: string; content?: unknown }>,
    response: string,
    metadata?: CachedResult["metadata"],
  ): Promise<void> {
    const key = this.generateKey(messages);
    
    // Estimate token counts (rough approximation: 1 token ≈ 4 characters)
    const requestText = normalizeMessagesForComparison(messages);
    const requestTokens = Math.ceil(requestText.length / 4);
    const responseTokens = Math.ceil(response.length / 4);

    const result: CachedResult = {
      response,
      timestamp: Date.now(),
      requestTokens,
      responseTokens,
      metadata,
    };

    this.cache.set(key, result);
    this.dedupeCache.check(key); // Mark as seen

    // Prune cache if needed
    if (this.cache.size > this.config.maxSize) {
      this.prune();
    }

    if (this.config.verbose) {
      log.verbose(
        `[cache] SET (key: ${key.slice(0, 8)}..., response: ${responseTokens} tokens)`,
      );
    }
  }

  /**
   * Prune old entries from the cache
   */
  private prune(): void {
    const now = Date.now();
    const cutoff = now - this.config.ttlMs;
    
    // Remove expired entries
    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < cutoff) {
        this.cache.delete(key);
      }
    }

    // If still over limit, remove oldest entries
    if (this.cache.size > this.config.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, entries.length - this.config.maxSize);
      for (const [key] of toDelete) {
        this.cache.delete(key);
      }
    }

    if (this.config.verbose) {
      log.verbose(`[cache] PRUNED (size: ${this.cache.size}/${this.config.maxSize})`);
    }
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.dedupeCache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    
    if (this.config.verbose) {
      log.verbose("[cache] CLEARED");
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    estimatedTokensSaved: number;
  } {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? (this.hitCount / total) * 100 : 0;
    
    // Estimate tokens saved from hits
    let estimatedTokensSaved = 0;
    for (const [, value] of this.cache.entries()) {
      estimatedTokensSaved += value.responseTokens;
    }

    return {
      size: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate,
      estimatedTokensSaved,
    };
  }

  /**
   * Remove a specific entry from the cache
   */
  delete(messages: Array<{ role?: string; content?: unknown }>): boolean {
    const key = this.generateKey(messages);
    return this.cache.delete(key);
  }

  /**
   * Get all cache keys (for debugging)
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Global request cache instance
 */
let globalRequestCache: RequestCache | null = null;

/**
 * Get or create the global request cache
 */
export function getGlobalRequestCache(config?: RequestCacheConfig): RequestCache {
  if (!globalRequestCache) {
    globalRequestCache = new RequestCache(config);
  }
  return globalRequestCache;
}

/**
 * Reset the global request cache
 */
export function resetGlobalRequestCache(): void {
  if (globalRequestCache) {
    globalRequestCache.clear();
    globalRequestCache = null;
  }
}

/**
 * Create a cache middleware wrapper for LLM calls
 * 
 * @param cache - The request cache instance
 * @param llmFn - The original LLM function
 * @returns Wrapped function with caching
 */
export function createCachedLLMWrapper<T = string>(
  cache: RequestCache,
  llmFn: (messages: Array<{ role?: string; content?: unknown }>) => Promise<T>,
): (messages: Array<{ role?: string; content?: unknown }>) => Promise<T> {
  return async (messages) => {
    // Check cache first
    const cached = await cache.check(messages);
    if (cached) {
      return cached.response as unknown as T;
    }

    // Call original function
    const result = await llmFn(messages);

    // Cache the result
    await cache.set(messages, String(result));

    return result;
  };
}
