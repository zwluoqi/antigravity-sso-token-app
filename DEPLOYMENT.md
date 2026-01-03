# Kiro Account Manager 部署指南

## 环境要求

### 开发环境
- Node.js 16.x 或更高版本
- npm 8.x 或更高版本
- Git

### 运行环境
- Windows 10/11, macOS 10.14+, 或 Linux (Ubuntu 18.04+)
- 至少 100MB 可用磁盘空间
- 网络连接（用于与服务器通信）

## 安装步骤

### 1. 克隆项目
```bash
git clone <repository-url>
cd kiro-account-app
```

### 2. 安装依赖
```bash
npm install
```

### 3. 开发模式运行
```bash
npm run dev
```

### 4. 生产构建
```bash
# 构建所有平台
npm run build

# 或构建特定平台
npm run build-win    # Windows
npm run build-mac    # macOS  
npm run build-linux  # Linux
```

## 配置说明

### 服务器配置
应用需要连接到后端服务器来获取token。默认配置：
- 服务器地址: `http://localhost:8080`
- API端点: `/api/request-token`

可以通过应用界面的"设置"按钮修改服务器地址。

### AWS SSO配置
应用会自动检测AWS SSO缓存目录：
- Windows: `C:\Users\{username}\.aws\sso\cache\`
- macOS/Linux: `~/.aws/sso/cache/`

确保该目录存在且应用有读写权限。

## 部署选项

### 选项1: 直接分发可执行文件
1. 运行 `npm run build`
2. 在 `dist/` 目录中找到对应平台的安装包
3. 分发给用户安装

### 选项2: 便携版本
1. 运行 `npm run pack`
2. 在 `dist/` 目录中找到未打包的应用文件夹
3. 压缩整个文件夹作为便携版本分发

### 选项3: 自动更新版本
可以配置自动更新服务器，详见 `electron-builder` 文档。

## 文件结构

```
kiro-account-app/
├── src/                    # 源代码
│   ├── main.js            # 主进程
│   ├── preload.js         # 预加载脚本
│   └── renderer/          # 渲染进程
├── assets/                # 资源文件
├── dist/                  # 构建输出目录
├── package.json           # 项目配置
├── start.bat             # Windows启动脚本
├── start.sh              # Linux/macOS启动脚本
└── README.md             # 项目说明
```

## 故障排除

### 常见问题

1. **应用无法启动**
   - 检查Node.js版本是否符合要求
   - 确保所有依赖已正确安装
   - 查看控制台错误信息

2. **无法连接服务器**
   - 检查服务器地址配置
   - 确保服务器正在运行
   - 检查防火墙设置

3. **权限问题**
   - 确保应用有读写AWS缓存目录的权限
   - 在某些系统上可能需要管理员权限

4. **Token文件不存在**
   - 确保AWS CLI已正确配置
   - 检查AWS SSO缓存目录是否存在

### 日志查看

开发模式下可以通过以下方式查看日志：
1. 打开开发者工具 (Ctrl+Shift+I)
2. 查看Console标签页
3. 检查应用配置目录中的日志文件

### 性能优化

1. **减少包大小**
   - 移除不必要的依赖
   - 使用 `electron-builder` 的优化选项

2. **提高启动速度**
   - 延迟加载非关键模块
   - 优化主进程代码

## 安全考虑

1. **代码签名**
   - 为生产版本添加代码签名
   - 配置证书和签名流程

2. **权限控制**
   - 最小化文件系统访问权限
   - 使用安全的IPC通信

3. **数据保护**
   - 敏感数据加密存储
   - 安全的网络通信

## 更新和维护

### 版本更新
1. 更新 `package.json` 中的版本号
2. 更新 `CHANGELOG.md`
3. 重新构建和测试
4. 发布新版本

### 依赖更新
定期更新依赖包以获取安全补丁和新功能：
```bash
npm audit
npm update
```

### 监控和日志
建议在生产环境中添加：
- 错误监控和报告
- 使用情况统计
- 性能监控

## 支持和反馈

如遇到问题或需要支持，请：
1. 查看本文档的故障排除部分
2. 检查项目的Issue页面
3. 提交新的Issue并提供详细信息

---

更多详细信息请参考：
- [Electron官方文档](https://www.electronjs.org/docs)
- [electron-builder文档](https://www.electron.build/)
- [项目README](./README.md)