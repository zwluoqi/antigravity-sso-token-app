const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ProgressMonitor = require('./progress-monitor');
const ErrorHandler = require('./error-handler');

/**
 * 文件同步服务类
 * 负责文件的上传、下载和同步操作
 */
class FileSyncService {
    constructor(sshManager, progressMonitor = null) {
        this.sshManager = sshManager;
        this.progressMonitor = progressMonitor || new ProgressMonitor();
        this.isTransferring = false;
        this.currentTransfer = null;
        this.currentTransferId = null;
        this.transferStats = {
            startTime: null,
            endTime: null,
            totalBytes: 0,
            transferredBytes: 0,
            speed: 0,
            cancelled: false,
            error: null
        };

        // 默认的current_token.json路径 (Antigravity)
        this.defaultLocalTokenPath = path.join(os.homedir(), '.antigravity-sso-token-manager', 'current_token.json');
    }

    /**
     * 同步文件到远程服务器
     * @param {string} localPath - 本地文件路径
     * @param {string} remotePath - 远程文件路径
     * @param {function} progressCallback - 进度回调函数
     * @returns {Promise<{success: boolean, error?: string, stats?: object}>}
     */
    async syncToRemote(localPath, remotePath, progressCallback = null) {
        try {
            // 检查是否正在传输
            if (this.isTransferring) {
                return { success: false, error: '已有文件传输正在进行中' };
            }

            // 检查SSH连接，如果未连接则尝试连接
            const connectionStatus = this.sshManager.getConnectionStatus();
            if (!connectionStatus.connected) {
                // 尝试使用保存的配置建立连接
                if (connectionStatus.config) {
                    console.log('SSH未连接，尝试使用保存的配置建立连接...');
                    const connectResult = await this.sshManager.connect(connectionStatus.config);
                    if (!connectResult.success) {
                        return { success: false, error: `连接失败: ${connectResult.error}` };
                    }
                    console.log('SSH连接建立成功');
                } else {
                    return { success: false, error: '未建立SSH连接且无保存的配置' };
                }
            }

            // 检查本地文件
            const localFileCheck = await this.checkLocalFile(localPath);
            if (!localFileCheck.exists) {
                return { success: false, error: `本地文件不存在: ${localPath}` };
            }

            // 生成传输ID并开始监控
            this.currentTransferId = this.progressMonitor.generateTransferId();
            this.progressMonitor.startTransfer(this.currentTransferId, {
                localPath,
                remotePath,
                totalBytes: localFileCheck.stats.size,
                type: 'upload'
            });

            // 开始传输
            this.isTransferring = true;
            this.transferStats.startTime = new Date();
            this.transferStats.totalBytes = localFileCheck.stats.size;
            this.transferStats.transferredBytes = 0;
            this.transferStats.cancelled = false;

            // 展开远程路径中的~符号并规范化路径
            let expandedRemotePath = remotePath;
            if (remotePath.startsWith('~')) {
                const expandResult = await this.sshManager.executeCommand('echo $HOME');
                if (expandResult.success) {
                    const homeDir = expandResult.result.stdout.trim();
                    expandedRemotePath = remotePath.replace('~', homeDir);
                }
            }

            // 确保使用Unix路径分隔符
            expandedRemotePath = expandedRemotePath.replace(/\\/g, '/');
            console.log(`文件传输路径: ${remotePath} -> ${expandedRemotePath}`);

            // 确保远程目录存在（使用Unix路径处理）
            const remoteDir = expandedRemotePath.substring(0, expandedRemotePath.lastIndexOf('/'));
            const dirResult = await this.sshManager.createRemoteDirectory(remoteDir);
            if (!dirResult.success) {
                this.isTransferring = false;
                return { success: false, error: `创建远程目录失败: ${dirResult.error}` };
            }

            // 获取SSH连接
            const ssh = this.sshManager.getSSHConnection();
            if (!ssh) {
                this.isTransferring = false;
                return { success: false, error: 'SSH连接不可用' };
            }

            // 执行文件传输
            this.currentTransfer = ssh.putFile(localPath, expandedRemotePath, null, {
                step: (totalTransferred, chunk, total) => {
                    // 检查是否被取消
                    if (this.transferStats.cancelled) {
                        return; // 停止处理进度更新
                    }

                    this.transferStats.transferredBytes = totalTransferred;

                    // 计算传输速度
                    const elapsed = (new Date() - this.transferStats.startTime) / 1000;
                    this.transferStats.speed = elapsed > 0 ? totalTransferred / elapsed : 0;

                    // 调用进度回调
                    if (progressCallback && typeof progressCallback === 'function') {
                        const progress = {
                            totalBytes: total,
                            transferredBytes: totalTransferred,
                            percentage: Math.round((totalTransferred / total) * 100),
                            speed: this.transferStats.speed,
                            speedFormatted: this.formatTransferSpeed(this.transferStats.speed),
                            estimatedTimeRemaining: this.calculateETA(totalTransferred, total, this.transferStats.speed),
                            estimatedTimeRemainingFormatted: this.formatTime(this.calculateETA(totalTransferred, total, this.transferStats.speed)),
                            elapsedTime: elapsed,
                            elapsedTimeFormatted: this.formatTime(Math.round(elapsed)),
                            fileSizeFormatted: this.formatFileSize(total),
                            transferredFormatted: this.formatFileSize(totalTransferred)
                        };

                        // 更新进度监控器
                        this.progressMonitor.updateProgress(this.currentTransferId, progress);

                        try {
                            progressCallback(progress);
                        } catch (callbackError) {
                            console.error('进度回调执行失败:', callbackError);
                        }
                    }
                }
            });

            await this.currentTransfer;

            // 验证文件传输
            const verifyResult = await this.verifyRemoteFile(expandedRemotePath, localFileCheck.stats.size);
            if (!verifyResult.success) {
                this.isTransferring = false;
                return { success: false, error: `文件传输验证失败: ${verifyResult.error}` };
            }

            // 完成传输
            this.transferStats.endTime = new Date();
            this.isTransferring = false;

            const duration = this.transferStats.endTime - this.transferStats.startTime;
            const avgSpeed = duration > 0 ? this.transferStats.totalBytes / (duration / 1000) : 0;

            const result = {
                success: true,
                stats: {
                    startTime: this.transferStats.startTime,
                    endTime: this.transferStats.endTime,
                    duration: duration,
                    fileSize: this.transferStats.totalBytes,
                    transferSpeed: avgSpeed
                }
            };

            // 通知进度监控器传输完成
            this.progressMonitor.completeTransfer(this.currentTransferId, result);
            this.currentTransferId = null;

            return result;

        } catch (error) {
            console.error('文件同步失败:', error);

            // 记录错误日志
            ErrorHandler.logError(error, 'transfer', {
                operation: 'syncToRemote',
                localPath,
                remotePath
            });

            this.isTransferring = false;

            const result = {
                success: false,
                error: ErrorHandler.handleError(error, 'transfer')
            };

            // 通知进度监控器传输失败
            if (this.currentTransferId) {
                this.progressMonitor.completeTransfer(this.currentTransferId, result);
                this.currentTransferId = null;
            }

            return result;
        }
    }

