/**
 * OpenClaw Token Cost Optimization Configuration
 * 
 * This module provides default configurations for optimizing LLM token costs
 * through model overrides, compression settings, and caching strategies.
 * 
 * @see https://github.com/openclaw/openclaw
 * @license MIT
 */

import type { OpenClawConfig } from "../config/config.js";

/**
 * Default cheap model for compaction tasks
 * Uses GPT-4o Mini or equivalent for summarization (50-80% cost reduction)
 */
export const DEFAULT_COMPACTION_MODEL = "openai/gpt-4o-mini";

/**
 * Alternative compaction models for different providers
 */
export const COMPACTION_MODEL_ALTERNATIVES = {
  anthropic: "anthropic/claude-3-5-haiku-20241022",
  openrouter: "openrouter/google/gemma-2-9b-it:free",
  ollama: "ollama/llama-3.2-1b",
  azure: "azure/gpt-4o-mini",
} as const;

/**
 * Request cache configuration
 */
export const REQUEST_CACHE_CONFIG = {
  /** Cache TTL in milliseconds (1 hour) */
  ttlMs: 60 * 60 * 1000,
  /** Maximum cache entries */
  maxSize: 10000,
  /** Enable semantic similarity check (requires embeddings) */
  semanticSimilarity: false,
  /** Similarity threshold for semantic matching (0-1) */
  similarityThreshold: 0.95,
} as const;

/**
 * Multi-channel deduplication configuration
 */
export const DEDUPLICATION_CONFIG = {
  /** Deduplication window in milliseconds (5 minutes) */
  windowMs: 5 * 60 * 1000,
  /** Maximum entries to track */
  maxEntries: 5000,
  /** Enable content hashing */
  contentHash: true,
  /** Hash algorithm: 'simple' | 'sha256' */
  hashAlgorithm: "simple" as const,
} as const;

/**
 * Tool description compression configuration
 */
export const TOOL_COMPRESSION_CONFIG = {
  /** Enable tool description compression */
  enabled: true,
  /** Use short format for common tools */
  useShortFormat: true,
  /** Remove verbose examples from descriptions */
  removeExamples: true,
  /** Truncate long descriptions to this length (0 = no limit) */
  maxLength: 200,
} as const;

/**
 * Predefined tool description mappings for compression
 * Maps tool names to concise descriptions
 */
export const TOOL_DESCRIPTION_MAP: Record<string, string> = {
  // Bash/Shell tools
  Bash: "exec(cmd, cwd?)",
  bash: "exec(cmd, cwd?)",
  exec: "exec(cmd, cwd?)",
  shell: "exec(cmd, cwd?)",
  
  // File operations
  Read: "read(path)",
  read: "read(path)",
  Write: "write(path, content)",
  write: "write(path, content)",
  Edit: "edit(path, changes)",
  edit: "edit(path, changes)",
  Delete: "delete(path)",
  delete: "delete(path)",
  Copy: "copy(src, dst)",
  copy: "copy(src, dst)",
  Move: "move(src, dst)",
  move: "move(src, dst)",
  List: "list(dir)",
  list: "list(dir)",
  Glob: "glob(pattern)",
  glob: "glob(pattern)",
  
  // Web tools
  web_fetch: "fetch(url)",
  fetch: "fetch(url)",
  navigate: "navigate(url)",
  browser_navigate: "navigate(url)",
  browser_click: "click(selector)",
  click: "click(selector)",
  browser_fill: "fill(selector, text)",
  fill: "fill(selector, text)",
  browser_select: "select(selector, value)",
  select: "select(selector, value)",
  browser_hover: "hover(selector)",
  hover: "hover(selector)",
  
  // Search tools
  search: "search(query)",
  google: "google(query)",
  duckduckgo: "duckduckgo(query)",
  
  // Memory tools
  memory_add: "add(text)",
  memory_search: "search(query)",
  memory_delete: "delete(id)",
  
  // Message tools
  send_message: "send(to, text)",
  reply: "reply(text)",
  react: "react(emoji)",
  edit_message: "edit(id, text)",
  delete_message: "delete(id)",
  
  // Image tools
  generate_image: "img(prompt)",
  analyze_image: "analyze(img, prompt?)",
  
  // Audio tools
  transcribe_audio: "transcribe(audio)",
  generate_audio: "tts(text, voice?)",
  
  // Code tools
  run_code: "run(lang, code)",
  lint_code: "lint(lang, code)",
  format_code: "format(lang, code)",
  
  // Git tools
  git_commit: "commit(msg)",
  git_push: "push(remote?)",
  git_pull: "pull(remote?)",
  git_status: "status()",
  git_diff: "diff(rev?)",
  
  // Database tools
  query_db: "query(sql)",
  insert_db: "insert(table, data)",
  update_db: "update(table, data, where)",
  delete_db: "delete(table, where)",
} as const;

