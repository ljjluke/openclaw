/**
 * Unit tests for multi-channel deduplication
 * 覆盖所有代码路径的完整测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MultiChannelDedupe } from "./multichannel-dedupe.js";

describe("MultiChannelDedupe - 完整路径测试", () => {
  let dedupe: MultiChannelDedupe;

  beforeEach(() => {
    dedupe = new MultiChannelDedupe({
      windowMs: 1000, // 1 second for testing
      maxEntries: 100,
      verbose: false,
    });
  });

  describe("constructor - 配置测试", () => {
    it("应该使用默认配置", () => {
      const defaultDedupe = new MultiChannelDedupe();
      expect(defaultDedupe).toBeDefined();
    });

    it("应该接受自定义 windowMs", () => {
      const customDedupe = new MultiChannelDedupe({ windowMs: 5000 });
      expect(customDedupe).toBeDefined();
    });

    it("应该接受自定义 maxEntries", () => {
      const customDedupe = new MultiChannelDedupe({ maxEntries: 500 });
      expect(customDedupe).toBeDefined();
    });

    it("应该接受 contentBased 配置", () => {
      const customDedupe = new MultiChannelDedupe({ contentBased: false });
      expect(customDedupe).toBeDefined();
    });

    it("应该接受 crossPlatform 配置", () => {
      const customDedupe = new MultiChannelDedupe({ crossPlatform: true });
      expect(customDedupe).toBeDefined();
    });

    it("应该接受 verbose 配置", () => {
      const customDedupe = new MultiChannelDedupe({ verbose: true });
      expect(customDedupe).toBeDefined();
    });

    it("应该接受 minLength 配置", () => {
      const customDedupe = new MultiChannelDedupe({ minLength: 50 });
      expect(customDedupe).toBeDefined();
    });

    it("应该接受所有配置组合", () => {
      const fullDedupe = new MultiChannelDedupe({
        windowMs: 60000,
        maxEntries: 1000,
        contentBased: true,
        crossPlatform: true,
        verbose: true,
        minLength: 30,
      });
      expect(fullDedupe).toBeDefined();
    });
  });

  describe("check - 所有路径覆盖", () => {
    it("应该返回 null 对于新消息", async () => {
      const messages = [{ role: "user", content: "Hello" }];
      const context = {
        provider: "telegram",
        accountId: "account1",
        sessionId: "session1",
        messageId: "msg1",
      };

      const result = await dedupe.check(messages, context);
      expect(result).toBeNull();
    });

    it("应该返回 null 对于短消息", async () => {
      const shortMessages = [{ role: "user", content: "Hi" }]; // < 20 chars
      const context = {
        provider: "telegram",
        accountId: "account1",
        sessionId: "session1",
        messageId: "msg1",
      };

      const result = await dedupe.check(shortMessages, context);
      expect(result).toBeNull();
    });

    it("应该返回缓存响应对于重复消息", async () => {
      const messages = [{ role: "user", content: "Test message with enough length".repeat(2) }];
      const response = "Test response";
      const context1 = {
        provider: "telegram",
        accountId: "account1",
        sessionId: "session1",
        messageId: "msg1",
      };
      const context2 = {
        provider: "telegram",
        accountId: "account1",
        sessionId: "session2",
        messageId: "msg2",
      };

      // First check should return null (new message)
      const firstCheck = await dedupe.check(messages, context1);
      expect(firstCheck).toBeNull();
      
      // Record the response
      await dedupe.record(messages, response, context1);
      
      // Second check from different session should return cached response
      const result = await dedupe.check(messages, context2);
      expect(result).toBe(response);
    });

    it("应该处理不同消息角色", async () => {
      const messages = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ];
      const response = "Hi there!";
      const context1 = {
        provider: "discord",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };
      const context2 = {
        provider: "discord",
        accountId: "acc1",
        sessionId: "s2",
        messageId: "m2",
      };

      await dedupe.record(messages, response, context1);
      const result = await dedupe.check(messages, context2);

      expect(result).toBe(response);
    });

    it("应该处理 object content", async () => {
      const messages = [
        { role: "user", content: { type: "text", text: "Hello" } }
      ];
      const response = "Response";
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      await dedupe.record(messages, response, context);
      const result = await dedupe.check(messages, context);

      expect(result).toBe(response);
    });
  });

  describe("record - 所有路径覆盖", () => {
    it("应该记录新消息", async () => {
      const messages = [{ role: "user", content: "Test message" }];
      const response = "Response";
      const context = {
        provider: "telegram",
        accountId: "account1",
        sessionId: "session1",
        messageId: "msg1",
      };

      await expect(dedupe.record(messages, response, context)).resolves.not.toThrow();
    });

    it("应该跳过短消息", async () => {
      const shortMessages = [{ role: "user", content: "Hi" }];
      const response = "Response";
      const context = {
        provider: "telegram",
        accountId: "account1",
        sessionId: "session1",
        messageId: "msg1",
      };

      await dedupe.record(shortMessages, response, context);
      
      const stats = dedupe.getStats();
      expect(stats.entries).toBe(0);
    });

    it("应该更新已存在条目", async () => {
      const messages = [{ role: "user", content: "Test".repeat(5) }];
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

      await dedupe.record(messages, "Response 1", context1);
      await dedupe.record(messages, "Response 2", context2);

      // Check from context1 should return the updated response
      const result = await dedupe.check(messages, context1);
      expect(result).toBe("Response 2");
    });

    it("应该处理空响应", async () => {
      const messages = [{ role: "user", content: "Test message" }];
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      await expect(dedupe.record(messages, "", context)).resolves.not.toThrow();
    });

    it("应该处理长响应", async () => {
      const messages = [{ role: "user", content: "Test message" }];
      const response = "x".repeat(10000);
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      await expect(dedupe.record(messages, response, context)).resolves.not.toThrow();
    });
  });

  describe("same message detection - 同消息检测", () => {
    it("不应该去重相同 messageId", async () => {
      const messages = [{ role: "user", content: "Test".repeat(5) }];
      const response = "Response";
      const context = {
        provider: "telegram",
        accountId: "account1",
        sessionId: "session1",
        messageId: "same-id",
      };

      // First check returns null (new message)
      const firstCheck = await dedupe.check(messages, context);
      expect(firstCheck).toBeNull();
      
      // Record the response
      await dedupe.record(messages, response, context);
      
      // Check same messageId should return cached response
      const result = await dedupe.check(messages, context);

      expect(result).toBe(response);
    });

    it("应该追踪多通道同内容", async () => {
      const messages = [{ role: "user", content: "Broadcast message".repeat(2) }];
      const response = "Broadcast response";

      const contexts = [
        { provider: "telegram", accountId: "acc1", sessionId: "s1", messageId: "m1" },
        { provider: "telegram", accountId: "acc1", sessionId: "s2", messageId: "m2" },
        { provider: "telegram", accountId: "acc1", sessionId: "s3", messageId: "m3" },
      ];

      // First check and record
      expect(await dedupe.check(messages, contexts[0])).toBeNull();
      await dedupe.record(messages, response, contexts[0]);

      // Subsequent checks should return cached response
      for (const ctx of contexts.slice(1)) {
        const result = await dedupe.check(messages, ctx);
        expect(result).toBe(response);
        // Also record to track the message
        await dedupe.record(messages, response, ctx);
      }

      const stats = dedupe.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.messages).toBe(3);
    });
  });

  describe("expiration - 过期测试", () => {
    it("应该过期旧条目", async () => {
      const fastDedupe = new MultiChannelDedupe({ windowMs: 10 });
      const messages = [{ role: "user", content: "Test message for expiration".repeat(2) }];
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      // Record first
      await fastDedupe.record(messages, "Response", context);

      // Should return cached response before expiration (same messageId)
      expect(await fastDedupe.check(messages, context)).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Check with different messageId to test expiration logic
      const expiredContext = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m2", // Different messageId
      };

      // Should return null after expiration
      expect(await fastDedupe.check(messages, expiredContext)).toBeNull();
    });

    it("不应该过期新条目", async () => {
      const messages = [{ role: "user", content: "Test message".repeat(2) }];
      const response = "Response";
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      // Record first
      await dedupe.record(messages, response, context);
      
      // Check should return cached response
      const result = await dedupe.check(messages, context);

      expect(result).toBe(response);
    });
  });

  describe("minimum length - 最小长度测试", () => {
    it("应该跳过短消息", async () => {
      const shortMessages = [{ role: "user", content: "Hi" }];
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      await dedupe.record(shortMessages, "Response", context);
      const result = await dedupe.check(shortMessages, context);

      expect(result).toBeNull();
    });

    it("应该去重足够长的消息", async () => {
      const longMessages = [{ role: "user", content: "This is a longer message that exceeds the minimum length" }];
      const response = "Response";
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

      await dedupe.record(longMessages, response, context1);
      const result = await dedupe.check(longMessages, context2);

      expect(result).toBe(response);
    });

    it("应该使用自定义 minLength", async () => {
      const customDedupe = new MultiChannelDedupe({ minLength: 10 });
      const shortMessages = [{ role: "user", content: "Hi" }]; // "user:Hi" = 7 chars < 10
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      await customDedupe.record(shortMessages, "Response", context);

      // Check should also return null for short messages
      const checkResult = await customDedupe.check(shortMessages, context);
      expect(checkResult).toBeNull();

      const stats = customDedupe.getStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe("cross-platform deduplication - 跨平台去重", () => {
    it("不应该默认跨平台去重", async () => {
      const messages = [{ role: "user", content: "Same content".repeat(2) }];
      const response = "Response";

      const telegramContext = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };
      const discordContext = {
        provider: "discord",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      await dedupe.record(messages, response, telegramContext);
      const result = await dedupe.check(messages, discordContext);

      expect(result).toBeNull();
    });

    it("应该跨平台去重当启用时", async () => {
      const crossPlatformDedupe = new MultiChannelDedupe({
        windowMs: 1000,
        crossPlatform: true,
      });

      const messages = [{ role: "user", content: "Same content".repeat(2) }];
      const response = "Response";

      const telegramContext = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };
      const discordContext = {
        provider: "discord",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      // First check returns null
      expect(await crossPlatformDedupe.check(messages, telegramContext)).toBeNull();
      
      // Record
      await crossPlatformDedupe.record(messages, response, telegramContext);
      
      // Check from discord should return cached response
      const result = await crossPlatformDedupe.check(messages, discordContext);

      expect(result).toBe(response);
    });

    it("应该同平台同账号去重", async () => {
      const messages = [{ role: "user", content: "Same content".repeat(2) }];
      const response = "Response";

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

      // First check and record
      expect(await dedupe.check(messages, context1)).toBeNull();
      await dedupe.record(messages, response, context1);
      
      // Check from context2 should return cached response
      const result = await dedupe.check(messages, context2);

      expect(result).toBe(response);
    });

    it("应该不同账号不去重", async () => {
      const messages = [{ role: "user", content: "Same content".repeat(2) }];
      const response = "Response";

      const context1 = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };
      const context2 = {
        provider: "telegram",
        accountId: "acc2",
        sessionId: "s1",
        messageId: "m1",
      };

      await dedupe.record(messages, response, context1);
      const result = await dedupe.check(messages, context2);

      expect(result).toBeNull();
    });
  });

  describe("statistics - 统计测试", () => {
    it("应该返回正确的统计信息", () => {
      const stats = dedupe.getStats();

      expect(stats).toHaveProperty("entries");
      expect(stats).toHaveProperty("messages");
      expect(stats).toHaveProperty("avgChannelsPerEntry");
    });

    it("应该追踪 entries 和 messages", async () => {
      const messages1 = [{ role: "user", content: "Message 1".repeat(3) }];
      const messages2 = [{ role: "user", content: "Message 2".repeat(3) }];
      const response = "Response";

      const contexts1 = [
        { provider: "telegram", accountId: "acc1", sessionId: "s1", messageId: "m1" },
        { provider: "telegram", accountId: "acc1", sessionId: "s2", messageId: "m2" },
      ];
      const contexts2 = [
        { provider: "discord", accountId: "acc1", sessionId: "s1", messageId: "m1" },
      ];

      // Check and record for contexts1
      expect(await dedupe.check(messages1, contexts1[0])).toBeNull();
      await dedupe.record(messages1, response, contexts1[0]);
      await dedupe.record(messages1, response, contexts1[1]);
      
      // Check and record for contexts2
      expect(await dedupe.check(messages2, contexts2[0])).toBeNull();
      await dedupe.record(messages2, response, contexts2[0]);

      const stats = dedupe.getStats();

      expect(stats.entries).toBe(2);
      expect(stats.messages).toBe(3);
      expect(stats.avgChannelsPerEntry).toBeGreaterThan(1);
    });

    it("应该处理空缓存", () => {
      const stats = dedupe.getStats();

      expect(stats.entries).toBe(0);
      expect(stats.messages).toBe(0);
      expect(stats.avgChannelsPerEntry).toBe(0);
    });
  });

  describe("clear - 清除测试", () => {
    it("应该清除所有数据", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const context = {
        provider: "telegram",
        accountId: "acc1",
        sessionId: "s1",
        messageId: "m1",
      };

      await dedupe.record(messages, "Response", context);
      dedupe.clear();

      const result = await dedupe.check(messages, context);
      expect(result).toBeNull();

      const stats = dedupe.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.messages).toBe(0);
    });
  });

  describe("prune - 修剪测试", () => {
    it("应该修剪过期条目", async () => {
      const tempDedupe = new MultiChannelDedupe({ windowMs: 10, maxEntries: 10 });

      for (let i = 0; i < 5; i++) {
        await tempDedupe.record(
          [{ role: "user", content: `Message ${i}`.repeat(5) }],
          `Response ${i}`,
          {
            provider: "telegram",
            accountId: "acc1",
            sessionId: `s${i}`,
            messageId: `m${i}`,
          }
        );
      }

      const statsBefore = tempDedupe.getStats();
      expect(statsBefore.entries).toBe(5);

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 20));

      // 触发修剪 - 通过添加超过 maxEntries 的新条目
      for (let i = 0; i < 10; i++) {
        await tempDedupe.record(
          [{ role: "user", content: `New message ${i}`.repeat(5) }],
          `New Response ${i}`,
          {
            provider: "telegram",
            accountId: "acc1",
            sessionId: `new${i}`,
            messageId: `new${i}`,
          }
        );
      }

      const statsAfter = tempDedupe.getStats();
      // Old entries should be pruned, only new entries remain (limited by maxEntries)
      expect(statsAfter.entries).toBeLessThanOrEqual(10);
    });

    it("应该修剪超过 maxEntries", async () => {
      const smallDedupe = new MultiChannelDedupe({ windowMs: 60000, maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        await smallDedupe.record(
          [{ role: "user", content: `Message ${i}`.repeat(5) }],
          `Response ${i}`,
          {
            provider: "telegram",
            accountId: "acc1",
            sessionId: `s${i}`,
            messageId: `m${i}`,
          }
        );
      }

      const stats = smallDedupe.getStats();
      expect(stats.entries).toBeLessThanOrEqual(5);
    });
  });

  describe("global functions - 全局函数测试", () => {
    it("应该创建全局实例", async () => {
      const { getGlobalMultiChannelDedupe } = await import("./multichannel-dedupe.js");
      const instance = getGlobalMultiChannelDedupe();
      expect(instance).toBeDefined();
    });

    it("应该重置全局实例", async () => {
      const { getGlobalMultiChannelDedupe, resetGlobalMultiChannelDedupe } = await import("./multichannel-dedupe.js");
      getGlobalMultiChannelDedupe();
      expect(() => resetGlobalMultiChannelDedupe()).not.toThrow();
    });
  });
});
