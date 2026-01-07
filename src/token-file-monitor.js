const chokidar = require('chokidar');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');

/**
 * Token文件监控服务类
 * 专门监控Antigravity Token文件的删除事件，并触发服务器同步机制
 */
class TokenFileMonitor {
    constructor() {
        this.watcher = null;
        this.isWatching = false;
        this.syncCooldown = 2000; // 2秒冷却时间，避免频繁同步
        this.lastSyncTime = 0;

        // Antigravity Token文件路径
        this.tokenFilePath = path.join(os.homedir(), '.antigravity-sso-token-manager', 'current_token.json');

        // 事件回调
        this.onTokenFileDeleted = null;
        this.onSyncTriggered = null;
        this.onError = null;

        console.log(`Token文件监控器初始化，监控路径: ${this.tokenFilePath}`);
    }

    /**
     * 开始监控Token文件
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async startWatching() {
        if (this.isWatching) {
            console.log('Token文件监控器已在运行中');
            return { success: true };
        }

        try {
            // 确保监控目录存在
            const tokenDir = path.dirname(this.tokenFilePath);
            await fs.ensureDir(tokenDir);

            // 创建文件监控器
            this.watcher = chokidar.watch(this.tokenFilePath, {
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 100
                }
            });

            // 监听文件删除事件
            this.watcher.on('unlink', (filePath) => {
                this.handleTokenFileDeleted(filePath);
            });

            // 监听文件添加事件（文件被重新创建）
            this.watcher.on('add', (filePath) => {
                console.log(`Token文件被重新创建: ${filePath}`);
            });

            // 监听错误事件
            this.watcher.on('error', (error) => {
                console.error('Token文件监控错误:', error);
                if (this.onError) {
                    this.onError(error);
                }
            });

            this.isWatching = true;
            console.log(`开始监控Token文件删除事件: ${this.tokenFilePath}`);

            return { success: true };
        } catch (error) {
            console.error('启动Token文件监控失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 停止监控Token文件
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async stopWatching() {
        if (!this.isWatching || !this.watcher) {
            console.log('Token文件监控器未在运行');
            return { success: true };
        }

        try {
            await this.watcher.close();
            this.watcher = null;
            this.isWatching = false;
            console.log('Token文件监控已停止');
            return { success: true };
        } catch (error) {
            console.error('停止Token文件监控失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理Token文件删除事件
     * @param {string} filePath - 被删除的文件路径
     */
    async handleTokenFileDeleted(filePath) {
        const now = Date.now();

        // 检查冷却时间
        if (now - this.lastSyncTime < this.syncCooldown) {
            console.log('Token文件删除检测到，但在冷却时间内，跳过同步');
            return;
        }

        console.log(`检测到Token文件被删除: ${filePath}`);

        // 触发文件删除回调
        if (this.onTokenFileDeleted) {
            this.onTokenFileDeleted(filePath);
        }

        // 等待一小段时间确保文件确实被删除
        await this.sleep(500);

        // 再次确认文件不存在
        const fileExists = await fs.pathExists(this.tokenFilePath);
        if (!fileExists) {
            console.log('确认Token文件已被删除，触发服务器同步机制');
            this.lastSyncTime = now;

            // 触发同步回调
            if (this.onSyncTriggered) {
                await this.onSyncTriggered(filePath);
            }
        } else {
            console.log('Token文件已恢复，取消同步');
        }
    }

    /**
     * 设置事件回调函数
     * @param {string} event - 事件名称 ('tokenFileDeleted', 'syncTriggered', 'error')
     * @param {function} callback - 回调函数
     */
    setEventCallback(event, callback) {
        switch (event) {
            case 'tokenFileDeleted':
                this.onTokenFileDeleted = callback;
                break;
            case 'syncTriggered':
                this.onSyncTriggered = callback;
                break;
            case 'error':
                this.onError = callback;
                break;
            default:
                console.warn(`未知的事件类型: ${event}`);
        }
    }

    /**
     * 获取监控状态
     * @returns {object} 状态信息
     */
    getStatus() {
        return {
            isWatching: this.isWatching,
            tokenFilePath: this.tokenFilePath,
            lastSyncTime: this.lastSyncTime,
            syncCooldown: this.syncCooldown
        };
    }

    /**
     * 设置同步冷却时间
     * @param {number} cooldown - 冷却时间（毫秒）
     */
    setSyncCooldown(cooldown) {
        if (typeof cooldown === 'number' && cooldown > 0) {
            this.syncCooldown = cooldown;
            console.log(`Token文件监控同步冷却时间设置为: ${cooldown}ms`);
        }
    }

    /**
     * 手动触发同步检查
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async triggerSyncCheck() {
        try {
            const fileExists = await fs.pathExists(this.tokenFilePath);
            if (!fileExists) {
                console.log('手动检查发现Token文件不存在，触发同步');
                if (this.onSyncTriggered) {
                    await this.onSyncTriggered(this.tokenFilePath);
                }
                return { success: true };
            } else {
                console.log('手动检查发现Token文件存在，无需同步');
                return { success: true, message: 'Token文件存在，无需同步' };
            }
        } catch (error) {
            console.error('手动触发同步检查失败:', error);
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
            await this.stopWatching();
            console.log('Token文件监控器资源清理完成');
        } catch (error) {
            console.error('Token文件监控器清理失败:', error);
        }
    }
}

module.exports = TokenFileMonitor;