const { NodeSSH } = require('node-ssh');
const fs = require('fs-extra');
const ErrorHandler = require('./error-handler');

/**
 * SSH连接管理器类
 * 负责SSH连接的建立、测试和管理
 */
class SSHManager {
    constructor(configStore = null) {
        this.ssh = new NodeSSH();
        this.isConnected = false;
        this.currentConfig = null;
        this.savedConfig = null; // 保存的配置
        this.configStore = configStore;
        this.connectionTimeout = 30000; // 30秒超时
        this.maxRetries = 3;
    }

    /**
     * 测试SSH连接
     * @param {object} config - SSH配置对象
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async testConnection(config) {
        const testSSH = new NodeSSH();
        
        try {
            // 验证配置
            const validationResult = this.validateConfig(config);
            if (!validationResult.valid) {
                return { success: false, error: validationResult.error };
            }

            // 准备连接选项
            const connectionOptions = this.prepareConnectionOptions(config);

            // 尝试连接
            await testSSH.connect(connectionOptions);

            // 测试基本命令
            const result = await testSSH.execCommand('echo "SSH connection test successful"');
            
            if (result.code !== 0) {
                throw new Error(`命令执行失败: ${result.stderr}`);
            }

            // 断开测试连接
            testSSH.dispose();

            return { success: true };
        } catch (error) {
            console.error('SSH连接测试失败:', error);
            
            // 记录错误日志
            ErrorHandler.logError(error, 'ssh', { 
                operation: 'testConnection', 
                config: { host: config.host, port: config.port, username: config.username } 
            });
            
            // 确保连接被清理
            try {
                testSSH.dispose();
            } catch (disposeError) {
                console.error('清理测试连接失败:', disposeError);
            }

            return { 
                success: false, 
                error: ErrorHandler.handleError(error, 'ssh')
            };
        }
    }

    /**
     * 建立SSH连接
     * @param {object} config - SSH配置对象
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async connect(config) {
        try {
            // 如果已经连接，先断开
            if (this.isConnected) {
                await this.disconnect();
            }

            // 验证配置
            const validationResult = this.validateConfig(config);
            if (!validationResult.valid) {
                return { success: false, error: validationResult.error };
            }

            // 准备连接选项
            const connectionOptions = this.prepareConnectionOptions(config);

            // 建立连接
            await this.ssh.connect(connectionOptions);

            // 更新状态
            this.isConnected = true;
            this.currentConfig = { ...config };

            // 测试连接是否正常
            const testResult = await this.ssh.execCommand('pwd');
            if (testResult.code !== 0) {
                throw new Error('连接建立后测试失败');
            }

            return { success: true };
        } catch (error) {
            console.error('SSH连接失败:', error);
            
            // 记录错误日志
            ErrorHandler.logError(error, 'ssh', { 
                operation: 'connect', 
                config: { host: config.host, port: config.port, username: config.username } 
            });
            
            // 重置状态
            this.isConnected = false;
            this.currentConfig = null;

            return { 
                success: false, 
                error: ErrorHandler.handleError(error, 'ssh')
            };
        }
    }

    /**
     * 断开SSH连接
     * @returns {Promise<{success: boolean}>}
     */
    async disconnect() {
        try {
            if (this.isConnected && this.ssh) {
                this.ssh.dispose();
            }

            // 重置状态
            this.isConnected = false;
            this.currentConfig = null;

            return { success: true };
        } catch (error) {
            console.error('SSH断开连接失败:', error);
            
            // 强制重置状态
            this.isConnected = false;
            this.currentConfig = null;

            return { success: true }; // 即使出错也返回成功，因为目标是断开连接
        }
    }

    /**
     * 获取连接状态
     * @returns {{connected: boolean, config?: object}}
     */
    /**
     * 加载保存的配置
     */
    async loadSavedConfig() {
        if (this.configStore) {
            try {
                const result = await this.configStore.loadConfig();
                if (result.success && result.config) {
                    this.savedConfig = result.config;
                    console.log('SSH管理器已加载保存的配置');
                }
            } catch (error) {
                console.error('加载保存的配置失败:', error);
            }
        }
    }

    getConnectionStatus() {
        // 优先返回当前连接的配置，如果没有则返回保存的配置
        const config = this.currentConfig || this.savedConfig;
        return {
            connected: this.isConnected,
            config: config ? { 
                host: config.host,
                port: config.port,
                username: config.username,
                remotePath: config.remotePath,
                password: config.password // 需要密码用于重新连接
            } : null
        };
    }

    /**
     * 执行SSH命令
     * @param {string} command - 要执行的命令
     * @param {object} options - 执行选项
     * @returns {Promise<{success: boolean, result?: object, error?: string}>}
     */
    async executeCommand(command, options = {}) {
        try {
            if (!this.isConnected) {
                return { success: false, error: '未建立SSH连接' };
            }

            const result = await this.ssh.execCommand(command, options);
            
            return {
                success: result.code === 0,
                result: {
                    code: result.code,
                    stdout: result.stdout,
                    stderr: result.stderr
                },
                error: result.code !== 0 ? result.stderr : undefined
            };
        } catch (error) {
            console.error('SSH命令执行失败:', error);
            return { 
                success: false, 
                error: this.formatSSHError(error)
            };
        }
    }

    /**
     * 检查远程目录是否存在
     * @param {string} remotePath - 远程路径
     * @returns {Promise<{exists: boolean, error?: string}>}
     */
    async checkRemoteDirectory(remotePath) {
        try {
            if (!this.isConnected) {
                return { exists: false, error: '未建立SSH连接' };
            }

            const result = await this.ssh.execCommand(`test -d "${remotePath}" && echo "exists" || echo "not_exists"`);
            
            if (result.code !== 0) {
                return { exists: false, error: result.stderr };
            }

            const exists = result.stdout.trim() === 'exists';
            return { exists };
        } catch (error) {
            console.error('检查远程目录失败:', error);
            return { 
                exists: false, 
                error: this.formatSSHError(error)
            };
        }
    }

