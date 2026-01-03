/**
 * SSH同步页面JavaScript逻辑
 */

// 本地工具函数（因为在iframe中无法访问主窗口的utils）
const localUtils = {
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

    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

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
    }
};

class SSHSyncManager {
    constructor() {
        this.isConnected = false;
        this.isTransferring = false;
        this.currentConfig = null;
        this.transferHistory = [];
        this.logs = [];

        this.initializeElements();
        this.bindEvents();
        this.loadInitialData();
    }

    /**
     * 初始化DOM元素引用
     */
    initializeElements() {
        // 表单元素
        this.configForm = document.getElementById('ssh-config-form');
        this.hostInput = document.getElementById('ssh-host');
        this.portInput = document.getElementById('ssh-port');
        this.usernameInput = document.getElementById('ssh-username');
        this.passwordInput = document.getElementById('ssh-password');
        this.remotePathInput = document.getElementById('ssh-remote-path');
        this.autoSyncCheckbox = document.getElementById('auto-sync');

        // 按钮元素
        this.testConnectionBtn = document.getElementById('test-connection');
        this.manualSyncBtn = document.getElementById('manual-sync');
        this.cancelSyncBtn = document.getElementById('cancel-sync');
        this.clearHistoryBtn = document.getElementById('clear-history');
        this.clearLogsBtn = document.getElementById('clear-logs');

        // 状态显示元素
        this.connectionIndicator = document.getElementById('connection-indicator');
        this.localFilePath = document.getElementById('local-file-path');
        this.localFileStatus = document.getElementById('local-file-status');
        this.fileSize = document.getElementById('file-size');
        this.fileMtime = document.getElementById('file-mtime');

        // 进度显示元素
        this.progressContainer = document.getElementById('progress-container');
        this.progressStatus = document.getElementById('progress-status');
        this.progressPercentage = document.getElementById('progress-percentage');
        this.progressFill = document.getElementById('progress-fill');
        this.transferSpeed = document.getElementById('transfer-speed');
        this.transferredSize = document.getElementById('transferred-size');
        this.eta = document.getElementById('eta');

        // 历史和统计元素
        this.historyEmpty = document.getElementById('history-empty');
        this.historyList = document.getElementById('history-list');
        this.totalTransfers = document.getElementById('total-transfers');
        this.successfulTransfers = document.getElementById('successful-transfers');
        this.failedTransfers = document.getElementById('failed-transfers');
        this.totalData = document.getElementById('total-data');

        // 日志元素
        this.logEntries = document.getElementById('log-entries');

        // 对话框元素
        this.confirmDialog = document.getElementById('confirm-dialog');
        this.confirmTitle = document.getElementById('confirm-title');
        this.confirmMessage = document.getElementById('confirm-message');
        this.confirmOkBtn = document.getElementById('confirm-ok');
        this.confirmCancelBtn = document.getElementById('confirm-cancel');

        // 消息容器
        this.messageContainer = document.getElementById('message-container');
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 表单事件
        this.configForm.addEventListener('submit', (e) => this.handleConfigSubmit(e));
        this.testConnectionBtn.addEventListener('click', () => this.handleTestConnection());

        // 同步控制事件
        this.manualSyncBtn.addEventListener('click', () => this.handleManualSync());
        this.cancelSyncBtn.addEventListener('click', () => this.handleCancelSync());

        // 清理操作事件
        this.clearHistoryBtn.addEventListener('click', () => this.handleClearHistory());
        this.clearLogsBtn.addEventListener('click', () => this.handleClearLogs());

        // 对话框事件
        this.confirmOkBtn.addEventListener('click', () => this.handleConfirmOk());
        this.confirmCancelBtn.addEventListener('click', () => this.hideConfirmDialog());
        this.confirmDialog.addEventListener('click', (e) => {
            if (e.target === this.confirmDialog) {
                this.hideConfirmDialog();
            }
        });

        // 表单输入验证
        this.hostInput.addEventListener('input', () => this.validateForm());
        this.usernameInput.addEventListener('input', () => this.validateForm());
        this.passwordInput.addEventListener('input', () => this.validateForm());

        // 自动同步复选框变化
        this.autoSyncCheckbox.addEventListener('change', () => this.handleAutoSyncToggle());

        // 完全移除输入框的事件拦截，允许所有原生行为
        [this.hostInput, this.usernameInput, this.passwordInput, this.remotePathInput].forEach(input => {
            if (!input) return;
            
            // 移除任何可能的只读属性
            input.removeAttribute('readonly');
            input.removeAttribute('disabled');
            
            // 确保输入框可以接收焦点和输入
            input.style.userSelect = 'text';
            input.style.webkitUserSelect = 'text';
            input.style.pointerEvents = 'auto';
            
            console.log(`[SSH-Sync] 输入框已启用: ${input.id}`);
        });

        // SSH同步事件监听
        this.setupSSHEventListeners();
    }