    /**
     * 检查本地文件是否存在
     * @param {string} filePath - 文件路径
     * @returns {Promise<{exists: boolean, stats?: object, error?: string}>}
     */
    async checkLocalFile(filePath) {
        try {
            const stats = await fs.stat(filePath);

            if (!stats.isFile()) {
                return { exists: false, error: '路径不是文件' };
            }

            return {
                exists: true,
                stats: {
                    size: stats.size,
                    mtime: stats.mtime,
                    mode: stats.mode
                }
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                return { exists: false };
            }

            console.error('检查本地文件失败:', error);
            return {
                exists: false,
                error: `检查文件失败: ${error.message}`
            };
        }
    }

    /**
     * 验证远程文件
     * @param {string} remotePath - 远程文件路径
     * @param {number} expectedSize - 期望的文件大小
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async verifyRemoteFile(remotePath, expectedSize) {
        try {
            // 处理路径，确保使用正确的格式
            let processedPath = remotePath;

            // 如果路径包含~，展开它
            if (processedPath.startsWith('~')) {
                const homeResult = await this.sshManager.executeCommand('echo $HOME');
                if (homeResult.success) {
                    const homeDir = homeResult.result.stdout.trim();
                    processedPath = processedPath.replace('~', homeDir);
                }
            }

            // 确保使用Unix路径分隔符
            processedPath = processedPath.replace(/\\/g, '/');

            console.log(`验证远程文件: ${remotePath} -> ${processedPath}`);

            const result = await this.sshManager.executeCommand(`stat -c %s "${processedPath}"`);

            if (!result.success) {
                // 如果文件不存在，检查目录是否存在，如果不存在则创建
                const remoteDir = processedPath.substring(0, processedPath.lastIndexOf('/'));
                console.log(`文件不存在，检查目录: ${remoteDir}`);

                const dirCheckResult = await this.sshManager.executeCommand(`test -d "${remoteDir}"`);
                if (!dirCheckResult.success) {
                    console.log(`目录不存在，尝试创建: ${remoteDir}`);
                    const createDirResult = await this.sshManager.createRemoteDirectory(remoteDir);
                    if (!createDirResult.success) {
                        return { success: false, error: `无法创建远程目录: ${createDirResult.error}` };
                    }
                }

                return { success: false, error: '远程文件不存在，可能上传失败' };
            }

            const remoteSize = parseInt(result.result.stdout.trim());

            if (isNaN(remoteSize)) {
                return { success: false, error: '远程文件大小格式无效' };
            }

            if (remoteSize !== expectedSize) {
                return {
                    success: false,
                    error: `文件大小不匹配，期望: ${expectedSize}, 实际: ${remoteSize}`
                };
            }

            return { success: true };
        } catch (error) {
            console.error('验证远程文件失败:', error);
            return {
                success: false,
                error: `验证失败: ${error.message}`
            };
        }
    }

    /**
     * 取消当前传输
     * @returns {Promise<{success: boolean}>}
     */
    async cancelTransfer() {
        try {
            if (!this.isTransferring) {
                return { success: true };
            }

            // 标记取消状态
            this.isTransferring = false;
            this.transferStats.cancelled = true;
            this.transferStats.endTime = new Date();

            // 通知进度监控器传输被取消
            if (this.currentTransferId) {
                this.progressMonitor.cancelTransfer(this.currentTransferId);
                this.currentTransferId = null;
            }

            // 如果有当前传输的引用，尝试中断
            if (this.currentTransfer) {
                try {
                    // 注意：node-ssh库的putFile方法可能不支持中途取消
                    // 但我们可以设置一个标志来在进度回调中检查
                    this.currentTransfer = null;
                } catch (cancelError) {
                    console.warn('无法中断当前传输:', cancelError);
                }
            }

            return { success: true };
        } catch (error) {
            console.error('取消传输失败:', error);
            return { success: true }; // 即使出错也返回成功
        }
    }

