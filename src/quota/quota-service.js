/**
 * Quota Service - 配额查询服务
 * 参考 Antigravity-Manager/src-tauri/src/modules/quota.rs
 */

const fetch = require('node-fetch');

// API 配置
const QUOTA_API_URL = 'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels';
const CLOUD_CODE_BASE_URL = 'https://cloudcode-pa.googleapis.com';

// 动态生成 User-Agent，适配不同架构
const os = require('os');
const USER_AGENT = `antigravity/1.11.3 ${os.platform()}/${os.arch()}`;

/**
 * 配额数据结构
 */
class QuotaData {
    constructor() {
        this.models = [];
        this.lastUpdated = Date.now();
        this.isForbidden = false;
        this.subscriptionTier = null;
    }

    addModel(name, percentage, resetTime) {
        this.models.push({
            name,
            percentage,
            resetTime
        });
    }

    toJSON() {
        return {
            models: this.models,
            lastUpdated: this.lastUpdated,
            isForbidden: this.isForbidden,
            subscriptionTier: this.subscriptionTier
        };
    }
}

/**
 * 获取项目 ID 和订阅类型
 * @param {string} accessToken - 访问令牌
 * @param {string} email - 账号邮箱（用于日志）
 * @returns {Promise<{projectId: string|null, subscriptionTier: string|null}>}
 */
async function fetchProjectId(accessToken, email = 'unknown') {
    try {
        const meta = { metadata: { ideType: 'ANTIGRAVITY' } };

        const response = await fetch(`${CLOUD_CODE_BASE_URL}/v1internal:loadCodeAssist`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'antigravity/windows/amd64'
            },
            body: JSON.stringify(meta),
            timeout: 15000
        });

        if (response.ok) {
            const data = await response.json();
            const projectId = data.cloudaicompanionProject || null;

            // 优先从 paidTier 获取订阅 ID，这比 currentTier 更能反映真实账户权益
            let subscriptionTier = null;
            if (data.paidTier && data.paidTier.id) {
                subscriptionTier = data.paidTier.id;
            } else if (data.currentTier && data.currentTier.id) {
                subscriptionTier = data.currentTier.id;
            }

            if (subscriptionTier) {
                console.log(`[Quota] [${email}] 订阅识别成功: ${subscriptionTier}`);
            }

            return { projectId, subscriptionTier };
        } else {
            console.warn(`[Quota] [${email}] loadCodeAssist 失败: Status: ${response.status}`);
            return { projectId: null, subscriptionTier: null };
        }
    } catch (error) {
        console.error(`[Quota] [${email}] loadCodeAssist 网络错误:`, error.message);
        return { projectId: null, subscriptionTier: null };
    }
}

/**
 * 查询账号配额
 * @param {string} accessToken - 访问令牌
 * @param {string} email - 账号邮箱（用于日志）
 * @returns {Promise<{success: boolean, data?: QuotaData, projectId?: string, error?: string}>}
 */
async function fetchQuota(accessToken, email = 'unknown') {
    try {
        console.log(`[Quota] [${email}] 开始查询配额...`);

        // 1. 获取 Project ID 和订阅类型
        const { projectId, subscriptionTier } = await fetchProjectId(accessToken, email);
        const finalProjectId = projectId || 'bamboo-precept-lgxtn';

        // 2. 查询配额
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(QUOTA_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': USER_AGENT
                    },
                    body: JSON.stringify({ project: finalProjectId }),
                    timeout: 15000
                });

                // 特殊处理 403 Forbidden - 直接返回,不重试
                if (response.status === 403) {
                    console.warn(`[Quota] 账号无权限 (403 Forbidden),标记为 forbidden 状态`);
                    const quotaData = new QuotaData();
                    quotaData.isForbidden = true;
                    quotaData.subscriptionTier = subscriptionTier;
                    return {
                        success: true,
                        data: quotaData.toJSON(),
                        projectId
                    };
                }

                if (!response.ok) {
                    const text = await response.text();
                    if (attempt < maxRetries) {
                        console.warn(`[Quota] API 错误: ${response.status} - ${text} (尝试 ${attempt}/${maxRetries})`);
                        lastError = `HTTP ${response.status} - ${text}`;
                        await sleep(1000);
                        continue;
                    } else {
                        return {
                            success: false,
                            error: `API 错误: ${response.status} - ${text}`
                        };
                    }
                }

                const quotaResponse = await response.json();
                const quotaData = new QuotaData();

                console.log(`[Quota] API 返回了 ${Object.keys(quotaResponse.models || {}).length} 个模型`);

                // 解析模型配额
                // 只显示指定的模型
                const targetModels = [
                    'gemini-3-pro-high',
                    'claude-opus-4-6-thinking',
                    'gemini-3-pro-image',
                    'claude-sonnet-4-6-thinking'
                ];

                if (quotaResponse.models) {
                    for (const [name, info] of Object.entries(quotaResponse.models)) {
                        if (info.quotaInfo && targetModels.includes(name)) {
                            const percentage = info.quotaInfo.remainingFraction
                                ? Math.round(info.quotaInfo.remainingFraction * 100)
                                : 0;
                            const resetTime = info.quotaInfo.resetTime || '';

                            quotaData.addModel(name, percentage, resetTime);
                        }
                    }
                }

                // 设置订阅类型
                quotaData.subscriptionTier = subscriptionTier;

                console.log(`[Quota] [${email}] 配额查询成功，找到 ${quotaData.models.length} 个相关模型`);

                return {
                    success: true,
                    data: quotaData.toJSON(),
                    projectId
                };

            } catch (error) {
                console.warn(`[Quota] 请求失败: ${error.message} (尝试 ${attempt}/${maxRetries})`);
                lastError = error.message;
                if (attempt < maxRetries) {
                    await sleep(1000);
                }
            }
        }

        return {
            success: false,
            error: lastError || '配额查询失败'
        };

    } catch (error) {
        console.error(`[Quota] [${email}] 配额查询异常:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 格式化剩余时间
 * @param {string} resetTime - ISO 时间字符串
 * @returns {string} 格式化的剩余时间
 */
function formatTimeRemaining(resetTime) {
    if (!resetTime) return '未知';

    try {
        const resetDate = new Date(resetTime);
        const now = new Date();
        const diffMs = resetDate.getTime() - now.getTime();

        if (diffMs <= 0) return '已重置';

        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (diffHours > 24) {
            const days = Math.floor(diffHours / 24);
            return `${days}天${diffHours % 24}小时`;
        } else if (diffHours > 0) {
            return `${diffHours}小时${diffMinutes}分钟`;
        } else {
            return `${diffMinutes}分钟`;
        }
    } catch (error) {
        return '未知';
    }
}

/**
 * 辅助函数：延迟
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    QuotaData,
    fetchQuota,
    fetchProjectId,
    formatTimeRemaining
};