    /**
     * 设置SSH同步相关的事件监听器
     */
    setupSSHEventListeners() {
        // 进度更新事件
        electronAPI.sshSync.onSyncProgress((event, progress) => {
            this.updateProgress(progress);
        });

        // 同步完成事件
        electronAPI.sshSync.onSyncComplete((event, result) => {
            this.handleSyncComplete(result);
        });

        // 同步取消事件
        electronAPI.sshSync.onSyncCancelled(() => {
            this.handleSyncCancelled();
        });

        // 连接状态变化事件
        electronAPI.sshSync.onConnectionStatusChanged((event, status) => {
            this.updateConnectionStatus(status.connected);
        });

        // 自动同步事件
        electronAPI.sshSync.onAutoSyncSuccess((event, result) => {
            this.handleAutoSyncSuccess(result);
        });

        electronAPI.sshSync.onAutoSyncError((event, error) => {
            this.handleAutoSyncError(error);
        });

        electronAPI.sshSync.onAutoSyncFileChanged((event, data) => {
            this.handleAutoSyncFileChanged(data);
        });
    }

    /**
     * 加载初始数据
     */
    async loadInitialData() {
        try {
            // 加载SSH配置
            await this.loadConfig();

            // 检查本地文件
            await this.checkLocalFile();

            // 加载传输历史
            await this.loadTransferHistory();

            // 检查连接状态
            await this.checkConnectionStatus();

            this.addLog('info', '页面初始化完成');
        } catch (error) {
            this.addLog('error', `初始化失败: ${error.message}`);
            this.showMessage('error', '页面初始化失败');
        }
    }

