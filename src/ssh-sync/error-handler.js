/**
 * 错误处理模块
 * 提供统一的错误处理和用户友好的错误消息
 */
class ErrorHandler {
    /**
     * 处理SSH相关错误
     * @param {Error} error - 错误对象
     * @returns {string} 用户友好的错误消息
     */
    static handleSSHError(error) {
        const errorMap = {
            'ENOTFOUND': '无法解析主机地址，请检查网络连接和主机名',
            'ECONNREFUSED': '连接被拒绝，请检查服务器地址和端口',
            'ECONNRESET': '连接被重置，请检查网络稳定性',
            'ETIMEDOUT': '连接超时，请检查网络或增加超时时间',
            'EHOSTUNREACH': '主机不可达，请检查网络连接',
            'EACCES': '权限被拒绝，请检查用户权限',
            'EPERM': '操作不被允许，请检查权限设置',
            'All configured authentication methods failed': '认证失败，请检查用户名和密码',
            'Authentication failed': '认证失败，请检查用户名和密码',
            'Connection closed': '连接已关闭，请重新建立连接',
            'Handshake failed': '握手失败，请检查SSH服务器配置',
            'Protocol version not supported': 'SSH协议版本不支持',
            'Host key verification failed': '主机密钥验证失败，请检查服务器指纹'
        };

        // 检查错误代码
        if (error.code && errorMap[error.code]) {
            return errorMap[error.code];
        }

        // 检查错误消息中的关键词
        const errorMessage = error.message || '';
        for (const [key, message] of Object.entries(errorMap)) {
            if (errorMessage.includes(key)) {
                return message;
            }
        }

        // 特殊处理一些常见的SSH错误模式
        if (errorMessage.includes('getaddrinfo')) {
            return '无法解析主机地址，请检查网络连接和主机名';
        }

        if (errorMessage.includes('timeout')) {
            return '连接超时，请检查网络连接或增加超时时间';
        }

        if (errorMessage.includes('authentication')) {
            return '认证失败，请检查用户名和密码';
        }

        if (errorMessage.includes('permission')) {
            return '权限不足，请检查用户权限或文件权限';
        }

        // 返回原始错误信息（如果没有匹配的友好消息）
        return errorMessage || '未知SSH错误';
    }

    /**
     * 处理文件操作相关错误
     * @param {Error} error - 错误对象
     * @returns {string} 用户友好的错误消息
     */
    static handleFileError(error) {
        const errorMap = {
            'ENOENT': '文件或目录不存在',
            'EACCES': '权限不足，无法访问文件',
            'EPERM': '操作不被允许，请检查权限',
            'ENOSPC': '磁盘空间不足',
            'EMFILE': '打开的文件过多',
            'ENFILE': '系统打开的文件过多',
            'EBUSY': '文件正在被使用',
            'EEXIST': '文件已存在',
            'EISDIR': '目标是目录而不是文件',
            'ENOTDIR': '路径中的组件不是目录',
            'EROFS': '文件系统为只读',
            'EFBIG': '文件过大',
            'EIO': '输入/输出错误',
            'ENAMETOOLONG': '文件名过长'
        };

        // 检查错误代码
        if (error.code && errorMap[error.code]) {
            return errorMap[error.code];
        }

        // 检查错误消息
        const errorMessage = error.message || '';
        for (const [key, message] of Object.entries(errorMap)) {
            if (errorMessage.includes(key)) {
                return message;
            }
        }

        // 返回原始错误信息
        return errorMessage || '文件操作错误';
    }

    /**
     * 处理网络相关错误
     * @param {Error} error - 错误对象
     * @returns {string} 用户友好的错误消息
     */
    static handleNetworkError(error) {
        const errorMap = {
            'ENETDOWN': '网络已断开',
            'ENETUNREACH': '网络不可达',
            'ECONNABORTED': '连接被中止',
            'ECONNRESET': '连接被重置',
            'ENOBUFS': '缓冲区空间不足',
            'EISCONN': '套接字已连接',
            'ENOTCONN': '套接字未连接',
            'ESHUTDOWN': '套接字已关闭',
            'ETOOMANYREFS': '引用过多',
            'EHOSTDOWN': '主机已关闭',
            'EHOSTUNREACH': '主机不可达'
        };

        if (error.code && errorMap[error.code]) {
            return errorMap[error.code];
        }

        return this.handleSSHError(error);
    }

    /**
     * 处理配置相关错误
     * @param {Error} error - 错误对象
     * @returns {string} 用户友好的错误消息
     */
    static handleConfigError(error) {
        const errorMessage = error.message || '';

        if (errorMessage.includes('主机地址')) {
            return '请输入有效的服务器地址';
        }

        if (errorMessage.includes('用户名')) {
            return '请输入有效的用户名';
        }

        if (errorMessage.includes('密码') || errorMessage.includes('私钥')) {
            return '请提供密码或SSH私钥进行认证';
        }

        if (errorMessage.includes('端口')) {
            return '请输入有效的端口号（1-65535）';
        }

        if (errorMessage.includes('配置文件')) {
            return '配置文件格式错误，请重新配置';
        }

        if (errorMessage.includes('加密') || errorMessage.includes('解密')) {
            return '配置文件已损坏，请重新配置';
        }

        return errorMessage || '配置错误';
    }

    /**
     * 处理传输相关错误
     * @param {Error} error - 错误对象
     * @returns {string} 用户友好的错误消息
     */
    static handleTransferError(error) {
        const errorMessage = error.message || '';

        if (errorMessage.includes('文件不存在')) {
            return '要传输的文件不存在，请检查文件路径';
        }

        if (errorMessage.includes('权限')) {
            return '文件权限不足，请检查文件权限设置';
        }

        if (errorMessage.includes('空间')) {
            return '磁盘空间不足，请清理磁盘空间后重试';
        }

        if (errorMessage.includes('网络')) {
            return '网络连接不稳定，请检查网络连接';
        }

        if (errorMessage.includes('中断') || errorMessage.includes('取消')) {
            return '文件传输被中断或取消';
        }

        if (errorMessage.includes('验证')) {
            return '文件传输验证失败，请重新传输';
        }

        return this.handleSSHError(error);
    }

