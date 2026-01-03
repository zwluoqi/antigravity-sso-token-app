const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const CryptoService = require('./crypto-service');

/**
 * 配置存储服务类
 * 负责SSH配置的安全存储和加载
 */
class ConfigStore {
    constructor(cryptoService = null) {
        this.cryptoService = cryptoService || new CryptoService();

        // 配置文件路径
        this.appConfigDir = path.join(os.homedir(), '.antigravity-account-manager');
        this.configPath = path.join(this.appConfigDir, 'ssh-config.json');

        // 主密钥（懒加载）
        this._masterKey = null;
    }

    /**
     * 获取主密钥（懒加载）
     * @returns {string} 主密钥
     */
    getMasterKey() {
        if (!this._masterKey) {
            this._masterKey = this.cryptoService.generateMasterKey();
        }
        return this._masterKey;
    }

    /**
     * 保存SSH配置
     * @param {object} config - SSH配置对象
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async saveConfig(config) {
        try {
            // 验证配置对象
            const validationResult = this.validateConfig(config);
            if (!validationResult.valid) {
                return { success: false, error: validationResult.error };
            }

            // 确保配置目录存在
            await fs.ensureDir(this.appConfigDir);

            // 准备要保存的配置
            const configToSave = {
                host: config.host,
                port: config.port || 22,
                username: config.username,
                remotePath: config.remotePath || '~/.aws/sso/cache',
                autoSync: config.autoSync || false,
                created: config.created || new Date().toISOString(),
                updated: new Date().toISOString()
            };

            // 加密敏感信息（密码）
            if (config.password) {
                const masterKey = this.getMasterKey();
                const encryptedPassword = this.cryptoService.encrypt(config.password, masterKey);
                configToSave.encryptedPassword = encryptedPassword;
            }

            // 如果有SSH私钥，也要加密
            if (config.privateKey) {
                const masterKey = this.getMasterKey();
                const encryptedPrivateKey = this.cryptoService.encrypt(config.privateKey, masterKey);
                configToSave.encryptedPrivateKey = encryptedPrivateKey;
            }

            // 写入配置文件
            await fs.writeJson(this.configPath, configToSave, { spaces: 2 });

            return { success: true };
        } catch (error) {
            console.error('保存SSH配置失败:', error);
            return { success: false, error: `保存配置失败: ${error.message}` };
        }
    }

    /**
     * 加载SSH配置
     * @returns {Promise<{success: boolean, config?: object, error?: string, needsReconfigure?: boolean}>}
     */
    async loadConfig() {
        try {
            // 检查配置文件是否存在
            if (!await fs.pathExists(this.configPath)) {
                return {
                    success: true,
                    config: this.getDefaultConfig()
                };
            }

            // 读取配置文件
            const savedConfig = await fs.readJson(this.configPath);

            // 准备返回的配置对象
            const config = {
                host: savedConfig.host || '',
                port: savedConfig.port || 22,
                username: savedConfig.username || '',
                remotePath: savedConfig.remotePath || '~/.aws/sso/cache',
                autoSync: savedConfig.autoSync || false,
                created: savedConfig.created,
                updated: savedConfig.updated
            };

            let decryptionFailed = false;

            // 解密敏感信息
            if (savedConfig.encryptedPassword) {
                try {
                    const masterKey = this.getMasterKey();
                    config.password = this.cryptoService.decrypt(savedConfig.encryptedPassword, masterKey);
                } catch (decryptError) {
                    console.warn('解密密码失败 (可能是设备特征变化导致密钥不匹配):', decryptError.message);
                    decryptionFailed = true;
                }
            }

            if (savedConfig.encryptedPrivateKey) {
                try {
                    const masterKey = this.getMasterKey();
                    config.privateKey = this.cryptoService.decrypt(savedConfig.encryptedPrivateKey, masterKey);
                } catch (decryptError) {
                    console.warn('解密私钥失败 (可能是设备特征变化导致密钥不匹配):', decryptError.message);
                    decryptionFailed = true;
                }
            }

            // 如果解密失败，删除损坏的配置并返回默认配置
            if (decryptionFailed) {
                console.warn('配置解密失败，将删除损坏的配置文件并返回默认配置');
                try {
                    // 备份损坏的配置文件
                    const backupPath = `${this.configPath}.corrupted.${Date.now()}`;
                    await fs.copy(this.configPath, backupPath);
                    console.log(`已备份损坏的配置到: ${backupPath}`);

                    // 删除原配置文件
                    await fs.remove(this.configPath);
                    console.log('已删除损坏的配置文件');
                } catch (cleanupError) {
                    console.error('清理损坏配置失败:', cleanupError);
                }

                return {
                    success: true,
                    config: this.getDefaultConfig(),
                    needsReconfigure: true
                };
            }

            return { success: true, config };
        } catch (error) {
            console.error('加载SSH配置失败:', error);
            return { success: false, error: `加载配置失败: ${error.message}` };
        }
    }

