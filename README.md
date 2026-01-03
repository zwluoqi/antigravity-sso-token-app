# Kiro Account Manager

一个跨平台的桌面应用程序，用于管理AWS Accounts。该应用提供了一个用户友好的界面来替换本地的AWS SSO缓存文件，并与服务器通信以获取新的token。

## 功能特性

- 🔄 **自动Token管理**: 自动读取和更新本地AWS Account文件
- 🌐 **服务器通信**: 与后端服务器通信获取新的access token
- 🔒 **防重复申请**: 内置机制防止重复申请同一个token
- 🔓 **Token解锁**: 支持解锁已使用的token
- 📊 **实时状态监控**: 显示token状态、过期时间等信息
- 🎨 **现代化UI**: 简洁美观的用户界面
- 📝 **操作日志**: 详细的操作日志记录
- ⚙️ **灵活配置**: 可配置服务器地址和其他设置

## 系统要求

- Windows 10/11, macOS 10.14+, 或 Linux (Ubuntu 18.04+)
- Node.js 16+ (仅开发时需要)

## 安装和使用

### 开发环境

1. 克隆项目并进入目录：
```bash
cd kiro-account-app
```

2. 安装依赖：
```bash
npm install
```

**如果遇到依赖问题，请运行修复脚本：**
- Windows: 双击 `fix-dependencies.bat` 或运行 `npm run reinstall`
- Linux/macOS: 运行 `chmod +x fix-dependencies.sh && ./fix-dependencies.sh`

3. 启动开发模式：
```bash
npm run dev
```

### 生产环境

1. 构建应用：
```bash
npm run build
```

2. 或者构建特定平台：
```bash
npm run build-win    # Windows
npm run build-mac    # macOS
npm run build-linux  # Linux
```

## 配置

### 服务器配置

应用需要连接到后端服务器来获取token。默认服务器地址是 `http://localhost:8080`。

你可以通过以下方式修改服务器配置：
1. 在应用中点击"设置"按钮
2. 输入新的服务器地址
3. 点击"保存"

### AWS SSO缓存目录

应用会自动检测AWS SSO缓存目录：
- Windows: `C:\Users\{username}\.aws\sso\cache\`
- macOS/Linux: `~/.aws/sso/cache/`

目标文件：`kiro-auth-token.json`

## API接口

应用与服务器通过以下API进行通信：

### POST /api/request-token

请求新的token。

**请求体：**
```json
{
  "currentTokenId": "当前token的ID（可选）",
  "requestId": "请求ID"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "accessToken": "新的访问token",
    "tokenId": "token ID",
    "expiresAt": "infinity",
    "refresh_token": "刷新token",
    "requestId": "请求ID",
    "timestamp": 1234567890
  }
}
```

## 工作原理

1. **Token读取**: 应用启动时自动读取本地AWS SSO缓存文件
2. **状态检查**: 检查当前token的有效性和过期时间
3. **服务器通信**: 当需要新token时，向服务器发送请求
4. **Token解锁**: 如果提供了当前tokenId，服务器会先解锁该token
5. **防重复机制**: 服务器端实现防重复申请机制
6. **文件更新**: 将新token写入本地缓存文件
7. **备份机制**: 自动备份原有token文件

## 安全考虑

- 应用使用Electron的安全最佳实践
- 禁用了Node.js集成和远程模块
- 启用了上下文隔离
- 通过preload脚本安全地暴露API

## 故障排除

### 常见问题

1. **Token文件不存在**
   - 确保AWS CLI已正确配置
   - 检查AWS SSO缓存目录是否存在

2. **服务器连接失败**
   - 检查服务器地址是否正确
   - 确保服务器正在运行
   - 检查网络连接

3. **权限问题**
   - 确保应用有读写AWS缓存目录的权限
   - 在某些系统上可能需要管理员权限

### 日志查看

应用内置了详细的日志系统，可以在界面中查看操作日志。如需更详细的调试信息，可以：

1. 开发模式下打开开发者工具
2. 查看控制台输出
3. 检查应用配置目录中的日志文件

## 开发

### 项目结构

```
kiro-account-app/
├── src/
│   ├── main.js          # 主进程
│   ├── preload.js       # 预加载脚本
│   └── renderer/        # 渲染进程
│       ├── index.html   # 主界面
│       ├── styles.css   # 样式文件
│       └── renderer.js  # 渲染进程逻辑
├── assets/              # 资源文件
├── package.json         # 项目配置
└── README.md           # 说明文档
```

### 技术栈

- **Electron**: 跨平台桌面应用框架
- **Node.js**: 后端运行时
- **HTML/CSS/JavaScript**: 前端技术
- **fs-extra**: 文件系统操作
- **node-fetch**: HTTP请求

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 更新日志

### v1.0.0
- 初始版本发布
- 基本的token管理功能
- 跨平台支持
- 现代化UI界面