    /**
     * 根据错误类型自动选择处理方法
     * @param {Error} error - 错误对象
     * @param {string} context - 错误上下文（ssh, file, network, config, transfer）
     * @returns {string} 用户友好的错误消息
     */
    static handleError(error, context = 'general') {
        if (!error) {
            return '未知错误';
        }

        try {
            switch (context) {
                case 'ssh':
                    return this.handleSSHError(error);
                case 'file':
                    return this.handleFileError(error);
                case 'network':
                    return this.handleNetworkError(error);
                case 'config':
                    return this.handleConfigError(error);
                case 'transfer':
                    return this.handleTransferError(error);
                default:
                    // 尝试自动检测错误类型
                    return this.autoDetectErrorType(error);
            }
        } catch (handlerError) {
            console.error('错误处理器本身出错:', handlerError);
            return error.message || '处理错误时发生异常';
        }
    }

    /**
     * 自动检测错误类型并处理
     * @param {Error} error - 错误对象
     * @returns {string} 用户友好的错误消息
     */
    static autoDetectErrorType(error) {
        const errorMessage = (error.message || '').toLowerCase();
        const errorCode = error.code || '';

        // 检测SSH相关错误
        if (errorCode.startsWith('E') && ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(errorCode)) {
            return this.handleSSHError(error);
        }

        // 检测文件相关错误
        if (['ENOENT', 'EACCES', 'EPERM', 'ENOSPC'].includes(errorCode)) {
            return this.handleFileError(error);
        }

        // 检测网络相关错误
        if (errorMessage.includes('network') || errorMessage.includes('connection')) {
            return this.handleNetworkError(error);
        }

        // 检测配置相关错误
        if (errorMessage.includes('config') || errorMessage.includes('validation')) {
            return this.handleConfigError(error);
        }

        // 检测传输相关错误
        if (errorMessage.includes('transfer') || errorMessage.includes('sync')) {
            return this.handleTransferError(error);
        }

        // 默认处理
        return error.message || '未知错误';
    }

    /**
     * 创建错误对象
     * @param {string} message - 错误消息
     * @param {string} code - 错误代码
     * @param {object} details - 错误详情
     * @returns {Error} 错误对象
     */
    static createError(message, code = null, details = null) {
        const error = new Error(message);
        if (code) {
            error.code = code;
        }
        if (details) {
            error.details = details;
        }
        return error;
    }

    /**
     * 记录错误日志
     * @param {Error} error - 错误对象
     * @param {string} context - 错误上下文
     * @param {object} additionalInfo - 附加信息
     */
    static logError(error, context = 'general', additionalInfo = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            context,
            error: {
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            additionalInfo
        };

        console.error('SSH同步错误:', logEntry);
        
        // 这里可以添加更多的日志记录逻辑，比如发送到日志服务
    }

    /**
     * 获取错误的严重程度
     * @param {Error} error - 错误对象
     * @returns {string} 严重程度（low, medium, high, critical）
     */
    static getErrorSeverity(error) {
        const errorCode = error.code || '';
        const errorMessage = (error.message || '').toLowerCase();

        // 严重错误
        if (['ENOSPC', 'EROFS', 'EIO'].includes(errorCode)) {
            return 'critical';
        }

        // 高级错误
        if (['EACCES', 'EPERM', 'ECONNREFUSED'].includes(errorCode)) {
            return 'high';
        }

        // 中级错误
        if (['ENOTFOUND', 'ETIMEDOUT', 'ENOENT'].includes(errorCode)) {
            return 'medium';
        }

        // 低级错误
        return 'low';
    }

    /**
     * 获取错误的恢复建议
     * @param {Error} error - 错误对象
     * @param {string} context - 错误上下文
     * @returns {Array<string>} 恢复建议列表
     */
    static getRecoverySuggestions(error, context = 'general') {
        const errorCode = error.code || '';
        const suggestions = [];

        switch (errorCode) {
            case 'ENOTFOUND':
                suggestions.push('检查网络连接是否正常');
                suggestions.push('确认服务器地址拼写正确');
                suggestions.push('尝试使用IP地址代替域名');
                break;

            case 'ECONNREFUSED':
                suggestions.push('确认SSH服务正在运行');
                suggestions.push('检查端口号是否正确');
                suggestions.push('确认防火墙设置允许连接');
                break;

            case 'ETIMEDOUT':
                suggestions.push('检查网络连接稳定性');
                suggestions.push('尝试增加连接超时时间');
                suggestions.push('确认服务器响应正常');
                break;

            case 'EACCES':
            case 'EPERM':
                suggestions.push('检查文件或目录权限');
                suggestions.push('确认用户有足够的权限');
                suggestions.push('尝试使用管理员权限运行');
                break;

            case 'ENOENT':
                suggestions.push('确认文件或目录存在');
                suggestions.push('检查路径拼写是否正确');
                suggestions.push('确认文件未被移动或删除');
                break;

            case 'ENOSPC':
                suggestions.push('清理磁盘空间');
                suggestions.push('删除不必要的文件');
                suggestions.push('检查磁盘使用情况');
                break;

            default:
                suggestions.push('检查错误详情并重试');
                suggestions.push('确认配置设置正确');
                suggestions.push('联系技术支持获取帮助');
        }

        return suggestions;
    }
}

module.exports = ErrorHandler;