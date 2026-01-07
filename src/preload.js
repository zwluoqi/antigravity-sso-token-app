const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // Antigravity Token 相关操作
    getAntigravityToken: () => ipcRenderer.invoke('get-antigravity-token'),
    saveAntigravityToken: (tokenData) => ipcRenderer.invoke('save-antigravity-token', tokenData),
    resetDeviceId: () => ipcRenderer.invoke('reset-device-id'), // 保持向后兼容

    // 服务器通信
    requestTokenFromServer: (currentTokenId, ssoToken) => ipcRenderer.invoke('request-token-from-server', currentTokenId, ssoToken),
    refreshTokenFromServer: (tokenId, ssoToken) => ipcRenderer.invoke('refresh-token-from-server', tokenId, ssoToken),
    getSooHoldToken: (ssoToken) => ipcRenderer.invoke('get-soo-hold-token', ssoToken),

    // 应用配置
    getAppConfig: () => ipcRenderer.invoke('get-app-config'),
    saveAppConfig: (config) => ipcRenderer.invoke('save-app-config', config),

    // 对话框
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
    showErrorBox: (title, content) => ipcRenderer.invoke('show-error-box', title, content),

    // 路径信息
    getAntigravityDataPath: () => ipcRenderer.invoke('get-antigravity-data-path'),
    getAntigravityAuthTokenPath: () => ipcRenderer.invoke('get-antigravity-auth-token-path'),
    getAntigravityDbPath: () => ipcRenderer.invoke('get-antigravity-db-path'),

    // 进程管理
    closeAntigravityProcess: () => ipcRenderer.invoke('close-antigravity-process'),
    restartAntigravityProcess: (antigravityPath) => ipcRenderer.invoke('restart-antigravity-process', antigravityPath),
    findAntigravityExecutable: () => ipcRenderer.invoke('find-antigravity-executable'),

    // 系统信息
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // 外部链接
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openPath: (path) => ipcRenderer.invoke('open-path', path),

    // 菜单更新
    updateMenuIndicator: (hasUpdate) => ipcRenderer.invoke('update-menu-indicator', hasUpdate),

    // Token文件监控
    tokenMonitor: {
        getStatus: () => ipcRenderer.invoke('get-token-monitor-status'),
        triggerSyncCheck: () => ipcRenderer.invoke('trigger-token-sync-check'),
        restart: () => ipcRenderer.invoke('restart-token-monitor')
    },

    // SSH同步功能
    sshSync: {
        // SSH连接管理
        testConnection: (config) => ipcRenderer.invoke('ssh-test-connection', config),
        connect: (config) => ipcRenderer.invoke('ssh-connect', config),
        disconnect: () => ipcRenderer.invoke('ssh-disconnect'),
        getStatus: () => ipcRenderer.invoke('ssh-get-status'),

        // 配置管理
        saveConfig: (config) => ipcRenderer.invoke('ssh-save-config', config),
        loadConfig: () => ipcRenderer.invoke('ssh-load-config'),
        deleteConfig: () => ipcRenderer.invoke('ssh-delete-config'),

        // 文件同步
        syncFile: (options) => ipcRenderer.invoke('ssh-sync-file', options),
        syncAntigravityToken: (options) => ipcRenderer.invoke('ssh-sync-antigravity-token', options),
        cancelSync: () => ipcRenderer.invoke('ssh-cancel-sync'),
        getSyncStatus: () => ipcRenderer.invoke('ssh-get-sync-status'),

        // 进度监控和统计
        getTransferHistory: (limit) => ipcRenderer.invoke('ssh-get-transfer-history', limit),
        getTransferStatistics: () => ipcRenderer.invoke('ssh-get-transfer-statistics'),
        clearTransferHistory: () => ipcRenderer.invoke('ssh-clear-transfer-history'),

        // 工具方法
        checkLocalFile: (filePath) => ipcRenderer.invoke('ssh-check-local-file', filePath),
        getDefaultTokenPath: () => ipcRenderer.invoke('ssh-get-default-token-path'),
        getAntigravityTokenPath: () => ipcRenderer.invoke('get-antigravity-auth-token-path'),

        // 自动同步
        enableAutoSync: (config) => ipcRenderer.invoke('ssh-enable-auto-sync', config),
        disableAutoSync: () => ipcRenderer.invoke('ssh-disable-auto-sync'),
        getAutoSyncStatus: () => ipcRenderer.invoke('ssh-get-auto-sync-status'),
        triggerAutoSync: () => ipcRenderer.invoke('ssh-trigger-auto-sync'),

        // 事件监听
        onSyncProgress: (callback) => {
            ipcRenderer.on('ssh-sync-progress', callback);
        },
        onSyncComplete: (callback) => {
            ipcRenderer.on('ssh-sync-complete', callback);
        },
        onSyncCancelled: (callback) => {
            ipcRenderer.on('ssh-sync-cancelled', callback);
        },
        onConnectionStatusChanged: (callback) => {
            ipcRenderer.on('ssh-connection-status-changed', callback);
        },
        onAutoSyncSuccess: (callback) => {
            ipcRenderer.on('auto-sync-success', callback);
        },
        onAutoSyncError: (callback) => {
            ipcRenderer.on('auto-sync-error', callback);
        },
        onAutoSyncFileChanged: (callback) => {
            ipcRenderer.on('auto-sync-file-changed', callback);
        },

        // 移除事件监听
        removeListener: (channel, callback) => {
            ipcRenderer.removeListener(channel, callback);
        },
        removeAllListeners: (channel) => {
            ipcRenderer.removeAllListeners(channel);
        }
    },

    // 事件监听
    onRefreshToken: (callback) => {
        ipcRenderer.on('refresh-token', callback);
    },

    onShowServerConfig: (callback) => {
        ipcRenderer.on('show-server-config', callback);
    },

    onCheckForUpdates: (callback) => {
        ipcRenderer.on('check-for-updates', callback);
    },

    // Token文件监控事件
    onTokenFileDeleted: (callback) => {
        ipcRenderer.on('token-file-deleted', callback);
    },

    onTokenSyncRequired: (callback) => {
        ipcRenderer.on('token-sync-required', callback);
    },

    onTokenMonitorError: (callback) => {
        ipcRenderer.on('token-monitor-error', callback);
    },

    // 移除事件监听
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

