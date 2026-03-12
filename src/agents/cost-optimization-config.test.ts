/**
 * Unit tests for cost optimization configuration
 * 覆盖所有代码路径的完整测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  compressToolDescription,
  simpleHash,
  normalizeMessagesForComparison,
  getRecommendedCompactionModel,
  createOptimizedConfig,
  TOOL_DESCRIPTION_MAP,
  DESCRIPTION_PATTERNS_TO_SHORTEN,
  TOOL_COMPRESSION_CONFIG,
} from "./cost-optimization-config.js";

describe("cost-optimization-config - 完整路径测试", () => {
  describe("compressToolDescription - 所有路径覆盖", () => {
    it("应该使用预定义映射 - Bash", () => {
      const result = compressToolDescription("Bash", "任何描述");
      expect(result).toBe("exec(cmd, cwd?)");
    });

    it("应该使用预定义映射 - Read", () => {
      const result = compressToolDescription("Read", "任何描述");
      expect(result).toBe("read(path)");
    });

    it("应该使用预定义映射 - Write", () => {
      const result = compressToolDescription("Write", "任何描述");
      expect(result).toBe("write(path, content)");
    });

    it("应该使用预定义映射 - 大小写敏感测试", () => {
      expect(compressToolDescription("bash", "x")).toBe("exec(cmd, cwd?)");
      expect(compressToolDescription("READ", "x")).toBe("read(path)");
      expect(compressToolDescription("write", "x")).toBe("write(path, content)");
    });

    it("应该移除 'This tool allows you to' 短语", () => {
      const desc = "This tool allows you to search the web";
      const result = compressToolDescription("unknown", desc);
      expect(result).not.toContain("This tool allows you to");
    });

    it("应该移除 'Use this function to' 短语", () => {
      const desc = "Use this function to calculate the result";
      const result = compressToolDescription("unknown", desc);
      expect(result).not.toContain("Use this function to");
    });

    it("应该移除 'You can use this to' 短语", () => {
      const desc = "You can use this to get the weather";
      const result = compressToolDescription("unknown", desc);
      expect(result).not.toContain("You can use this to");
    });

    it("应该替换 'The following parameters are supported:'", () => {
      const desc = "The following parameters are supported: x, y";
      const result = compressToolDescription("unknown", desc);
      expect(result).toContain("Params:");
      expect(result).not.toContain("The following parameters are supported:");
    });

    it("应该替换 'Returns:' 为 '→'", () => {
      const desc = "Performs calculation. Returns: the result";
      const result = compressToolDescription("unknown", desc);
      expect(result).toContain("→");
      expect(result).not.toContain("Returns:");
    });

    it("应该移除 'Example:' 后的内容", () => {
      const desc = "Does something. Example: foo(bar)";
      const result = compressToolDescription("unknown", desc);
      expect(result).not.toContain("Example:");
    });

    it("应该移除 'For example:' 后的内容", () => {
      const desc = "Does something. For example: foo(bar)";
      const result = compressToolDescription("unknown", desc);
      expect(result).not.toContain("For example:");
    });

    it("应该截断超过 maxLength 的描述", () => {
      const longDesc = "x".repeat(300);
      const result = compressToolDescription("unknown_tool", longDesc);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result).toMatch(/\.\.\.$/);
    });

    it("应该处理未知工具 - 无模式匹配", () => {
      const desc = "A simple tool";
      const result = compressToolDescription("custom", desc);
      expect(result).toBe("A simple tool");
    });

    it("应该处理空描述", () => {
      const result = compressToolDescription("tool", "");
      expect(result).toBe("");
    });

    it("应该处理 undefined 描述", () => {
      // @ts-ignore
      const result = compressToolDescription("tool", undefined);
      expect(typeof result).toBe("string");
    });

    it("应该处理 null 描述", () => {
      // @ts-ignore
      const result = compressToolDescription("tool", null);
      expect(typeof result).toBe("string");
    });

    it("应该处理特殊字符", () => {
      const desc = "Tool with <special> & 'chars'";
      const result = compressToolDescription("unknown", desc);
      expect(result).toBe(desc);
    });

    it("应该处理 emoji", () => {
      const desc = "Tool with emoji 🚀 and text";
      const result = compressToolDescription("unknown", desc);
      expect(result).toBe(desc);
    });

    it("应该处理多行描述", () => {
      const desc = "Line 1\nLine 2\nLine 3";
      const result = compressToolDescription("unknown", desc);
      expect(result).toBe(desc);
    });

    it("应该处理超长描述无模式匹配", () => {
      const desc = "x".repeat(500);
      const result = compressToolDescription("unknown", desc);
      expect(result.length).toBeLessThanOrEqual(200);
    });
  });

  describe("simpleHash - 所有路径覆盖", () => {
    it("应该处理空字符串", () => {
      const result = simpleHash("");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("应该处理单字符", () => {
      const result = simpleHash("a");
      expect(typeof result).toBe("string");
    });

    it("应该处理长字符串", () => {
      const result = simpleHash("x".repeat(10000));
      expect(typeof result).toBe("string");
    });

    it("应该处理 unicode 字符", () => {
      const result = simpleHash("你好世界🚀");
      expect(typeof result).toBe("string");
    });

    it("相同输入应该产生相同输出", () => {
      const input = "test";
      const hash1 = simpleHash(input);
      const hash2 = simpleHash(input);
      expect(hash1).toBe(hash2);
    });

    it("不同输入应该产生不同输出", () => {
      const hash1 = simpleHash("test1");
      const hash2 = simpleHash("test2");
      expect(hash1).not.toBe(hash2);
    });

    it("应该处理特殊字符", () => {
      expect(() => simpleHash("!@#$%^&*()")).not.toThrow();
    });

    it("应该处理换行符", () => {
      const hash1 = simpleHash("a\nb");
      const hash2 = simpleHash("ab");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("normalizeMessagesForComparison - 所有路径覆盖", () => {
    it("应该处理空数组", () => {
      const result = normalizeMessagesForComparison([]);
      expect(result).toBe("");
    });

    it("应该处理单消息", () => {
      const result = normalizeMessagesForComparison([
        { role: "user", content: "Hello" }
      ]);
      expect(result).toBe("user:Hello");
    });

    it("应该处理多消息", () => {
      const result = normalizeMessagesForComparison([
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" }
      ]);
      expect(result).toBe("user:Hi|assistant:Hello");
    });

    it("应该处理 undefined role", () => {
      const result = normalizeMessagesForComparison([
        // @ts-ignore
        { content: "Hello" }
      ]);
      expect(result).toContain("unknown:Hello");
    });

    it("应该处理 null role", () => {
      const result = normalizeMessagesForComparison([
        // @ts-ignore
        { role: null, content: "Hello" }
      ]);
      expect(result).toContain("unknown:Hello");
    });

    it("应该处理 object content", () => {
      const result = normalizeMessagesForComparison([
        { role: "user", content: { type: "text", text: "Hello" } }
      ]);
      expect(result).toContain("user:");
    });

    it("应该处理 array content", () => {
      const result = normalizeMessagesForComparison([
        { role: "user", content: [{ type: "text", text: "Hi" }] }
      ]);
      expect(result).toContain("user:[");
    });

    it("应该处理 number content", () => {
      const result = normalizeMessagesForComparison([
        // @ts-ignore
        { role: "user", content: 123 }
      ]);
      expect(result).toBe("user:123");
    });

    it("应该处理 boolean content", () => {
      const result = normalizeMessagesForComparison([
        // @ts-ignore
        { role: "user", content: true }
      ]);
      expect(result).toBe("user:true");
    });

    it("应该处理 null content", () => {
      const result = normalizeMessagesForComparison([
        // @ts-ignore
        { role: "user", content: null }
      ]);
      expect(result).toBe("user:null");
    });

    it("应该处理 undefined content", () => {
      const result = normalizeMessagesForComparison([
        // @ts-ignore
        { role: "user", content: undefined }
      ]);
      expect(result).toBe("user:undefined");
    });
  });

  describe("getRecommendedCompactionModel - 所有路径覆盖", () => {
    it("应该返回 anthropic 推荐模型", () => {
      const result = getRecommendedCompactionModel("anthropic");
      expect(result).toContain("haiku");
    });

    it("应该返回 openrouter 推荐模型", () => {
      const result = getRecommendedCompactionModel("openrouter");
      expect(result).toContain("gemma");
    });

    it("应该返回 ollama 推荐模型", () => {
      const result = getRecommendedCompactionModel("ollama");
      expect(result).toContain("llama");
    });

    it("应该返回 azure 推荐模型", () => {
      const result = getRecommendedCompactionModel("azure");
      expect(result).toContain("gpt-4o-mini");
    });

    it("应该返回默认模型 - 未知 provider", () => {
      const result = getRecommendedCompactionModel("unknown");
      expect(result).toBe("openai/gpt-4o-mini");
    });

    it("应该返回默认模型 - 空字符串", () => {
      const result = getRecommendedCompactionModel("");
      expect(result).toBe("openai/gpt-4o-mini");
    });

    it("应该处理大小写", () => {
      expect(getRecommendedCompactionModel("ANTHROPIC")).toContain("haiku");
      expect(getRecommendedCompactionModel("Ollama")).toContain("llama");
    });
  });

  describe("createOptimizedConfig - 所有路径覆盖", () => {
    it("应该创建默认配置", () => {
      const config = createOptimizedConfig();
      expect(config.agents?.defaults?.compaction?.model).toBe("openai/gpt-4o-mini");
    });

    it("应该接受自定义 compactionModel", () => {
      const config = createOptimizedConfig({
        compactionModel: "custom/model",
      });
      expect(config.agents?.defaults?.compaction?.model).toBe("custom/model");
    });

    it("应该启用 cache 默认", () => {
      const config = createOptimizedConfig();
      expect((config as any).requestCache?.enabled).toBe(true);
    });

    it("应该禁用 cache", () => {
      const config = createOptimizedConfig({ enableCache: false });
      expect((config as any).requestCache).toBeUndefined();
    });

    it("应该启用 dedup 默认", () => {
      const config = createOptimizedConfig();
      expect((config as any).deduplication?.enabled).toBe(true);
    });

    it("应该禁用 dedup", () => {
      const config = createOptimizedConfig({ enableDedup: false });
      expect((config as any).deduplication).toBeUndefined();
    });

    it("应该启用 toolCompression 默认", () => {
      const config = createOptimizedConfig();
      expect((config as any).toolCompression).toBeDefined();
    });

    it("应该禁用 toolCompression", () => {
      const config = createOptimizedConfig({ enableToolCompression: false });
      expect((config as any).toolCompression).toBeUndefined();
    });

    it("应该配置本地模型", () => {
      const config = createOptimizedConfig({ useLocalModels: true });
      expect(config.agents?.defaults?.compaction?.model).toContain("ollama");
      expect(config.models?.providers?.ollama?.baseUrl).toBe("http://localhost:11434");
    });

    it("应该处理所有选项组合", () => {
      const config = createOptimizedConfig({
        compactionModel: "test/model",
        enableCache: false,
        enableDedup: false,
        enableToolCompression: false,
        useLocalModels: false,
      });
      expect(config.agents?.defaults?.compaction?.model).toBe("test/model");
      expect((config as any).requestCache).toBeUndefined();
      expect((config as any).deduplication).toBeUndefined();
      expect((config as any).toolCompression).toBeUndefined();
    });
  });

  describe("TOOL_DESCRIPTION_MAP - 完整性测试", () => {
    it("应该包含所有常用工具", () => {
      const expectedTools = [
        "Bash", "bash", "Read", "read", "Write", "write",
        "Edit", "edit", "Delete", "delete", "Copy", "copy",
        "Move", "move", "List", "list", "Glob", "glob",
        "web_fetch", "fetch", "navigate", "browser_navigate",
        "browser_click", "click", "browser_fill", "fill",
        "search", "google", "memory_add", "memory_search",
        "send_message", "reply", "generate_image",
      ];
      
      for (const tool of expectedTools) {
        expect(TOOL_DESCRIPTION_MAP[tool]).toBeDefined();
      }
    });

    it("所有映射应该是简洁的", () => {
      for (const [toolName, description] of Object.entries(TOOL_DESCRIPTION_MAP)) {
        expect(description.length).toBeLessThan(50);
        expect(description).not.toContain("This tool");
        expect(description).not.toContain("allows you to");
        expect(description).not.toContain("  "); // 无多余空格
      }
    });
  });

  describe("DESCRIPTION_PATTERNS_TO_SHORTEN - 模式测试", () => {
    it("应该包含所有预期模式", () => {
      expect(DESCRIPTION_PATTERNS_TO_SHORTEN.length).toBeGreaterThan(5);
    });

    it("所有模式应该是有效的 RegExp", () => {
      for (const { pattern } of DESCRIPTION_PATTERNS_TO_SHORTEN) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });

    it("所有替换应该是字符串", () => {
      for (const { replacement } of DESCRIPTION_PATTERNS_TO_SHORTEN) {
        expect(typeof replacement).toBe("string");
      }
    });
  });

  describe("TOOL_COMPRESSION_CONFIG - 配置测试", () => {
    it("应该包含所有配置项", () => {
      expect(TOOL_COMPRESSION_CONFIG).toHaveProperty("enabled");
      expect(TOOL_COMPRESSION_CONFIG).toHaveProperty("useShortFormat");
      expect(TOOL_COMPRESSION_CONFIG).toHaveProperty("removeExamples");
      expect(TOOL_COMPRESSION_CONFIG).toHaveProperty("maxLength");
    });

    it("应该使用正确的默认值", () => {
      expect(TOOL_COMPRESSION_CONFIG.enabled).toBe(true);
      expect(TOOL_COMPRESSION_CONFIG.useShortFormat).toBe(true);
      expect(TOOL_COMPRESSION_CONFIG.removeExamples).toBe(true);
      expect(TOOL_COMPRESSION_CONFIG.maxLength).toBe(200);
    });
  });
});
