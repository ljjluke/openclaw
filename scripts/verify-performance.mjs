/**
 * 性能验证独立脚本
 * 
 * 直接运行获取真实性能数据，无需测试框架
 * 
 * 运行方式：node scripts/verify-performance.mjs
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 简单哈希函数
function simpleHash(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// 工具描述映射表
const TOOL_DESCRIPTION_MAP = {
  "Bash": "exec(cmd, cwd?)",
  "bash": "exec(cmd, cwd?)",
  "Read": "read(path)",
  "read": "read(path)",
  "Write": "write(path, content)",
  "write": "write(path, content)",
  "Edit": "edit(path, changes)",
  "edit": "edit(path, changes)",
  "Glob": "glob(pattern)",
  "glob": "glob(pattern)",
  "List": "list(dir)",
  "list": "list(dir)",
  "web_fetch": "fetch(url)",
  "memory_add": "add(text)",
  "memory_search": "search(query)",
  "send_message": "send(to, text)",
  "generate_image": "img(prompt)",
};

// 压缩模式
const DESCRIPTION_PATTERNS = [
  { pattern: /This tool allows you to\s+/gi, replacement: "" },
  { pattern: /Use this function to\s+/gi, replacement: "" },
  { pattern: /The following parameters are supported:\s*/gi, replacement: "Params: " },
  { pattern: /Example:\s*[\s\S]*?(?=\n\n|\n[A-Z]|\Z)/gi, replacement: "" },
];

function compressToolDescription(toolName, description) {
  const mapped = TOOL_DESCRIPTION_MAP[toolName];
  if (mapped) return mapped;

  let compressed = description;
  for (const { pattern, replacement } of DESCRIPTION_PATTERNS) {
    compressed = compressed.replace(pattern, replacement);
  }
  if (compressed.length > 200) {
    compressed = compressed.slice(0, 197) + "...";
  }
  return compressed.trim();
}

// 内存测量
function getMemoryUsageMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

// 延迟测量
function measureLatencyMs(fn) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return { result, latencyMs: Math.round((end - start) * 100) / 100 };
}

// 测试报告
console.log("=".repeat(60));
console.log("OpenClaw Token 优化 - 性能验证报告");
console.log("=".repeat(60));
console.log(`运行时间：${new Date().toISOString()}`);
console.log(`Node 版本：${process.version}`);
console.log("");

// ========== 测试 1: 工具描述压缩性能 ==========
console.log("\n" + "=".repeat(60));
console.log("测试 1: 工具描述压缩性能");
console.log("=".repeat(60));

const toolTestCases = [
  { name: "Bash", desc: "This tool allows you to execute shell commands in the current working directory. The following parameters are supported: cmd (required), cwd (optional). Example: exec('ls -la')" },
  { name: "Read", desc: "Read the contents of a file at the specified path and return the content as a string. Supports both text and binary files." },
  { name: "Write", desc: "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does." },
  { name: "custom_tool", desc: "A custom tool that performs some special operation with multiple parameters." },
];

// 延迟测试
const iterations = 10000;
let totalLatency = 0;

for (let i = 0; i < iterations; i++) {
  const testCase = toolTestCases[i % toolTestCases.length];
  const { latencyMs } = measureLatencyMs(() => 
    compressToolDescription(testCase.name, testCase.desc)
  );
  totalLatency += latencyMs;
}

const avgLatency = totalLatency / iterations;
console.log(`\n压缩延迟 (${iterations} 次迭代):`);
console.log(`  平均：${avgLatency.toFixed(3)}ms`);
console.log(`  每次：${(avgLatency * 1000).toFixed(2)}μs`);

// 压缩率测试
console.log("\n工具描述压缩详情:");
let totalOriginal = 0;
let totalCompressed = 0;

for (const testCase of toolTestCases) {
  const compressed = compressToolDescription(testCase.name, testCase.desc);
  totalOriginal += testCase.desc.length;
  totalCompressed += compressed.length;
  const savings = ((testCase.desc.length - compressed.length) / testCase.desc.length) * 100;
  
  console.log(`  ${testCase.name}:`);
  console.log(`    原始：${testCase.desc.length} chars`);
  console.log(`    压缩：${compressed.length} chars (${compressed.substring(0, 50)}${compressed.length > 50 ? '...' : ''})`);
  console.log(`    节省：${savings.toFixed(1)}%`);
}

const overallSavings = ((totalOriginal - totalCompressed) / totalOriginal) * 100;
console.log(`\n整体压缩率：${overallSavings.toFixed(1)}%`);

// ========== 测试 2: 哈希函数性能 ==========
console.log("\n" + "=".repeat(60));
console.log("测试 2: 哈希函数性能");
console.log("=".repeat(60));

const hashTestStrings = [
  "Short message",
  "A longer message with more content to hash",
  "x".repeat(1000),
  JSON.stringify({ role: "user", content: "Hello" }),
];

let hashTotalLatency = 0;
for (let i = 0; i < iterations; i++) {
  const str = hashTestStrings[i % hashTestStrings.length];
  const { latencyMs } = measureLatencyMs(() => simpleHash(str));
  hashTotalLatency += latencyMs;
}

const hashAvgLatency = hashTotalLatency / iterations;
console.log(`\n哈希延迟 (${iterations} 次迭代):`);
console.log(`  平均：${hashAvgLatency.toFixed(3)}ms`);
console.log(`  每次：${(hashAvgLatency * 1000).toFixed(2)}μs`);

// ========== 测试 3: 内存占用测试 ==========
console.log("\n" + "=".repeat(60));
console.log("测试 3: 内存占用测试");
console.log("=".repeat(60));

const initialMemory = getMemoryUsageMB();

// 模拟缓存数据结构
const cacheMap = new Map();
const messageIndex = new Map();

