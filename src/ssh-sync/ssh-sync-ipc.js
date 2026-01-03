// 尝试加载Electron的ipcMain，如果不在Electron环境中则使用null
let ipcMain;
try {
    ipcMain = require('electron').ipcMain;
} catch (error) {
    // 在非Electron环境中（如测试）使用模拟对象
    ipcMain = null;
}
const SSHManager = require('./ssh-manager');
const FileSyncService = require('./file-sync-service');
const ConfigStore = require('./config-store');
const ProgressMonitor = require('./progress-monitor');
const AutoSyncService = require('./auto-sync-service');

/**
 * SSH同步IPC处理器
 * 管理主进程中的SSH同步相关IPC通信
 */
class SSHSyncIPC {
    constructor() {
        this.configStore = new ConfigStore();
        this.sshManager = new SSHManager(this.configStore);
        this.progressMonitor = new ProgressMonitor();
        this.fileSyncService = new FileSyncService(this.sshManager, this.progressMonitor);
        this.autoSyncService = new AutoSyncService(this.fileSyncService, this.configStore);

        // 初始化时加载保存的配置
        this.initializeServices();

        // 设置自动同步事件回调
        this.setupAutoSyncCallbacks();

        // 注册IPC处理器
        this.registerHandlers();
    }

    /**
     * 初始化服务
     */
    async initializeServices() {
        try {
            // 让SSH管理器加载保存的配置
            await this.sshManager.loadSavedConfig();

            // 检查配置中的自动同步设置，如果启用则自动启动
            const configResult = await this.configStore.loadConfig();

            if (configResult.needsReconfigure) {
                console.log('SSH配置需要重新配置 (加密密钥已变化)');
                // 配置已损坏，跳过自动同步
                return;
            }

            if (configResult.success && configResult.config && configResult.config.autoSync) {
                console.log('配置中启用了自动同步，正在启动...');
                await this.autoSyncService.enable(configResult.config);
            }
        } catch (error) {
            console.error('初始化服务失败:', error);
        }
    }

    /**
     * 注册所有IPC处理器
     */
    registerHandlers() {
        // 如果不在Electron环境中，跳过IPC注册
        if (!ipcMain) {
            console.log('非Electron环境，跳过IPC处理器注册');
            return;
        }

        // SSH连接相关
        ipcMain.handle('ssh-test-connection', this.handleTestConnection.bind(this));
        ipcMain.handle('ssh-connect', this.handleConnect.bind(this));
        ipcMain.handle('ssh-disconnect', this.handleDisconnect.bind(this));
        ipcMain.handle('ssh-get-status', this.handleGetStatus.bind(this));

        // 配置管理相关
        ipcMain.handle('ssh-save-config', this.handleSaveConfig.bind(this));
        ipcMain.handle('ssh-load-config', this.handleLoadConfig.bind(this));
        ipcMain.handle('ssh-delete-config', this.handleDeleteConfig.bind(this));

        // 文件同步相关
        ipcMain.handle('ssh-sync-file', this.handleSyncFile.bind(this));
        ipcMain.handle('ssh-sync-antigravity-token', this.handleSyncAntigravityToken.bind(this));
        ipcMain.handle('ssh-cancel-sync', this.handleCancelSync.bind(this));
        ipcMain.handle('ssh-get-sync-status', this.handleGetSyncStatus.bind(this));

        // 进度监控相关
        ipcMain.handle('ssh-get-transfer-history', this.handleGetTransferHistory.bind(this));
        ipcMain.handle('ssh-get-transfer-statistics', this.handleGetTransferStatistics.bind(this));
        ipcMain.handle('ssh-clear-transfer-history', this.handleClearTransferHistory.bind(this));

        // 工具方法
        ipcMain.handle('ssh-check-local-file', this.handleCheckLocalFile.bind(this));
        ipcMain.handle('ssh-get-default-token-path', this.handleGetDefaultTokenPath.bind(this));

        // 自动同步相关
        ipcMain.handle('ssh-enable-auto-sync', this.handleEnableAutoSync.bind(this));
        ipcMain.handle('ssh-disable-auto-sync', this.handleDisableAutoSync.bind(this));
        ipcMain.handle('ssh-get-auto-sync-status', this.handleGetAutoSyncStatus.bind(this));
        ipcMain.handle('ssh-trigger-auto-sync', this.handleTriggerAutoSync.bind(this));

        console.log('SSH同步IPC处理器注册完成');
    }

