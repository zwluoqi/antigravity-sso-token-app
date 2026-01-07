
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { spawn, exec } = require('child_process');
const jwt = require('jsonwebtoken');

// 应用配置
const isDev = process.argv.includes('--dev');
const APP_NAME = 'Antigravity SSOToken Manager';

// SSH同步功能
const SSHSyncIPC = require('./ssh-sync/ssh-sync-ipc');
// Token文件监控功能
const TokenFileMonitor = require('./token-file-monitor');
// 配额查询功能
const { fetchQuota, formatTimeRemaining } = require('./quota');

// 全局变量
let mainWindow;
let serverUrl = 'https://supercode.xxworld.org'; // 默认服务器地址
let sshSyncIPC; // SSH同步IPC处理器
let tokenFileMonitor; // Token文件监控器

// Antigravity 数据目录路径 (参考 Antigravity-Manager)
const ANTIGRAVITY_SSO_TOKEN_DIR = path.join(os.homedir(), '.antigravity-sso-token-manager');
const ANTIGRAVITY_ACCOUNTS_DIR = path.join(ANTIGRAVITY_SSO_TOKEN_DIR, 'accounts');
const ANTIGRAVITY_AUTH_TOKEN_FILE = path.join(ANTIGRAVITY_SSO_TOKEN_DIR, 'current_token.json');
const ANTIGRAVITY_ACCOUNTS_INDEX_FILE = path.join(ANTIGRAVITY_SSO_TOKEN_DIR, 'accounts.json');

// Antigravity 数据库路径 (用于Token注入)
// 参考 Antigravity-Manager/src-tauri/src/modules/db.rs
function getAntigravityDbPath() {
    // 首先尝试检测便携模式
    const portableDbPath = getPortableDbPath();
    if (portableDbPath) {
        console.log('[Antigravity路径] 使用便携模式数据库路径:', portableDbPath);
        return portableDbPath;
    }

    // 标准模式：使用系统默认路径
    let dbPath = null;
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA;
        if (appData) {
            dbPath = path.join(appData, 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
        }
    } else if (process.platform === 'darwin') {
        dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
    } else {
        dbPath = path.join(os.homedir(), '.config', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
    }
    console.log('[Antigravity路径] 数据库路径:', dbPath);
    return dbPath;
}

// 检测便携模式数据库路径 (参考 Antigravity-Manager)
function getPortableDbPath() {
    try {
        // 检查常见的便携模式安装位置
        const possiblePaths = [];

        if (process.platform === 'win32') {
            // Windows: 检查常见安装位置
            const programFiles = process.env['ProgramFiles'];
            const programFilesX86 = process.env['ProgramFiles(x86)'];
            const localAppData = process.env.LOCALAPPDATA;

            if (programFiles) {
                possiblePaths.push(path.join(programFiles, 'Antigravity'));
            }
            if (programFilesX86) {
                possiblePaths.push(path.join(programFilesX86, 'Antigravity'));
            }
            if (localAppData) {
                possiblePaths.push(path.join(localAppData, 'Programs', 'Antigravity'));
            }
            // 用户主目录下的常见位置
            possiblePaths.push(path.join(os.homedir(), 'Antigravity'));
            possiblePaths.push(path.join(os.homedir(), 'Desktop', 'Antigravity'));
        } else if (process.platform === 'darwin') {
            possiblePaths.push('/Applications/Antigravity.app/Contents/Resources');
            possiblePaths.push(path.join(os.homedir(), 'Applications', 'Antigravity.app', 'Contents', 'Resources'));
        } else {
            possiblePaths.push('/opt/antigravity');
            possiblePaths.push(path.join(os.homedir(), 'antigravity'));
        }

        for (const basePath of possiblePaths) {
            const portableDbPath = path.join(basePath, 'data', 'user-data', 'User', 'globalStorage', 'state.vscdb');
            if (fs.existsSync(portableDbPath)) {
                console.log('[Antigravity路径] 发现便携模式数据库:', portableDbPath);
                return portableDbPath;
            }
        }

        return null;
    } catch (error) {
        console.error('[Antigravity路径] 检测便携模式失败:', error);
        return null;
    }
}

// 应用配置文件路径
const APP_CONFIG_DIR = path.join(os.homedir(), '.antigravity-sso-token-manager');
const APP_CONFIG_FILE = path.join(APP_CONFIG_DIR, 'config.json');

// 创建主窗口
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 900,
        minWidth: 800,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            spellcheck: false,
            enableWebSQL: false
        },
        icon: path.join(__dirname, 'icon.png'),
        title: APP_NAME,
        show: false // 先不显示,等加载完成后再显示
    });

    // 加载主页面
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });

    // 窗口关闭事件
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 创建菜单
    createMenu();
}

// 全局变量用于跟踪更新状态
let hasUpdateAvailable = false;
let currentMenu = null;

