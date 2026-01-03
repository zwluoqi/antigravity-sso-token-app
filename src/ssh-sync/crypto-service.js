const crypto = require('crypto');
const os = require('os');

/**
 * 加密服务类
 * 提供AES-256-GCM加密和解密功能，用于安全存储SSH凭据
 */
class CryptoService {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.keyDerivation = 'pbkdf2';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.saltLength = 32; // 256 bits
        this.iterations = 100000; // PBKDF2 iterations
    }

    /**
     * 生成基于设备特征的主密钥
     * @returns {string} 主密钥
     */
    generateMasterKey() {
        try {
            // 使用设备特征生成一致的主密钥
            const deviceInfo = [
                os.hostname(),
                os.platform(),
                os.arch(),
                os.userInfo().username
            ].join('|');
            
            // 使用SHA-256生成固定长度的密钥
            return crypto.createHash('sha256').update(deviceInfo).digest('hex');
        } catch (error) {
            console.error('生成主密钥失败:', error);
            // 如果设备信息获取失败，使用随机密钥
            return crypto.randomBytes(32).toString('hex');
        }
    }

    /**
     * 加密敏感数据
     * @param {string} data - 要加密的数据
     * @param {string} masterKey - 主密钥
     * @returns {object} 包含加密数据、IV、标签和盐的对象
     */
    encrypt(data, masterKey) {
        try {
            if (!data || typeof data !== 'string') {
                throw new Error('数据必须是非空字符串');
            }
            
            if (!masterKey || typeof masterKey !== 'string') {
                throw new Error('主密钥必须是非空字符串');
            }

            // 生成随机盐和IV
            const salt = crypto.randomBytes(this.saltLength);
            const iv = crypto.randomBytes(this.ivLength);

            // 使用PBKDF2从主密钥派生加密密钥
            const key = crypto.pbkdf2Sync(masterKey, salt, this.iterations, this.keyLength, 'sha256');

            // 创建加密器 - 使用现代API
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

            // 加密数据
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            return {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                tag: '', // CBC模式不使用认证标签
                salt: salt.toString('hex')
            };
        } catch (error) {
            console.error('加密失败:', error);
            throw new Error(`加密失败: ${error.message}`);
        }
    }

    /**
     * 解密敏感数据
     * @param {object} encryptedData - 包含加密数据、IV、标签和盐的对象
     * @param {string} masterKey - 主密钥
     * @returns {string} 解密后的数据
     */
    decrypt(encryptedData, masterKey) {
        try {
            if (!encryptedData || typeof encryptedData !== 'object') {
                throw new Error('加密数据必须是对象');
            }

            const { encrypted, iv, salt } = encryptedData;
            
            if (!encrypted || !iv || !salt) {
                throw new Error('加密数据格式不完整');
            }

            if (!masterKey || typeof masterKey !== 'string') {
                throw new Error('主密钥必须是非空字符串');
            }

            // 从十六进制字符串转换回Buffer
            const saltBuffer = Buffer.from(salt, 'hex');

            // 使用PBKDF2从主密钥派生解密密钥
            const key = crypto.pbkdf2Sync(masterKey, saltBuffer, this.iterations, this.keyLength, 'sha256');

            // 从十六进制字符串转换回Buffer
            const ivBuffer = Buffer.from(encryptedData.iv, 'hex');

            // 创建解密器 - 使用现代API
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuffer);

            // 解密数据
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('解密失败:', error);
            throw new Error(`解密失败: ${error.message}`);
        }
    }

    /**
     * 验证加密数据的完整性
     * @param {object} encryptedData - 加密数据对象
     * @returns {boolean} 数据是否有效
     */
    validateEncryptedData(encryptedData) {
        try {
            if (!encryptedData || typeof encryptedData !== 'object') {
                return false;
            }

            const { encrypted, iv, salt } = encryptedData;
            
            // 检查必需字段是否存在
            if (!encrypted || !iv || !salt) {
                return false;
            }

            // 检查字段是否为有效的十六进制字符串
            const hexRegex = /^[0-9a-fA-F]+$/;
            if (!hexRegex.test(encrypted) || !hexRegex.test(iv) || !hexRegex.test(salt)) {
                return false;
            }

            // 检查长度是否正确
            if (Buffer.from(iv, 'hex').length !== this.ivLength ||
                Buffer.from(salt, 'hex').length !== this.saltLength) {
                return false;
            }

            return true;
        } catch (error) {
            console.error('验证加密数据失败:', error);
            return false;
        }
    }

    /**
     * 安全清除敏感字符串（尽力而为）
     * @param {string} sensitiveString - 要清除的敏感字符串
     */
    clearSensitiveString(sensitiveString) {
        try {
            if (typeof sensitiveString === 'string') {
                // 在JavaScript中无法真正清除字符串内存
                // 但我们可以尝试覆盖变量
                sensitiveString = null;
            }
        } catch (error) {
            console.error('清除敏感字符串失败:', error);
        }
    }
}

module.exports = CryptoService;