// 日志功能
contextBridge.exposeInMainWorld('logger', {
    info: (message, ...args) => console.log('[INFO]', message, ...args),
    warn: (message, ...args) => console.warn('[WARN]', message, ...args),
    error: (message, ...args) => console.error('[ERROR]', message, ...args),
    debug: (message, ...args) => console.debug('[DEBUG]', message, ...args)
});

// 工具函数
contextBridge.exposeInMainWorld('utils', {
    formatDate: (date) => {
        if (!date) return '-';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    isValidJson: (str) => {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    },

    // SSH同步相关工具函数
    formatTransferSpeed: (bytesPerSecond) => {
        if (bytesPerSecond === 0) return '0 Bytes/s';
        const k = 1024;
        const sizes = ['Bytes/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
        return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    formatDuration: (milliseconds) => {
        if (milliseconds < 1000) {
            return `${milliseconds}毫秒`;
        }

        const seconds = Math.floor(milliseconds / 1000);
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
    },

    formatETA: (seconds) => {
        if (seconds <= 0) return '完成';
        if (seconds < 60) {
            return `${Math.round(seconds)}秒`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}分${remainingSeconds}秒`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}小时${minutes}分钟`;
        }
    },

    validateSSHConfig: (config) => {
        const errors = [];

        if (!config || typeof config !== 'object') {
            errors.push('配置必须是对象');
            return { valid: false, errors };
        }

        if (!config.host || typeof config.host !== 'string' || config.host.trim() === '') {
            errors.push('主机地址不能为空');
        }

        if (!config.username || typeof config.username !== 'string' || config.username.trim() === '') {
            errors.push('用户名不能为空');
        }

        if (!config.password && !config.privateKey) {
            errors.push('必须提供密码或SSH私钥');
        }

        if (config.port !== undefined) {
            const port = parseInt(config.port);
            if (isNaN(port) || port < 1 || port > 65535) {
                errors.push('端口必须是1-65535之间的数字');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    getSSHConfigDefaults: () => {
        return {
            host: '',
            port: 22,
            username: '',
            password: '',
            remotePath: '~/.antigravity-sso-token-manager',
            autoSync: false
        };
    }
});