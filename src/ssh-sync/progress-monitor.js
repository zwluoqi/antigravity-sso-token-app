/**
 * 进度监控器类
 * 管理文件传输的进度监控和事件通知
 */
class ProgressMonitor {
    constructor() {
        this.listeners = new Map();
        this.activeTransfers = new Map();
        this.transferHistory = [];
        this.maxHistorySize = 100;
    }

    /**
     * 添加进度监听器
     * @param {string} transferId - 传输ID
     * @param {function} callback - 回调函数
     */
    addProgressListener(transferId, callback) {
        if (!this.listeners.has(transferId)) {
            this.listeners.set(transferId, []);
        }
        this.listeners.get(transferId).push(callback);
    }

    /**
     * 移除进度监听器
     * @param {string} transferId - 传输ID
     * @param {function} callback - 回调函数（可选）
     */
    removeProgressListener(transferId, callback = null) {
        if (!this.listeners.has(transferId)) {
            return;
        }

        if (callback) {
            const callbacks = this.listeners.get(transferId);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        } else {
            this.listeners.delete(transferId);
        }
    }

    /**
     * 开始监控传输
     * @param {string} transferId - 传输ID
     * @param {object} transferInfo - 传输信息
     */
    startTransfer(transferId, transferInfo) {
        const transfer = {
            id: transferId,
            ...transferInfo,
            startTime: new Date(),
            status: 'active',
            progress: {
                percentage: 0,
                transferredBytes: 0,
                totalBytes: transferInfo.totalBytes || 0,
                speed: 0
            }
        };

        this.activeTransfers.set(transferId, transfer);
        this.notifyListeners(transferId, 'start', transfer);
    }

    /**
     * 更新传输进度
     * @param {string} transferId - 传输ID
     * @param {object} progress - 进度信息
     */
    updateProgress(transferId, progress) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer) {
            return;
        }

        transfer.progress = { ...transfer.progress, ...progress };
        transfer.lastUpdateTime = new Date();

        this.notifyListeners(transferId, 'progress', transfer);
    }

    /**
     * 完成传输
     * @param {string} transferId - 传输ID
     * @param {object} result - 传输结果
     */
    completeTransfer(transferId, result) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer) {
            return;
        }

        transfer.endTime = new Date();
        transfer.status = result.success ? 'completed' : 'failed';
        transfer.result = result;

        // 移动到历史记录
        this.addToHistory(transfer);
        this.activeTransfers.delete(transferId);

        this.notifyListeners(transferId, 'complete', transfer);
        this.removeProgressListener(transferId);
    }

    /**
     * 取消传输
     * @param {string} transferId - 传输ID
     */
    cancelTransfer(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer) {
            return;
        }

        transfer.endTime = new Date();
        transfer.status = 'cancelled';

        // 移动到历史记录
        this.addToHistory(transfer);
        this.activeTransfers.delete(transferId);

        this.notifyListeners(transferId, 'cancel', transfer);
        this.removeProgressListener(transferId);
    }

    /**
     * 获取活动传输列表
     * @returns {Array} 活动传输列表
     */
    getActiveTransfers() {
        return Array.from(this.activeTransfers.values());
    }

    /**
     * 获取传输历史
     * @param {number} limit - 限制数量
     * @returns {Array} 传输历史
     */
    getTransferHistory(limit = 50) {
        return this.transferHistory.slice(-limit);
    }

    /**
     * 获取传输统计
     * @returns {object} 统计信息
     */
    getStatistics() {
        const active = this.getActiveTransfers();
        const history = this.transferHistory;

        const completed = history.filter(t => t.status === 'completed');
        const failed = history.filter(t => t.status === 'failed');
        const cancelled = history.filter(t => t.status === 'cancelled');

        const totalBytes = completed.reduce((sum, t) => sum + (t.progress.totalBytes || 0), 0);
        const totalTime = completed.reduce((sum, t) => {
            if (t.startTime && t.endTime) {
                return sum + (t.endTime - t.startTime);
            }
            return sum;
        }, 0);

        return {
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            cancelled: cancelled.length,
            totalTransfers: history.length,
            totalBytesTransferred: totalBytes,
            averageSpeed: totalTime > 0 ? totalBytes / (totalTime / 1000) : 0
        };
    }

    /**
     * 清除历史记录
     */
    clearHistory() {
        this.transferHistory = [];
    }

    /**
     * 通知监听器
     * @param {string} transferId - 传输ID
     * @param {string} event - 事件类型
     * @param {object} data - 事件数据
     */
    notifyListeners(transferId, event, data) {
        const callbacks = this.listeners.get(transferId);
        if (!callbacks) {
            return;
        }

        callbacks.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('进度监听器回调失败:', error);
            }
        });
    }

    /**
     * 添加到历史记录
     * @param {object} transfer - 传输对象
     */
    addToHistory(transfer) {
        this.transferHistory.push({ ...transfer });

        // 限制历史记录大小
        if (this.transferHistory.length > this.maxHistorySize) {
            this.transferHistory = this.transferHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * 生成传输ID
     * @returns {string} 唯一的传输ID
     */
    generateTransferId() {
        return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 设置历史记录最大大小
     * @param {number} size - 最大大小
     */
    setMaxHistorySize(size) {
        if (typeof size === 'number' && size > 0) {
            this.maxHistorySize = size;
            
            // 如果当前历史记录超过新的限制，进行裁剪
            if (this.transferHistory.length > size) {
                this.transferHistory = this.transferHistory.slice(-size);
            }
        }
    }
}

module.exports = ProgressMonitor;