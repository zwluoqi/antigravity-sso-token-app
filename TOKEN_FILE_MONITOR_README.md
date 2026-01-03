# Token文件监控机制

## 概述

本项目新增了Token文件监控机制，用于监控本地 `kiro-auth-token.json` 文件的删除事件。当文件被删除时，系统会自动触发服务器同步机制，重新获取Token。

## 功能特性

- **实时监控**：使用 `chokidar` 库实时监控Token文件的删除事件
- **自动同步**：文件删除后自动触发服务器同步机制
- **冷却机制**：防止频繁触发同步（默认2秒冷却时间）
- **错误处理**：完善的错误处理和日志记录
- **事件通知**：通过IPC机制通知渲染进程

## 架构设计

### 1. 核心组件

#### TokenFileMonitor (`src/token-file-monitor.js`)
- 负责监控Token文件的删除事件
- 提供事件回调机制
- 支持手动触发同步检查

#### 主进程集成 (`src/main.js`)
- 初始化Token文件监控器
- 设置事件回调处理
- 通过IPC通知渲染进程

#### 渲染进程处理 (`src/renderer/renderer.js`)
- 监听Token文件删除事件
- 自动触发服务器同步
- 更新UI状态和日志

### 2. 工作流程

```
1. 应用启动 → 初始化TokenFileMonitor
2. 开始监控 → 监听文件删除事件
3. 文件被删除 → 触发删除事件回调
4. 主进程处理 → 通知渲染进程
5. 渲染进程 → 自动调用getSooHoldToken()
6. 服务器同步 → 重新获取Token并保存
```

## 使用方法

### 1. 自动启动

Token文件监控器会在应用启动时自动初始化和启动，无需手动操作。

### 2. 手动操作

通过渲染进程可以进行以下操作：

```javascript
// 获取监控状态
const status = await electronAPI.tokenMonitor.getStatus();

// 手动触发同步检查
const result = await electronAPI.tokenMonitor.triggerSyncCheck();

// 重启监控器
const restartResult = await electronAPI.tokenMonitor.restart();
```

### 3. 事件监听

渲染进程可以监听以下事件：

```javascript
// 监听文件删除事件
electronAPI.onTokenFileDeleted((event, filePath) => {
    console.log('Token文件被删除:', filePath);
});

// 监听同步触发事件
electronAPI.onTokenSyncRequired(async (event, data) => {
    console.log('需要同步Token:', data);
});

// 监听监控错误事件
electronAPI.onTokenMonitorError((event, errorMessage) => {
    console.error('监控错误:', errorMessage);
});
```

## 配置选项

### TokenFileMonitor配置

```javascript
// 设置同步冷却时间（毫秒）
tokenFileMonitor.setSyncCooldown(2000);

// 设置事件回调
tokenFileMonitor.setEventCallback('tokenFileDeleted', callback);
tokenFileMonitor.setEventCallback('syncTriggered', callback);
tokenFileMonitor.setEventCallback('error', callback);
```

## 测试

### 1. 使用测试脚本

项目提供了专门的测试脚本 `test-token-monitor.js`：

```bash
# 运行完整测试
node test-token-monitor.js test

# 其他操作
node test-token-monitor.js backup   # 备份Token文件
node test-token-monitor.js restore  # 恢复Token文件
node test-token-monitor.js delete   # 删除Token文件
node test-token-monitor.js check    # 检查文件存在
```

### 2. 手动测试

1. 启动应用并确保已配置SSO Token
2. 手动删除 `~/.aws/sso/cache/kiro-auth-token.json` 文件
3. 观察应用日志，应该看到监控事件和自动同步过程
4. 检查Token是否被重新创建

## 日志说明

### 监控相关日志

- `Token文件监控器初始化...` - 监控器开始初始化
- `开始监控Token文件删除事件` - 监控器启动成功
- `检测到Token文件被删除` - 文件删除事件触发
- `确认Token文件已被删除，触发服务器同步机制` - 开始同步流程

### 同步相关日志

- `Token文件删除触发同步` - 渲染进程收到同步通知
- `开始自动从服务器重新拉取Token...` - 开始服务器同步
- `Token文件删除后自动同步成功！` - 同步成功
- `Token文件删除后自动同步失败` - 同步失败

## 故障排除

### 1. 监控器未启动

**症状**：删除Token文件后没有触发同步

**解决方案**：
- 检查应用启动日志，确认监控器初始化成功
- 使用 `electronAPI.tokenMonitor.getStatus()` 检查状态
- 尝试重启监控器：`electronAPI.tokenMonitor.restart()`

### 2. 同步失败

**症状**：监控器检测到删除但同步失败

**解决方案**：
- 确认已配置有效的SSO Token
- 检查网络连接
- 查看详细错误日志

### 3. 频繁触发

**症状**：短时间内多次触发同步

**解决方案**：
- 检查冷却时间设置是否合理
- 确认没有其他程序频繁操作Token文件

## 与现有功能的关系

### 1. 与SSH同步的区别

- **SSH同步**：用于在不同设备间同步Token文件
- **Token监控**：用于本地文件删除后的自动恢复

### 2. 与loadCurrentToken的配合

- `loadCurrentToken()` 方法在文件不存在时会触发同步
- Token监控提供了更及时的响应机制
- 两者可以互补工作，提供更好的用户体验

## 技术细节

### 1. 文件监控

使用 `chokidar` 库监控文件系统事件：
- 监听 `unlink` 事件（文件删除）
- 监听 `add` 事件（文件创建）
- 设置稳定性阈值避免误触发

### 2. IPC通信

主进程和渲染进程通过以下IPC消息通信：
- `token-file-deleted` - 文件删除通知
- `token-sync-required` - 同步需求通知
- `token-monitor-error` - 错误通知

### 3. 错误处理

- 监控器启动失败时记录错误但不影响应用运行
- 同步失败时提供详细错误信息
- 支持手动重试机制

## 更新日志

### v1.0.0 (2024-01-20)
- 初始版本发布
- 支持Token文件删除监控
- 自动触发服务器同步机制
- 完整的测试工具和文档