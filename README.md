## 安装和使用

### 开发环境

1. 克隆项目并进入目录：
```bash
cd antigravity-sso-token-app
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