// 创建应用菜单
function createMenu() {
    const packageJson = require('../package.json');

    const template = [
        {
            label: '文件',
            submenu: [
                {
                    label: '退出',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { role: 'undo', label: '撤销' },
                { role: 'redo', label: '重做' },
                { type: 'separator' },
                { role: 'cut', label: '剪切' },
                { role: 'copy', label: '复制' },
                { role: 'paste', label: '粘贴' },
                { role: 'selectAll', label: '全选' }
            ]
        },
        {
            label: '工具',
            submenu: [
                {
                    label: '打开Antigravity数据目录',
                    click: () => {
                        require('electron').shell.openPath(ANTIGRAVITY_SSO_TOKEN_DIR);
                    }
                },
                {
                    label: '打开Antigravity数据库目录',
                    click: () => {
                        const dbPath = getAntigravityDbPath();
                        if (dbPath) {
                            require('electron').shell.openPath(path.dirname(dbPath));
                        }
                    }
                }
            ]
        },
        {
            label: '帮助' + (hasUpdateAvailable ? ' ●' : ''),
            submenu: [
                {
                    label: '检查更新' + (hasUpdateAvailable ? ' ●' : ''),
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                            mainWindow.webContents.send('check-for-updates');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: '关于',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '关于',
                            message: APP_NAME,
                            detail: `版本: ${packageJson.version}\n用于管理Antigravity SSOToken的跨平台应用`
                        });
                    }
                }
            ]
        }
    ];

    currentMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(currentMenu);
}

// 更新菜单中的更新提示
function updateMenuUpdateIndicator(hasUpdate) {
    hasUpdateAvailable = hasUpdate;
    createMenu(); // 重新创建菜单以更新红点显示
}

// 显示服务器配置对话框
async function showServerConfigDialog() {
    const config = await loadAppConfig();
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['确定', '取消'],
        defaultId: 0,
        title: '服务器配置',
        message: '请输入服务器地址',
        detail: `当前服务器地址: ${config.serverUrl || serverUrl}`
    });

    if (result.response === 0) {
        // 这里应该显示一个输入对话框，但Electron没有内置的，我们通过渲染进程处理
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('show-server-config', config.serverUrl || serverUrl);
        }
    }
}

// 加载应用配置
async function loadAppConfig() {
    try {
        await fs.ensureDir(APP_CONFIG_DIR);

        if (await fs.pathExists(APP_CONFIG_FILE)) {
            const config = await fs.readJson(APP_CONFIG_FILE);
            if (config.serverUrl) {
                serverUrl = config.serverUrl;
            }
            return config;
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }

    return { serverUrl };
}

// 初始化Token文件监控器
async function initializeTokenFileMonitor() {
    try {
        console.log('正在初始化Token文件监控器...');

        // 设置事件回调
        tokenFileMonitor.setEventCallback('tokenFileDeleted', (filePath) => {
            console.log(`Token文件被删除: ${filePath}`);
            // 通知渲染进程Token文件被删除
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('token-file-deleted', filePath);
            }
        });

        tokenFileMonitor.setEventCallback('syncTriggered', async (filePath) => {
            console.log(`Token文件删除触发同步: ${filePath}`);
            // 通知渲染进程需要重新同步Token
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('token-sync-required', {
                    reason: 'file_deleted',
                    filePath: filePath,
                    timestamp: Date.now()
                });
            }
        });

        tokenFileMonitor.setEventCallback('error', (error) => {
            console.error('Token文件监控错误:', error);
            // 通知渲染进程监控出错
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('token-monitor-error', error.message);
            }
        });

        // 启动监控
        const result = await tokenFileMonitor.startWatching();
        if (result.success) {
            console.log('Token文件监控器启动成功');
        } else {
            console.error('Token文件监控器启动失败:', result.error);
        }
    } catch (error) {
        console.error('初始化Token文件监控器失败:', error);
    }
}

// 保存应用配置
async function saveAppConfig(config) {
    try {
        await fs.ensureDir(APP_CONFIG_DIR);
        await fs.writeJson(APP_CONFIG_FILE, config, { spaces: 2 });
        return true;
    } catch (error) {
        console.error('保存配置失败:', error);
        return false;
    }
}