/**
 * Common description patterns to remove or shorten
 */
export const DESCRIPTION_PATTERNS_TO_SHORTEN = [
  {
    pattern: /This tool allows you to\s+/gi,
    replacement: "",
  },
  {
    pattern: /Use this function to\s+/gi,
    replacement: "",
  },
  {
    pattern: /You can use this to\s+/gi,
    replacement: "",
  },
  {
    pattern: /The following parameters are supported:\s*/gi,
    replacement: "Params: ",
  },
  {
    pattern: /Returns:\s*/gi,
    replacement: "→ ",
  },
  {
    pattern: /Example:\s*[\s\S]*?(?=\n\n|\n[A-Z]|\Z)/gi,
    replacement: "",
  },
  {
    pattern: /For example:\s*[\s\S]*?(?=\n\n|\n[A-Z]|\Z)/gi,
    replacement: "",
  },
];

/**
 * Creates an optimized OpenClaw configuration for cost reduction
 * 
 * @param options - Customization options
 * @returns Optimized configuration object
 */
export function createOptimizedConfig(options?: {
  /** Override compaction model */
  compactionModel?: string;
  /** Enable request caching */
  enableCache?: boolean;
  /** Enable multi-channel deduplication */
  enableDedup?: boolean;
  /** Enable tool description compression */
  enableToolCompression?: boolean;
  /** Use local models (Ollama) */
  useLocalModels?: boolean;
}): OpenClawConfig {
  const config: OpenClawConfig = {
    agents: {
      defaults: {
        // Use cheap model for compaction (50-80% savings)
        compaction: {
          model: options?.compactionModel ?? DEFAULT_COMPACTION_MODEL,
        },
      },
    },
  };

  // Add caching configuration if enabled
  if (options?.enableCache !== false) {
    (config as any).requestCache = {
      enabled: true,
      ...REQUEST_CACHE_CONFIG,
    };
  }

  // Add deduplication configuration if enabled
  if (options?.enableDedup !== false) {
    (config as any).deduplication = {
      enabled: true,
      ...DEDUPLICATION_CONFIG,
    };
  }

  // Add tool compression configuration if enabled
  if (options?.enableToolCompression !== false) {
    (config as any).toolCompression = {
      ...TOOL_COMPRESSION_CONFIG,
    };
  }

  // Configure local models if requested
  if (options?.useLocalModels) {
    config.agents!.defaults!.compaction!.model = COMPACTION_MODEL_ALTERNATIVES.ollama;
    config.models = {
      providers: {
        ollama: {
          baseUrl: "http://localhost:11434",
        },
      },
    };
  }

  return config;
}

/**
 * Gets the recommended compaction model for a given provider
 * 
 * @param provider - The LLM provider name
 * @returns Recommended compaction model string
 */
export function getRecommendedCompactionModel(provider: string): string {
  const providerKey = provider.toLowerCase() as keyof typeof COMPACTION_MODEL_ALTERNATIVES;
  return COMPACTION_MODEL_ALTERNATIVES[providerKey] ?? DEFAULT_COMPACTION_MODEL;
}

/**
 * Compresses a tool description using predefined mappings and patterns
 * 
 * @param toolName - The name of the tool
 * @param description - The original description
 * @returns Compressed description
 */
export function compressToolDescription(toolName: string, description: string): string {
  // Check for predefined mapping first
  const mapped = TOOL_DESCRIPTION_MAP[toolName];
  if (mapped) {
    return mapped;
  }

  let compressed = description;

  // Apply pattern-based shortening
  for (const { pattern, replacement } of DESCRIPTION_PATTERNS_TO_SHORTEN) {
    compressed = compressed.replace(pattern, replacement);
  }

  // Apply max length truncation if configured
  if (TOOL_COMPRESSION_CONFIG.maxLength > 0 && compressed.length > TOOL_COMPRESSION_CONFIG.maxLength) {
    compressed = compressed.slice(0, TOOL_COMPRESSION_CONFIG.maxLength - 3) + "...";
  }

  return compressed.trim();
}

/**
 * Generates a simple hash for content deduplication
 * 
 * @param content - The content to hash
 * @returns Hash string
 */
export function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Normalizes message content for comparison and deduplication
 * 
 * @param messages - Array of message objects
 * @returns Normalized content string
 */
export function normalizeMessagesForComparison(messages: Array<{ role?: string; content?: unknown }>): string {
  return messages
    .map((msg) => {
      const role = msg.role ?? "unknown";
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return `${role}:${content}`;
    })
    .join("|");
}
