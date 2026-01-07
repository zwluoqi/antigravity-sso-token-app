/**
 * Quota Module - 配额管理模块
 * 导出配额相关的服务和功能
 */

const { fetchQuota, fetchProjectId, formatTimeRemaining, QuotaData } = require('./quota-service');

module.exports = {
    fetchQuota,
    fetchProjectId,
    formatTimeRemaining,
    QuotaData
};