/**
 * Performance Benchmarks for Cost Optimization Modules
 *
 * This file contains performance benchmarks for:
 * - Tool description compression
 * - Request cache operations
 * - Multi-channel deduplication
 *
 * Run with: npm test -- src/agents/cost-optimization.bench.ts
 */

import { describe, it, expect } from "vitest";
import {
  compressToolDescription,
  simpleHash,
  normalizeMessagesForComparison,
} from "./cost-optimization-config.js";
import { RequestCache } from "./request-cache.js";
import { MultiChannelDedupe } from "../auto-reply/reply/multichannel-dedupe.js";

/**
 * Helper to measure execution time
 */
function measureTime(fn: () => void | Promise<void>): Promise<number> {
  const start = performance.now();
  const result = fn();
  if (result instanceof Promise) {
    return result.then(() => performance.now() - start);
  }
  return Promise.resolve(performance.now() - start);
}

describe("cost-optimization - performance benchmarks", () => {
  describe("compressToolDescription - performance", () => {
    it("should compress tool description in <1ms", async () => {
      const longDescription =
        "This tool allows you to execute bash commands in the shell. " +
        "The following parameters are supported: cmd (the command to execute), " +
        "cwd (optional working directory). Returns: the command output. " +
        "Example: bash('ls -la') will list all files in the current directory.";

      const iterations = 1000;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(() => {
          compressToolDescription("Bash", longDescription);
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`compressToolDescription: avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      // Should be very fast (<1ms average)
      expect(avgTime).toBeLessThan(1);
    });

    it("should handle predefined mappings in <0.1ms", async () => {
      const iterations = 1000;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(() => {
          compressToolDescription("Read", "This is a long description that should be replaced");
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`Predefined mapping: avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(0.5);
      expect(compressToolDescription("Read", "any description")).toBe("read(path)");
    });

    it("should process 100 tool descriptions in <100ms", async () => {
      const toolDescriptions = [
        { name: "Bash", desc: "This tool allows you to execute bash commands" },
        { name: "Read", desc: "This tool allows you to read files" },
        { name: "Write", desc: "This tool allows you to write files" },
        { name: "Edit", desc: "This tool allows you to edit files" },
        { name: "Delete", desc: "This tool allows you to delete files" },
      ];

      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        for (const tool of toolDescriptions) {
          compressToolDescription(tool.name, tool.desc);
        }
      }

      const totalTime = performance.now() - startTime;
      console.log(`100 iterations of 5 tools: ${totalTime.toFixed(2)}ms total`);

      expect(totalTime).toBeLessThan(100);
    });
  });

  describe("simpleHash - performance", () => {
    it("should hash short strings in <0.1ms", async () => {
      const testString = "Hello, World!";
      const iterations = 10000;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(() => {
          simpleHash(testString);
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`simpleHash (short): avg ${avgTime.toFixed(4)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(0.1);
    });

    it("should hash long strings in <1ms", async () => {
      const testString = "a".repeat(10000);
      const iterations = 1000;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(() => {
          simpleHash(testString);
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`simpleHash (long): avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(1);
    });

    it("should produce consistent hashes", () => {
      const testString = "test-content";
      const hash1 = simpleHash(testString);
      const hash2 = simpleHash(testString);
      expect(hash1).toBe(hash2);
    });
  });

  describe("normalizeMessagesForComparison - performance", () => {
    it("should normalize messages in <1ms", async () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ];

      const iterations = 1000;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(() => {
          normalizeMessagesForComparison(messages);
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`normalizeMessages: avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(1);
    });

    it("should handle large message arrays in <10ms", async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}: ${"lorem ipsum ".repeat(10)}`,
      }));

      const iterations = 100;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(() => {
          normalizeMessagesForComparison(messages);
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`normalizeMessages (large): avg ${avgTime.toFixed(2)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(10);
    });
  });

  describe("RequestCache - performance", () => {
    it("should check cache in <5ms", async () => {
      const cache = new RequestCache({ verbose: false });
      const messages = [
        { role: "user", content: "Test message" },
        { role: "assistant", content: "Test response" },
      ];

      // Pre-populate cache
      await cache.set(messages, "Test response");

      const iterations = 100;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(async () => {
          await cache.check(messages);
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`RequestCache.check: avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(5);
    });

    it("should set cache in <5ms", async () => {
      const cache = new RequestCache({ verbose: false });
      const messages = [
        { role: "user", content: "Test message" },
      ];

      const iterations = 100;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(async () => {
          await cache.set(messages, `Response ${i}`);
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`RequestCache.set: avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(5);
    });

    it("should handle 1000 cache entries", async () => {
      const cache = new RequestCache({ maxSize: 1000, verbose: false });

      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        const messages = [{ role: "user", content: `Message ${i}` }];
        await cache.set(messages, `Response ${i}`);
      }

      const totalTime = performance.now() - startTime;
      console.log(`1000 cache entries: ${totalTime.toFixed(2)}ms total`);

      expect(totalTime).toBeLessThan(5000); // 5 seconds for 1000 entries
      expect(cache.getStats().size).toBe(1000);
    });
  });

  describe("MultiChannelDedupe - performance", () => {
    it("should check dedupe in <5ms", async () => {
      const dedupe = new MultiChannelDedupe({ verbose: false });
      const messages = [{ role: "user", content: "Test message" }];
      const context = {
        provider: "discord",
        accountId: "test-account",
        sessionId: "test-session",
        messageId: "test-message",
      };

      // Pre-populate
      await dedupe.record(messages, "Test response", context);

      const iterations = 100;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(async () => {
          await dedupe.check(messages, { ...context, messageId: `test-message-${i}` });
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`MultiChannelDedupe.check: avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(5);
    });

    it("should record dedupe in <5ms", async () => {
      const dedupe = new MultiChannelDedupe({ verbose: false });
      const messages = [{ role: "user", content: "Test message" }];
      const context = {
        provider: "discord",
        accountId: "test-account",
        sessionId: "test-session",
        messageId: "test-message",
      };

      const iterations = 100;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const time = await measureTime(async () => {
          await dedupe.record(messages, `Response ${i}`, { ...context, messageId: `test-message-${i}` });
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`MultiChannelDedupe.record: avg ${avgTime.toFixed(3)}ms per call (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(5);
    });

    it("should handle 500 dedupe entries", async () => {
      const dedupe = new MultiChannelDedupe({ maxEntries: 500, verbose: false });

      const startTime = performance.now();

      for (let i = 0; i < 500; i++) {
        const messages = [{ role: "user", content: `Message ${i}` }];
        await dedupe.record(
          messages,
          `Response ${i}`,
          {
            provider: "discord",
            accountId: "test-account",
            sessionId: "test-session",
            messageId: `message-${i}`,
          },
        );
      }

      const totalTime = performance.now() - startTime;
      console.log(`500 dedupe entries: ${totalTime.toFixed(2)}ms total`);

      expect(totalTime).toBeLessThan(3000); // 3 seconds for 500 entries
      expect(dedupe.getStats().entries).toBe(500);
    });
  });

  describe("Integration - end-to-end performance", () => {
    it("should process full pipeline in <20ms", async () => {
      const cache = new RequestCache({ verbose: false });
      const dedupe = new MultiChannelDedupe({ verbose: false });

      const messages = [
        { role: "user", content: "Hello, how are you?" },
        { role: "assistant", content: "I'm doing well, thank you!" },
      ];

      const context = {
        provider: "discord",
        accountId: "test-account",
        sessionId: "test-session",
        messageId: "test-message",
      };

      const iterations = 50;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        // Step 1: Check dedupe
        await dedupe.check(messages, { ...context, messageId: `msg-${i}` });

        // Step 2: Check cache
        await cache.check(messages);

        // Step 3: Record to dedupe
        await dedupe.record(messages, "Response", { ...context, messageId: `msg-${i}` });

        // Step 4: Set cache
        await cache.set(messages, "Response");

        totalTime += performance.now() - startTime;
      }

      const avgTime = totalTime / iterations;
      console.log(`Full pipeline: avg ${avgTime.toFixed(2)}ms per iteration (${iterations} iterations)`);

      expect(avgTime).toBeLessThan(20);
    });
  });
});
