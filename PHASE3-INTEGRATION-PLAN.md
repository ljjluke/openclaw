# Phase 3: 原型开发集成计划

> **版本**: v1.0
> **日期**: 2026 年 3 月 11 日
> **状态**: 执行中

---

## 📋 集成目标

将 Phase 2 开发的成本优化模块集成到 OpenClaw 主流程中，实现：
1. 工具描述自动压缩
2. 请求缓存自动生效
3. 多通道去重自动生效
4. 压缩模型配置自动应用

---

## 🔧 集成点分析

### 1. 工具描述压缩集成

**目标文件**: `src/agents/pi-embedded-runner/compact.ts`

**集成点**: 
- 在 `session.compact()` 调用前压缩工具描述
- 在 `buildEmbeddedSystemPrompt` 中压缩工具 summaries

**修改位置**:
```typescript
// compact.ts 第 795 行附近
const result = await compactWithSafetyTimeout(() =>
  session.compact(params.customInstructions),
);

// 修改为：
import { compressToolsInMessages } from "../compaction.js";

// 在 compact 前压缩工具描述
const compressedMessages = compressToolsInMessages(session.messages, {
  enabled: params.config?.agents?.defaults?.compaction?.toolCompression ?? true,
});
// 应用压缩后的消息
session.messages = compressedMessages;

const result = await compactWithSafetyTimeout(() =>
  session.compact(params.customInstructions),
);
```

---

### 2. 请求缓存集成

**目标文件**: `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts`

**集成点**: 
- 在 LLM 请求前检查缓存
- 在 LLM 响应后保存缓存

**修改位置**:
```typescript
// 在发送 LLM 请求前
import { getGlobalRequestCache } from "../agents/request-cache.js";

const cache = getGlobalRequestCache();
const cached = await cache.check(messages);
if (cached) {
  return cached.response; // 使用缓存
}

// LLM 请求后
const response = await llm.chat(messages);
await cache.set(messages, response);
```

---

### 3. 多通道去重集成

**目标文件**: `src/auto-reply/reply.ts` 或 `src/auto-reply/reply/reply-dispatcher.ts`

**集成点**: 
- 在消息处理前检查是否重复
- 复用已处理的响应

**修改位置**:
```typescript
// reply-dispatcher.ts
import { getGlobalMultiChannelDedupe } from "./multichannel-dedupe.js";

const dedupe = getGlobalMultiChannelDedupe();
const duplicateOf = await dedupe.check(messages, {
  channelId,
  accountId,
  sessionId,
  messageId,
});

if (duplicateOf) {
  // 复用之前的响应
  const cachedResponse = await dedupe.getCachedResponse(duplicateOf);
  return cachedResponse;
}

// 正常处理
const response = await processMessage(messages);
await dedupe.record(messages, response, {
  channelId,
  accountId,
  sessionId,
  messageId,
});
```

---

### 4. 压缩模型配置应用

**目标文件**: `src/agents/pi-embedded-runner/compact.ts`

**集成点**: 
- 读取配置中的压缩模型设置
- 应用模型覆盖

**修改位置**:
```typescript
// compact.ts 中解析模型配置
const compactionModelOverride = params.config?.agents?.defaults?.compaction?.model;

if (compactionModelOverride) {
  const [provider, modelId] = compactionModelOverride.split('/');
  // 应用模型覆盖
  session.model = { provider, model: modelId };
}
```

---

## 📝 实施步骤

### Step 1: 添加工具压缩到 compact.ts

**文件**: `src/agents/pi-embedded-runner/compact.ts`

**修改内容**:
1. 导入 `compressToolsInMessages`
2. 在 compact 前调用压缩函数
3. 添加配置检查

---

### Step 2: 添加请求缓存到 lifecycle.ts

**文件**: `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts`

**修改内容**:
1. 导入 `getGlobalRequestCache`
2. 在 `handleLLMRequest` 中添加缓存检查
3. 添加缓存保存逻辑

---

### Step 3: 添加多通道去重到 reply-dispatcher.ts

**文件**: `src/auto-reply/reply/reply-dispatcher.ts`

**修改内容**:
1. 导入 `getGlobalMultiChannelDedupe`
2. 在消息分发前检查重复
3. 添加响应记录逻辑

---

### Step 4: 添加配置应用

**文件**: `src/agents/pi-embedded-runner/compact.ts`

**修改内容**:
1. 读取 `compaction.model` 配置
2. 应用模型覆盖
3. 添加日志记录

---

## 🧪 测试计划

### 单元测试

```bash
# 运行集成测试
npm test -- test/cost-optimization.integration.test.ts

# 运行特定模块测试
npm test -- src/agents/compaction.test.ts
npm test -- src/agents/request-cache.test.ts
npm test -- src/auto-reply/reply/multichannel-dedupe.test.ts
```

### 集成测试

1. **工具压缩测试**: 验证工具描述被正确压缩
2. **请求缓存测试**: 验证缓存命中/未命中场景
3. **多通道去重测试**: 验证跨通道去重功能
4. **模型配置测试**: 验证压缩模型配置生效

---

## 📊 验收标准

- [ ] 工具压缩在 compact 时自动生效
- [ ] 请求缓存减少重复 API 调用
- [ ] 多通道去重减少冗余 LLM 调用
- [ ] 压缩模型配置正确应用
- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 性能影响 < 100ms 延迟
- [ ] 内存占用 < 50MB

---

## ⚠️ 注意事项

1. **向后兼容**: 所有修改必须向后兼容
2. **配置可选**: 所有优化功能可通过配置关闭
3. **错误处理**: 优化失败不影响核心功能
4. **日志记录**: 添加详细日志便于调试

---

## 📚 参考文档

- [Phase 2 实施文档](../COST-OPTIMIZATION-IMPLEMENTATION.md)
- [OpenClaw 源码分析](../../docs/openclaw-source-code-analysis.md)
- [架构分析](../../docs/openclaw-architecture-analysis.md)

---

**修订历史**:
| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v1.0 | 2026-03-11 | 初始版本，定义集成计划 |