    /**
     * 删除配置
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteConfig() {
        try {
            if (await fs.pathExists(this.configPath)) {
                // 创建备份
                const backupPath = `${this.configPath}.backup.${Date.now()}`;
                await fs.copy(this.configPath, backupPath);

                // 删除配置文件
                await fs.remove(this.configPath);
            }

            return { success: true };
        } catch (error) {
            console.error('删除SSH配置失败:', error);
            return { success: false, error: `删除配置失败: ${error.message}` };
        }
    }

    /**
     * 验证配置对象
     * @param {object} config - 要验证的配置
     * @returns {{valid: boolean, error?: string}}
     */
    validateConfig(config) {
        if (!config || typeof config !== 'object') {
            return { valid: false, error: '配置必须是对象' };
        }

        // 必需字段验证
        if (!config.host || typeof config.host !== 'string' || config.host.trim() === '') {
            return { valid: false, error: '主机地址不能为空' };
        }

        if (!config.username || typeof config.username !== 'string' || config.username.trim() === '') {
            return { valid: false, error: '用户名不能为空' };
        }

        // 端口验证
        if (config.port !== undefined) {
            const port = parseInt(config.port);
            if (isNaN(port) || port < 1 || port > 65535) {
                return { valid: false, error: '端口必须是1-65535之间的数字' };
            }
        }

        // 认证方式验证（必须有密码或私钥）
        if (!config.password && !config.privateKey) {
            return { valid: false, error: '必须提供密码或SSH私钥' };
        }

        // 远程路径验证
        if (config.remotePath && typeof config.remotePath !== 'string') {
            return { valid: false, error: '远程路径必须是字符串' };
        }

        return { valid: true };
    }

    /**
     * 获取默认配置
     * @returns {object} 默认配置对象
     */
    getDefaultConfig() {
        return {
            host: '',
            port: 22,
            username: '',
            password: '',
            remotePath: '~/.aws/sso/cache',
            autoSync: false,
            created: null,
            updated: null
        };
    }

    /**
     * 检查配置是否存在
     * @returns {Promise<boolean>}
     */
    async configExists() {
        try {
            return await fs.pathExists(this.configPath);
        } catch (error) {
            console.error('检查配置文件存在性失败:', error);
            return false;
        }
    }

    /**
     * 获取配置文件路径
     * @returns {string}
     */
    getConfigPath() {
        return this.configPath;
    }

    /**
     * 更新配置的特定字段
     * @param {object} updates - 要更新的字段
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updateConfig(updates) {
        try {
            // 先加载现有配置
            const loadResult = await this.loadConfig();
            if (!loadResult.success) {
                return loadResult;
            }

            // 合并更新
            const updatedConfig = { ...loadResult.config, ...updates };

            // 保存更新后的配置
            return await this.saveConfig(updatedConfig);
        } catch (error) {
            console.error('更新SSH配置失败:', error);
            return { success: false, error: `更新配置失败: ${error.message}` };
        }
    }

    /**
     * 清除敏感数据（尽力而为）
     * @param {object} config - 包含敏感数据的配置对象
     */
    clearSensitiveData(config) {
        if (config && typeof config === 'object') {
            if (config.password) {
                this.cryptoService.clearSensitiveString(config.password);
                config.password = null;
            }
            if (config.privateKey) {
                this.cryptoService.clearSensitiveString(config.privateKey);
                config.privateKey = null;
            }
        }
    }
}

module.exports = ConfigStore;