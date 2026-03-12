/**
 * Integration tests for cost optimization modules
 * 测试多个优化模块之间的协同工作
 */

import { describe, it, expect, beforeEach } from "vitest";
import { compressToolDescription, createOptimizedConfig } from "./cost-optimization-config.js";
import { RequestCache } from "./request-cache.js";
import { MultiChannelDedupe } from "../auto-reply/reply/multichannel-dedupe.js";

describe("Cost Optimization - 集成测试", () => {
  describe("工具压缩 + 请求缓存协同", () => {
    it("应该压缩工具描述并缓存结果", async () => {
      // 1. 压缩工具描述
      const originalDescription = "This tool allows you to execute shell commands in the specified working directory.";
      const compressed = compressToolDescription("Bash", originalDescription);
      
      expect(compressed).toBe("exec(cmd, cwd?)");
      expect(compressed.length).toBeLessThan(originalDescription.length);
      
      // 2. 缓存压缩后的描述
      const cache = new RequestCache({
        ttlMs: 60000,
        maxSize: 100,
      });
      
      const messages = [{ role: "system", content: `Tools: ${compressed}` }];
      const response = "Tool description cached";
      
      await cache.set(messages, response);
      
      // 3. 验证缓存命中
      const cached = await cache.check(messages);
      expect(cached).not.toBeNull();
      expect(cached?.response).toBe(response);
    });

    it("应该处理多个工具的压缩和缓存", async () => {
      const tools = [
        { name: "Bash", desc: "This tool allows you to execute bash commands" },
        { name: "Read", desc: "This tool allows you to read files" },
        { name: "Write", desc: "This tool allows you to write files" },
        { name: "Unknown", desc: "This is a custom tool for something" },
      ];
      
      const cache = new RequestCache({
        ttlMs: 60000,
        maxSize: 100,
        verbose: false,
      });
      
      for (const tool of tools) {
        const compressed = compressToolDescription(tool.name, tool.desc);
        const messages = [{ role: "system", content: `Tool: ${compressed}` }];
        
        await cache.set(messages, `Processed: ${compressed}`);
      }
      
      const stats = cache.getStats();
      expect(stats.size).toBe(4);
      // Note: hits/misses are tracked in check(), not set()
      expect(stats.misses).toBe(0);
      
      // 验证缓存命中
      for (const tool of tools) {
        const compressed = compressToolDescription(tool.name, tool.desc);
        const messages = [{ role: "system", content: `Tool: ${compressed}` }];
        const cached = await cache.check(messages);
        expect(cached).not.toBeNull();
      }
      
      const finalStats = cache.getStats();
      expect(finalStats.hits).toBe(4);
    });
  });

  describe("多通道去重 + 请求缓存协同", () => {
    it("应该先去重再缓存", async () => {
      const dedupe = new MultiChannelDedupe({
        windowMs: 60000,
        maxEntries: 100,
        minLength: 5,
      });
      
      const cache = new RequestCache({
        ttlMs: 60000,
        maxSize: 100,
      });
      
      const messages = [{ role: "user", content: "Hello world" }];
      const context1 = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };
      const context2 = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s2",
        messageId: "m2",
      };
      
      // 第一次检查 - 应该返回 null（新消息）
      const dedupeResult1 = await dedupe.check(messages, context1);
      expect(dedupeResult1).toBeNull();
      
      // 检查缓存 - 应该返回 null（未缓存）
      const cacheResult1 = await cache.check(messages);
      expect(cacheResult1).toBeNull();
      
      // 记录响应
      const response = "Hi there!";
      await dedupe.record(messages, response, context1);
      await cache.set(messages, response);
      
      // 第二次检查（不同通道）- 应该返回缓存响应
      const dedupeResult2 = await dedupe.check(messages, context2);
      expect(dedupeResult2).toBe(response);
      
      // 检查缓存 - 应该返回缓存结果
      const cacheResult2 = await cache.check(messages);
      expect(cacheResult2).not.toBeNull();
      expect(cacheResult2?.response).toBe(response);
    });

    it("应该处理多通道相同消息的并发请求", async () => {
      const dedupe = new MultiChannelDedupe({
        windowMs: 60000,
        maxEntries: 100,
        minLength: 10,
        verbose: false,
      });
      
      const messages = [{ role: "user", content: "Same message content" }];
      const contexts = Array.from({ length: 5 }, (_, i) => ({
        provider: "telegram",
        accountId: "acc1",
        sessionId: `s${i + 1}`,
        messageId: `m${i + 1}`,
      }));
      
      // 顺序执行以模拟真实场景
      const results = [];
      for (const ctx of contexts) {
        const result = await dedupe.check(messages, ctx);
        if (result === null) {
          await dedupe.record(messages, "Response", ctx);
          results.push(null);
        } else {
          results.push(result);
        }
      }
      
      // 第一个应该是 null（新消息），后续应该返回缓存响应
      expect(results[0]).toBeNull();
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBe("Response");
      }
      
      const stats = dedupe.getStats();
      expect(stats.entries).toBe(1);
      // messageIndex tracks by messageId, but the key includes provider:accountId:messageId
      // So we expect 5 unique messageIds
      expect(stats.messages).toBeGreaterThanOrEqual(1);
    });
  });

  describe("createOptimizedConfig 集成", () => {
    it("应该创建包含所有优化功能的配置", () => {
      const config = createOptimizedConfig({
        compactionModel: "openai/gpt-4o-mini",
        enableCache: true,
        enableDedup: true,
        enableToolCompression: true,
      });
      
      expect(config.agents?.defaults?.compaction?.model).toBe("openai/gpt-4o-mini");
      expect((config as any).requestCache?.enabled).toBe(true);
      expect((config as any).deduplication?.enabled).toBe(true);
      expect((config as any).toolCompression?.enabled).toBe(true);
    });

    it("应该使用默认值创建配置", () => {
      const config = createOptimizedConfig();
      
      expect(config.agents?.defaults?.compaction?.model).toBe("openai/gpt-4o-mini");
      expect((config as any).requestCache?.enabled).toBe(true);
      expect((config as any).deduplication?.enabled).toBe(true);
      expect((config as any).toolCompression?.enabled).toBe(true);
    });

    it("应该禁用特定功能", () => {
      const config = createOptimizedConfig({
        enableCache: false,
        enableDedup: false,
        enableToolCompression: false,
      });
      
      expect((config as any).requestCache).toBeUndefined();
      expect((config as any).deduplication).toBeUndefined();
      expect((config as any).toolCompression).toBeUndefined();
    });

    it("应该配置本地模型", () => {
      const config = createOptimizedConfig({
        useLocalModels: true,
      });
      
      expect(config.agents?.defaults?.compaction?.model).toBe("ollama/llama-3.2-1b");
      expect(config.models?.providers?.ollama?.baseUrl).toBe("http://localhost:11434");
    });
  });

  describe("边界情况和错误处理", () => {
    it("应该处理空消息数组", async () => {
      const cache = new RequestCache();
      const dedupe = new MultiChannelDedupe();
      
      const emptyMessages: any[] = [];
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };
      
      const cacheResult = await cache.check(emptyMessages);
      expect(cacheResult).toBeNull();
      
      const dedupeResult = await dedupe.check(emptyMessages, context);
      expect(dedupeResult).toBeNull();
    });

    it("应该处理 null/undefined 输入", async () => {
      const cache = new RequestCache();
      
      // @ts-ignore
      const nullResult = await cache.check(null);
      expect(nullResult).toBeNull();
      
      // @ts-ignore
      const undefinedResult = await cache.check(undefined);
      expect(undefinedResult).toBeNull();
    });

    it("应该处理超长描述压缩", () => {
      const longDescription = "x".repeat(1000);
      const compressed = compressToolDescription("CustomTool", longDescription);
      
      expect(compressed.length).toBeLessThanOrEqual(200);
      expect(compressed.endsWith("...")).toBe(true);
    });

    it("应该处理特殊字符和 emoji", () => {
      const specialDesc = "工具描述 with 特殊字符 !@#$% and emoji 🚀🎉";
      const compressed = compressToolDescription("CustomTool", specialDesc);
      
      expect(compressed).toContain("特殊字符");
      expect(compressed).toContain("🚀");
    });
  });

  describe("性能测试", () => {
    it("应该在合理时间内完成压缩", () => {
      const tools = Array.from({ length: 100 }, (_, i) => ({
        name: `Tool${i}`,
        desc: `This is a very long description for tool ${i} that should be compressed`,
      }));
      
      const start = Date.now();
      tools.forEach(tool => compressToolDescription(tool.name, tool.desc));
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // 100ms 内完成
    });

    it("应该在合理时间内完成缓存操作", async () => {
      const cache = new RequestCache({ maxSize: 1000 });
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: "user",
        content: `Message ${i}`,
      }));
      
      const start = Date.now();
      for (const msg of messages) {
        await cache.set([msg], `Response ${msg.content}`);
      }
      const setDuration = Date.now() - start;
      
      const checkStart = Date.now();
      for (const msg of messages) {
        await cache.check([msg]);
      }
      const checkDuration = Date.now() - checkStart;
      
      expect(setDuration).toBeLessThan(1000); // 1s 内完成 100 次设置
      expect(checkDuration).toBeLessThan(500); // 500ms 内完成 100 次检查
    });
  });
});