// 应用事件处理
app.whenReady().then(async () => {
    // 加载配置
    await loadAppConfig();

    // 确保Antigravity数据目录存在
    console.log('[Antigravity路径] 初始化数据目录...');
    console.log('[Antigravity路径] 工具目录:', ANTIGRAVITY_SSO_TOKEN_DIR);
    console.log('[Antigravity路径] 账户目录:', ANTIGRAVITY_ACCOUNTS_DIR);
    console.log('[Antigravity路径] Token文件:', ANTIGRAVITY_AUTH_TOKEN_FILE);
    await fs.ensureDir(ANTIGRAVITY_SSO_TOKEN_DIR);
    await fs.ensureDir(ANTIGRAVITY_ACCOUNTS_DIR);
    console.log('[Antigravity路径] 数据目录初始化完成');

    // 初始化SSH同步IPC处理器
    sshSyncIPC = new SSHSyncIPC();

    // 初始化Token文件监控器
    tokenFileMonitor = new TokenFileMonitor();

    // 创建主窗口
    createMainWindow();

    // 设置主窗口引用到SSH同步IPC
    sshSyncIPC.setMainWindow(mainWindow);

    // 启动Token文件监控
    await initializeTokenFileMonitor();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // 清理SSH同步资源
        if (sshSyncIPC) {
            sshSyncIPC.cleanup();
        }
        // 清理Token文件监控资源
        if (tokenFileMonitor) {
            tokenFileMonitor.cleanup();
        }
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// IPC 事件处理 - Token相关
ipcMain.handle('get-antigravity-token', async () => {
    try {
        console.log('[Antigravity Token] 正在读取Token...');
        console.log('[Antigravity Token] Token文件路径:', ANTIGRAVITY_AUTH_TOKEN_FILE);

        // 确保目录存在
        await fs.ensureDir(ANTIGRAVITY_SSO_TOKEN_DIR);

        if (await fs.pathExists(ANTIGRAVITY_AUTH_TOKEN_FILE)) {
            const tokenData = await fs.readJson(ANTIGRAVITY_AUTH_TOKEN_FILE);
            console.log('[Antigravity Token] Token读取成功');
            return { success: true, data: tokenData };
        } else {
            console.log('[Antigravity Token] Token文件不存在');
            return { success: false, error: 'Token文件不存在' };
        }
    } catch (error) {
        console.error('[Antigravity Token] Token读取失败:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-antigravity-token', async (event, tokenData) => {
    try {
        console.log('[Antigravity Token] 正在保存Token...');
        console.log('[Antigravity Token] Token文件路径:', ANTIGRAVITY_AUTH_TOKEN_FILE);

        // 确保目录存在
        await fs.ensureDir(ANTIGRAVITY_SSO_TOKEN_DIR);
        await fs.ensureDir(ANTIGRAVITY_ACCOUNTS_DIR);
        console.log('[Antigravity Token] 目录已确认存在');

        // 备份原文件
        if (await fs.pathExists(ANTIGRAVITY_AUTH_TOKEN_FILE)) {
            const backupFile = `${ANTIGRAVITY_AUTH_TOKEN_FILE}.backup.${Date.now()}`;
            await fs.copy(ANTIGRAVITY_AUTH_TOKEN_FILE, backupFile);
            console.log('[Antigravity Token] 原Token已备份至:', backupFile);
        }

        // 写入新的token数据到current_token.json
        await fs.writeJson(ANTIGRAVITY_AUTH_TOKEN_FILE, tokenData, { spaces: 2 });
        console.log('[Antigravity Token] Token已写入文件');

        // 同时将token注入到Antigravity的数据库中
        const dbPath = getAntigravityDbPath();
        console.log('[Antigravity DB] 正在检查数据库路径:', dbPath);
        if (dbPath && await fs.pathExists(dbPath)) {
            try {
                console.log('[Antigravity DB] 数据库存在，开始注入Token...');
                await injectTokenToDatabase(dbPath, tokenData);
                console.log('[Antigravity DB] Token已成功注入到Antigravity数据库');
            } catch (dbError) {
                console.error('[Antigravity DB] 注入Token到数据库失败:', dbError);
                // 不影响主流程，继续执行
            }
        } else {
            console.log('[Antigravity DB] 数据库文件不存在，跳过注入');
        }

        console.log('[Antigravity Token] Token保存完成');
        return { success: true };
    } catch (error) {
        console.error('[Antigravity Token] Token保存失败:', error.message);
        return { success: false, error: error.message };
    }
});

// Token注入到Antigravity数据库
async function injectTokenToDatabase(dbPath, tokenData) {
    try {
        console.log('[Antigravity DB 注入] 开始Token注入流程...');
        console.log('[Antigravity DB 注入] 数据库路径:', dbPath);
        console.log('[Antigravity DB 注入] 收到的Token数据键:', Object.keys(tokenData));

        // 解析Token数据 - 兼容多种属性名格式
        const accessToken = tokenData.accessToken || tokenData.access_token || '';
        const refreshToken = tokenData.refreshToken || tokenData.refresh_token || '';

        // 解析过期时间 - 支持多种格式
        let expiryTimestamp;
        if (tokenData.expiresAt) {
            // ISO字符串格式 (来自renderer)
            expiryTimestamp = new Date(tokenData.expiresAt).getTime();
        } else {
            // 默认365*24小时后过期
            expiryTimestamp = Date.now() + 365 * 24 * 3600000;
        }

        // 转换为Unix秒
        const expirySeconds = Math.floor(expiryTimestamp / 1000);

        console.log('[Antigravity DB 注入] 解析后的Token数据:');
        console.log('[Antigravity DB 注入] - accessToken长度:', accessToken.length);
        console.log('[Antigravity DB 注入] - refreshToken长度:', refreshToken.length);
        console.log('[Antigravity DB 注入] - expiryTimestamp:', expiryTimestamp);
        console.log('[Antigravity DB 注入] - expirySeconds:', expirySeconds);

        if (!accessToken) {
            throw new Error('accessToken为空，无法注入');
        }

        const Database = require('better-sqlite3');
        const db = new Database(dbPath);
        console.log('[Antigravity DB 注入] 数据库已打开');

        // 读取当前数据
        console.log('[Antigravity DB 注入] 正在读取 jetskiStateSync.agentManagerInitState...');
        const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get('jetskiStateSync.agentManagerInitState');

        if (!row) {
            db.close();
            console.error('[Antigravity DB 注入] 数据库中未找到agentManagerInitState');
            throw new Error('数据库中未找到agentManagerInitState，请先启动一次Antigravity');
        }
        console.log('[Antigravity DB 注入] 已读取到现有数据, 原始长度:', row.value.length);

        // Base64解码
        const currentData = Buffer.from(row.value, 'base64');
        console.log('[Antigravity DB 注入] 数据已Base64解码, 长度:', currentData.length);

        // 移除旧的Field 6并创建新的OAuth字段
        const cleanData = removeProtobufField(currentData, 6);
        console.log('[Antigravity DB 注入] 已移除旧的Field 6, 清理后长度:', cleanData.length);

        const newField = createOAuthField(accessToken, refreshToken, expirySeconds);
        console.log('[Antigravity DB 注入] 已创建新OAuth字段, 长度:', newField.length);

        // 合并数据
        const finalData = Buffer.concat([cleanData, newField]);
        const finalB64 = finalData.toString('base64');
        console.log('[Antigravity DB 注入] 数据已合并, 最终长度:', finalData.length);
        console.log('[Antigravity DB 注入] Base64编码后长度:', finalB64.length);

        // 写入数据库
        console.log('[Antigravity DB 注入] 正在更新数据库...');
        db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?").run(finalB64, 'jetskiStateSync.agentManagerInitState');
        console.log('[Antigravity DB 注入] agentManagerInitState 已更新');

        // 注入Onboarding标记
        db.prepare("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)").run('antigravityOnboarding', 'true');
        console.log('[Antigravity DB 注入] antigravityOnboarding 标记已设置');

        db.close();
        console.log('[Antigravity DB 注入] 数据库已关闭, Token注入完成');
        return true;
    } catch (error) {
        console.error('[Antigravity DB 注入] Token注入失败:', error);
        throw error;
    }
}

// ====== Protobuf 操作函数 (参考 Antigravity-Manager/src-tauri/src/utils/protobuf.rs) ======

/**
 * Protobuf Varint 编码
 */
function encodeVarint(value) {
    const bytes = [];
    value = BigInt(value);
    while (value >= 0x80n) {
        bytes.push(Number((value & 0x7Fn) | 0x80n));
        value >>= 7n;
    }
    bytes.push(Number(value));
    return Buffer.from(bytes);
}

/**
 * 读取 Protobuf Varint
 * @returns {Object} { value: BigInt, newOffset: number }
 */
function readVarint(data, offset) {
    let result = 0n;
    let shift = 0n;
    let pos = offset;

    while (true) {
        if (pos >= data.length) {
            throw new Error('数据不完整');
        }
        const byte = data[pos];
        result |= BigInt(byte & 0x7F) << shift;
        pos += 1;
        if ((byte & 0x80) === 0) {
            break;
        }
        shift += 7n;
    }

    return { value: result, newOffset: pos };
}

/**
 * 跳过 Protobuf 字段
 */
function skipField(data, offset, wireType) {
    switch (wireType) {
        case 0: {
            // Varint
            const { newOffset } = readVarint(data, offset);
            return newOffset;
        }
        case 1: {
            // 64-bit
            return offset + 8;
        }
        case 2: {
            // Length-delimited
            const { value: length, newOffset: contentOffset } = readVarint(data, offset);
            return contentOffset + Number(length);
        }
        case 5: {
            // 32-bit
            return offset + 4;
        }
        default:
            throw new Error(`未知 wire_type: ${wireType}`);
    }
}

/**
 * 移除指定的 Protobuf 字段
 */
function removeProtobufField(data, fieldNum) {
    const result = [];
    let offset = 0;

    while (offset < data.length) {
        const startOffset = offset;
        const { value: tag, newOffset } = readVarint(data, offset);
        const wireType = Number(tag & 7n);
        const currentField = Number(tag >> 3n);

        if (currentField === fieldNum) {
            // 跳过此字段
            offset = skipField(data, newOffset, wireType);
            console.log(`[Antigravity Protobuf] 移除字段 ${fieldNum}`);
        } else {
            // 保留其他字段
            const nextOffset = skipField(data, newOffset, wireType);
            result.push(...data.slice(startOffset, nextOffset));
            offset = nextOffset;
        }
    }

    return Buffer.from(result);
}

/**
 * 创建 OAuthTokenInfo (Field 6)
 *
 * 结构 (参考 protobuf.rs):
 * message OAuthTokenInfo {
 *     optional string access_token = 1;
 *     optional string token_type = 2;
 *     optional string refresh_token = 3;
 *     optional Timestamp expiry = 4;
 * }
 */
/**
 * 创建 OAuthTokenInfo (Field 6)
 * 参考 Antigravity-Manager/src-tauri/src/utils/protobuf.rs
 *
 * 结构:
 * message OAuthTokenInfo {
 *     optional string access_token = 1;
 *     optional string token_type = 2;
 *     optional string refresh_token = 3;
 *     optional Timestamp expiry = 4;
 * }
 *
 * @param {string} accessToken - 访问令牌
 * @param {string} refreshToken - 刷新令牌
 * @param {number} expirySeconds - 过期时间（Unix秒，不是毫秒）
 */
function createOAuthField(accessToken, refreshToken, expirySeconds) {
    console.log('[Antigravity Protobuf] 创建OAuth字段...');
    console.log('[Antigravity Protobuf] access_token长度:', accessToken.length);
    console.log('[Antigravity Protobuf] refresh_token长度:', refreshToken.length);
    console.log('[Antigravity Protobuf] expirySeconds:', expirySeconds);

    // Field 1: access_token (string, wire_type = 2)
    const tag1 = (1 << 3) | 2; // = 10
    const field1 = Buffer.concat([
        encodeVarint(tag1),
        encodeVarint(accessToken.length),
        Buffer.from(accessToken, 'utf8')
    ]);

    // Field 2: token_type (string, fixed value "Bearer", wire_type = 2)
    const tag2 = (2 << 3) | 2; // = 18
    const tokenType = "Bearer";
    const field2 = Buffer.concat([
        encodeVarint(tag2),
        encodeVarint(tokenType.length),
        Buffer.from(tokenType, 'utf8')
    ]);

    // Field 3: refresh_token (string, wire_type = 2)
    const tag3 = (3 << 3) | 2; // = 26
    const field3 = Buffer.concat([
        encodeVarint(tag3),
        encodeVarint(refreshToken.length),
        Buffer.from(refreshToken, 'utf8')
    ]);

    // Field 4: expiry (嵌套的 Timestamp 消息, wire_type = 2)
    // Timestamp 消息包含: Field 1: seconds (int64, wire_type = 0)
    // 注意: expirySeconds 已经是秒，不需要再除以1000
    const timestampTag = (1 << 3) | 0; // = 8
    const timestampMsg = Buffer.concat([
        encodeVarint(timestampTag),
        encodeVarint(expirySeconds)
    ]);

    const tag4 = (4 << 3) | 2; // = 34
    const field4 = Buffer.concat([
        encodeVarint(tag4),
        encodeVarint(timestampMsg.length),
        timestampMsg
    ]);

    // 合并所有字段为 OAuthTokenInfo 消息
    const oauthInfo = Buffer.concat([field1, field2, field3, field4]);
    console.log('[Antigravity Protobuf] OAuthTokenInfo消息长度:', oauthInfo.length);

    // 包装为 Field 6 (length-delimited)
    const tag6 = (6 << 3) | 2; // = 50
    const field6 = Buffer.concat([
        encodeVarint(tag6),
        encodeVarint(oauthInfo.length),
        oauthInfo
    ]);

    console.log('[Antigravity Protobuf] Field 6 总长度:', field6.length);
    return field6;
}

// 服务器通信相关IPC处理器
ipcMain.handle('request-token-from-server', async (event, currentTokenId, ssoToken) => {
    try {
        console.log('[Antigravity 申请新账号] 开始申请新账号...');
        console.log('[Antigravity 申请新账号] Antigravity数据目录:', ANTIGRAVITY_SSO_TOKEN_DIR);
        console.log('[Antigravity 申请新账号] Token文件路径:', ANTIGRAVITY_AUTH_TOKEN_FILE);
        console.log('[Antigravity 申请新账号] 数据库路径:', getAntigravityDbPath());
        console.log('[Antigravity 申请新账号] 服务器地址:', serverUrl);

        const fetch = require('node-fetch');
        const packageJson = require('../package.json');

        if (!ssoToken) {
            throw new Error('缺少SSO Token');
        }

        console.log('[Antigravity 申请新账号] 正在向服务器发送请求...');
        const response = await fetch(`${serverUrl}/api-antigravity/request-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Version': packageJson.version
            },
            body: JSON.stringify({
                currentTokenId: currentTokenId,
                requestId: Date.now().toString(),
                ssoToken: ssoToken,
                clientVersion: packageJson.version
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`服务器响应错误: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('[Antigravity 申请新账号] 服务器响应:', result);

        if (result.success) {
            console.log('[Antigravity 申请新账号] 账号申请成功');
            return { success: true, data: result.data };
        } else {
            // 检查是否是版本不兼容错误
            if (result.error && result.error.includes('版本不兼容') && result.updateUrl) {
                return {
                    success: false,
                    error: result.error,
                    needUpdate: true,
                    updateUrl: result.updateUrl
                };
            }
            console.log('[Antigravity 申请新账号] 账号申请失败:', result.error);
            return { success: false, error: result.error };
        }
    } catch (error) {
        console.error('[Antigravity 申请新账号] 请求异常:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('refresh-token-from-server', async (event, tokenId, ssoToken) => {
    try {
        console.log('[Antigravity 刷新Token] 开始刷新Token...');
        console.log('[Antigravity 刷新Token] Antigravity数据目录:', ANTIGRAVITY_SSO_TOKEN_DIR);
        console.log('[Antigravity 刷新Token] Token文件路径:', ANTIGRAVITY_AUTH_TOKEN_FILE);
        console.log('[Antigravity 刷新Token] 数据库路径:', getAntigravityDbPath());
        console.log('[Antigravity 刷新Token] 服务器地址:', serverUrl);
        console.log('[Antigravity 刷新Token] TokenId:', tokenId);

        const fetch = require('node-fetch');
        const packageJson = require('../package.json');

        if (!tokenId) {
            throw new Error('缺少tokenId');
        }

        if (!ssoToken) {
            throw new Error('缺少SSO Token');
        }

        console.log('[Antigravity 刷新Token] 正在向服务器发送请求...');
        const response = await fetch(`${serverUrl}/api-antigravity/refresh-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Version': packageJson.version
            },
            body: JSON.stringify({
                tokenId: tokenId,
                ssoToken: ssoToken,
                clientVersion: packageJson.version
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`服务器响应错误: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('[Antigravity 刷新Token] 服务器响应:', result);

        if (result.success) {
            console.log('[Antigravity 刷新Token] Token刷新成功');
            return { success: true, data: result.data };
        } else {
            // 检查是否是版本不兼容错误
            if (result.error && result.error.includes('版本不兼容') && result.updateUrl) {
                console.log('[Antigravity 刷新Token] 版本不兼容，需要更新');
                return {
                    success: false,
                    error: result.error,
                    needUpdate: true,
                    updateUrl: result.updateUrl
                };
            }
            console.log('[Antigravity 刷新Token] Token刷新失败:', result.error);
            return { success: false, error: result.error };
        }
    } catch (error) {
        console.error('[Antigravity 刷新Token] 请求异常:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-soo-hold-token', async (event, ssoToken) => {
    try {
        const fetch = require('node-fetch');
        const packageJson = require('../package.json');

        if (!ssoToken) {
            throw new Error('缺少SSO Token');
        }

        const response = await fetch(`${serverUrl}/api-antigravity/get-soo-hold-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Version': packageJson.version
            },
            body: JSON.stringify({
                ssoToken: ssoToken,
                clientVersion: packageJson.version
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`服务器响应错误: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Token获取结果:', result);

        if (result.success) {
            return { success: true, data: result.data };
        } else {
            // 检查是否是版本不兼容错误
            if (result.error && result.error.includes('版本不兼容') && result.updateUrl) {
                return {
                    success: false,
                    error: result.error,
                    needUpdate: true,
                    updateUrl: result.updateUrl
                };
            }
            return { success: false, error: result.error };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 配置相关IPC处理器
ipcMain.handle('get-app-config', async () => {
    const config = await loadAppConfig();
    return config;
});

ipcMain.handle('save-app-config', async (event, config) => {
    const success = await saveAppConfig(config);
    if (success && config.serverUrl) {
        serverUrl = config.serverUrl;
    }
    return success;
});

ipcMain.handle('show-message-box', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result;
});

ipcMain.handle('show-error-box', async (event, title, content) => {
    dialog.showErrorBox(title, content);
});

// 路径相关IPC处理器
ipcMain.handle('get-antigravity-data-path', () => {
    return ANTIGRAVITY_SSO_TOKEN_DIR;
});

ipcMain.handle('get-antigravity-auth-token-path', () => {
    return ANTIGRAVITY_AUTH_TOKEN_FILE;
});

ipcMain.handle('get-antigravity-db-path', () => {
    return getAntigravityDbPath();
});

// 进程管理相关的IPC处理器
ipcMain.handle('close-antigravity-process', async () => {
    try {
        console.log('正在关闭Antigravity进程...');
        return new Promise((resolve) => {
            if (process.platform === 'win32') {
                // Windows系统使用taskkill命令
                exec('taskkill /f /im Antigravity.exe', (error, stdout, stderr) => {
                    if (error) {
                        console.log('关闭Antigravity.exe进程时出现错误（可能进程不存在）:', error.message);
                        resolve({ success: true, message: '进程可能已经关闭或不存在' });
                    } else {
                        console.log('Antigravity.exe进程已成功关闭');
                        resolve({ success: true, message: 'Antigravity.exe进程已成功关闭' });
                    }
                });
            } else if (process.platform === 'darwin') {
                // macOS系统：使用osascript优雅地关闭Antigravity应用
                const osascriptCmd = `osascript -e 'tell application "Antigravity" to quit' 2>/dev/null`;

                exec(osascriptCmd, (osascriptError, osascriptStdout, osascriptStderr) => {
                    // 无论osascript是否成功，都尝试使用killall作为备份
                    setTimeout(() => {
                        exec('killall Antigravity 2>/dev/null', (killError, killStdout, killStderr) => {
                            if (osascriptError && killError) {
                                console.log('Antigravity进程可能不存在或已关闭');
                                resolve({ success: true, message: 'Antigravity进程可能已经关闭或不存在' });
                            } else {
                                console.log('Antigravity进程已成功关闭');
                                resolve({ success: true, message: 'Antigravity进程已成功关闭' });
                            }
                        });
                    }, 500); // 给osascript一点时间来优雅关闭
                });
            } else {
                // Linux系统使用pkill命令，更精确地匹配
                exec('pkill -9 -x antigravity', (error, stdout, stderr) => {
                    if (error) {
                        console.log('关闭antigravity进程时出现错误（可能进程不存在）:', error.message);
                        resolve({ success: true, message: '进程可能已经关闭或不存在' });
                    } else {
                        console.log('antigravity进程已成功关闭');
                        resolve({ success: true, message: 'antigravity进程已成功关闭' });
                    }
                });
            }
        });
    } catch (error) {
        console.error('关闭Antigravity进程时发生异常:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('restart-antigravity-process', async (event, antigravityPath) => {
    try {
        console.log('正在重启Antigravity进程...');

        // 如果没有提供路径，尝试使用默认路径
        if (!antigravityPath) {
            if (process.platform === 'win32') {
                // Windows默认路径
                const localAppData = process.env.LOCALAPPDATA;
                if (localAppData) {
                    antigravityPath = path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe');
                }

                // 如果默认路径不存在，尝试其他常见路径
                if (!antigravityPath || !await fs.pathExists(antigravityPath)) {
                    const alternatePaths = [
                        'C:\\Program Files\\Antigravity\\Antigravity.exe',
                        'C:\\Program Files (x86)\\Antigravity\\Antigravity.exe',
                        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Antigravity', 'Antigravity.exe'),
                        path.join(os.homedir(), 'Desktop', 'Antigravity.exe'),
                        path.join(process.cwd(), 'Antigravity.exe')
                    ];

                    for (const altPath of alternatePaths) {
                        if (await fs.pathExists(altPath)) {
                            antigravityPath = altPath;
                            break;
                        }
                    }
                }
            } else if (process.platform === 'darwin') {
                // macOS默认路径
                antigravityPath = '/Applications/Antigravity.app';

                if (!await fs.pathExists(antigravityPath)) {
                    const alternatePaths = [
                        path.join(os.homedir(), 'Applications', 'Antigravity.app'),
                        path.join(os.homedir(), 'Desktop', 'Antigravity.app')
                    ];

                    for (const altPath of alternatePaths) {
                        if (await fs.pathExists(altPath)) {
                            antigravityPath = altPath;
                            break;
                        }
                    }
                }
            } else {
                // Linux默认路径
                antigravityPath = '/usr/bin/antigravity';

                if (!await fs.pathExists(antigravityPath)) {
                    const alternatePaths = [
                        '/opt/Antigravity/antigravity',
                        '/usr/share/antigravity/antigravity',
                        path.join(os.homedir(), '.local', 'bin', 'antigravity'),
                        path.join(os.homedir(), 'Desktop', 'antigravity'),
                        path.join(process.cwd(), 'antigravity')
                    ];

                    for (const altPath of alternatePaths) {
                        if (await fs.pathExists(altPath)) {
                            antigravityPath = altPath;
                            break;
                        }
                    }
                }
            }
        }

        // 检查可执行文件是否存在
        if (!antigravityPath || !await fs.pathExists(antigravityPath)) {
            return {
                success: false,
                error: `找不到Antigravity可执行文件: ${antigravityPath || '未指定'}。请手动指定Antigravity的安装路径。`
            };
        }

        console.log(`使用路径启动Antigravity: ${antigravityPath}`);

        // 启动进程
        let antigravityProcess;
        if (process.platform === 'darwin' && antigravityPath.endsWith('.app')) {
            // macOS使用open命令启动.app
            antigravityProcess = spawn('open', ['-a', antigravityPath], {
                detached: true,
                stdio: 'ignore'
            });
        } else {
            antigravityProcess = spawn(antigravityPath, [], {
                detached: true,
                stdio: 'ignore'
            });
        }

        // 分离进程，让它独立运行
        antigravityProcess.unref();

        console.log(`Antigravity进程已启动，PID: ${antigravityProcess.pid}`);

        return {
            success: true,
            message: `Antigravity进程已成功启动，PID: ${antigravityProcess.pid}`,
            pid: antigravityProcess.pid,
            path: antigravityPath
        };

    } catch (error) {
        console.error('重启Antigravity进程时发生异常:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('find-antigravity-executable', async () => {
    try {
        const possiblePaths = [];

        if (process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA;
            if (localAppData) {
                possiblePaths.push(path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'));
            }
            possiblePaths.push(
                'C:\\Program Files\\Antigravity\\Antigravity.exe',
                'C:\\Program Files (x86)\\Antigravity\\Antigravity.exe',
                path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Antigravity', 'Antigravity.exe'),
                path.join(os.homedir(), 'Desktop', 'Antigravity.exe'),
                path.join(process.cwd(), 'Antigravity.exe')
            );
        } else if (process.platform === 'darwin') {
            possiblePaths.push(
                '/Applications/Antigravity.app',
                path.join(os.homedir(), 'Applications', 'Antigravity.app'),
                path.join(os.homedir(), 'Desktop', 'Antigravity.app')
            );
        } else {
            possiblePaths.push(
                '/usr/bin/antigravity',
                '/opt/Antigravity/antigravity',
                '/usr/share/antigravity/antigravity',
                path.join(os.homedir(), '.local', 'bin', 'antigravity'),
                path.join(os.homedir(), 'Desktop', 'antigravity'),
                path.join(process.cwd(), 'antigravity')
            );
        }

        const foundPaths = [];
        for (const antigravityPath of possiblePaths) {
            if (await fs.pathExists(antigravityPath)) {
                foundPaths.push(antigravityPath);
            }
        }

        return { success: true, paths: foundPaths };

    } catch (error) {
        console.error('查找Antigravity可执行文件时发生异常:', error);
        return { success: false, error: error.message };
    }
});

// 系统信息相关的IPC处理器
ipcMain.handle('get-platform', () => {
    return process.platform;
});

ipcMain.handle('get-app-version', () => {
    try {
        const packageJson = require('../package.json');
        return packageJson.version;
    } catch (error) {
        console.error('获取应用版本失败:', error);
        return '1.0.0'; // 默认版本
    }
});

// 外部链接相关的IPC处理器
ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        console.error('打开外部链接失败:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-path', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        console.error('打开路径失败:', error);
        return { success: false, error: error.message };
    }
});

// 更新菜单提示相关的IPC处理器
ipcMain.handle('update-menu-indicator', (event, hasUpdate) => {
    updateMenuUpdateIndicator(hasUpdate);
    return { success: true };
});

ipcMain.handle('jwtdecode', (event, token) => {
    try {
        const decoded = jwt.decode(token);
        return { success: true, data: decoded };
    } catch (error) {
        console.error('JWT解码失败:', error);
        return { success: false, error: error.message };
    }
});

// Token文件监控相关的IPC处理器
ipcMain.handle('get-token-monitor-status', () => {
    if (tokenFileMonitor) {
        return { success: true, data: tokenFileMonitor.getStatus() };
    } else {
        return { success: false, error: 'Token文件监控器未初始化' };
    }
});

ipcMain.handle('trigger-token-sync-check', async () => {
    if (tokenFileMonitor) {
        return await tokenFileMonitor.triggerSyncCheck();
    } else {
        return { success: false, error: 'Token文件监控器未初始化' };
    }
});

ipcMain.handle('restart-token-monitor', async () => {
    if (tokenFileMonitor) {
        try {
            await tokenFileMonitor.stopWatching();
            const result = await tokenFileMonitor.startWatching();
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        return { success: false, error: 'Token文件监控器未初始化' };
    }
});

// 配额查询相关的IPC处理器
ipcMain.handle('fetch-quota', async (event, accessToken, email) => {
    try {
        console.log('[Quota IPC] 开始查询配额...');
        const result = await fetchQuota(accessToken, email);
        console.log('[Quota IPC] 配额查询结果:', result.success ? '成功' : '失败');
        return result;
    } catch (error) {
        console.error('[Quota IPC] 配额查询异常:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('format-time-remaining', (event, resetTime) => {
    return formatTimeRemaining(resetTime);
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    dialog.showErrorBox('应用错误', `发生未预期的错误: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});