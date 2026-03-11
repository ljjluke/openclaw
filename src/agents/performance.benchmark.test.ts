/**
 * 性能基准测试脚本
 * 
 * 测量成本优化模块的实际性能数据：
 * - 延迟影响 (ms)
 * - 内存占用 (MB)
 * - 缓存命中率
 * - 实际 Token 节省率
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RequestCache } from "../request-cache.js";
import { MultiChannelDedupe } from "./multichannel-dedupe.js";
import { compressToolDescription, simpleHash } from "../cost-optimization-config.js";

// 内存测量辅助函数
function getMemoryUsageMB(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed / 1024 / 1024;
  }
  return 0;
}

// 延迟测量辅助函数
async function measureLatencyMs<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { result, latencyMs: Math.round((end - start) * 100) / 100 };
}

describe("性能基准测试", () => {
  describe("RequestCache 性能", () => {
    let cache: RequestCache;

    beforeEach(() => {
      cache = new RequestCache({
        ttlMs: 60 * 60 * 1000,
        maxSize: 10000,
        verbose: false,
      });
    });

    it("测量 check 操作的延迟", async () => {
      const messages = [
        { role: "user", content: "Hello, this is a test message with some content" },
        { role: "assistant", content: "Hi there! How can I help you today?" },
      ];

      const iterations = 1000;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { latencyMs } = await measureLatencyMs(() => cache.check(messages));
        latencies.push(latencyMs);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log(`\nRequestCache.check() 延迟 (${iterations} 次迭代):`);
      console.log(`  平均: ${avgLatency.toFixed(2)}ms`);
      console.log(`  最大: ${maxLatency.toFixed(2)}ms`);
      console.log(`  最小: ${minLatency.toFixed(2)}ms`);

      // 验证延迟在可接受范围内
      expect(avgLatency).toBeLessThan(10); // 平均 < 10ms
    });

    it("测量 set 操作的延迟", async () => {
      const messages = [
        { role: "user", content: "Test message for benchmarking" },
      ];
      const response = "This is a test response for benchmarking purposes";

      const iterations = 1000;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { latencyMs } = await measureLatencyMs(() => 
          cache.set(messages, response)
        );
        latencies.push(latencyMs);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;

      console.log(`\nRequestCache.set() 延迟 (${iterations} 次迭代):`);
      console.log(`  平均：${avgLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(10);
    });

    it("测量内存占用", async () => {
      const initialMemory = getMemoryUsageMB();
      
      // 添加 1000 个缓存条目
      for (let i = 0; i < 1000; i++) {
        await cache.set(
          [{ role: "user", content: `Message ${i}` }],
          `Response ${i}`.repeat(10)
        );
      }

      const finalMemory = getMemoryUsageMB();
      const memoryDelta = finalMemory - initialMemory;

      console.log(`\nRequestCache 内存占用 (1000 条目):`);
      console.log(`  增加：${memoryDelta.toFixed(2)} MB`);
      console.log(`  每条目：${(memoryDelta * 1024).toFixed(2)} KB`);

      expect(memoryDelta).toBeLessThan(50); // < 50MB
    });

    it("测量缓存命中率", async () => {
      const uniqueMessages = 100;
      const totalRequests = 1000;

      // 先填充缓存
      for (let i = 0; i < uniqueMessages; i++) {
        await cache.set(
          [{ role: "user", content: `Message ${i}` }],
          `Response ${i}`
        );
      }

      // 随机请求（有些命中，有些未命中）
      let hits = 0;
      for (let i = 0; i < totalRequests; i++) {
        const msgIndex = Math.floor(Math.random() * uniqueMessages * 1.5); // 有些是不存在的
        const result = await cache.check([
          { role: "user", content: `Message ${msgIndex}` }
        ]);
        if (result !== null) {
          hits++;
        }
      }

      const hitRate = (hits / totalRequests) * 100;

      console.log(`\nRequestCache 命中率:`);
      console.log(`  总请求：${totalRequests}`);
      console.log(`  命中：${hits}`);
      console.log(`  命中率：${hitRate.toFixed(1)}%`);

      expect(hitRate).toBeGreaterThan(50); // 应该 > 50%
    });
  });

  describe("MultiChannelDedupe 性能", () => {
    let dedupe: MultiChannelDedupe;

    beforeEach(() => {
      dedupe = new MultiChannelDedupe({
        windowMs: 60 * 60 * 1000,
        maxEntries: 10000,
        verbose: false,
      });
    });

    it("测量 check 操作的延迟", async () => {
      const messages = [
        { role: "user", content: "Test message for deduplication benchmark" },
      ];
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "sess1",
        messageId: "msg1",
      };

      const iterations = 1000;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { latencyMs } = await measureLatencyMs(() => 
          dedupe.check(messages, context)
        );
        latencies.push(latencyMs);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;

      console.log(`\nMultiChannelDedupe.check() 延迟 (${iterations} 次迭代):`);
      console.log(`  平均：${avgLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(10);
    });

    it("测量内存占用", async () => {
      const initialMemory = getMemoryUsageMB();
      
      // 添加 1000 个去重条目
      for (let i = 0; i < 1000; i++) {
        await dedupe.record(
          [{ role: "user", content: `Message ${i}`.repeat(5) }],
          `Response ${i}`.repeat(10),
          {
            provider: "telegram",
            accountId: "acc1",
            sessionId: `sess${i}`,
            messageId: `msg${i}`,
          }
        );
      }

      const finalMemory = getMemoryUsageMB();
      const memoryDelta = finalMemory - initialMemory;

      console.log(`\nMultiChannelDedupe 内存占用 (1000 条目):`);
      console.log(`  增加：${memoryDelta.toFixed(2)} MB`);

      expect(memoryDelta).toBeLessThan(20); // < 20MB
    });
  });

  describe("工具描述压缩性能", () => {
    it("测量 compressToolDescription 延迟", () => {
      const testCases = [
        { name: "Bash", desc: "This tool allows you to execute shell commands in the current working directory. The following parameters are supported: cmd (required), cwd (optional). Example: exec('ls -la')" },
        { name: "Read", desc: "Read the contents of a file at the specified path and return the content as a string. Supports both text and binary files." },
        { name: "Write", desc: "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does." },
        { name: "custom_tool", desc: "A custom tool that performs some special operation with multiple parameters and options." },
      ];

      const iterations = 10000;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const testCase = testCases[i % testCases.length];
        const start = performance.now();
        compressToolDescription(testCase.name, testCase.desc);
        const end = performance.now();
        latencies.push(Math.round((end - start) * 100) / 100);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;

      console.log(`\ncompressToolDescription() 延迟 (${iterations} 次迭代):`);
      console.log(`  平均：${avgLatency.toFixed(3)}ms`);

      expect(avgLatency).toBeLessThan(1); // < 1ms
    });

    it("测量压缩率", () => {
      const testCases = [
        { name: "Bash", desc: "This tool allows you to execute shell commands in the current working directory. The following parameters are supported: cmd (required), cwd (optional). Example: exec('ls -la')" },
        { name: "Read", desc: "Read the contents of a file at the specified path and return the content as a string. Supports both text and binary files." },
        { name: "Write", desc: "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does." },
        { name: "List", desc: "List the contents of a directory. Returns an array of file and directory names." },
        { name: "Glob", desc: "Search for files matching a glob pattern. Supports wildcards like * and **." },
      ];

      let totalOriginal = 0;
      let totalCompressed = 0;

      for (const testCase of testCases) {
        const compressed = compressToolDescription(testCase.name, testCase.desc);
        totalOriginal += testCase.desc.length;
        totalCompressed += compressed.length;
      }

      const savingsRate = ((totalOriginal - totalCompressed) / totalOriginal) * 100;

      console.log(`\n工具描述压缩率:`);
      console.log(`  原始总长度：${totalOriginal} chars`);
      console.log(`  压缩后总长度：${totalCompressed} chars`);
      console.log(`  节省率：${savingsRate.toFixed(1)}%`);

      expect(savingsRate).toBeGreaterThan(30); // 应该 > 30%
    });
  });

  describe("哈希函数性能", () => {
    it("测量 simpleHash 延迟", () => {
      const testStrings = [
        "Short message",
        "A longer message with more content to hash and process",
        "x".repeat(1000),
        JSON.stringify({ role: "user", content: "Hello" }),
      ];

      const iterations = 10000;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const str = testStrings[i % testStrings.length];
        const start = performance.now();
        simpleHash(str);
        const end = performance.now();
        latencies.push(Math.round((end - start) * 100) / 100);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;

      console.log(`\nsimpleHash() 延迟 (${iterations} 次迭代):`);
      console.log(`  平均：${avgLatency.toFixed(3)}ms`);

      expect(avgLatency).toBeLessThan(1); // < 1ms
    });
  });
});