    /**
     * 处理SSH连接测试
     */
    async handleTestConnection(event, config) {
        try {
            console.log('测试SSH连接:', config.host);
            const result = await this.sshManager.testConnection(config);

            if (result.success) {
                console.log('SSH连接测试成功');
            } else {
                console.log('SSH连接测试失败:', result.error);
            }

            return result;
        } catch (error) {
            console.error('SSH连接测试异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理SSH连接建立
     */
    async handleConnect(event, config) {
        try {
            console.log('建立SSH连接:', config.host);
            const result = await this.sshManager.connect(config);

            if (result.success) {
                console.log('SSH连接建立成功');
                // 发送连接状态更新事件
                event.sender.send('ssh-connection-status-changed', { connected: true });
            } else {
                console.log('SSH连接建立失败:', result.error);
            }

            return result;
        } catch (error) {
            console.error('SSH连接建立异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理SSH连接断开
     */
    async handleDisconnect(event) {
        try {
            console.log('断开SSH连接');
            const result = await this.sshManager.disconnect();

            if (result.success) {
                console.log('SSH连接断开成功');
                // 发送连接状态更新事件
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-connection-status-changed', { connected: false });
                }
            }

            return result;
        } catch (error) {
            console.error('SSH连接断开异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理获取SSH连接状态
     */
    async handleGetStatus(event) {
        try {
            return this.sshManager.getConnectionStatus();
        } catch (error) {
            console.error('获取SSH状态异常:', error);
            return { connected: false, error: error.message };
        }
    }

    /**
     * 处理保存SSH配置
     */
    async handleSaveConfig(event, config) {
        try {
            console.log('保存SSH配置');
            const result = await this.configStore.saveConfig(config);

            if (result.success) {
                console.log('SSH配置保存成功');
            } else {
                console.log('SSH配置保存失败:', result.error);
            }

            return result;
        } catch (error) {
            console.error('保存SSH配置异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理加载SSH配置
     */
    async handleLoadConfig(event) {
        try {
            console.log('加载SSH配置');
            const result = await this.configStore.loadConfig();

            if (result.success) {
                console.log('SSH配置加载成功');
            } else {
                console.log('SSH配置加载失败:', result.error);
            }

            return result;
        } catch (error) {
            console.error('加载SSH配置异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理删除SSH配置
     */
    async handleDeleteConfig(event) {
        try {
            console.log('删除SSH配置');
            const result = await this.configStore.deleteConfig();

            if (result.success) {
                console.log('SSH配置删除成功');
            }

            return result;
        } catch (error) {
            console.error('删除SSH配置异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理文件同步
     */
    async handleSyncFile(event, options) {
        try {
            const { localPath, remotePath } = options;
            console.log('开始文件同步:', localPath, '->', remotePath);

            // 创建进度回调
            const progressCallback = (progress) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-sync-progress', progress);
                }
            };

            const result = await this.fileSyncService.syncToRemote(
                localPath,
                remotePath,
                progressCallback
            );

            if (result.success) {
                console.log('文件同步成功');
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-sync-complete', { success: true, stats: result.stats });
                }
            } else {
                console.log('文件同步失败:', result.error);
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-sync-complete', { success: false, error: result.error });
                }
            }

            return result;
        } catch (error) {
            console.error('文件同步异常:', error);
            const result = { success: false, error: error.message };
            if (!event.sender.isDestroyed()) {
                event.sender.send('ssh-sync-complete', result);
            }
            return result;
        }
    }

    /**
     * 处理Antigravity Token同步
     */
    async handleSyncAntigravityToken(event, options = {}) {
        try {
            const { remotePath } = options;
            console.log('开始Antigravity Token同步');

            // 创建进度回调
            const progressCallback = (progress) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-sync-progress', progress);
                }
            };

            const result = await this.fileSyncService.syncAntigravityToken(remotePath, progressCallback);

            if (result.success) {
                console.log('Antigravity Token同步成功');
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-sync-complete', { success: true, stats: result.stats });
                }
            } else {
                console.log('Antigravity Token同步失败:', result.error);
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-sync-complete', { success: false, error: result.error });
                }
            }

            return result;
        } catch (error) {
            console.error('Antigravity Token同步异常:', error);
            const result = { success: false, error: error.message };
            if (!event.sender.isDestroyed()) {
                event.sender.send('ssh-sync-complete', result);
            }
            return result;
        }
    }

    /**
     * 处理取消同步
     */
    async handleCancelSync(event) {
        try {
            console.log('取消文件同步');
            const result = await this.fileSyncService.cancelTransfer();

            if (result.success) {
                console.log('文件同步取消成功');
                if (!event.sender.isDestroyed()) {
                    event.sender.send('ssh-sync-cancelled');
                }
            }

            return result;
        } catch (error) {
            console.error('取消文件同步异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理获取同步状态
     */
    async handleGetSyncStatus(event) {
        try {
            return this.fileSyncService.getTransferStatus();
        } catch (error) {
            console.error('获取同步状态异常:', error);
            return { transferring: false, error: error.message };
        }
    }

    /**
     * 处理获取传输历史
     */
    async handleGetTransferHistory(event, limit = 50) {
        try {
            return this.fileSyncService.getTransferHistory(limit);
        } catch (error) {
            console.error('获取传输历史异常:', error);
            return [];
        }
    }

    /**
     * 处理获取传输统计
     */
    async handleGetTransferStatistics(event) {
        try {
            return this.fileSyncService.getTransferStatistics();
        } catch (error) {
            console.error('获取传输统计异常:', error);
            return {
                active: 0,
                completed: 0,
                failed: 0,
                cancelled: 0,
                totalTransfers: 0,
                totalBytesTransferred: 0,
                averageSpeed: 0
            };
        }
    }

    /**
     * 处理清除传输历史
     */
    async handleClearTransferHistory(event) {
        try {
            this.fileSyncService.clearTransferHistory();
            console.log('传输历史清除成功');
            return { success: true };
        } catch (error) {
            console.error('清除传输历史异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理检查本地文件
     */
    async handleCheckLocalFile(event, filePath) {
        try {
            return await this.fileSyncService.checkLocalFile(filePath);
        } catch (error) {
            console.error('检查本地文件异常:', error);
            return { exists: false, error: error.message };
        }
    }

    /**
     * 处理获取默认Token路径
     */
    async handleGetDefaultTokenPath(event) {
        try {
            return {
                success: true,
                path: this.fileSyncService.getDefaultLocalTokenPath()
            };
        } catch (error) {
            console.error('获取默认Token路径异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 设置自动同步事件回调
     */
    setupAutoSyncCallbacks() {
        // 自动同步成功回调
        this.autoSyncService.setEventCallback('syncSuccess', (result) => {
            console.log('自动同步成功');
            // 不发送IPC消息，避免在UI状态变化时的竞态条件
        });

        // 自动同步失败回调
        this.autoSyncService.setEventCallback('syncError', (error) => {
            console.error('自动同步失败:', error);
            // 不发送IPC消息，避免在UI状态变化时的竞态条件
        });

        // 文件变化回调
        this.autoSyncService.setEventCallback('fileChange', (filePath) => {
            console.log('检测到文件变化:', filePath);
            // 不发送IPC消息，避免在UI状态变化时的竞态条件
        });
    }

    /**
     * 设置主窗口引用（用于发送事件）
     */
    setMainWindow(mainWindow) {
        this.mainWindow = mainWindow;
    }

    /**
     * 处理启用自动同步
     */
    async handleEnableAutoSync(event, config = null) {
        try {
            console.log('启用自动同步');
            const result = await this.autoSyncService.enable(config);

            if (result.success) {
                console.log('自动同步启用成功');
            } else {
                console.log('自动同步启用失败:', result.error);
            }

            return result;
        } catch (error) {
            console.error('启用自动同步异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理禁用自动同步
     */
    async handleDisableAutoSync(event) {
        try {
            console.log('禁用自动同步');
            const result = await this.autoSyncService.disable();

            if (result.success) {
                console.log('自动同步禁用成功');
            }

            return result;
        } catch (error) {
            console.error('禁用自动同步异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理获取自动同步状态
     */
    async handleGetAutoSyncStatus(event) {
        try {
            return await this.autoSyncService.getStatus();
        } catch (error) {
            console.error('获取自动同步状态异常:', error);
            return {
                enabled: false,
                running: false,
                watching: false,
                error: error.message
            };
        }
    }

    /**
     * 处理手动触发自动同步
     */
    async handleTriggerAutoSync(event) {
        try {
            console.log('手动触发自动同步');
            const result = await this.autoSyncService.triggerSync();

            if (result.success) {
                console.log('手动触发自动同步成功');
            } else {
                console.log('手动触发自动同步失败:', result.error);
            }

            return result;
        } catch (error) {
            console.error('手动触发自动同步异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理保存SSH配置（重写以支持自动同步）
     */
    async handleSaveConfig(event, config) {
        try {
            console.log('保存SSH配置');
            const result = await this.configStore.saveConfig(config);

            if (result.success) {
                console.log('SSH配置保存成功');

                // 如果启用了自动同步，更新自动同步服务
                if (config.autoSync) {
                    await this.autoSyncService.enable(config);
                } else {
                    await this.autoSyncService.disable();
                }
            } else {
                console.log('SSH配置保存失败:', result.error);
            }

            return result;
        } catch (error) {
            console.error('保存SSH配置异常:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        try {
            // 清理自动同步服务
            if (this.autoSyncService) {
                this.autoSyncService.cleanup();
            }

            // 断开SSH连接
            if (this.sshManager) {
                this.sshManager.disconnect();
            }

            console.log('SSH同步IPC资源清理完成');
        } catch (error) {
            console.error('SSH同步IPC资源清理异常:', error);
        }
    }
}

module.exports = SSHSyncIPC;