    /**
     * 获取传输状态
     * @returns {{transferring: boolean, progress?: object}}
     */
    getTransferStatus() {
        if (!this.isTransferring) {
            return { transferring: false };
        }

        const progress = this.transferStats.totalBytes > 0 ?
            Math.round((this.transferStats.transferredBytes / this.transferStats.totalBytes) * 100) : 0;

        return {
            transferring: true,
            progress: {
                percentage: progress,
                totalBytes: this.transferStats.totalBytes,
                transferredBytes: this.transferStats.transferredBytes,
                speed: this.transferStats.speed,
                startTime: this.transferStats.startTime,
                estimatedTimeRemaining: this.calculateETA(
                    this.transferStats.transferredBytes,
                    this.transferStats.totalBytes,
                    this.transferStats.speed
                )
            }
        };
    }

    /**
     * 同步默认的current_token.json文件 (Antigravity)
     * @param {string} remotePath - 远程路径（可选，默认使用配置中的路径）
     * @param {function} progressCallback - 进度回调函数
     * @returns {Promise<{success: boolean, error?: string, stats?: object}>}
     */
    async syncAntigravityToken(remotePath = null, progressCallback = null) {
        try {
            // 使用默认本地路径
            const localPath = this.defaultLocalTokenPath;

            // 确定远程路径
            let targetRemotePath = remotePath;
            if (!targetRemotePath) {
                const connectionStatus = this.sshManager.getConnectionStatus();
                if (connectionStatus.config && connectionStatus.config.remotePath) {
                    targetRemotePath = path.join(connectionStatus.config.remotePath, 'current_token.json');
                } else {
                    targetRemotePath = '~/.antigravity-sso-token-manager/current_token.json';
                }
            }

            return await this.syncToRemote(localPath, targetRemotePath, progressCallback);
        } catch (error) {
            console.error('同步Antigravity Token失败:', error);
            return {
                success: false,
                error: `同步Antigravity Token失败: ${error.message}`
            };
        }
    }

