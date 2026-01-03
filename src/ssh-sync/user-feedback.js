/**
 * 用户反馈系统
 * 提供统一的用户通知和反馈机制
 */
class UserFeedback {
    constructor() {
        this.notifications = [];
        this.maxNotifications = 10;
        this.defaultDuration = 5000;
    }

    /**
     * 显示成功消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     * @param {object} options - 额外选项
     */
    showSuccess(message, duration = this.defaultDuration, options = {}) {
        return this.showNotification('success', message, duration, options);
    }

    /**
     * 显示错误消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     * @param {object} options - 额外选项
     */
    showError(message, duration = 8000, options = {}) {
        return this.showNotification('error', message, duration, options);
    }

    /**
     * 显示警告消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     * @param {object} options - 额外选项
     */
    showWarning(message, duration = 6000, options = {}) {
        return this.showNotification('warning', message, duration, options);
    }

    /**
     * 显示信息消息
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     * @param {object} options - 额外选项
     */
    showInfo(message, duration = this.defaultDuration, options = {}) {
        return this.showNotification('info', message, duration, options);
    }

    /**
     * 显示通知
     * @param {string} type - 通知类型
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长
     * @param {object} options - 额外选项
     * @returns {string} 通知ID
     */
    showNotification(type, message, duration, options = {}) {
        const notification = {
            id: this.generateId(),
            type,
            message,
            duration,
            timestamp: Date.now(),
            persistent: options.persistent || false,
            actions: options.actions || [],
            details: options.details || null
        };

        this.notifications.push(notification);
        
        // 限制通知数量
        if (this.notifications.length > this.maxNotifications) {
            this.notifications = this.notifications.slice(-this.maxNotifications);
        }

        // 触发显示事件
        this.triggerNotificationEvent('show', notification);

        // 如果不是持久通知，设置自动移除
        if (!notification.persistent && duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification.id);
            }, duration);
        }

        return notification.id;
    }

    /**
     * 移除通知
     * @param {string} notificationId - 通知ID
     */
    removeNotification(notificationId) {
        const index = this.notifications.findIndex(n => n.id === notificationId);
        if (index > -1) {
            const notification = this.notifications[index];
            this.notifications.splice(index, 1);
            this.triggerNotificationEvent('remove', notification);
        }
    }

    /**
     * 清除所有通知
     */
    clearAllNotifications() {
        this.notifications.forEach(notification => {
            this.triggerNotificationEvent('remove', notification);
        });
        this.notifications = [];
    }

    /**
     * 显示确认对话框
     * @param {string} title - 对话框标题
     * @param {string} message - 对话框消息
     * @param {object} options - 选项
     * @returns {Promise<boolean>} 用户选择结果
     */
    showConfirmDialog(title, message, options = {}) {
        return new Promise((resolve) => {
            const dialog = {
                id: this.generateId(),
                type: 'confirm',
                title,
                message,
                confirmText: options.confirmText || '确定',
                cancelText: options.cancelText || '取消',
                dangerous: options.dangerous || false,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            };

            this.triggerNotificationEvent('dialog', dialog);
        });
    }

    /**
     * 显示输入对话框
     * @param {string} title - 对话框标题
     * @param {string} message - 对话框消息
     * @param {object} options - 选项
     * @returns {Promise<string|null>} 用户输入结果
     */
    showInputDialog(title, message, options = {}) {
        return new Promise((resolve) => {
            const dialog = {
                id: this.generateId(),
                type: 'input',
                title,
                message,
                placeholder: options.placeholder || '',
                defaultValue: options.defaultValue || '',
                inputType: options.inputType || 'text',
                required: options.required || false,
                onConfirm: (value) => resolve(value),
                onCancel: () => resolve(null)
            };

            this.triggerNotificationEvent('dialog', dialog);
        });
    }

    /**
     * 显示进度通知
     * @param {string} message - 消息内容
     * @param {object} options - 选项
     * @returns {object} 进度控制器
     */
    showProgress(message, options = {}) {
        const progressId = this.generateId();
        const notification = {
            id: progressId,
            type: 'progress',
            message,
            progress: 0,
            persistent: true,
            cancellable: options.cancellable || false,
            onCancel: options.onCancel || null
        };

        this.notifications.push(notification);
        this.triggerNotificationEvent('show', notification);

        return {
            id: progressId,
            update: (progress, newMessage) => {
                const index = this.notifications.findIndex(n => n.id === progressId);
                if (index > -1) {
                    this.notifications[index].progress = Math.max(0, Math.min(100, progress));
                    if (newMessage) {
                        this.notifications[index].message = newMessage;
                    }
                    this.triggerNotificationEvent('update', this.notifications[index]);
                }
            },
            complete: (finalMessage) => {
                const index = this.notifications.findIndex(n => n.id === progressId);
                if (index > -1) {
                    if (finalMessage) {
                        this.notifications[index].message = finalMessage;
                    }
                    this.notifications[index].progress = 100;
                    this.triggerNotificationEvent('update', this.notifications[index]);
                    
                    // 2秒后自动移除
                    setTimeout(() => {
                        this.removeNotification(progressId);
                    }, 2000);
                }
            },
            cancel: () => {
                this.removeNotification(progressId);
            }
        };
    }

    /**
     * 显示错误详情对话框
     * @param {Error} error - 错误对象
     * @param {string} context - 错误上下文
     * @param {object} options - 选项
     */
    showErrorDetails(error, context = 'general', options = {}) {
        const ErrorHandler = require('./error-handler');
        
        const friendlyMessage = ErrorHandler.handleError(error, context);
        const severity = ErrorHandler.getErrorSeverity(error);
        const suggestions = ErrorHandler.getRecoverySuggestions(error, context);

        const dialog = {
            id: this.generateId(),
            type: 'error-details',
            title: options.title || '错误详情',
            friendlyMessage,
            originalError: error.message,
            errorCode: error.code,
            severity,
            suggestions,
            timestamp: new Date().toLocaleString(),
            context,
            onClose: options.onClose || (() => {})
        };

        this.triggerNotificationEvent('dialog', dialog);
    }

    /**
     * 获取所有通知
     * @returns {Array} 通知列表
     */
    getAllNotifications() {
        return [...this.notifications];
    }

    /**
     * 获取特定类型的通知
     * @param {string} type - 通知类型
     * @returns {Array} 通知列表
     */
    getNotificationsByType(type) {
        return this.notifications.filter(n => n.type === type);
    }

    /**
     * 设置事件监听器
     * @param {string} event - 事件名称
     * @param {function} callback - 回调函数
     */
    on(event, callback) {
        if (!this.eventListeners) {
            this.eventListeners = {};
        }
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    /**
     * 移除事件监听器
     * @param {string} event - 事件名称
     * @param {function} callback - 回调函数
     */
    off(event, callback) {
        if (this.eventListeners && this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }

    /**
     * 触发通知事件
     * @param {string} event - 事件名称
     * @param {object} data - 事件数据
     */
    triggerNotificationEvent(event, data) {
        if (this.eventListeners && this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('通知事件回调执行失败:', error);
                }
            });
        }
    }

    /**
     * 生成唯一ID
     * @returns {string} 唯一ID
     */
    generateId() {
        return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 设置最大通知数量
     * @param {number} max - 最大数量
     */
    setMaxNotifications(max) {
        if (typeof max === 'number' && max > 0) {
            this.maxNotifications = max;
        }
    }

    /**
     * 设置默认显示时长
     * @param {number} duration - 时长（毫秒）
     */
    setDefaultDuration(duration) {
        if (typeof duration === 'number' && duration > 0) {
            this.defaultDuration = duration;
        }
    }
}

module.exports = UserFeedback;