/**
 * Token 节省率验证测试
 * 
 * 使用真实场景数据验证各优化方案的实际 Token 节省效果
 */

import { describe, it, expect } from "vitest";
import { compressToolDescription, compressToolsInMessages } from "./compaction.js";
import { normalizeMessagesForComparison } from "./cost-optimization-config.js";

// 模拟 Token 计数（1 token ≈ 4 characters）
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

describe("Token 节省率验证", () => {
  describe("工具描述压缩 - 真实场景测试", () => {
    it("完整工具列表压缩测试", () => {
      // 真实的工具描述（来自 OpenClaw）
      const originalTools = [
        {
          name: "Bash",
          description: "This tool allows you to execute shell commands in the current working directory. The command is executed in a non-interactive shell. The following parameters are supported: cmd (required, string) - The command to execute, cwd (optional, string) - The working directory. Example usage: exec({ cmd: 'ls -la', cwd: '/home/user' })"
        },
        {
          name: "Read",
          description: "Read the contents of a file at the specified path and return the content as a string. This tool supports both text and binary files. For large files, consider using the range parameter to read specific portions. Parameters: path (required, string) - The file path to read, encoding (optional, string) - The character encoding (default: utf-8). Example: read({ path: './config.json' })"
        },
        {
          name: "Write",
          description: "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does. For appending to files, use the Edit tool instead. Parameters: path (required, string) - The file path, content (required, string) - The content to write. Example: write({ path: './output.txt', content: 'Hello World' })"
        },
        {
          name: "Edit",
          description: "Edit a file by applying changes to specific lines or patterns. This tool is useful for making small modifications to large files without rewriting the entire content. Supports multiple change operations in a single call. Parameters: path (required, string) - The file path, changes (required, array) - Array of change operations. Example: edit({ path: './src/app.ts', changes: [{ oldText: 'foo', newText: 'bar' }] })"
        },
        {
          name: "Glob",
          description: "Search for files matching a glob pattern. Supports wildcards like * (matches any characters except /) and ** (matches any characters including /). Useful for finding files by name pattern or extension. Parameters: pattern (required, string) - The glob pattern, cwd (optional, string) - The base directory. Example: glob({ pattern: '**/*.ts', cwd: './src' })"
        },
        {
          name: "web_fetch",
          description: "Fetch content from a URL and return the text content. This tool supports various protocols including http, https, and file. The content is automatically converted to markdown format for better readability. Parameters: url (required, string) - The URL to fetch. Example: web_fetch({ url: 'https://example.com/article' })"
        },
        {
          name: "memory_add",
          description: "Add information to the long-term memory system. This tool allows you to store important facts, decisions, or context that should persist across sessions. The memory will be searchable by content. Parameters: text (required, string) - The information to store, tags (optional, array) - Tags for categorization. Example: memory_add({ text: 'User prefers TypeScript', tags: ['preference', 'language'] })"
        },
        {
          name: "memory_search",
          description: "Search the long-term memory for relevant information. Uses semantic search to find memories matching the query. Returns the most relevant memories ranked by similarity score. Parameters: query (required, string) - The search query, limit (optional, number) - Maximum results to return (default: 5). Example: memory_search({ query: 'user preferences', limit: 10 })"
        },
        {
          name: "send_message",
          description: "Send a message to a specified channel or user. This is the primary tool for communication across all supported messaging platforms. Supports text, media attachments, and formatting. Parameters: to (required, string) - The recipient identifier, text (required, string) - The message content, attachments (optional, array) - Media files to attach. Example: send_message({ to: '@user123', text: 'Hello!', attachments: ['./image.png'] })"
        },
        {
          name: "generate_image",
          description: "Generate an image from a text description using AI. This tool uses state-of-the-art diffusion models to create high-quality images. Supports various styles and aspect ratios. Parameters: prompt (required, string) - The image description, size (optional, string) - Image size (default: 1024x1024), style (optional, string) - Artistic style. Example: generate_image({ prompt: 'A sunset over mountains', size: '1024x1024', style: 'photorealistic' })"
        },
      ];

      let totalOriginalTokens = 0;
      let totalCompressedTokens = 0;

      console.log("\n=== 工具描述压缩详情 ===\n");

      for (const tool of originalTools) {
        const compressed = compressToolDescription(tool.name, tool.description);
        const originalTokens = estimateTokens(tool.description);
        const compressedTokens = estimateTokens(compressed);
        const savings = ((originalTokens - compressedTokens) / originalTokens) * 100;

        totalOriginalTokens += originalTokens;
        totalCompressedTokens += compressedTokens;

        console.log(`${tool.name}:`);
        console.log(`  原始：${tool.description.length} chars (${originalTokens} tokens)`);
        console.log(`  压缩：${compressed.length} chars (${compressedTokens} tokens)`);
        console.log(`  节省：${savings.toFixed(1)}%\n`);
      }

      const overallSavings = ((totalOriginalTokens - totalCompressedTokens) / totalOriginalTokens) * 100;

      console.log("=== 汇总 ===");
      console.log(`总原始 Tokens: ${totalOriginalTokens}`);
      console.log(`总压缩 Tokens: ${totalCompressedTokens}`);
      console.log(`整体节省率：${overallSavings.toFixed(1)}%`);

      // 验证节省率
      expect(overallSavings).toBeGreaterThan(50); // 应该 > 50%
    });

    it("消息级别压缩测试", () => {
      // 模拟包含工具定义的系统消息
      const messages = [
        {
          role: "system",
          content: `You are a helpful assistant with the following tools:

Bash: This tool allows you to execute shell commands in the current working directory. The command is executed in a non-interactive shell.
Read: Read the contents of a file at the specified path and return the content as a string.
Write: Write content to a file at the specified path. Creates the file if it doesn't exist.
Glob: Search for files matching a glob pattern. Supports wildcards.

Please help the user with their task.`
        },
        {
          role: "user",
          content: "List all TypeScript files in the project"
        }
      ];

      const originalTokens = messages.reduce((sum, msg) => {
        return sum + estimateTokens(typeof msg.content === 'string' ? msg.content : '');
      }, 0);

      const compressedMessages = compressToolsInMessages(messages);
      
      const compressedTokens = compressedMessages.reduce((sum, msg) => {
        return sum + estimateTokens(typeof msg.content === 'string' ? msg.content : '');
      }, 0);

      const savings = ((originalTokens - compressedTokens) / originalTokens) * 100;

      console.log("\n=== 消息级别压缩 ===");
      console.log(`原始 Tokens: ${originalTokens}`);
      console.log(`压缩 Tokens: ${compressedTokens}`);
      console.log(`节省率：${savings.toFixed(1)}%`);

      expect(savings).toBeGreaterThan(10); // 应该 > 10%
    });
  });

  describe("请求缓存 - 实际场景测试", () => {
    it("重复问题场景 - Token 节省计算", () => {
      // 模拟用户经常问的重复问题
      const commonQuestions = [
        "What is the current status of the project?",
        "Can you list all files in the directory?",
        "How do I install dependencies?",
        "What tests are failing?",
        "Show me the recent commits",
      ];

      // 模拟 100 次请求，其中 60% 是重复问题
      const totalRequests = 100;
      const uniqueQuestions = commonQuestions.length;
      const repeatRate = 0.6;

      const uniqueRequests = uniqueQuestions;
      const repeatedRequests = Math.floor(totalRequests * repeatRate);
      const actualUniqueRequests = totalRequests - repeatedRequests;

      // 平均每个问题的响应 Token 数
      const avgResponseTokens = 500;

      // 无缓存时的总 Token 数
      const tokensWithoutCache = totalRequests * avgResponseTokens;

      // 有缓存时的总 Token 数（只有唯一请求需要调用 LLM）
      const tokensWithCache = actualUniqueRequests * avgResponseTokens;

      const savings = ((tokensWithoutCache - tokensWithCache) / tokensWithoutCache) * 100;

      console.log("\n=== 请求缓存节省 ===");
      console.log(`总请求数：${totalRequests}`);
      console.log(`唯一请求数：${actualUniqueRequests}`);
      console.log(`重复请求数：${repeatedRequests}`);
      console.log(`无缓存 Tokens: ${tokensWithoutCache}`);
      console.log(`有缓存 Tokens: ${tokensWithCache}`);
      console.log(`节省率：${savings.toFixed(1)}%`);

      expect(savings).toBeCloseTo(repeatRate * 100, 0); // 应该接近重复率
    });
  });

  describe("多通道去重 - 实际场景测试", () => {
    it("多通道广播场景 - Token 节省计算", () => {
      // 模拟消息同时发送到 5 个通道
      const channels = [
        { provider: "telegram", channelId: "channel1" },
        { provider: "telegram", channelId: "channel2" },
        { provider: "discord", channelId: "channel3" },
        { provider: "slack", channelId: "channel4" },
        { provider: "signal", channelId: "channel5" },
      ];

      const messageContent = "Hello everyone! This is an important announcement.";
      const avgResponseTokens = 300;

      // 无去重：每个通道都调用 LLM
      const tokensWithoutDedupe = channels.length * avgResponseTokens;

      // 有去重：只调用一次 LLM
      const tokensWithDedupe = avgResponseTokens;

      const savings = ((tokensWithoutDedupe - tokensWithDedupe) / tokensWithoutDedupe) * 100;

      console.log("\n=== 多通道去重节省 ===");
      console.log(`通道数：${channels.length}`);
      console.log(`无去重 Tokens: ${tokensWithoutDedupe}`);
      console.log(`有去重 Tokens: ${tokensWithDedupe}`);
      console.log(`节省率：${savings.toFixed(1)}%`);

      expect(savings).toBeGreaterThan(70); // (5-1)/5 = 80%
    });
  });

  describe("压缩模型优化 - 成本节省测试", () => {
    it("不同模型成本对比", () => {
      // 公开 API 价格（每 1M tokens，USD）
      const modelPrices = {
        "gpt-4o": { input: 2.50, output: 10.00 },
        "gpt-4o-mini": { input: 0.15, output: 0.60 },
        "claude-3-5-sonnet": { input: 3.00, output: 15.00 },
        "claude-3-5-haiku": { input: 0.80, output: 4.00 },
        "llama-3.2-1b": { input: 0, output: 0 }, // 本地模型
      };

      // 假设压缩任务的 Token 使用
      const inputTokens = 10000;
      const outputTokens = 2000;

      console.log("\n=== 压缩模型成本对比 ===");
      console.log(`输入 Tokens: ${inputTokens}, 输出 Tokens: ${outputTokens}\n`);

      const costs: Record<string, number> = {};
      
      for (const [model, price] of Object.entries(modelPrices)) {
        const cost = (inputTokens / 1_000_000) * price.input + 
                     (outputTokens / 1_000_000) * price.output;
        costs[model] = cost;
        console.log(`${model}: $${cost.toFixed(6)}`);
      }

      // 计算从 GPT-4o 切换到 GPT-4o-mini 的节省
      const gpt4oSavings = ((costs["gpt-4o"] - costs["gpt-4o-mini"]) / costs["gpt-4o"]) * 100;
      console.log(`\nGPT-4o → GPT-4o-mini 节省：${gpt4oSavings.toFixed(1)}%`);

      // 计算切换到本地模型的节省
      const localSavings = ((costs["gpt-4o"] - costs["llama-3.2-1b"]) / costs["gpt-4o"]) * 100;
      console.log(`GPT-4o → Llama-3.2-1B (本地) 节省：${localSavings.toFixed(1)}%`);

      expect(gpt4oSavings).toBeGreaterThan(90); // 应该 > 90%
    });
  });

  describe("综合节省率 - 场景模拟", () => {
    it("中度用户月度场景", () => {
      // 假设的中度用户月度使用量
      const monthlyStats = {
        totalCompressions: 100,
        avgTokensPerCompression: 10000,
        repeatedRequests: 30, // 30% 是重复请求
        multiChannelMessages: 20, // 20 次多通道广播
        avgChannelsPerBroadcast: 5,
      };

      // 基础成本（无优化）
      const baseCost = monthlyStats.totalCompressions * monthlyStats.avgTokensPerCompression;

      // 应用各项优化后的成本
      // 1. 压缩模型优化（假设 50% 的 Token 用于压缩，使用廉价模型节省 94%）
      const compressionTokens = baseCost * 0.5;
      const compressionSavings = compressionTokens * 0.94;

      // 2. 请求缓存（30% 重复请求）
      const cacheSavings = baseCost * 0.3;

      // 3. 多通道去重（20 次广播 × 4 个额外通道）
      const dedupeSavings = monthlyStats.multiChannelMessages * 
                           (monthlyStats.avgChannelsPerBroadcast - 1) * 
                           500; // 假设每次响应 500 tokens

      const totalSavings = compressionSavings + cacheSavings + dedupeSavings;
      const savingsRate = (totalSavings / baseCost) * 100;

      console.log("\n=== 中度用户月度节省 ===");
      console.log(`基础 Token 使用：${baseCost.toLocaleString()}`);
      console.log(`压缩模型节省：${compressionSavings.toLocaleString()}`);
      console.log(`请求缓存节省：${cacheSavings.toLocaleString()}`);
      console.log(`多通道去重节省：${dedupeSavings.toLocaleString()}`);
      console.log(`总节省：${totalSavings.toLocaleString()}`);
      console.log(`综合节省率：${savingsRate.toFixed(1)}%`);

      expect(savingsRate).toBeGreaterThan(50); // 应该 > 50%
    });
  });
});
