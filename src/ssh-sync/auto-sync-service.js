const chokidar = require('chokidar');
const path = require('path');
const os = require('os');

/**
 * 自动同步服务类
 * 监控本地current_token.json文件变化并自动同步
 */
class AutoSyncService {
    constructor(fileSyncService, configStore) {
        this.fileSyncService = fileSyncService;
        this.configStore = configStore;
        this.watcher = null;
        this.isEnabled = false;
        this.isWatching = false;
        this.lastSyncTime = 0;
        this.syncCooldown = 5000; // 5秒冷却时间，避免频繁同步
        this.retryAttempts = 3;
        this.retryDelay = 10000; // 10秒重试延迟

        // 默认监控的文件路径 (Antigravity)
        this.defaultTokenPath = path.join(os.homedir(), '.antigravity-sso-token-manager', 'current_token.json');
        this.watchedPath = this.defaultTokenPath;

        // 事件回调
        this.onSyncSuccess = null;
        this.onSyncError = null;
        this.onFileChange = null;
    }

    /**
     * 启用自动同步
     * @param {object} config - SSH配置
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async enable(config = null) {
        try {
            // 如果没有提供配置，尝试加载保存的配置
            if (!config) {
                const configResult = await this.configStore.loadConfig();
                if (!configResult.success || !configResult.config.autoSync) {
                    return { success: false, error: '自动同步未启用或配置不存在' };
                }
                config = configResult.config;
            }

            // 检查配置是否启用自动同步
            if (!config.autoSync) {
                return { success: false, error: '配置中未启用自动同步' };
            }

            this.isEnabled = true;
            await this.startWatching();

            console.log('自动同步服务已启用');
            return { success: true };
        } catch (error) {
            console.error('启用自动同步失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 禁用自动同步
     * @returns {Promise<{success: boolean}>}
     */
    async disable() {
        try {
            this.isEnabled = false;
            await this.stopWatching();

            console.log('自动同步服务已禁用');
            return { success: true };
        } catch (error) {
            console.error('禁用自动同步失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 开始监控文件变化
     */
    async startWatching() {
        if (this.isWatching) {
            return;
        }

        try {
            // 创建文件监控器
            this.watcher = chokidar.watch(this.watchedPath, {
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 1000,
                    pollInterval: 100
                }
            });

            // 监听文件变化事件
            this.watcher.on('change', (filePath) => {
                this.handleFileChange(filePath);
            });

            this.watcher.on('add', (filePath) => {
                this.handleFileChange(filePath);
            });

            this.watcher.on('error', (error) => {
                console.error('文件监控错误:', error);
                if (this.onSyncError) {
                    this.onSyncError(error);
                }
            });

            this.isWatching = true;
            console.log(`开始监控文件: ${this.watchedPath}`);
        } catch (error) {
            console.error('启动文件监控失败:', error);
            throw error;
        }
    }

    /**
     * 停止监控文件变化
     */
    async stopWatching() {
        if (!this.isWatching || !this.watcher) {
            return;
        }

        try {
            await this.watcher.close();
            this.watcher = null;
            this.isWatching = false;
            console.log('文件监控已停止');
        } catch (error) {
            console.error('停止文件监控失败:', error);
            throw error;
        }
    }

    /**
     * 处理文件变化事件
     */
    async handleFileChange(filePath) {
        if (!this.isEnabled) {
            return;
        }

        const now = Date.now();

        // 检查冷却时间
        if (now - this.lastSyncTime < this.syncCooldown) {
            console.log('文件变化检测到，但在冷却时间内，跳过同步');
            return;
        }

        console.log(`检测到文件变化: ${filePath}`);

        // 触发文件变化回调
        if (this.onFileChange) {
            this.onFileChange(filePath);
        }

        // 执行自动同步
        await this.performAutoSync();
    }

    /**
     * 执行自动同步
     */
    async performAutoSync() {
        let attempts = 0;

        while (attempts < this.retryAttempts) {
            try {
                console.log(`开始自动同步 (尝试 ${attempts + 1}/${this.retryAttempts})`);

                // 检查SSH连接状态
                const sshManager = this.fileSyncService.sshManager;
                const connectionStatus = sshManager.getConnectionStatus();

                if (!connectionStatus.connected) {
                    // 尝试重新连接
                    const configResult = await this.configStore.loadConfig();
                    if (configResult.success && configResult.config) {
                        const connectResult = await sshManager.connect(configResult.config);
                        if (!connectResult.success) {
                            throw new Error(`SSH连接失败: ${connectResult.error}`);
                        }
                    } else {
                        throw new Error('无法加载SSH配置');
                    }
                }

                // 执行同步
                const syncResult = await this.fileSyncService.syncAntigravityToken();

                if (syncResult.success) {
                    this.lastSyncTime = Date.now();
                    console.log('自动同步成功');

                    if (this.onSyncSuccess) {
                        this.onSyncSuccess(syncResult);
                    }

                    return;
                } else {
                    throw new Error(syncResult.error);
                }

            } catch (error) {
                attempts++;
                console.error(`自动同步失败 (尝试 ${attempts}/${this.retryAttempts}):`, error.message);

                if (attempts >= this.retryAttempts) {
                    console.error('自动同步达到最大重试次数，放弃同步');

                    if (this.onSyncError) {
                        this.onSyncError(error);
                    }

                    return;
                }

                // 等待重试延迟
                await this.sleep(this.retryDelay);
            }
        }
    }

    /**
     * 获取自动同步状态
     * @returns {object} 状态信息
     */
    async getStatus() {
        // 从配置文件读取autoSync设置，而不是使用运行时状态
        let configAutoSync = false;
        try {
            const configResult = await this.configStore.loadConfig();
            if (configResult.success && configResult.config) {
                configAutoSync = configResult.config.autoSync || false;
            }
        } catch (error) {
            console.error('获取自动同步配置失败:', error);
        }

        return {
            enabled: configAutoSync, // 使用配置文件中的设置
            running: this.isEnabled, // 运行时状态
            watching: this.isWatching,
            watchedPath: this.watchedPath,
            lastSyncTime: this.lastSyncTime,
            syncCooldown: this.syncCooldown,
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay
        };
    }

    /**
     * 设置监控路径
     * @param {string} filePath - 文件路径
     */
    setWatchedPath(filePath) {
        if (typeof filePath === 'string' && filePath.trim() !== '') {
            this.watchedPath = filePath;
        }
    }

    /**
     * 设置同步冷却时间
     * @param {number} cooldown - 冷却时间（毫秒）
     */
    setSyncCooldown(cooldown) {
        if (typeof cooldown === 'number' && cooldown > 0) {
            this.syncCooldown = cooldown;
        }
    }

    /**
     * 设置重试参数
     * @param {number} attempts - 重试次数
     * @param {number} delay - 重试延迟（毫秒）
     */
    setRetryParams(attempts, delay) {
        if (typeof attempts === 'number' && attempts > 0) {
            this.retryAttempts = attempts;
        }
        if (typeof delay === 'number' && delay > 0) {
            this.retryDelay = delay;
        }
    }

    /**
     * 设置事件回调
     * @param {string} event - 事件名称
     * @param {function} callback - 回调函数
     */
    setEventCallback(event, callback) {
        switch (event) {
            case 'syncSuccess':
                this.onSyncSuccess = callback;
                break;
            case 'syncError':
                this.onSyncError = callback;
                break;
            case 'fileChange':
                this.onFileChange = callback;
                break;
        }
    }

    /**
     * 手动触发同步检查
     */
    async triggerSync() {
        if (!this.isEnabled) {
            return { success: false, error: '自动同步未启用' };
        }

        try {
            await this.performAutoSync();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 睡眠函数
     * @param {number} ms - 毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 清理资源
     */
    async cleanup() {
        try {
            // 停止文件监控和运行时状态，但不修改配置文件
            this.isEnabled = false;
            await this.stopWatching();
            console.log('自动同步服务资源清理完成');
        } catch (error) {
            console.error('自动同步服务清理失败:', error);
        }
    }
}

module.exports = AutoSyncService;