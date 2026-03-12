/**
 * Multi-Channel Deduplication for OpenClaw
 * 
 * Detects and deduplicates identical messages sent across multiple channels
 * to avoid redundant LLM API calls.
 * 
 * Use cases:
 * - Same message posted to multiple Discord channels
 * - Same question asked in multiple Telegram groups
 * - Cross-posted content on different platforms
 * 
 * @see https://github.com/openclaw/openclaw
 * @license MIT
 */

import { createDedupeCache, type DedupeCache } from "../../infra/dedupe.js";
import { simpleHash, normalizeMessagesForComparison } from "../../agents/cost-optimization-config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("multichannel-dedupe");

/**
 * Deduplication entry for tracking messages across channels
 */
export interface DedupEntry {
  /** Original message content hash */
  contentHash: string;
  /** First seen timestamp */
  firstSeen: number;
  /** Channels where this message was seen */
  channels: Array<{
    provider: string;
    accountId: string;
    sessionId: string;
    messageId: string;
  }>;
  /** Cached LLM response */
  cachedResponse?: string;
  /** Response tokens */
  responseTokens?: number;
}

/**
 * Multi-channel deduplication configuration
 */
export interface MultiChannelDedupeConfig {
  /** Deduplication window in milliseconds (default: 5 minutes) */
  windowMs?: number;
  /** Maximum entries to track (default: 5000) */
  maxEntries?: number;
  /** Enable content-based deduplication (default: true) */
  contentBased?: boolean;
  /** Enable cross-platform deduplication (default: false) */
  crossPlatform?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Minimum content length for deduplication (default: 20 chars) */
  minLength?: number;
}

/**
 * Multi-Channel Deduplication manager
 */
export class MultiChannelDedupe {
  private contentIndex: Map<string, DedupEntry>;
  private messageIndex: Map<string, string>; // messageId -> contentHash
  private dedupeCache: DedupeCache;
  private config: Required<MultiChannelDedupeConfig>;

  constructor(config?: MultiChannelDedupeConfig) {
    this.config = {
      windowMs: config?.windowMs ?? 5 * 60 * 1000, // 5 minutes
      maxEntries: config?.maxEntries ?? 5000,
      contentBased: config?.contentBased ?? true,
      crossPlatform: config?.crossPlatform ?? false,
      verbose: config?.verbose ?? false,
      minLength: config?.minLength ?? 20,
    };

    this.contentIndex = new Map();
    this.messageIndex = new Map();
    this.dedupeCache = createDedupeCache({
      ttlMs: this.config.windowMs,
      maxSize: this.config.maxEntries,
    });
  }

  /**
   * Generate content hash for messages
   */
  private generateContentHash(
    messages: Array<{ role?: string; content?: unknown }>,
  ): string {
    const normalized = normalizeMessagesForComparison(messages);
    return simpleHash(normalized);
  }

  /**
   * Generate a cross-channel key for deduplication
   */
  private generateCrossChannelKey(
    contentHash: string,
    provider: string,
    accountId: string,
  ): string {
    if (this.config.crossPlatform) {
      // Cross-platform deduplication: only use content hash
      return contentHash;
    }
    // Same-account deduplication: include provider and account
    return `${provider}:${accountId}:${contentHash}`;
  }

  /**
   * Check if a message is a duplicate across channels
   * 
   * @param messages - The message content
   * @param context - Message context information
   * @returns Existing response if duplicate, null otherwise
   */
  async check(
    messages: Array<{ role?: string; content?: unknown }>,
    context: {
      provider: string;
      accountId: string;
      sessionId: string;
      messageId: string;
    },
  ): Promise<string | null> {
    const content = normalizeMessagesForComparison(messages);
    
    // Skip short messages (not worth deduplicating)
    if (content.length < this.config.minLength) {
      return null;
    }

    const contentHash = this.generateContentHash(messages);
    const crossChannelKey = this.generateCrossChannelKey(
      contentHash,
      context.provider,
      context.accountId,
    );

    // Check if we've seen this content before
    const entry = this.contentIndex.get(crossChannelKey);
    if (!entry) {
      if (this.config.verbose) {
        log.verbose(`[dedupe] NEW content from ${context.provider}:${context.messageId}`);
      }
      return null;
    }

    // Check if this is the same message (same messageId)
    const existingMessage = entry.channels.find(
      (c) => c.messageId === context.messageId,
    );
    if (existingMessage) {
      if (this.config.verbose) {
        log.verbose(`[dedupe] SAME message ${context.messageId}`);
      }
      return entry.cachedResponse ?? null;
    }

    // Check time window
    const now = Date.now();
    if (now - entry.firstSeen > this.config.windowMs) {
      if (this.config.verbose) {
        log.verbose(`[dedupe] EXPIRED entry for ${contentHash}`);
      }
      // Remove expired entry
      this.contentIndex.delete(crossChannelKey);
      return null;
    }

    // This is a duplicate across channels - return cached response
    if (this.config.verbose) {
      log.verbose(
        `[dedupe] DUPLICATE detected! ${context.provider}:${context.messageId} ` +
        `matches ${entry.channels.length} other channel(s)`,
      );
    }

    return entry.cachedResponse ?? null;
  }