    /**
     * 创建远程目录
     * @param {string} remotePath - 远程路径
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async createRemoteDirectory(remotePath) {
        try {
            if (!this.isConnected) {
                return { success: false, error: '未建立SSH连接' };
            }

            // 处理路径，确保使用Unix格式
            let processedPath = remotePath;
            
            // 如果路径包含~，展开它
            if (processedPath.startsWith('~')) {
                const homeResult = await this.ssh.execCommand('echo $HOME');
                if (homeResult.code === 0) {
                    const homeDir = homeResult.stdout.trim();
                    processedPath = processedPath.replace('~', homeDir);
                }
            }
            
            // 确保使用Unix路径分隔符
            processedPath = processedPath.replace(/\\/g, '/');
            
            console.log(`创建远程目录: ${remotePath} -> ${processedPath}`);

            const result = await this.ssh.execCommand(`mkdir -p "${processedPath}"`);
            
            if (result.code !== 0) {
                return { success: false, error: result.stderr || '创建目录失败' };
            }

            // 验证目录是否创建成功
            const verifyResult = await this.ssh.execCommand(`test -d "${processedPath}"`);
            if (verifyResult.code !== 0) {
                return { success: false, error: '目录创建后验证失败' };
            }

            console.log(`远程目录创建成功: ${processedPath}`);
            return { success: true };
        } catch (error) {
            console.error('创建远程目录失败:', error);
            return { 
                success: false, 
                error: this.formatSSHError(error)
            };
        }
    }

    /**
     * 获取SSH连接对象（用于文件传输）
     * @returns {NodeSSH|null}
     */
    getSSHConnection() {
        return this.isConnected ? this.ssh : null;
    }

    /**
     * 验证SSH配置
     * @param {object} config - SSH配置
     * @returns {{valid: boolean, error?: string}}
     */
    validateConfig(config) {
        if (!config || typeof config !== 'object') {
            return { valid: false, error: '配置必须是对象' };
        }

        if (!config.host || typeof config.host !== 'string') {
            return { valid: false, error: '主机地址不能为空' };
        }

        if (!config.username || typeof config.username !== 'string') {
            return { valid: false, error: '用户名不能为空' };
        }

        if (!config.password && !config.privateKey) {
            return { valid: false, error: '必须提供密码或SSH私钥' };
        }

        const port = parseInt(config.port);
        if (isNaN(port) || port < 1 || port > 65535) {
            return { valid: false, error: '端口必须是1-65535之间的数字' };
        }

        return { valid: true };
    }

    /**
     * 准备连接选项
     * @param {object} config - SSH配置
     * @returns {object} node-ssh连接选项
     */
    prepareConnectionOptions(config) {
        const options = {
            host: config.host,
            port: config.port || 22,
            username: config.username,
            readyTimeout: this.connectionTimeout,
            algorithms: {
                kex: [
                    'ecdh-sha2-nistp256',
                    'ecdh-sha2-nistp384',
                    'ecdh-sha2-nistp521',
                    'diffie-hellman-group14-sha256',
                    'diffie-hellman-group16-sha512',
                    'diffie-hellman-group18-sha512'
                ],
                cipher: [
                    'aes128-gcm',
                    'aes256-gcm',
                    'aes128-ctr',
                    'aes192-ctr',
                    'aes256-ctr'
                ]
            }
        };

        // 添加认证方式
        if (config.password) {
            options.password = config.password;
        }

        if (config.privateKey) {
            if (typeof config.privateKey === 'string' && config.privateKey.startsWith('/')) {
                // 私钥文件路径
                options.privateKey = config.privateKey;
            } else {
                // 私钥内容
                options.privateKeyRaw = config.privateKey;
            }
            
            if (config.passphrase) {
                options.passphrase = config.passphrase;
            }
        }

        return options;
    }

    /**
     * 格式化SSH错误信息
     * @param {Error} error - 错误对象
     * @returns {string} 格式化的错误信息
     */
    formatSSHError(error) {
        const errorMap = {
            'ENOTFOUND': '无法解析主机地址，请检查网络连接和主机名',
            'ECONNREFUSED': '连接被拒绝，请检查服务器地址和端口',
            'ECONNRESET': '连接被重置，请检查网络稳定性',
            'ETIMEDOUT': '连接超时，请检查网络或增加超时时间',
            'EHOSTUNREACH': '主机不可达，请检查网络连接',
            'EACCES': '权限被拒绝，请检查用户权限',
            'All configured authentication methods failed': '认证失败，请检查用户名和密码',
            'Authentication failed': '认证失败，请检查用户名和密码'
        };

        // 检查错误代码
        if (error.code && errorMap[error.code]) {
            return errorMap[error.code];
        }

        // 检查错误消息
        for (const [key, message] of Object.entries(errorMap)) {
            if (error.message && error.message.includes(key)) {
                return message;
            }
        }

        // 返回原始错误信息
        return error.message || '未知SSH错误';
    }

    /**
     * 设置连接超时时间
     * @param {number} timeout - 超时时间（毫秒）
     */
    setConnectionTimeout(timeout) {
        if (typeof timeout === 'number' && timeout > 0) {
            this.connectionTimeout = timeout;
        }
    }

    /**
     * 设置最大重试次数
     * @param {number} retries - 重试次数
     */
    setMaxRetries(retries) {
        if (typeof retries === 'number' && retries >= 0) {
            this.maxRetries = retries;
        }
    }
}

module.exports = SSHManager;