    /**
     * 计算预计剩余时间
     * @param {number} transferred - 已传输字节数
     * @param {number} total - 总字节数
     * @param {number} speed - 传输速度（字节/秒）
     * @returns {number} 预计剩余时间（秒）
     */
    calculateETA(transferred, total, speed) {
        if (speed <= 0 || transferred >= total) {
            return 0;
        }

        const remaining = total - transferred;
        return Math.round(remaining / speed);
    }

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化的文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化传输速度
     * @param {number} bytesPerSecond - 每秒字节数
     * @returns {string} 格式化的传输速度
     */
    formatTransferSpeed(bytesPerSecond) {
        return this.formatFileSize(bytesPerSecond) + '/s';
    }

    /**
     * 格式化时间
     * @param {number} seconds - 秒数
     * @returns {string} 格式化的时间
     */
    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}秒`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}分${remainingSeconds}秒`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}小时${minutes}分钟`;
        }
    }

    /**
     * 重置传输统计
     */
    resetTransferStats() {
        this.transferStats = {
            startTime: null,
            endTime: null,
            totalBytes: 0,
            transferredBytes: 0,
            speed: 0
        };
    }

    /**
     * 设置默认本地Token路径
     * @param {string} path - 本地文件路径
     */
    setDefaultLocalTokenPath(path) {
        if (typeof path === 'string' && path.trim() !== '') {
            this.defaultLocalTokenPath = path;
        }
    }

    /**
     * 获取默认本地Token路径
     * @returns {string}
     */
    getDefaultLocalTokenPath() {
        return this.defaultLocalTokenPath;
    }

    /**
     * 获取进度监控器
     * @returns {ProgressMonitor}
     */
    getProgressMonitor() {
        return this.progressMonitor;
    }

    /**
     * 添加传输进度监听器
     * @param {function} callback - 回调函数
     */
    addProgressListener(callback) {
        if (this.currentTransferId) {
            this.progressMonitor.addProgressListener(this.currentTransferId, callback);
        }
    }

    /**
     * 获取传输统计信息
     * @returns {object}
     */
    getTransferStatistics() {
        return this.progressMonitor.getStatistics();
    }

    /**
     * 获取传输历史
     * @param {number} limit - 限制数量
     * @returns {Array}
     */
    getTransferHistory(limit = 50) {
        return this.progressMonitor.getTransferHistory(limit);
    }

    /**
     * 清除传输历史
     */
    clearTransferHistory() {
        this.progressMonitor.clearHistory();
    }
}

module.exports = FileSyncService;