// 添加 1000 个条目
for (let i = 0; i < 1000; i++) {
  const contentHash = simpleHash(`message-${i}`);
  cacheMap.set(contentHash, {
    response: `Response ${i}`.repeat(10),
    timestamp: Date.now(),
    channels: [
      { provider: "telegram", accountId: "acc1", sessionId: `sess${i}`, messageId: `msg${i}` },
    ],
  });
  messageIndex.set(`msg${i}`, contentHash);
}

const finalMemory = getMemoryUsageMB();
const memoryDelta = finalMemory - initialMemory;

console.log(`\n缓存内存占用 (1000 条目):`);
console.log(`  增加：${memoryDelta.toFixed(2)} MB`);
console.log(`  每条目：${(memoryDelta * 1024).toFixed(2)} KB`);

// 估算 10000 条目的内存
const estimatedMaxMemory = memoryDelta * 10;
console.log(`\n预估最大内存 (10000 条目):`);
console.log(`  约：${estimatedMaxMemory.toFixed(2)} MB`);

// ========== 测试 4: Token 节省率验证 ==========
console.log("\n" + "=".repeat(60));
console.log("测试 4: Token 节省率验证");
console.log("=".repeat(60));

// 真实工具描述
const realTools = [
  {
    name: "Bash",
    description: "This tool allows you to execute shell commands in the current working directory. The command is executed in a non-interactive shell. The following parameters are supported: cmd (required, string) - The command to execute, cwd (optional, string) - The working directory. Example usage: exec({ cmd: 'ls -la', cwd: '/home/user' })"
  },
  {
    name: "Read",
    description: "Read the contents of a file at the specified path and return the content as a string. This tool supports both text and binary files. For large files, consider using the range parameter to read specific portions. Parameters: path (required, string) - The file path to read, encoding (optional, string) - The character encoding (default: utf-8)."
  },
  {
    name: "Write",
    description: "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does. For appending to files, use the Edit tool instead. Parameters: path (required, string) - The file path, content (required, string) - The content to write."
  },
  {
    name: "Glob",
    description: "Search for files matching a glob pattern. Supports wildcards like * (matches any characters except /) and ** (matches any characters including /). Useful for finding files by name pattern or extension. Parameters: pattern (required, string) - The glob pattern, cwd (optional, string) - The base directory."
  },
  {
    name: "memory_add",
    description: "Add information to the long-term memory system. This tool allows you to store important facts, decisions, or context that should persist across sessions. The memory will be searchable by content. Parameters: text (required, string) - The information to store, tags (optional, array) - Tags for categorization."
  },
];

let toolTotalOriginal = 0;
let toolTotalCompressed = 0;

console.log("\n工具描述压缩详情:");
for (const tool of realTools) {
  const compressed = compressToolDescription(tool.name, tool.description);
  const originalTokens = Math.ceil(tool.description.length / 4);
  const compressedTokens = Math.ceil(compressed.length / 4);
  const savings = ((originalTokens - compressedTokens) / originalTokens) * 100;
  
  toolTotalOriginal += originalTokens;
  toolTotalCompressed += compressedTokens;
  
  console.log(`  ${tool.name}:`);
  console.log(`    原始：${originalTokens} tokens`);
  console.log(`    压缩：${compressedTokens} tokens`);
  console.log(`    节省：${savings.toFixed(1)}%`);
}

const toolOverallSavings = ((toolTotalOriginal - toolTotalCompressed) / toolTotalOriginal) * 100;
console.log(`\n工具描述整体节省率：${toolOverallSavings.toFixed(1)}%`);

// ========== 测试 5: 成本节省计算 ==========
console.log("\n" + "=".repeat(60));
console.log("测试 5: 成本节省计算 (基于公开 API 价格)");
console.log("=".repeat(60));

// API 价格（每 1M tokens, USD）
const prices = {
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "claude-3-5-haiku": { input: 0.80, output: 4.00 },
  "ollama-local": { input: 0, output: 0 },
};

const inputTokens = 10000;
const outputTokens = 2000;

console.log(`\n假设压缩任务：输入 ${inputTokens} tokens, 输出 ${outputTokens} tokens\n`);

for (const [model, price] of Object.entries(prices)) {
  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  console.log(`  ${model}: $${cost.toFixed(6)}`);
}

const gpt4oCost = (inputTokens / 1_000_000) * prices["gpt-4o"].input + (outputTokens / 1_000_000) * prices["gpt-4o"].output;
const miniCost = (inputTokens / 1_000_000) * prices["gpt-4o-mini"].input + (outputTokens / 1_000_000) * prices["gpt-4o-mini"].output;
const modelSavings = ((gpt4oCost - miniCost) / gpt4oCost) * 100;

console.log(`\nGPT-4o → GPT-4o-mini 节省：${modelSavings.toFixed(1)}%`);
console.log(`GPT-4o → Ollama 本地 节省：100.0%`);

// ========== 总结 ==========
console.log("\n" + "=".repeat(60));
console.log("验证总结");
console.log("=".repeat(60));

console.log(`
✅ 性能数据（实测）:
   - 工具压缩延迟：${avgLatency.toFixed(3)}ms/次
   - 哈希计算延迟：${hashAvgLatency.toFixed(3)}ms/次
   - 缓存内存占用：${memoryDelta.toFixed(2)}MB/1000 条目

✅ 压缩率（实测）:
   - 工具描述节省：${overallSavings.toFixed(1)}%
   - 真实工具节省：${toolOverallSavings.toFixed(1)}%

✅ 成本节省（基于公开价格）:
   - 压缩模型优化：${modelSavings.toFixed(1)}%
   - 本地模型替代：100%
`);

console.log("=".repeat(60));
console.log("验证完成");
console.log("=".repeat(60));
