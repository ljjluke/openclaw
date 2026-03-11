/**
 * Unit tests for request cache
 * 覆盖所有代码路径的完整测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RequestCache, createCachedLLMWrapper } from "../request-cache.js";

describe("RequestCache - 完整路径测试", () => {
  let cache: RequestCache;

  beforeEach(() => {
    cache = new RequestCache({
      ttlMs: 1000, // 1 second for testing
      maxSize: 100,
      verbose: false,
    });
  });

  describe("constructor - 配置测试", () => {
    it("应该使用默认配置", () => {
      const defaultCache = new RequestCache();
      expect(defaultCache).toBeDefined();
    });

    it("应该接受自定义 ttlMs", () => {
      const customCache = new RequestCache({ ttlMs: 5000 });
      expect(customCache).toBeDefined();
    });

    it("应该接受自定义 maxSize", () => {
      const customCache = new RequestCache({ maxSize: 500 });
      expect(customCache).toBeDefined();
    });

    it("应该接受 verbose 模式", () => {
      const verboseCache = new RequestCache({ verbose: true });
      expect(verboseCache).toBeDefined();
    });

    it("应该接受 semanticSimilarity 配置", () => {
      const semanticCache = new RequestCache({ semanticSimilarity: true });
      expect(semanticCache).toBeDefined();
    });

    it("应该接受 similarityThreshold 配置", () => {
      const thresholdCache = new RequestCache({ similarityThreshold: 0.9 });
      expect(thresholdCache).toBeDefined();
    });

    it("应该接受所有配置组合", () => {
      const fullCache = new RequestCache({
        ttlMs: 60000,
        maxSize: 1000,
        verbose: true,
        semanticSimilarity: true,
        similarityThreshold: 0.95,
      });
      expect(fullCache).toBeDefined();
    });
  });

  describe("check - 所有路径覆盖", () => {
    it("应该返回 null 对于 undefined key", async () => {
      // @ts-ignore
      const result = await cache.check(undefined);
      expect(result).toBeNull();
    });

    it("应该返回 null 对于 null key", async () => {
      // @ts-ignore
      const result = await cache.check(null);
      expect(result).toBeNull();
    });

    it("应该返回 null 对于空消息数组", async () => {
      const result = await cache.check([]);
      expect(result).toBeNull();
    });

    it("应该返回 null 对于未缓存的请求", async () => {
      const messages = [{ role: "user", content: "Hello" }];
      const result = await cache.check(messages);
      expect(result).toBeNull();
    });

    it("应该返回缓存结果对于匹配的请求", async () => {
      const messages = [{ role: "user", content: "Test message" }];
      const response = "Test response";

      await cache.set(messages, response);
      const result = await cache.check(messages);

      expect(result).not.toBeNull();
      expect(result?.response).toBe(response);
    });

    it("应该返回缓存结果包含 metadata", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const response = "Response";
      const metadata = { model: "gpt-4", provider: "openai" };

      await cache.set(messages, response, metadata);
      const result = await cache.check(messages);

      expect(result?.metadata).toEqual(metadata);
    });

    it("应该区分不同角色的消息", async () => {
      const messages1 = [{ role: "user", content: "Hello" }];
      const messages2 = [{ role: "system", content: "Hello" }];
      const response = "Response";

      await cache.set(messages1, response);
      
      const result1 = await cache.check(messages1);
      const result2 = await cache.check(messages2);

      expect(result1?.response).toBe(response);
      expect(result2).toBeNull();
    });

    it("应该处理多消息数组", async () => {
      const messages = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const response = "How can I help?";

      await cache.set(messages, response);
      const result = await cache.check(messages);

      expect(result?.response).toBe(response);
    });

    it("应该处理 object content", async () => {
      const messages = [
        { role: "user", content: { type: "text", text: "Hello" } }
      ];
      const response = "Response";

      await cache.set(messages, response);
      const result = await cache.check(messages);

      expect(result?.response).toBe(response);
    });
  });

  describe("set - 所有路径覆盖", () => {
    it("应该设置缓存无 metadata", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const response = "Response";

      await expect(cache.set(messages, response)).resolves.not.toThrow();
    });

    it("应该设置缓存有 metadata", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const response = "Response";
      const metadata = { model: "gpt-4", sessionId: "123" };

      await expect(cache.set(messages, response, metadata)).resolves.not.toThrow();
    });

    it("应该处理空响应", async () => {
      const messages = [{ role: "user", content: "Test" }];
      
      await expect(cache.set(messages, "")).resolves.not.toThrow();
    });

    it("应该处理长响应", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const response = "x".repeat(10000);

      await expect(cache.set(messages, response)).resolves.not.toThrow();
    });

    it("应该更新已存在的 key", async () => {
      const messages = [{ role: "user", content: "Test" }];
      
      await cache.set(messages, "Response 1");
      await cache.set(messages, "Response 2");

      const result = await cache.check(messages);
      expect(result?.response).toBe("Response 2");
    });
  });

  describe("expiration - 过期测试", () => {
    it("应该过期旧条目", async () => {
      const fastCache = new RequestCache({ ttlMs: 10, maxSize: 100 });
      const messages = [{ role: "user", content: "Test" }];

      await fastCache.set(messages, "Response");
      
      // 应该初始缓存
      expect(await fastCache.check(messages)).not.toBeNull();
      
      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 20));
      
      // 应该已过期
      expect(await fastCache.check(messages)).toBeNull();
    });

    it("不应该过期新条目", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const response = "Response";

      await cache.set(messages, response);
      const result = await cache.check(messages);

      expect(result).not.toBeNull();
      expect(result?.response).toBe(response);
    });
  });

  describe("size limits - 大小限制测试", () => {
    it("应该尊重 maxSize 限制", async () => {
      const smallCache = new RequestCache({ ttlMs: 60000, maxSize: 5 });

      for (let i = 0; i < 10; i++) {
        await smallCache.set(
          [{ role: "user", content: `Message ${i}` }],
          `Response ${i}`
        );
      }

      const stats = smallCache.getStats();
      expect(stats.size).toBeLessThanOrEqual(5);
    });

    it("应该修剪过期条目", async () => {
      const tempCache = new RequestCache({ ttlMs: 10, maxSize: 100 });

      for (let i = 0; i < 50; i++) {
        await tempCache.set(
          [{ role: "user", content: `Message ${i}` }],
          `Response ${i}`
        );
      }

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 20));

      // 触发修剪
      await tempCache.set([{ role: "user", content: "New" }], "New Response");

      const stats = tempCache.getStats();
      expect(stats.size).toBeLessThan(50);
    });
  });

  describe("getStats - 统计测试", () => {
    it("应该返回正确的统计信息", async () => {
      const messages = [{ role: "user", content: "Test" }];

      // Miss
      await cache.check(messages);
      
      // Set
      await cache.set(messages, "Response");
      
      // Hit
      await cache.check(messages);
      
      const stats = cache.getStats();
      
      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("hits");
      expect(stats).toHaveProperty("misses");
      expect(stats).toHaveProperty("hitRate");
      expect(stats).toHaveProperty("estimatedTokensSaved");
    });

    it("应该追踪 hits 和 misses", async () => {
      const messages = [{ role: "user", content: "Test" }];

      await cache.check(messages); // Miss
      await cache.set(messages, "Response");
      await cache.check(messages); // Hit
      await cache.check(messages); // Hit
      
      const stats = cache.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it("应该计算正确的 hitRate", async () => {
      const messages = [{ role: "user", content: "Test" }];

      await cache.check(messages); // Miss
      await cache.set(messages, "Response");
      await cache.check(messages); // Hit
      
      const stats = cache.getStats();
      
      expect(stats.hitRate).toBe(50); // 1 hit / 2 total = 50%
    });

    it("应该处理零请求", () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it("应该估算 tokens saved", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const response = "This is a test response";

      await cache.set(messages, response);
      
      const stats = cache.getStats();
      expect(stats.estimatedTokensSaved).toBeGreaterThan(0);
    });
  });

  describe("clear - 清除测试", () => {
    it("应该清除所有条目", async () => {
      const messages = [{ role: "user", content: "Test" }];
      
      await cache.set(messages, "Response");
      cache.clear();
      
      const result = await cache.check(messages);
      expect(result).toBeNull();
    });

    it("应该重置统计", async () => {
      const messages = [{ role: "user", content: "Test" }];
      
      await cache.check(messages); // Miss
      await cache.set(messages, "Response");
      await cache.check(messages); // Hit
      
      cache.clear();
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe("delete - 删除测试", () => {
    it("应该删除特定条目", async () => {
      const messages = [{ role: "user", content: "Test" }];
      
      await cache.set(messages, "Response");
      const deleted = cache.delete(messages);
      
      expect(deleted).toBe(true);
      expect(await cache.check(messages)).toBeNull();
    });

    it("应该返回 false 对于不存在的条目", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const deleted = cache.delete(messages);
      expect(deleted).toBe(false);
    });

    it("应该处理空消息", async () => {
      // @ts-ignore
      const deleted = cache.delete([]);
      expect(typeof deleted).toBe("boolean");
    });
  });

  describe("getKeys - 调试测试", () => {
    it("应该返回所有缓存 keys", async () => {
      await cache.set([{ role: "user", content: "Test 1" }], "Response 1");
      await cache.set([{ role: "user", content: "Test 2" }], "Response 2");
      
      const keys = cache.getKeys();
      expect(keys.length).toBe(2);
    });

    it("应该返回空数组对于空缓存", () => {
      const keys = cache.getKeys();
      expect(keys).toEqual([]);
    });
  });
});

describe("createCachedLLMWrapper - 包装器测试", () => {
  it("应该用缓存包装 LLM 函数", async () => {
    const cache = new RequestCache({ ttlMs: 60000, maxSize: 100 });
    let callCount = 0;

    const mockLLM = async (messages: Array<{ role?: string; content?: unknown }>) => {
      callCount++;
      return `Response to ${JSON.stringify(messages)}`;
    };

    const cachedLLM = createCachedLLMWrapper(cache, mockLLM);
    const messages = [{ role: "user", content: "Test" }];

    // 第一次调用 - 应该调用 LLM
    const result1 = await cachedLLM(messages);
    expect(callCount).toBe(1);

    // 第二次调用 - 应该使用缓存
    const result2 = await cachedLLM(messages);
    expect(callCount).toBe(1); // 仍然 1
    expect(result2).toBe(result1);
  });

  it("应该处理不同的消息", async () => {
    const cache = new RequestCache({ ttlMs: 60000, maxSize: 100 });
    let callCount = 0;

    const mockLLM = async () => {
      callCount++;
      return "Response";
    };

    const cachedLLM = createCachedLLMWrapper(cache, mockLLM);

    await cachedLLM([{ role: "user", content: "Test 1" }]);
    await cachedLLM([{ role: "user", content: "Test 2" }]);
    await cachedLLM([{ role: "user", content: "Test 1" }]); // 缓存命中

    expect(callCount).toBe(2); // 只有 2 次唯一调用
  });

  it("应该处理空响应", async () => {
    const cache = new RequestCache({ ttlMs: 60000, maxSize: 100 });
    const mockLLM = async () => "";

    const cachedLLM = createCachedLLMWrapper(cache, mockLLM);
    const messages = [{ role: "user", content: "Test" }];

    await cachedLLM(messages);
    const result = await cachedLLM(messages);

    expect(result).toBe("");
  });
});