  /**
   * Record a message and its response for future deduplication
   * 
   * @param messages - The message content
   * @param response - The LLM response
   * @param context - Message context information
   */
  async record(
    messages: Array<{ role?: string; content?: unknown }>,
    response: string,
    context: {
      provider: string;
      accountId: string;
      sessionId: string;
      messageId: string;
    },
  ): Promise<void> {
    const content = normalizeMessagesForComparison(messages);
    
    // Skip short messages
    if (content.length < this.config.minLength) {
      return;
    }

    const contentHash = this.generateContentHash(messages);
    const crossChannelKey = this.generateCrossChannelKey(
      contentHash,
      context.provider,
      context.accountId,
    );

    // Check if entry exists
    let entry = this.contentIndex.get(crossChannelKey);
    if (!entry) {
      entry = {
        contentHash,
        firstSeen: Date.now(),
        channels: [],
        cachedResponse: response,
        responseTokens: Math.ceil(response.length / 4),
      };
      this.contentIndex.set(crossChannelKey, entry);
    } else {
      // Update cached response
      entry.cachedResponse = response;
      entry.responseTokens = Math.ceil(response.length / 4);
    }

    // Add this channel to the entry
    entry.channels.push({
      provider: context.provider,
      accountId: context.accountId,
      sessionId: context.sessionId,
      messageId: context.messageId,
    });

    // Index by messageId for quick lookup
    const messageKey = `${context.provider}:${context.accountId}:${context.messageId}`;
    this.messageIndex.set(messageKey, contentHash);

    // Update dedupe cache
    this.dedupeCache.check(crossChannelKey);

    // Prune if needed
    if (this.contentIndex.size > this.config.maxEntries) {
      this.prune();
    }

    if (this.config.verbose) {
      log.verbose(
        `[dedupe] RECORDED ${context.provider}:${context.messageId} ` +
        `(entry has ${entry.channels.length} channel(s))`,
      );
    }
  }

  /**
   * Prune old entries
   */
  private prune(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    // Remove expired entries
    for (const [key, entry] of this.contentIndex.entries()) {
      if (entry.firstSeen < cutoff) {
        this.contentIndex.delete(key);
      }
    }

    // If still over limit, remove oldest entries
    if (this.contentIndex.size > this.config.maxEntries) {
      const entries = Array.from(this.contentIndex.entries())
        .sort((a, b) => a[1].firstSeen - b[1].firstSeen);
      
      const toDelete = entries.slice(0, entries.length - this.config.maxEntries);
      for (const [key] of toDelete) {
        this.contentIndex.delete(key);
      }
    }

    // Clean up message index
    for (const [msgKey, contentHash] of this.messageIndex.entries()) {
      if (!this.contentIndex.has(contentHash)) {
        this.messageIndex.delete(msgKey);
      }
    }

    if (this.config.verbose) {
      log.verbose(
        `[dedupe] PRUNED (entries: ${this.contentIndex.size}/${this.config.maxEntries})`,
      );
    }
  }

  /**
   * Clear all deduplication data
   */
  clear(): void {
    this.contentIndex.clear();
    this.messageIndex.clear();
    this.dedupeCache.clear();

    if (this.config.verbose) {
      log.verbose("[dedupe] CLEARED");
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    entries: number;
    messages: number;
    avgChannelsPerEntry: number;
  } {
    const totalChannels = this.contentIndex.values().reduce(
      (sum, entry) => sum + entry.channels.length,
      0,
    );
    const avgChannels = this.contentIndex.size > 0
      ? totalChannels / this.contentIndex.size
      : 0;

    return {
      entries: this.contentIndex.size,
      messages: this.messageIndex.size,
      avgChannelsPerEntry: avgChannels,
    };
  }
}

/**
 * Global multi-channel deduplication instance
 */
let globalMultiChannelDedupe: MultiChannelDedupe | null = null;

/**
 * Get or create the global multi-channel dedupe instance
 */
export function getGlobalMultiChannelDedupe(
  config?: MultiChannelDedupeConfig,
): MultiChannelDedupe {
  if (!globalMultiChannelDedupe) {
    globalMultiChannelDedupe = new MultiChannelDedupe(config);
  }
  return globalMultiChannelDedupe;
}

/**
 * Reset the global multi-channel dedupe instance
 */
export function resetGlobalMultiChannelDedupe(): void {
  if (globalMultiChannelDedupe) {
    globalMultiChannelDedupe.clear();
    globalMultiChannelDedupe = null;
  }
}