    /**
     * 加载SSH配置
     */
    async loadConfig() {
        try {
            const result = await electronAPI.sshSync.loadConfig();
            console.log('[SSH-Sync] 加载配置结果:', result);

            if (result.success && result.config) {
                this.currentConfig = result.config;
                console.log('[SSH-Sync] currentConfig已设置:', this.currentConfig);
                this.populateForm(result.config);
                this.addLog('info', `SSH配置加载成功: ${result.config.host || '(空)'}`);
            } else {
                console.log('[SSH-Sync] 未找到已保存的配置');
                this.addLog('warn', '未找到已保存的SSH配置');
            }
        } catch (error) {
            console.error('[SSH-Sync] 加载配置异常:', error);
            this.addLog('error', `加载配置失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 填充表单数据
     */
    populateForm(config) {
        this.hostInput.value = config.host || '';
        this.portInput.value = config.port || 22;
        this.usernameInput.value = config.username || '';
        this.passwordInput.value = config.password || '';
        this.remotePathInput.value = config.remotePath || '~/.aws/sso/cache';
        this.autoSyncCheckbox.checked = config.autoSync || false;

        this.validateForm();
    }

    /**
     * 处理配置表单提交
     */
    async handleConfigSubmit(event) {
        event.preventDefault();

        if (!this.validateForm()) {
            this.showMessage('error', '请填写所有必填字段');
            return;
        }

        const config = this.getFormData();
        console.log('[SSH-Sync] 准备保存配置:', config);

        try {
            this.setButtonLoading(this.configForm.querySelector('button[type="submit"]'), true);

            const result = await electronAPI.sshSync.saveConfig(config);
            console.log('[SSH-Sync] 保存配置结果:', result);

            if (result.success) {
                // 重要：保存配置后重新加载，确保密码等敏感信息正确保存到内存
                await this.loadConfig();
                console.log('[SSH-Sync] 配置已重新加载到内存');
                this.showMessage('success', 'SSH配置保存成功');
                this.addLog('success', `SSH配置已保存: ${config.host}:${config.port}`);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('[SSH-Sync] 保存配置异常:', error);
            this.addLog('error', `保存配置失败: ${error.message}`);
            this.showMessage('error', `保存失败: ${error.message}`);
        } finally {
            this.setButtonLoading(this.configForm.querySelector('button[type="submit"]'), false);
        }
    }

    /**
     * 处理连接测试
     */
    async handleTestConnection() {
        if (!this.validateForm()) {
            this.showMessage('error', '请填写所有必填字段');
            return;
        }

        const config = this.getFormData();

        try {
            this.setButtonLoading(this.testConnectionBtn, true);
            this.updateConnectionStatus('connecting');
            this.addLog('info', `正在测试连接到 ${config.host}:${config.port}`);

            const result = await electronAPI.sshSync.testConnection(config);

            if (result.success) {
                this.updateConnectionStatus(true);
                this.showMessage('success', 'SSH连接测试成功');
                this.addLog('success', 'SSH连接测试成功');
            } else {
                this.updateConnectionStatus(false);
                throw new Error(result.error);
            }
        } catch (error) {
            this.updateConnectionStatus(false);
            this.addLog('error', `连接测试失败: ${error.message}`);
            this.showMessage('error', `连接失败: ${error.message}`);
        } finally {
            this.setButtonLoading(this.testConnectionBtn, false);
        }
    }

    /**
     * 获取表单数据
     */
    getFormData() {
        const formData = {
            host: this.hostInput.value.trim(),
            port: parseInt(this.portInput.value) || 22,
            username: this.usernameInput.value.trim(),
            password: this.passwordInput.value,
            remotePath: this.remotePathInput.value.trim() || '~/.aws/sso/cache',
            autoSync: this.autoSyncCheckbox.checked
        };
        
        console.log('[SSH-Sync] 获取表单数据:', {
            host: formData.host,
            port: formData.port,
            username: formData.username,
            hasPassword: !!formData.password,
            remotePath: formData.remotePath,
            autoSync: formData.autoSync
        });
        
        return formData;
    }

    /**
     * 验证表单
     */
    validateForm() {
        const config = this.getFormData();
        const validation = localUtils.validateSSHConfig(config);

        // 更新表单验证状态
        this.updateFieldValidation('ssh-host', !validation.errors.some(e => e.includes('主机地址')));
        this.updateFieldValidation('ssh-username', !validation.errors.some(e => e.includes('用户名')));
        this.updateFieldValidation('ssh-password', !validation.errors.some(e => e.includes('密码')));

        // 更新按钮状态
        const isValid = validation.valid;
        this.testConnectionBtn.disabled = !isValid;
        this.configForm.querySelector('button[type="submit"]').disabled = !isValid;

        return isValid;
    }

    /**
     * 更新字段验证状态
     */
    updateFieldValidation(fieldId, isValid) {
        const field = document.getElementById(fieldId);
        if (isValid) {
            field.classList.remove('invalid');
        } else {
            field.classList.add('invalid');
        }
    }

    /**
     * 更新连接状态显示
     */
    updateConnectionStatus(status) {
        this.connectionIndicator.className = 'status-indicator';

        if (status === 'connecting') {
            this.connectionIndicator.classList.add('connecting');
            this.connectionIndicator.textContent = '连接中...';
            this.isConnected = false;
        } else if (status === true) {
            this.connectionIndicator.classList.add('connected');
            this.connectionIndicator.textContent = '已连接';
            this.isConnected = true;
        } else {
            this.connectionIndicator.classList.add('disconnected');
            this.connectionIndicator.textContent = '未连接';
            this.isConnected = false;
        }

        // 更新同步按钮状态
        this.updateSyncButtonState();
    }

    /**
     * 检查连接状态
     */
    async checkConnectionStatus() {
        try {
            const status = await electronAPI.sshSync.getStatus();
            this.updateConnectionStatus(status.connected);
        } catch (error) {
            this.addLog('error', `检查连接状态失败: ${error.message}`);
        }
    }

    /**
     * 检查本地文件
     */
    async checkLocalFile() {
        try {
            // 获取默认Token路径
            const pathResult = await electronAPI.sshSync.getDefaultTokenPath();
            if (!pathResult.success) {
                throw new Error(pathResult.error);
            }

            const tokenPath = pathResult.path;
            this.localFilePath.textContent = tokenPath;

            // 检查文件是否存在
            const fileResult = await electronAPI.sshSync.checkLocalFile(tokenPath);

            if (fileResult.exists) {
                this.localFileStatus.textContent = '存在';
                this.localFileStatus.className = 'file-status exists';
                this.fileSize.textContent = localUtils.formatFileSize(fileResult.stats.size);
                this.fileMtime.textContent = localUtils.formatDate(fileResult.stats.mtime);
                this.addLog('info', `本地Token文件存在，大小: ${localUtils.formatFileSize(fileResult.stats.size)}`);
            } else {
                this.localFileStatus.textContent = '不存在';
                this.localFileStatus.className = 'file-status missing';
                this.fileSize.textContent = '-';
                this.fileMtime.textContent = '-';
                this.addLog('warn', '本地Token文件不存在');
            }

            // 更新同步按钮状态
            this.updateSyncButtonState();

        } catch (error) {
            this.localFileStatus.textContent = '检查失败';
            this.localFileStatus.className = 'file-status checking';
            this.addLog('error', `检查本地文件失败: ${error.message}`);
        }
    }

    /**
     * 更新同步按钮状态
     */
    updateSyncButtonState() {
        const hasLocalFile = this.localFileStatus.classList.contains('exists');
        const hasValidConfig = this.validateForm();
        const canSync = hasValidConfig && hasLocalFile && !this.isTransferring;

        this.manualSyncBtn.disabled = !canSync;
        this.cancelSyncBtn.disabled = !this.isTransferring;
    }

    /**
     * 设置按钮加载状态
     */
    setButtonLoading(button, loading) {
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.innerHTML = '<span class="btn-icon">⏳</span>处理中...';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || button.textContent;
        }
    }

    /**
     * 显示消息提示
     */
    showMessage(type, message, duration = 5000) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;

        this.messageContainer.appendChild(messageEl);

        // 自动移除消息
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, duration);
    }

    /**
     * 添加日志条目
     */
    addLog(level, message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';

        logEntry.innerHTML = `
            <span class="log-time">${timestamp}</span>
            <span class="log-level ${level}">${level.toUpperCase()}</span>
            <span class="log-message">${message}</span>
        `;

        this.logEntries.appendChild(logEntry);

        // 滚动到底部
        this.logEntries.scrollTop = this.logEntries.scrollHeight;

        // 限制日志条目数量
        const maxLogs = 100;
        while (this.logEntries.children.length > maxLogs) {
            this.logEntries.removeChild(this.logEntries.firstChild);
        }

        // 保存到内存
        this.logs.push({ timestamp, level, message });
        if (this.logs.length > maxLogs) {
            this.logs = this.logs.slice(-maxLogs);
        }
    }

    /**
     * 清除日志
     */
    handleClearLogs() {
        this.logEntries.innerHTML = '';
        this.logs = [];
        this.addLog('info', '日志已清除');
    }

    /**
     * 显示确认对话框
     */
    showConfirmDialog(title, message, callback) {
        this.confirmTitle.textContent = title;
        this.confirmMessage.textContent = message;
        this.confirmCallback = callback;
        this.confirmDialog.style.display = 'flex';
    }

    /**
     * 隐藏确认对话框
     */
    hideConfirmDialog() {
        this.confirmDialog.style.display = 'none';
        this.confirmCallback = null;
    }

    /**
     * 处理确认对话框确定按钮
     */
    handleConfirmOk() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.hideConfirmDialog();
    }

    /**
     * 处理手动同步
     */
    async handleManualSync() {
        if (this.isTransferring) {
            this.showMessage('warning', '已有传输正在进行中');
            return;
        }

        // 如果没有连接，先尝试建立连接
        if (!this.isConnected) {
            this.addLog('info', 'SSH未连接，尝试使用保存的配置建立连接...');
            
            // 先尝试加载保存的配置
            let config = this.currentConfig;
            console.log('[SSH-Sync] 当前配置:', config);
            
            // 如果没有保存的配置，使用表单数据
            if (!config || !config.host) {
                console.log('[SSH-Sync] 没有保存的配置，尝试使用表单数据');
                if (!this.validateForm()) {
                    this.showMessage('error', '请先填写并保存SSH连接配置');
                    return;
                }
                config = this.getFormData();
                console.log('[SSH-Sync] 使用表单数据:', config);
                this.addLog('info', `使用表单数据建立连接: ${config.host}`);
            } else {
                console.log('[SSH-Sync] 使用保存的配置');
                this.addLog('info', `使用保存的配置连接到 ${config.host}:${config.port}`);
            }
            
            try {
                this.updateConnectionStatus('connecting');
                
                const connectionResult = await electronAPI.sshSync.testConnection(config);
                
                if (connectionResult.success) {
                    this.updateConnectionStatus(true);
                    this.addLog('success', 'SSH连接建立成功');
                } else {
                    this.updateConnectionStatus(false);
                    throw new Error(connectionResult.error);
                }
            } catch (error) {
                this.updateConnectionStatus(false);
                this.addLog('error', `连接失败: ${error.message}`);
                this.showMessage('error', `连接失败: ${error.message}`);
                return;
            }
        }

        try {
            this.isTransferring = true;
            this.updateSyncButtonState();
            this.showProgress();
            this.addLog('info', '开始同步Antigravity Token文件');

            const result = await electronAPI.sshSync.syncAntigravityToken();

            if (result.success) {
                this.addLog('success', `文件同步成功，耗时: ${localUtils.formatDuration(result.stats.duration)}`);
                this.showMessage('success', '文件同步成功');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.addLog('error', `文件同步失败: ${error.message}`);
            this.showMessage('error', `同步失败: ${error.message}`);
        } finally {
            this.isTransferring = false;
            this.hideProgress();
            this.updateSyncButtonState();
            await this.loadTransferHistory();
            this.updateStatistics();
        }
    }

    /**
     * 处理取消同步
     */
    async handleCancelSync() {
        if (!this.isTransferring) {
            return;
        }

        try {
            const result = await electronAPI.sshSync.cancelSync();

            if (result.success) {
                this.addLog('warn', '用户取消了文件同步');
                this.showMessage('info', '同步已取消');
            }
        } catch (error) {
            this.addLog('error', `取消同步失败: ${error.message}`);
            this.showMessage('error', `取消失败: ${error.message}`);
        }
    }

    /**
     * 处理同步完成事件
     */
    handleSyncComplete(result) {
        this.isTransferring = false;
        this.hideProgress();
        this.updateSyncButtonState();

        if (result.success) {
            this.addLog('success', `同步完成: ${localUtils.formatFileSize(result.stats.fileSize)}, 平均速度: ${localUtils.formatTransferSpeed(result.stats.transferSpeed)}`);
        } else {
            this.addLog('error', `同步失败: ${result.error}`);
        }

        // 刷新历史记录和统计
        setTimeout(() => {
            this.loadTransferHistory();
            this.updateStatistics();
        }, 500);
    }

    /**
     * 处理同步取消事件
     */
    handleSyncCancelled() {
        this.isTransferring = false;
        this.hideProgress();
        this.updateSyncButtonState();
        this.addLog('warn', '同步已被取消');

        // 刷新历史记录
        setTimeout(() => {
            this.loadTransferHistory();
            this.updateStatistics();
        }, 500);
    }

    /**
     * 更新进度显示
     */
    updateProgress(progress) {
        if (!this.progressContainer.style.display || this.progressContainer.style.display === 'none') {
            this.showProgress();
        }

        // 更新进度条
        this.progressFill.style.width = `${progress.percentage}%`;
        this.progressPercentage.textContent = `${progress.percentage}%`;

        // 更新状态文本
        if (progress.percentage === 0) {
            this.progressStatus.textContent = '准备传输...';
        } else if (progress.percentage === 100) {
            this.progressStatus.textContent = '传输完成';
        } else {
            this.progressStatus.textContent = '正在传输...';
        }

        // 更新详细信息
        this.transferSpeed.textContent = progress.speedFormatted || localUtils.formatTransferSpeed(progress.speed || 0);
        this.transferredSize.textContent = progress.transferredFormatted || localUtils.formatFileSize(progress.transferredBytes || 0);
        this.eta.textContent = progress.estimatedTimeRemainingFormatted || localUtils.formatETA(progress.estimatedTimeRemaining || 0);
    }

    /**
     * 显示进度容器
     */
    showProgress() {
        this.progressContainer.style.display = 'block';
        this.resetProgress();
    }

    /**
     * 隐藏进度容器
     */
    hideProgress() {
        this.progressContainer.style.display = 'none';
    }

    /**
     * 重置进度显示
     */
    resetProgress() {
        this.progressFill.style.width = '0%';
        this.progressPercentage.textContent = '0%';
        this.progressStatus.textContent = '准备中...';
        this.transferSpeed.textContent = '-';
        this.transferredSize.textContent = '-';
        this.eta.textContent = '-';
    }

    /**
     * 加载传输历史
     */
    async loadTransferHistory() {
        try {
            const history = await electronAPI.sshSync.getTransferHistory(20);
            this.transferHistory = history;
            this.renderTransferHistory();
        } catch (error) {
            this.addLog('error', `加载传输历史失败: ${error.message}`);
        }
    }

    /**
     * 渲染传输历史
     */
    renderTransferHistory() {
        if (this.transferHistory.length === 0) {
            this.historyEmpty.style.display = 'block';
            this.historyList.style.display = 'none';
            return;
        }

        this.historyEmpty.style.display = 'none';
        this.historyList.style.display = 'block';
        this.historyList.innerHTML = '';

        this.transferHistory.forEach(transfer => {
            const historyItem = this.createHistoryItem(transfer);
            this.historyList.appendChild(historyItem);
        });
    }

    /**
     * 创建历史记录项
     */
    createHistoryItem(transfer) {
        const item = document.createElement('div');
        item.className = `history-item ${transfer.status}`;

        const statusText = {
            'completed': '成功',
            'failed': '失败',
            'cancelled': '已取消'
        }[transfer.status] || transfer.status;

        const duration = transfer.endTime && transfer.startTime ?
            transfer.endTime - transfer.startTime : 0;

        item.innerHTML = `
            <div class="history-status ${transfer.status}">${statusText}</div>
            <div class="history-details">
                <div class="history-path">${transfer.remotePath || '~/.antigravity_tools/current_token.json'}</div>
                <div class="history-time">${localUtils.formatDate(transfer.startTime)}</div>
            </div>
            <div class="history-size">${transfer.progress ? localUtils.formatFileSize(transfer.progress.totalBytes) : '-'}</div>
            <div class="history-duration">${duration ? localUtils.formatDuration(duration) : '-'}</div>
        `;

        return item;
    }

    /**
     * 更新统计信息
     */
    async updateStatistics() {
        try {
            const stats = await electronAPI.sshSync.getTransferStatistics();

            this.totalTransfers.textContent = stats.totalTransfers || 0;
            this.successfulTransfers.textContent = stats.completed || 0;
            this.failedTransfers.textContent = (stats.failed || 0) + (stats.cancelled || 0);
            this.totalData.textContent = localUtils.formatFileSize(stats.totalBytesTransferred || 0);
        } catch (error) {
            this.addLog('error', `更新统计信息失败: ${error.message}`);
        }
    }

    /**
     * 处理清除历史记录
     */
    handleClearHistory() {
        this.showConfirmDialog(
            '清除传输历史',
            '确定要清除所有传输历史记录吗？此操作不可撤销。',
            async () => {
                try {
                    await electronAPI.sshSync.clearTransferHistory();
                    this.transferHistory = [];
                    this.renderTransferHistory();
                    this.updateStatistics();
                    this.addLog('info', '传输历史已清除');
                    this.showMessage('success', '历史记录已清除');
                } catch (error) {
                    this.addLog('error', `清除历史失败: ${error.message}`);
                    this.showMessage('error', `清除失败: ${error.message}`);
                }
            }
        );
    }

    /**
     * 定期刷新数据
     */
    startPeriodicRefresh() {
        // 每30秒检查一次本地文件状态
        setInterval(() => {
            this.checkLocalFile();
        }, 30000);

        // 每10秒更新一次统计信息
        setInterval(() => {
            this.updateStatistics();
        }, 10000);
    }

    /**
     * 处理自动同步开关切换
     */
    async handleAutoSyncToggle() {
        const isEnabled = this.autoSyncCheckbox.checked;

        try {
            if (isEnabled) {
                // 启用自动同步
                const config = this.getFormData();
                const result = await electronAPI.sshSync.enableAutoSync(config);

                if (result.success) {
                    this.addLog('success', '自动同步已启用');
                    this.showMessage('success', '自动同步已启用');
                } else {
                    throw new Error(result.error);
                }
            } else {
                // 禁用自动同步
                const result = await electronAPI.sshSync.disableAutoSync();

                if (result.success) {
                    this.addLog('info', '自动同步已禁用');
                    this.showMessage('info', '自动同步已禁用');
                } else {
                    throw new Error(result.error);
                }
            }
        } catch (error) {
            // 恢复复选框状态
            this.autoSyncCheckbox.checked = !isEnabled;
            this.addLog('error', `自动同步设置失败: ${error.message}`);
            this.showMessage('error', `设置失败: ${error.message}`);
        }
    }

    /**
     * 处理自动同步成功事件
     */
    handleAutoSyncSuccess(result) {
        this.addLog('success', `自动同步成功: ${localUtils.formatFileSize(result.stats?.fileSize || 0)}`);
        this.showMessage('success', '自动同步完成', 3000);

        // 刷新历史记录和统计
        setTimeout(() => {
            this.loadTransferHistory();
            this.updateStatistics();
        }, 500);
    }

    /**
     * 处理自动同步错误事件
     */
    handleAutoSyncError(error) {
        this.addLog('error', `自动同步失败: ${error.error}`);
        this.showMessage('error', `自动同步失败: ${error.error}`, 8000);
    }

    /**
     * 处理自动同步文件变化事件
     */
    handleAutoSyncFileChanged(data) {
        this.addLog('info', `检测到文件变化: ${data.filePath}`);

        // 刷新本地文件信息
        setTimeout(() => {
            this.checkLocalFile();
        }, 1000);
    }

    /**
     * 检查并更新自动同步状态
     */
    async checkAutoSyncStatus() {
        try {
            const status = await electronAPI.sshSync.getAutoSyncStatus();

            // 更新UI状态但不触发事件
            this.autoSyncCheckbox.removeEventListener('change', this.handleAutoSyncToggle);
            this.autoSyncCheckbox.checked = status.enabled;
            this.autoSyncCheckbox.addEventListener('change', () => this.handleAutoSyncToggle());

            if (status.enabled) {
                this.addLog('info', `自动同步已启用，监控文件: ${status.watchedPath}`);
            }
        } catch (error) {
            this.addLog('error', `检查自动同步状态失败: ${error.message}`);
        }
    }

    /**
     * 处理配置表单提交（重写以支持自动同步）
     */
    async handleConfigSubmit(event) {
        event.preventDefault();

        if (!this.validateForm()) {
            this.showMessage('error', '请填写所有必填字段');
            return;
        }

        const config = this.getFormData();

        try {
            this.setButtonLoading(this.configForm.querySelector('button[type="submit"]'), true);

            const result = await electronAPI.sshSync.saveConfig(config);

            if (result.success) {
                this.currentConfig = config;
                this.showMessage('success', 'SSH配置保存成功');
                this.addLog('success', 'SSH配置已保存');

                // 如果启用了自动同步，显示相关信息
                if (config.autoSync) {
                    this.addLog('info', '自动同步功能已启用');
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.addLog('error', `保存配置失败: ${error.message}`);
            this.showMessage('error', `保存失败: ${error.message}`);
        } finally {
            this.setButtonLoading(this.configForm.querySelector('button[type="submit"]'), false);
        }
    }

    /**
     * 加载初始数据（重写以包含自动同步状态检查）
     */
    async loadInitialData() {
        try {
            // 加载SSH配置
            await this.loadConfig();

            // 检查本地文件
            await this.checkLocalFile();

            // 加载传输历史
            await this.loadTransferHistory();

            // 检查连接状态
            await this.checkConnectionStatus();

            // 检查自动同步状态
            await this.checkAutoSyncStatus();

            this.addLog('info', '页面初始化完成');
        } catch (error) {
            this.addLog('error', `初始化失败: ${error.message}`);
            this.showMessage('error', '页面初始化失败');
        }
    }

    /**
     * 处理窗口关闭前的清理
     */
    cleanup() {
        // 移除事件监听器
        electronAPI.sshSync.removeAllListeners('ssh-sync-progress');
        electronAPI.sshSync.removeAllListeners('ssh-sync-complete');
        electronAPI.sshSync.removeAllListeners('ssh-sync-cancelled');
        electronAPI.sshSync.removeAllListeners('ssh-connection-status-changed');
        electronAPI.sshSync.removeAllListeners('auto-sync-success');
        electronAPI.sshSync.removeAllListeners('auto-sync-error');
        electronAPI.sshSync.removeAllListeners('auto-sync-file-changed');
    }
}

// 初始化SSH同步管理器的函数
function initializeSSHSyncManager() {
    // 检查是否已经初始化
    if (window.sshSyncManager) {
        return;
    }

    // 检查必要的DOM元素是否存在
    if (!document.getElementById('ssh-config-form')) {
        console.warn('SSH同步DOM元素未找到，延迟初始化');
        setTimeout(initializeSSHSyncManager, 100);
        return;
    }

    try {
        window.sshSyncManager = new SSHSyncManager();

        // 启动定期刷新
        window.sshSyncManager.startPeriodicRefresh();

        console.log('SSH同步管理器初始化成功');
    } catch (error) {
        console.error('SSH同步管理器初始化失败:', error);
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSSHSyncManager);
} else {
    initializeSSHSyncManager();
}

// 页面卸载前清理
window.addEventListener('beforeunload', () => {
    if (window.sshSyncManager) {
        window.sshSyncManager.cleanup();
    }
});

// 导出初始化函数，供外部调用
window.initializeSSHSyncManager = initializeSSHSyncManager;