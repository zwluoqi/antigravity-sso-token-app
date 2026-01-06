// 标签页管理
class TabManager {
    constructor() {
        this.currentTab = 'token-manager';
        this.initializeTabs();
    }

    initializeTabs() {
        // 获取所有标签按钮和内容面板
        this.tabButtons = document.querySelectorAll('.nav-tab');
        this.tabPanes = document.querySelectorAll('.tab-pane');

        console.log(`找到 ${this.tabButtons.length} 个标签按钮`);
        console.log(`找到 ${this.tabPanes.length} 个标签面板`);

        // 绑定点击事件
        this.tabButtons.forEach((button, index) => {
            const tabId = button.getAttribute('data-tab');
            console.log(`绑定标签按钮 ${index}: ${tabId}`);

            button.addEventListener('click', (e) => {
                console.log(`标签按钮被点击: ${tabId}`);
                this.switchTab(tabId);
            });
        });

        // 检查标签面板
        this.tabPanes.forEach((pane, index) => {
            console.log(`标签面板 ${index}: ${pane.id}, 类名: ${pane.className}`);
        });
    }

    switchTab(tabId) {
        console.log(`尝试切换到标签页: ${tabId}, 当前标签页: ${this.currentTab}`);

        if (this.currentTab === tabId) {
            console.log('标签页已经是当前标签页，跳过切换');
            return;
        }

        // 更新按钮状态
        this.tabButtons.forEach(button => {
            if (button.getAttribute('data-tab') === tabId) {
                button.classList.add('active');
                console.log(`激活按钮: ${tabId}`);
            } else {
                button.classList.remove('active');
            }
        });

        // 更新内容面板
        this.tabPanes.forEach(pane => {
            if (pane.id === tabId) {
                pane.classList.add('active');
                console.log(`显示面板: ${pane.id}`);
            } else {
                pane.classList.remove('active');
                console.log(`隐藏面板: ${pane.id}`);
            }
        });

        this.currentTab = tabId;
        console.log(`标签页切换完成: ${tabId}`);

        // 触发标签页切换事件
        this.onTabSwitch(tabId);
    }

    onTabSwitch(tabId) {
        console.log(`切换到标签页: ${tabId}`);

        // 如果切换到SSH同步标签页，可以执行特定的初始化逻辑
        if (tabId === 'ssh-sync') {
            this.initializeSSHSyncTab();
        }
    }

    async initializeSSHSyncTab() {
        console.log('开始初始化SSH同步标签页');

        try {
            // 加载SSH同步的CSS
            if (!document.querySelector('link[href="ssh-sync.css"]')) {
                console.log('加载SSH同步CSS');
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'ssh-sync.css';
                document.head.appendChild(link);
            }

            // 加载SSH同步的JavaScript
            if (!document.querySelector('script[src="ssh-sync.js"]')) {
                console.log('加载SSH同步JavaScript');
                const script = document.createElement('script');
                script.src = 'ssh-sync.js';
                script.onload = () => {
                    console.log('SSH同步脚本加载完成');
                    // 脚本加载完成后初始化SSH同步管理器
                    setTimeout(() => {
                        if (window.initializeSSHSyncManager) {
                            console.log('初始化SSH同步管理器');
                            window.initializeSSHSyncManager();
                        } else {
                            console.error('initializeSSHSyncManager函数未找到');
                        }
                    }, 100);
                };
                script.onerror = (error) => {
                    console.error('SSH同步脚本加载失败:', error);
                };
                document.head.appendChild(script);
            } else {
                console.log('SSH同步脚本已存在');
                // 如果脚本已经加载，直接初始化
                setTimeout(() => {
                    if (window.initializeSSHSyncManager) {
                        console.log('直接初始化SSH同步管理器');
                        window.initializeSSHSyncManager();
                    } else {
                        console.error('initializeSSHSyncManager函数未找到');
                    }
                }, 100);
            }
        } catch (error) {
            console.error('初始化SSH同步标签页失败:', error);
        }
    }

    getCurrentTab() {
        return this.currentTab;
    }
}

// 应用状态管理
class AppState {
    constructor() {
        this.currentToken = null;
        this.serverConfig = {
            url: 'https://supercode.xxworld.org',
            autoRefresh: true,
            refreshInterval: 30,
            ssoToken: ''
        };
        this.renewalConfig = null; // 存储续费配置
        this.isProcessing = false;
        this.requestHistory = new Map(); // 用于防重复申请
        this.autoRefreshTimer = null; // 自动刷新定时器
    }

    setCurrentToken(token) {
        console.log('设置当前token', token)
        this.currentToken = token;
        this.updateUI();
        // 设置自动刷新定时器
        this.setupAutoRefresh();
    }

    setUsageData(usageData) {
        this.usageData = usageData;
        this.updateUsageDisplay();
        // 保存使用量数据到配置中
        this.saveUsageDataToConfig(usageData);
    }


    async saveUsageDataToConfig(usageData) {
        try {
            const currentConfig = { ...this.serverConfig, usageDatas: usageData };
            this.serverConfig = currentConfig;
            // 通过应用实例保存配置
            if (window.app) {
                await window.app.saveConfig();
            }
        } catch (error) {
            console.error('保存使用量数据到配置失败:', error);
        }
    }


    setSsoUsage(ssoUsage) {
        if (!ssoUsage) {
            console.error('SSO Token使用情况为空');
            return;
        }
        this.serverConfig.ssoUsage = ssoUsage;
        this.updateSsoUsageDisplay();
        this.saveSSOUsageDataToConfig(ssoUsage);
        // SSO使用情况更新后，刷新续费按钮显示状态
        this.updateRenewalButtonsVisibility();
    }

    async saveSSOUsageDataToConfig(ssoUsage) {

        try {
            const currentConfig = { ...this.serverConfig, ssoUsage: ssoUsage };
            this.serverConfig = currentConfig;
            // 通过应用实例保存配置
            if (window.app) {
                await window.app.saveConfig();
            }
        } catch (error) {
            console.error('保存SSO Token使用情况到配置失败:', error);
        }
    }

    loadUsageDataFromConfig() {
        if (this.serverConfig.usageDatas) {
            this.usageData = this.serverConfig.usageDatas;
            this.updateUsageDisplay();
        }
    }

    setServerConfig(config) {
        this.serverConfig = { ...this.serverConfig, ...config };
        this.updateUI();
        // 配置更改后重新设置自动刷新
        this.setupAutoRefresh();
        // 配置更改后刷新续费按钮显示状态
        this.updateRenewalButtonsVisibility();
    }

    setProcessing(processing) {
        this.isProcessing = processing;
        this.toggleLoadingIndicator(processing);
    }

    updateUI() {
        this.updateTokenStatus();
        this.updateServerStatus();
        this.updateUsageDisplay();
        this.updateRenewalButtonsVisibility();
    }

    // 设置续费配置
    setRenewalConfig(config) {
        this.renewalConfig = config;
        this.updateRenewalButtonsVisibility(); // 更新按钮显示
    }

    updateTokenStatus() {
        const tokenStatus = document.getElementById('tokenStatus');
        const currentTokenId = document.getElementById('currentTokenId');
        const tokenExpiry = document.getElementById('tokenExpiry');
        const lastUpdate = document.getElementById('lastUpdate');

        if (this.currentToken) {
            const now = new Date();
            const expiry = new Date(this.currentToken.realExpiresAt || Date.now() + 3600000);
            const isExpired = expiry < now;

            tokenStatus.textContent = isExpired ? '已过期' : '有效';
            tokenStatus.className = `status-badge ${isExpired ? 'status-expired' : 'status-active'}`;

            currentTokenId.textContent = this.currentToken.aws_sso_app_session_id.substring(0, 10) || 'N/A';
            tokenExpiry.textContent = utils.formatDate(expiry);
            lastUpdate.textContent = utils.formatDate(now);
        } else {
            tokenStatus.textContent = '未知';
            tokenStatus.className = 'status-badge status-unknown';
            currentTokenId.textContent = '-';
            tokenExpiry.textContent = '-';
            lastUpdate.textContent = '-';
        }
    }

    updateUsageDisplay() {
        const usageDataSection = document.getElementById('usageDataSection');
        const usageDataContainer = document.getElementById('usageDataContainer');

        if (this.usageData && Array.isArray(this.usageData) && this.usageData.length > 0) {
            // Show the usage data section
            usageDataSection.style.display = 'block';

            // Clear existing content
            usageDataContainer.innerHTML = '';

            // Create usage items for each resource type
            this.usageData.forEach(usage => {
                const usageItem = this.createUsageItem(usage);
                usageDataContainer.appendChild(usageItem);
            });
        } else {
            // Hide the usage data section if no data
            usageDataSection.style.display = 'none';
        }
    }

    createUsageItem(usage) {
        const { resourceType, currentUsage, limit } = usage;
        const percentage = limit > 0 ? Math.round((currentUsage / limit) * 100) : 0;

        // Determine the status class based on usage percentage
        let statusClass = '';
        if (percentage >= 90) {
            statusClass = 'usage-danger';
        } else if (percentage >= 70) {
            statusClass = 'usage-warning';
        }

        const usageItem = document.createElement('div');
        usageItem.className = `usage-item ${statusClass}`;

        // Create resource type label
        const usageType = document.createElement('div');
        usageType.className = 'usage-type';
        usageType.textContent = this.getResourceTypeLabel(resourceType);

        // Create usage stats container
        const usageStats = document.createElement('div');
        usageStats.className = 'usage-stats';

        // Create usage numbers
        const usageNumbers = document.createElement('div');
        usageNumbers.className = 'usage-numbers';
        usageNumbers.textContent = `${currentUsage}/${limit}`;

        // Create progress bar
        const usageProgress = document.createElement('div');
        usageProgress.className = 'usage-progress';

        const progressBar = document.createElement('div');
        progressBar.className = `usage-progress-bar ${statusClass}`;
        progressBar.style.width = `${Math.min(percentage, 100)}%`;

        usageProgress.appendChild(progressBar);

        // Create percentage display
        const usagePercentage = document.createElement('div');
        usagePercentage.className = 'usage-percentage';
        usagePercentage.textContent = `${percentage}%`;

        // Assemble the usage stats
        usageStats.appendChild(usageNumbers);
        usageStats.appendChild(usageProgress);
        usageStats.appendChild(usagePercentage);

        // Assemble the usage item
        usageItem.appendChild(usageType);
        usageItem.appendChild(usageStats);

        return usageItem;
    }

    getResourceTypeLabel(resourceType) {
        const labels = {
            'SPEC': 'SPEC',
            'VIBE': 'VIBE',
            'AGENTIC_REQUEST': '智能请求',
            'SSO': 'SSO Token'
        };
        return labels[resourceType] || resourceType;
    }

    updateServerStatus() {
        const serverStatus = document.getElementById('serverStatus');
        const connectionStatus = document.getElementById('connectionStatus');

        this.updateSsoUsageDisplay();
        // 服务器状态会在测试连接时更新
    }

    updateSsoUsageDisplay() {
        const ssoUsageSection = document.getElementById('ssoUsageSection');
        const ssoUsageContainer = document.getElementById('ssoUsageContainer');
        const ssoTokenExpiry = document.getElementById('ssoTokenExpiry');

        if (this.serverConfig.ssoUsage) {
            ssoUsageSection.style.display = 'block';
            ssoUsageContainer.innerHTML = '';
            const { expiresAt, limitedCount, requestCount } = this.serverConfig.ssoUsage;
            console.log('expiresAt:', expiresAt);
            if (new Date(expiresAt) > new Date()) {
                ssoTokenExpiry.textContent = utils.formatDate(expiresAt);
            }
            else if (limitedCount === 0 && requestCount === 0) {
                // 红色提示
                ssoTokenExpiry.style.color = 'red';
                ssoTokenExpiry.textContent = 'sso_token配置错误';
            }
            else {
                ssoTokenExpiry.textContent = '已过期';
            }
            const usageItem = this.createUsageItem({
                resourceType: 'SSO',
                currentUsage: requestCount,
                limit: limitedCount
            });
            ssoUsageContainer.appendChild(usageItem);
        } else {
            ssoUsageSection.style.display = 'none';
            ssoUsageContainer.innerHTML = '';
            // 如果没有SSO使用量数据，显示基本的SSO Token状态
            if (this.serverConfig.ssoToken) {
                ssoTokenExpiry.textContent = '已配置';
            } else {
                ssoTokenExpiry.textContent = '未配置';
            }
        }
    }

    toggleLoadingIndicator(show) {
        const indicator = document.getElementById('loadingIndicator');
        if (show) {
            indicator.classList.add('show');
        } else {
            indicator.classList.remove('show');
        }
    }

    // 设置自动刷新定时器
    setupAutoRefresh() {
        console.warn('setupAutoRefresh');
        // 清除现有定时器
        if (this.autoRefreshTimer) {
            clearTimeout(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }

        // 检查是否启用自动刷新
        if (!this.serverConfig.autoRefresh || !this.currentToken || !this.currentToken.realExpiresAt) {
            console.warn('不需要自动刷新账号', this.serverConfig.autoRefresh, this.currentToken)
            return;
        }

        // 检查是否有SSO Token
        if (!this.serverConfig.ssoToken) {
            console.log('自动刷新需要SSO Token，跳过设置');
            return;
        }

        const now = new Date();
        const realExpiresAt = new Date(this.currentToken.realExpiresAt);

        // 计算提前5分钟刷新的时间点
        const refreshTime = new Date(realExpiresAt.getTime() - 5 * 60 * 1000); // 提前5分钟
        const timeUntilRefresh = refreshTime.getTime() - now.getTime();

        // 如果刷新时间已经过了，立即刷新
        if (timeUntilRefresh <= 0) {
            console.log('Token即将过期，立即执行自动刷新');
            this.performAutoRefresh();
            return;
        }

        console.log(`设置自动刷新定时器，将在 ${Math.round(timeUntilRefresh / 1000 / 60)} 分钟后刷新Token`);

        // 设置定时器
        this.autoRefreshTimer = setTimeout(() => {
            this.performAutoRefresh();
        }, timeUntilRefresh);
    }

    // 执行自动刷新
    async performAutoRefresh() {
        if (this.isProcessing) {
            console.log('正在处理其他请求，跳过自动刷新');
            return;
        }

        if (!this.currentToken || !this.serverConfig.ssoToken) {
            console.log('缺少必要信息，无法执行自动刷新');
            return;
        }

        try {
            console.log('开始执行自动刷新Token...');

            // 通过应用实例获取TokenManager来执行刷新
            if (window.app && window.app.tokenManager) {
                await window.app.tokenManager.refreshCurrentToken();
            }
        } catch (error) {
            console.error('自动刷新Token失败:', error);
        }
    }

    // 清除自动刷新定时器
    clearAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearTimeout(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
            console.log('自动刷新定时器已清除');
        }
    }

    // 检查SSO Token状态
    getSsoTokenStatus() {
        if (!this.serverConfig.ssoToken) {
            return { status: 'missing', message: '未配置SSO Token' };
        }

        if (!this.serverConfig.ssoUsage || !this.serverConfig.ssoUsage.expiresAt) {
            return { status: 'unknown', message: 'SSO Token状态未知' };
        }

        const now = new Date();
        const expiresAt = new Date(this.serverConfig.ssoUsage.expiresAt);
        const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (expiresAt <= now) {
            return { status: 'expired', message: 'SSO Token已过期', hoursUntilExpiry: 0 };
        } else if (hoursUntilExpiry <= 12) {
            return { status: 'expiring_soon', message: `SSO Token将在${Math.round(hoursUntilExpiry)}小时后过期`, hoursUntilExpiry };
        } else {
            return { status: 'valid', message: 'SSO Token有效', hoursUntilExpiry };
        }
    }

    // 更新服务器连接卡片按钮显示状态
    updateRenewalButtonsVisibility() {
        const ssoStatus = this.getSsoTokenStatus();
        this.updateServerCardButtons(ssoStatus);
    }

    // 更新服务器连接卡片的按钮
    updateServerCardButtons(ssoStatus) {
        console.log('更新服务器连接卡片按钮显示状态', ssoStatus);
        const serverCardActions = document.querySelector('.server-card .card-actions');
        const testConnectionBtn = document.getElementById('testConnectionBtn');
        const renew24HourBtn = document.getElementById('renew24HourBtn');
        const renew30DayBtn = document.getElementById('renew30DayBtn');

        const shouldShowRenewalButtons =
            ssoStatus.status === 'missing' ||
            ssoStatus.status === 'expired' ||
            ssoStatus.status === 'expiring_soon';

        console.log('shouldShowRenewalButtons:', shouldShowRenewalButtons);
        console.log('SSO状态:', ssoStatus.status);

        if (shouldShowRenewalButtons) {
            console.log('需要显示SSO续费按钮，隐藏原有续费按钮');
            // 隐藏原有的续费按钮，显示新的续费按钮
            if (renew24HourBtn) {
                renew24HourBtn.style.display = 'none';
                console.log('隐藏24小时续费按钮');
            }
            if (renew30DayBtn) {
                renew30DayBtn.style.display = 'none';
                console.log('隐藏30天续费按钮');
            }

            // 创建或显示SSO续费按钮
            this.createSsoRenewalButtons(serverCardActions);
        } else {
            console.log('SSO Token有效，隐藏所有续费按钮');
            // SSO Token有效时，隐藏所有续费按钮
            if (renew24HourBtn) {
                renew24HourBtn.style.display = 'none';
                console.log('隐藏24小时续费按钮');
            }
            if (renew30DayBtn) {
                renew30DayBtn.style.display = 'none';
                console.log('隐藏30天续费按钮');
            }

            // 隐藏SSO续费按钮
            this.hideSsoRenewalButtons();
        }
    }

    // 创建SSO续费按钮
    createSsoRenewalButtons(serverCardActions) {
        // 检查是否已经存在SSO续费按钮
        let ssoRenewalContainer = document.getElementById('ssoRenewalContainer');

        if (!ssoRenewalContainer) {
            ssoRenewalContainer = document.createElement('div');
            ssoRenewalContainer.id = 'ssoRenewalContainer';
            ssoRenewalContainer.className = 'sso-renewal-buttons';

            // 插入到服务器卡片操作区域
            serverCardActions.appendChild(ssoRenewalContainer);
        }

        // 清空现有内容并重新创建按钮（以使用最新的配置数据）
        ssoRenewalContainer.innerHTML = '';

        if (this.renewalConfig) {
            // 获取SSO Token状态以确定剩余有效期
            const ssoStatus = this.getSsoTokenStatus();
            console.log('SSO Token状态', ssoStatus);
            const hoursUntilExpiry = ssoStatus.hoursUntilExpiry || 0;

            // 创建24小时续费按钮（仅当剩余有效期 <= 12小时时显示）
            if (this.renewalConfig.hour24 && hoursUntilExpiry <= 12) {
                const ssoRenew24HourBtn = document.createElement('button');
                ssoRenew24HourBtn.id = 'ssoRenew24HourBtn';
                ssoRenew24HourBtn.className = 'btn btn-warning btn-sm';
                ssoRenew24HourBtn.innerHTML = `
                    <span class="icon">💳</span>
                    24小时续费 ¥${this.renewalConfig.hour24.price}
                `;

                ssoRenewalContainer.appendChild(ssoRenew24HourBtn);

                // 添加事件监听器
                ssoRenew24HourBtn.addEventListener('click', async () => {
                    if (window.app) {
                        // 使用Electron的shell模块打开Stripe支付页面
                        await electronAPI.openExternal(this.renewalConfig.hour24Url);
                        // await window.app.handleRenewal('hour24');
                    }
                });
            }

            // 创建30天续费按钮（仅当剩余有效期 <= 24小时时显示）
            if (this.renewalConfig.day30 && hoursUntilExpiry <= 24) {
                const config = this.renewalConfig.day30;
                const ssoRenew30DayBtn = document.createElement('button');
                ssoRenew30DayBtn.id = 'ssoRenew30DayBtn';
                ssoRenew30DayBtn.className = 'btn btn-info btn-sm';

                // 检查是否有原价和优惠价
                let pricingHtml = '';
                if (config.originalPrice && config.originalPrice > config.price) {
                    pricingHtml = `
                        <div class="renewal-pricing">
                            <div class="renewal-title">30天续费</div>
                            <div class="pricing-info">
                                <span class="original-price">¥${config.originalPrice}</span>
                                <span class="discounted-price">¥${config.price}</span>
                            </div>
                        </div>
                    `;
                } else {
                    pricingHtml = `30天续费 ¥${config.price}`;
                }

                ssoRenew30DayBtn.innerHTML = `
                    <span class="icon">💳</span>
                    ${pricingHtml}
                `;

                ssoRenewalContainer.appendChild(ssoRenew30DayBtn);

                // 添加事件监听器
                ssoRenew30DayBtn.addEventListener('click', async () => {
                    if (window.app) {
                        await window.app.handleRenewal('day30');
                    }
                });
            }
        } else {
            // 如果没有配置数据，显示默认按钮
            const defaultBtn = document.createElement('button');
            defaultBtn.className = 'btn btn-secondary btn-sm';
            defaultBtn.innerHTML = `
                <span class="icon">⏳</span>
                加载续费配置中...
            `;
            defaultBtn.disabled = true;
            ssoRenewalContainer.appendChild(defaultBtn);
        }

        ssoRenewalContainer.style.display = 'flex';
    }

    // 隐藏SSO续费按钮
    hideSsoRenewalButtons() {
        console.log('隐藏SSO续费按钮');
        const ssoRenewalContainer = document.getElementById('ssoRenewalContainer');
        if (ssoRenewalContainer) {
            console.log('找到SSO续费按钮容器，正在隐藏', ssoRenewalContainer);
            ssoRenewalContainer.style.display = 'none';
        } else {
            console.log('SSO续费按钮容器不存在，无需隐藏');
        }
    }
}

// 日志管理器
class LogManager {
    constructor() {
        this.logContainer = document.getElementById('logContainer');
        this.maxLogs = 100;
    }

    log(message, type = 'info') {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;

        const time = document.createElement('span');
        time.className = 'log-time';
        time.textContent = `[${new Date().toLocaleTimeString()}]`;

        const msg = document.createElement('span');
        msg.className = 'log-message';
        msg.textContent = message;

        logEntry.appendChild(time);
        logEntry.appendChild(msg);

        this.logContainer.insertBefore(logEntry, this.logContainer.firstChild);

        // 限制日志数量
        while (this.logContainer.children.length > this.maxLogs) {
            this.logContainer.removeChild(this.logContainer.lastChild);
        }

        // 滚动到顶部
        this.logContainer.scrollTop = 0;

        // 同时输出到控制台
        if (window.logger && typeof window.logger[type] === 'function') {
            window.logger[type](message);
        } else {
            console.log(`[${type.toUpperCase()}]`, message);
        }
    }

    clear() {
        this.logContainer.innerHTML = '';
        this.log('日志已清空');
    }
}

// 模态框管理器
class ModalManager {
    constructor() {
        this.modal = document.getElementById('modal');
        this.settingsModal = document.getElementById('settingsModal');
        this.ssoTokenModal = document.getElementById('ssoTokenModal');
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 通用模态框
        document.getElementById('modalCloseBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('modalCancelBtn').addEventListener('click', () => this.hideModal());

        // 设置模态框
        document.getElementById('settingsModalCloseBtn').addEventListener('click', () => this.hideSettingsModal());
        document.getElementById('settingsModalCancelBtn').addEventListener('click', () => this.hideSettingsModal());

        // SSO Token模态框
        document.getElementById('ssoTokenModalCloseBtn').addEventListener('click', () => this.hideSsoTokenModal());
        document.getElementById('ssoTokenModalCancelBtn').addEventListener('click', () => this.hideSsoTokenModal());

        // 点击背景关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hideModal();
        });

        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.hideSettingsModal();
        });

        this.ssoTokenModal.addEventListener('click', (e) => {
            if (e.target === this.ssoTokenModal) this.hideSsoTokenModal();
        });
    }

    showModal(title, body, onConfirm = null) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;

        const confirmBtn = document.getElementById('modalConfirmBtn');
        confirmBtn.onclick = () => {
            if (onConfirm) onConfirm();
            this.hideModal();
        };

        this.modal.classList.add('show');
    }

    hideModal() {
        this.modal.classList.remove('show');
    }

    showSettingsModal(config) {
        document.getElementById('ssoTokenInput').value = config.ssoToken || '';
        document.getElementById('autoRefreshCheckbox').checked = config.autoRefresh || false;
        // document.getElementById('refreshIntervalInput').value = config.refreshInterval || 30;

        this.settingsModal.classList.add('show');
    }

    hideSettingsModal() {
        this.settingsModal.classList.remove('show');
    }

    showSsoTokenModal() {
        document.getElementById('ssoTokenQuickInput').value = '';
        document.getElementById('rememberSsoToken').checked = false;
        this.ssoTokenModal.classList.add('show');

        // 聚焦到输入框
        setTimeout(() => {
            document.getElementById('ssoTokenQuickInput').focus();
        }, 100);
    }

    hideSsoTokenModal() {
        this.ssoTokenModal.classList.remove('show');
    }

    getSsoTokenData() {
        return {
            ssoToken: document.getElementById('ssoTokenQuickInput').value.trim(),
            remember: document.getElementById('rememberSsoToken').checked
        };
    }

    getSettingsData() {
        return {
            ssoToken: document.getElementById('ssoTokenInput').value.trim(),
            autoRefresh: document.getElementById('autoRefreshCheckbox').checked,
            // refreshInterval: parseInt(document.getElementById('refreshIntervalInput').value) || 30
        };
    }
}

// Token管理器
class TokenManager {
    constructor(appState, logManager, modalManager, processManager = null) {
        this.appState = appState;
        this.logManager = logManager;
        this.modalManager = modalManager;
        this.processManager = processManager;
    }

    async loadCurrentToken() {
        try {
            this.logManager.log('正在加载当前Token...');
            const result = await electronAPI.getAntigravityToken();

            if (result.success) {
                this.appState.setCurrentToken(result.data);
                this.logManager.log('Token加载成功', 'success');
                return result.data;
            } else {
                this.logManager.log(`Token加载失败: ${result.error}`, 'error');

                // 检查是否有SSO Token可以用于自动同步
                if (this.appState.serverConfig.ssoToken) {
                    this.logManager.log('检测到已配置SSO Token，500ms后重新从服务器拉取当前Token...', 'info');
                    setTimeout(async () => {
                        this.logManager.log('开始重新从服务器拉取当前Token...', 'info');
                        // 去服务器重新加载当前sso_token所持有的tokenid，如果有的话
                        const success = await this.getSooHoldToken();
                        if (success) {
                            this.logManager.log('重新从服务器拉取当前Token成功！', 'success');
                        } else {
                            this.logManager.log('重新从服务器拉取当前Token失败', 'error');
                        }
                    }, 500);
                } else {
                    this.logManager.log('未配置SSO Token，无法自动从服务器同步Token', 'warning');
                    this.logManager.log('请配置SSO Token后重新申请或刷新Token', 'info');
                }
            }
        } catch (error) {
            this.logManager.log(`Token加载异常: ${error.message}`, 'error');
            return null;
        }
    }

    async saveToken(tokenData) {
        try {
            this.logManager.log('正在保存Token...');
            const result = await electronAPI.saveAntigravityToken(tokenData);

            if (result.success) {
                this.appState.setCurrentToken(tokenData);
                this.logManager.log('Token保存成功', 'success');
                return true;
            } else {
                this.logManager.log(`Token保存失败: ${result.error}`, 'error');
                return false;
            }
        } catch (error) {
            this.logManager.log(`Token保存异常: ${error.message}`, 'error');
            return false;
        }
    }

    async requestNewToken() {
        if (this.appState.isProcessing) {
            this.logManager.log('正在处理中，请稍候...', 'warning');
            return;
        }

        // 检查SSO Token状态
        const ssoStatus = this.appState.getSsoTokenStatus();

        if (ssoStatus.status === 'missing') {
            this.logManager.log('需要输入SSO Token进行身份验证', 'info');
            this.modalManager.showSsoTokenModal();
            return;
        }

        if (ssoStatus.status === 'expired') {
            this.logManager.log('SSO Token已过期，需要续费', 'warning');
            this.showRenewalOptionsModal();
            return;
        }

        // 如果有有效的SSO Token，直接申请
        await this.requestNewTokenWithSsoToken(this.appState.serverConfig.ssoToken);
    }

    // 显示续费选项模态框
    showRenewalOptionsModal() {
        const renewalConfig = this.appState.renewalConfig;

        // 检查续费配置是否已加载
        if (!renewalConfig) {
            this.logManager.log('续费配置未加载，请稍后重试', 'warning');
            this.modalManager.showModal('续费配置加载中',
                '<p>续费配置正在加载中，请稍后重试。</p>');
            return;
        }

        const ssoStatus = this.appState.getSsoTokenStatus();
        const hoursUntilExpiry = ssoStatus.hoursUntilExpiry || 0;

        // 构建24小时续费按钮（仅当剩余有效期 <= 12小时时显示）
        let hour24ButtonHtml = '';
        if (renewalConfig.hour24 && hoursUntilExpiry <= 12) {
            hour24ButtonHtml = `
                <div class="renewal-option">
                    <button id="modalRenew24Hour" class="btn btn-warning btn-block">
                        <span class="icon">💳</span>
                        24小时续费 ¥${renewalConfig.hour24.price}
                    </button>
                </div>
            `;
        }

        // 构建30天续费按钮（仅当剩余有效期 <= 24小时时显示）
        let day30ButtonHtml = '';
        if (renewalConfig.day30 && hoursUntilExpiry <= 24) {
            const config = renewalConfig.day30;
            let pricingHtml = '';
            if (config.originalPrice && config.originalPrice > config.price) {
                pricingHtml = `
                    <div class="renewal-pricing">
                        <div class="renewal-title">30天续费</div>
                        <div class="pricing-info">
                            <span class="original-price">¥${config.originalPrice}</span>
                            <span class="discounted-price">¥${config.price}</span>
                        </div>
                    </div>
                `;
            } else {
                pricingHtml = `30天续费 ¥${config.price}`;
            }

            day30ButtonHtml = `
                <div class="renewal-option">
                    <button id="modalRenew30Day" class="btn btn-info btn-block">
                        <span class="icon">💳</span>
                        ${pricingHtml}
                    </button>
                </div>
            `;
        }

        const modalBody = `
            <div class="renewal-options-info">
                <h4>SSO Token已过期</h4>
                <p>您的SSO Token已过期，需要续费后才能申请新账号。请选择续费方案：</p>
                <div class="renewal-options">
                    ${hour24ButtonHtml}
                    ${day30ButtonHtml}
                </div>
            </div>
        `;

        this.modalManager.showModal('续费选择', modalBody);

        // 添加续费按钮事件监听器
        setTimeout(() => {
            document.getElementById('modalRenew24Hour')?.addEventListener('click', async () => {
                this.modalManager.hideModal();
                if (window.app) {
                    // 使用Electron的shell模块打开Stripe支付页面
                    await electronAPI.openExternal(this.renewalConfig.hour24Url);
                    // await window.app.handleRenewal('hour24');
                }
            });

            document.getElementById('modalRenew30Day')?.addEventListener('click', async () => {
                this.modalManager.hideModal();
                if (window.app) {
                    await window.app.handleRenewal('day30');
                }
            });
        }, 100);
    }

    async requestNewTokenWithSsoToken(ssoToken) {
        if (this.appState.isProcessing) {
            this.logManager.log('正在处理中，请稍候...', 'warning');
            return;
        }

        try {
            this.appState.setProcessing(true);

            // 获取当前tokenId用于解锁
            const currentTokenId = this.appState.currentToken?.aws_sso_app_session_id || null;

            // 检查是否已经在申请中（防重复申请）
            const requestKey = `${currentTokenId || 'new'}_${Date.now()}`;
            if (this.appState.requestHistory.has(currentTokenId) &&
                Date.now() - this.appState.requestHistory.get(currentTokenId) < 6000) {
                this.logManager.log('请求过于频繁，请稍后再试', 'warning');
                this.appState.setProcessing(false);
                return;
            }

            this.logManager.log('正在向服务器申请新Token...');
            this.appState.requestHistory.set(currentTokenId, Date.now());

            const result = await electronAPI.requestTokenFromServer(currentTokenId, ssoToken);
            console.log(result);
            if (result.success && result.data) {
                const newTokenData = {
                    accessToken: result.data.accessToken,
                    refreshToken: result.data.refreshToken,
                    aws_sso_app_session_id: result.data.tokenId,
                    // 存储token的过期时间，假的过期时间一年以后
                    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    // 存储token的真实过期时间
                    realExpiresAt: result.data.expiresAt,
                    ...(result.authMethod === 'social' && {
                        profileArn: "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK",
                        tokenType: result.data.tokenType
                    }),
                    authMethod: result.data.authMethod,
                    provider: result.data.provider,
                    region: result.data.region
                };

                const saved = await this.saveToken(newTokenData);
                if (saved) {
                    this.logManager.log('新Token申请并保存成功！', 'success');

                    // 显示使用量数据
                    if (result.data.usageDatas && Array.isArray(result.data.usageDatas)) {
                        this.appState.setUsageData(result.data.usageDatas);
                        this.logManager.log('使用量数据已更新', 'info');
                    }

                    // 显示SSO Token使用情况
                    if (result.data.ssoUsage) {
                        this.appState.setSsoUsage(result.data.ssoUsage);
                        this.logManager.log('SSO Token使用情况已更新', 'info');
                    }

                    // 标记token已被使用，防止二次申请
                    this.markTokenAsUsed(result.data.tokenId);

                    // Token申请成功后，执行Antigravity进程重启（使用独立的try-catch防止崩溃）
                    if (this.processManager) {
                        try {
                            this.logManager.log('开始执行Antigravity进程重启...', 'info');
                            await this.processManager.restartAntigravityAfterTokenSuccess();
                        } catch (restartError) {
                            this.logManager.log(`Antigravity进程重启失败: ${restartError.message}`, 'warning');
                            console.error('Antigravity进程重启错误:', restartError);
                        }
                    }
                } else {
                    this.logManager.log('Token申请成功但保存失败', 'error');
                }
            } else {
                // 检查是否需要更新客户端
                if (result.needUpdate && result.updateUrl) {
                    this.logManager.log(`${result.error}`, 'error');
                    this.modalManager.showModal('客户端需要更新',
                        `<p>${result.error}</p><p>请下载最新版本的客户端。</p>`,
                        () => {
                            // require('electron').shell.openExternal(result.updateUrl);
                            electronAPI.openExternal(result.updateUrl);
                        });
                } else {
                    this.logManager.log(`Token申请失败: ${result.error}`, 'error');
                }
            }
        } catch (error) {
            this.logManager.log(`Token申请异常: ${error.message}`, 'error');
        } finally {
            this.appState.setProcessing(false);
        }
    }

    markTokenAsUsed(tokenId) {
        // 这里可以实现token使用标记逻辑
        // 例如：向服务器发送标记请求，或在本地存储中记录
        this.logManager.log(`Token ${tokenId} 已标记为已使用`);
    }

    // 刷新当前Token
    async refreshCurrentToken() {
        if (!this.appState.currentToken || !this.appState.serverConfig.ssoToken) {
            this.logManager.log('缺少必要信息，无法刷新Token', 'error');
            return false;
        }

        if (this.appState.isProcessing) {
            this.logManager.log('正在处理中，跳过Token刷新', 'warning');
            return false;
        }

        try {
            this.appState.setProcessing(true);

            const tokenId = this.appState.currentToken.aws_sso_app_session_id;
            const ssoToken = this.appState.serverConfig.ssoToken;

            this.logManager.log('正在自动刷新Token...', 'info');

            const result = await electronAPI.refreshTokenFromServer(tokenId, ssoToken);
            console.log('Token刷新结果:', result);

            if (result.success && result.data) {
                const newTokenData = {
                    accessToken: result.data.accessToken,
                    refreshToken: result.data.refreshToken,
                    aws_sso_app_session_id: result.data.tokenId,
                    // 存储token的过期时间，假的过期时间一年以后
                    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    // 存储token的真实过期时间
                    realExpiresAt: result.data.expiresAt,
                    authMethod: result.data.authMethod,
                    provider: result.data.provider,
                    region: result.data.region
                };

                const saved = await this.saveToken(newTokenData);
                if (saved) {
                    this.logManager.log('Token自动刷新成功！', 'success');

                    // 更新使用量数据
                    if (result.data.usageDatas && Array.isArray(result.data.usageDatas)) {
                        this.appState.setUsageData(result.data.usageDatas);
                        this.logManager.log('使用量数据已更新', 'info');
                    }

                    // 更新SSO Token使用情况
                    if (result.data.ssoUsage) {
                        this.appState.setSsoUsage(result.data.ssoUsage);
                        this.logManager.log('SSO Token使用情况已更新', 'info');
                    }

                    return true;
                } else {
                    this.logManager.log('Token刷新成功但保存失败', 'error');
                    return false;
                }
            } else {
                // 检查是否需要更新客户端
                if (result.needUpdate && result.updateUrl) {
                    this.logManager.log(`${result.error}`, 'error');
                    this.modalManager.showModal('客户端需要更新',
                        `<p>${result.error}</p><p>请下载最新版本的客户端。</p>`,
                        () => {
                            // require('electron').shell.openExternal(result.updateUrl);
                            electronAPI.openExternal(result.updateUrl);
                        });
                } else {
                    this.logManager.log(`Token自动刷新失败: ${result.error}`, 'error');
                }
                return false;
            }
        } catch (error) {
            this.logManager.log(`Token自动刷新异常: ${error.message}`, 'error');
            return false;
        } finally {
            this.appState.setProcessing(false);
        }
    }


    async getSooHoldToken() {


        if (!this.appState.serverConfig.ssoToken) {
            this.logManager.log('缺少必要信息，无法刷新Token', 'error');
            return false;
        }

        if (this.appState.isProcessing) {
            this.logManager.log('正在处理中，跳过Token刷新', 'warning');
            return false;
        }

        try {
            this.appState.setProcessing(true);

            // const tokenId = this.appState.currentToken.aws_sso_app_session_id;
            const ssoToken = this.appState.serverConfig.ssoToken;

            this.logManager.log('正在自动获取Token...', 'info');

            const result = await electronAPI.getSooHoldToken(ssoToken);
            console.log('Token获取结果:', result);

            if (result.success && result.data) {
                const newTokenData = {
                    accessToken: result.data.accessToken,
                    refreshToken: result.data.refreshToken,
                    aws_sso_app_session_id: result.data.tokenId,
                    // 存储token的过期时间，假的过期时间一年以后
                    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    // 存储token的真实过期时间
                    realExpiresAt: result.data.expiresAt,
                    authMethod: result.data.authMethod,
                    provider: result.data.provider,
                    region: result.data.region
                };

                const saved = await this.saveToken(newTokenData);
                if (saved) {
                    this.logManager.log('Token自动刷新成功！', 'success');

                    // 更新使用量数据
                    if (result.data.usageDatas && Array.isArray(result.data.usageDatas)) {
                        this.appState.setUsageData(result.data.usageDatas);
                        this.logManager.log('使用量数据已更新', 'info');
                    }

                    // 更新SSO Token使用情况
                    if (result.data.ssoUsage) {
                        this.appState.setSsoUsage(result.data.ssoUsage);
                        this.logManager.log('SSO Token使用情况已更新', 'info');
                    }

                    return true;
                } else {
                    this.logManager.log('Token刷新成功但保存失败', 'error');
                    return false;
                }
            } else {
                // 检查是否需要更新客户端
                if (result.needUpdate && result.updateUrl) {
                    this.logManager.log(`${result.error}`, 'error');
                    this.modalManager.showModal('客户端需要更新',
                        `<p>${result.error}</p><p>请下载最新版本的客户端。</p>`,
                        () => {
                            // require('electron').shell.openExternal(result.updateUrl);
                            electronAPI.openExternal(result.updateUrl);
                        });
                } else {
                    this.logManager.log(`Token自动刷新失败: ${result.error}`, 'error');
                }
                return false;
            }
        } catch (error) {
            this.logManager.log(`Token自动刷新异常: ${error.message}`, 'error');
            return false;
        } finally {
            this.appState.setProcessing(false);
        }
    }
}

// 服务器连接管理器
class ServerManager {
    constructor(appState, logManager) {
        this.appState = appState;
        this.logManager = logManager;
    }

    async testConnection() {
        try {
            this.logManager.log('正在测试服务器连接...');

            const serverStatus = document.getElementById('serverStatus');
            const connectionStatus = document.getElementById('connectionStatus');

            // 这里应该实现实际的连接测试
            // 暂时模拟测试结果
            const isConnected = await this.pingServer();

            if (isConnected) {
                serverStatus.textContent = '已连接';
                serverStatus.className = 'status-badge status-connected';
                connectionStatus.textContent = '连接正常';
                this.logManager.log('服务器连接测试成功', 'success');
            } else {
                serverStatus.textContent = '连接失败';
                serverStatus.className = 'status-badge status-disconnected';
                connectionStatus.textContent = '连接失败';
                this.logManager.log('服务器连接测试失败', 'error');
            }

            return isConnected;
        } catch (error) {
            this.logManager.log(`连接测试异常: ${error.message}`, 'error');
            return false;
        }
    }

    async pingServer() {
        try {
            // 实现简单的ping测试
            const response = await fetch(`${this.appState.serverConfig.url}/health`, {
                method: 'GET',
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

// 进程管理器
class ProcessManager {
    constructor(appState, logManager) {
        this.appState = appState;
        this.logManager = logManager;
        this.antigravityPath = null;
    }

    async findAntigravityExecutable() {
        try {
            this.logManager.log('正在查找Antigravity可执行文件...');
            const result = await electronAPI.findAntigravityExecutable();

            if (result.success && result.paths.length > 0) {
                this.antigravityPath = result.paths[0]; // 使用找到的第一个路径
                this.logManager.log(`找到Antigravity可执行文件: ${this.antigravityPath}`, 'success');
                return this.antigravityPath;
            } else {
                this.logManager.log('未找到Antigravity可执行文件', 'warning');
                return null;
            }
        } catch (error) {
            this.logManager.log(`查找Antigravity可执行文件时发生错误: ${error.message}`, 'error');
            return null;
        }
    }

    async closeAntigravityProcess() {
        try {
            this.logManager.log('正在关闭Antigravity进程...');
            const result = await electronAPI.closeAntigravityProcess();

            if (result.success) {
                this.logManager.log(result.message, 'success');
                return true;
            } else {
                this.logManager.log(`关闭Antigravity进程失败: ${result.error}`, 'error');
                return false;
            }
        } catch (error) {
            this.logManager.log(`关闭Antigravity进程时发生异常: ${error.message}`, 'error');
            return false;
        }
    }

    async restartAntigravityProcess(customPath = null) {
        try {
            const pathToUse = customPath || this.antigravityPath;

            if (!pathToUse) {
                this.logManager.log('正在查找Antigravity可执行文件...');
                const foundPath = await this.findAntigravityExecutable();
                if (!foundPath) {
                    this.logManager.log('无法找到Antigravity可执行文件，请手动指定路径', 'error');
                    return false;
                }
            }

            this.logManager.log('正在重启Antigravity进程...');
            const result = await electronAPI.restartAntigravityProcess(pathToUse);

            if (result.success) {
                this.logManager.log(result.message, 'success');
                return true;
            } else {
                this.logManager.log(`重启Antigravity进程失败: ${result.error}`, 'error');
                return false;
            }
        } catch (error) {
            this.logManager.log(`重启Antigravity进程时发生异常: ${error.message}`, 'error');
            return false;
        }
    }

    async restartAntigravityAfterTokenSuccess() {
        try {
            this.logManager.log('Token申请成功，开始执行Antigravity进程重启流程...', 'info');

            // 1. 先关闭Antigravity进程
            const closeSuccess = await this.closeAntigravityProcess();
            if (!closeSuccess) {
                this.logManager.log('关闭Antigravity进程失败，但继续尝试重启', 'warning');
            }

            // 2. 等待一小段时间确保进程完全关闭
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 3. 重启Antigravity进程
            const restartSuccess = await this.restartAntigravityProcess();
            if (restartSuccess) {
                this.logManager.log('Antigravity进程重启完成！', 'success');
                return true;
            } else {
                this.logManager.log('Antigravity进程重启失败，请自行手动打开Antigravity应用即可', 'error');
                return false;
            }
        } catch (error) {
            this.logManager.log(`Antigravity进程重启流程发生异常: ${error.message}`, 'error');
            return false;
        }
    }

    async resetDeviceId() {
        try {
            const result = await electronAPI.resetDeviceId();
            if (result.success) {
                this.logManager.log('设备ID重置成功', 'success');
            } else {
                this.logManager.log('设备ID重置失败', 'error');
            }
            return true;
        }
        catch (error) {
            this.logManager.log(`重置设备ID时发生异常: ${error.message}`, 'error');
            return false;
        }
    }
}

// 版本管理器
class VersionManager {
    constructor(appState, logManager, modalManager) {
        this.appState = appState;
        this.logManager = logManager;
        this.modalManager = modalManager;
        this.currentVersion = null; // 将从package.json动态获取
        this.lastCheckTime = null;
        this.updateInfo = null;
    }

    async initializeVersion() {
        try {
            this.currentVersion = await electronAPI.getAppVersion();
            console.log('当前应用版本:', this.currentVersion);

            // 更新UI显示当前版本
            const currentVersionEl = document.getElementById('currentVersion');
            if (currentVersionEl) {
                currentVersionEl.textContent = this.currentVersion;
            }
        } catch (error) {
            console.error('获取应用版本失败:', error);
            this.currentVersion = '1.0.0'; // 默认版本
        }
    }

    async checkForUpdates(showMessage = true) {
        try {
            // 确保已获取当前版本
            if (!this.currentVersion) {
                await this.initializeVersion();
            }

            if (showMessage) {
                this.logManager.log('正在检查版本更新...');
            }


            // 获取平台信息
            const platform = await electronAPI.getPlatform();

            // 调用服务器版本检查API
            const response = await fetch(`${this.appState.serverConfig.url}/api/check-version`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentVersion: this.currentVersion,
                    platform: platform
                })
            });

            if (!response.ok) {
                throw new Error(`版本检查请求失败: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.updateInfo = result.data;
                this.lastCheckTime = new Date();

                // 更新菜单指示器
                await this.updateMenuIndicator();

                if (showMessage) {
                    if (result.data.hasUpdate) {
                        this.logManager.log(`发现新版本: ${result.data.latestVersion}`, 'info');
                        // 显示更新对话框
                        this.showUpdateDialog();
                    } else {
                        this.logManager.log('当前已是最新版本', 'success');
                        // 显示已是最新版本的对话框
                        this.showUpToDateDialog();
                    }
                }

                return result.data;
            } else {
                throw new Error(result.error || '版本检查失败');
            }

        } catch (error) {
            this.logManager.log(`版本检查失败: ${error.message}`, 'error');
            if (showMessage) {
                this.showErrorDialog(error.message);
            }
            return null;
        }
    }

    async updateMenuIndicator() {
        try {
            const hasUpdate = this.updateInfo && this.updateInfo.hasUpdate;
            await electronAPI.updateMenuIndicator(hasUpdate);
        } catch (error) {
            console.error('更新菜单指示器失败:', error);
        }
    }

    showUpdateDialog() {
        if (!this.updateInfo) return;

        this.modalManager.showModal('发现新版本',
            `<div class="version-update-info">
                <h4>新版本: ${this.updateInfo.latestVersion}</h4>
                <p><strong>当前版本:</strong> ${this.currentVersion}</p>
                <p><strong>更新内容:</strong></p>
                <p>${this.updateInfo.releaseNotes}</p>
                <p><strong>提示:</strong> 点击确定下载最新版本。</p>
            </div>`,
            () => {
                this.downloadUpdate();
            });
    }

    showUpToDateDialog() {
        this.modalManager.showModal('版本检查',
            `<div class="version-update-info">
                <p>当前版本: <strong>${this.currentVersion}</strong></p>
                <p>您使用的已经是最新版本！</p>
            </div>`);
    }

    showErrorDialog(errorMessage) {
        this.modalManager.showModal('版本检查失败',
            `<div class="version-update-info">
                <p>检查更新时发生错误：</p>
                <p><strong>${errorMessage}</strong></p>
                <p>请检查网络连接后重试。</p>
            </div>`);
    }

    async downloadUpdate() {
        if (!this.updateInfo || !this.updateInfo.downloadUrl) {
            this.logManager.log('没有可用的下载链接', 'error');
            return;
        }

        try {
            this.logManager.log('正在打开下载页面...', 'info');

            // 使用Electron的shell模块打开下载链接
            await electronAPI.openExternal(this.updateInfo.downloadUrl);

            // 显示更新说明
            this.modalManager.showModal('版本更新',
                `<div class="version-update-info">
                    <h4>新版本: ${this.updateInfo.latestVersion}</h4>
                    <p><strong>更新内容:</strong></p>
                    <p>${this.updateInfo.releaseNotes}</p>
                    <p><strong>提示:</strong> 下载完成后请关闭当前应用并安装新版本。</p>
                </div>`);

        } catch (error) {
            this.logManager.log(`打开下载链接失败: ${error.message}`, 'error');
        }
    }

    // 自动检查更新（应用启动时调用）
    async autoCheckForUpdates() {
        try {
            // 首先初始化版本信息
            await this.initializeVersion();

            // 检查上次检查时间，避免频繁检查
            const lastCheck = localStorage.getItem('lastVersionCheck');
            if (lastCheck) {
                const lastCheckTime = new Date(lastCheck);
                const now = new Date();
                const hoursSinceLastCheck = (now - lastCheckTime) / (1000 * 60 * 60);

                // // 如果距离上次检查不到4小时，跳过自动检查
                // if (hoursSinceLastCheck < 4) {
                //     console.log('距离上次版本检查不到4小时，跳过自动检查');
                //     return;
                // }
            }

            // 静默检查更新
            const updateInfo = await this.checkForUpdates(false);
            if (updateInfo && updateInfo.hasUpdate) {
                // 如果有更新，显示通知
                this.logManager.log(`发现新版本 ${updateInfo.latestVersion}，请在帮助菜单中点击"检查更新"`, 'info');
            }

            // 记录检查时间
            localStorage.setItem('lastVersionCheck', new Date().toISOString());
        } catch (error) {
            console.error('自动版本检查失败:', error);
        }
    }
}

// 应用主类
class App {
    constructor() {
        this.appState = new AppState();
        this.logManager = new LogManager();
        this.modalManager = new ModalManager();
        this.processManager = new ProcessManager(this.appState, this.logManager);
        this.tokenManager = new TokenManager(this.appState, this.logManager, this.modalManager, this.processManager);
        this.serverManager = new ServerManager(this.appState, this.logManager);
        this.versionManager = new VersionManager(this.appState, this.logManager, this.modalManager);
        this.init();
    }

    async init() {
        this.logManager.log('应用初始化中...');

        // 加载配置
        await this.loadConfig();

        // 设置事件监听器
        this.setupEventListeners();

        // 加载当前Token
        await this.tokenManager.loadCurrentToken();

        // 测试服务器连接
        await this.serverManager.testConnection();

        // 自动检查版本更新
        await this.versionManager.autoCheckForUpdates();

        await this.refreshSsoUsage();

        // 加载续费配置
        await this.loadRenewalConfig();


        // 检查Token文件监控状态
        await this.checkTokenMonitorStatus();

        this.logManager.log('应用初始化完成', 'success');
    }

    // 检查Token文件监控状态
    async checkTokenMonitorStatus() {
        try {
            const result = await electronAPI.tokenMonitor.getStatus();
            if (result.success) {
                const status = result.data;
                if (status.isWatching) {
                    this.logManager.log('Token文件监控器运行正常', 'success');
                } else {
                    this.logManager.log('Token文件监控器未运行', 'warning');
                }
            } else {
                this.logManager.log(`Token文件监控器状态检查失败: ${result.error}`, 'error');
            }
        } catch (error) {
            this.logManager.log(`Token文件监控器状态检查异常: ${error.message}`, 'error');
        }
    }

    async loadConfig() {
        try {
            const config = await electronAPI.getAppConfig();
            this.appState.setServerConfig(config);
            // 加载保存的使用量数据
            this.appState.loadUsageDataFromConfig();
        } catch (error) {
            this.logManager.log(`配置加载失败: ${error.message}`, 'error');
        }
    }

    async saveConfig() {
        try {
            // 确保包含最新的使用量数据
            const configToSave = {
                ...this.appState.serverConfig,
                usageDatas: this.appState.usageData
            };
            const success = await electronAPI.saveAppConfig(configToSave);
            if (success) {
                this.logManager.log('配置保存成功', 'success');
            } else {
                this.logManager.log('配置保存失败', 'error');
            }
            return success;
        } catch (error) {
            this.logManager.log(`配置保存异常: ${error.message}`, 'error');
            return false;
        }
    }

    // 加载续费配置
    async loadRenewalConfig() {
        try {
            // if (!this.appState.serverConfig.ssoToken) {
            //     this.logManager.log('未配置SSO Token，跳过续费配置加载', 'info');
            //     return;
            // }

            this.logManager.log('正在加载续费配置...', 'info');
            const renewalConfig = await this.getRenewalConfig();
            if (renewalConfig) {
                this.appState.setRenewalConfig(renewalConfig);
                this.logManager.log('续费配置加载成功', 'success');
            } else {
                this.logManager.log('续费配置加载失败', 'warning');
            }
        } catch (error) {
            this.logManager.log(`续费配置加载异常: ${error.message}`, 'error');
        }
    }

    // 处理续费请求
    async handleRenewal(renewalType) {
        if (this.appState.isProcessing) {
            this.logManager.log('正在处理中，请稍候...', 'warning');
            return;
        }

        // 检查SSO Token
        if (!this.appState.serverConfig.ssoToken) {
            this.logManager.log('需要配置SSO Token才能进行续费', 'warning');
            this.modalManager.showSettingsModal(this.appState.serverConfig);
            return;
        }

        try {
            this.appState.setProcessing(true);
            this.logManager.log(`开始${renewalType === 'hour24' ? '24小时' : '30天'}续费...`, 'info');

            // 获取续费配置
            const renewalConfig = await this.getRenewalConfig();
            if (!renewalConfig) {
                this.logManager.log('获取续费配置失败', 'error');
                return;
            }

            const config = renewalType === 'hour24' ? renewalConfig.hour24 : renewalConfig.day30;
            if (!config) {
                this.logManager.log('续费配置不可用', 'error');
                return;
            }

            // 显示续费确认对话框
            this.showRenewalConfirmDialog(renewalType, config);

        } catch (error) {
            this.logManager.log(`续费处理异常: ${error.message}`, 'error');
        } finally {
            this.appState.setProcessing(false);
        }
    }

    // 获取续费配置
    async getRenewalConfig() {
        try {
            const response = await fetch(`${this.appState.serverConfig.url}/api/renewal-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.appState.serverConfig.ssoToken}`,
                },
                body: JSON.stringify({
                    appName: 'antigravity',
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success) {
                return result.data;
            } else {
                throw new Error(result.error || '获取续费配置失败');
            }
        } catch (error) {
            console.error('获取续费配置失败:', error);
            return null;
        }
    }

    // 显示续费确认对话框
    showRenewalConfirmDialog(renewalType, config) {
        const renewalName = renewalType === 'hour24' ? '24小时续费' : '30天续费';

        // 为30天续费添加原价和优惠价显示
        let priceDisplay = `￥${config.price}`;
        if (renewalType === 'day30' && config.originalPrice && config.originalPrice > config.price) {
            priceDisplay = `
                <span class="original-price" style="text-decoration: line-through; color: #6c757d; margin-right: 8px;">￥${config.originalPrice}</span>
                <span class="discounted-price" style="color: #17a2b8; font-weight: 600;">￥${config.price}</span>
            `;
        }

        const modalBody = `
            <div class="renewal-confirm-info">
                <h4>${renewalName}</h4>
                <div class="renewal-details">
                    <p><strong>续费类型:</strong> ${renewalName}</p>
                    <p><strong>价格:</strong> ${priceDisplay}</p>
                    <p><strong>描述:</strong> ${config.description}</p>
                </div>
                <div class="renewal-warning">
                    <p><strong>注意:</strong> 点击确定后将跳转到Stripe支付页面完成付款。</p>
                </div>
            </div>
        `;

        this.modalManager.showModal(
            '确认续费',
            modalBody,
            () => this.processRenewal(renewalType, config)
        );
    }

    // 处理续费支付
    async processRenewal(renewalType, config) {
        try {
            this.appState.setProcessing(true);
            this.logManager.log('正在创建续费订单...', 'info');

            const response = await fetch(`${this.appState.serverConfig.url}/api/create-renewal-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.appState.serverConfig.ssoToken}`
                },
                body: JSON.stringify({
                    renewalType: renewalType,
                    successUrl: `${window.location.origin}/renewal-success`,
                    cancelUrl: `${window.location.origin}/renewal-cancel`
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success && result.data.url) {
                this.logManager.log(`续费订单创建成功，金额: ¥${result.data.amount}，正在跳转到支付页面...`, 'success');

                // 使用Electron的shell模块打开Stripe支付页面
                await electronAPI.openExternal(result.data.url);

                this.logManager.log('已打开支付页面，支持信用卡和支付宝付款。正在监控支付状态...', 'info');
                this.appState.setProcessing(false);

                // 开始轮询支付状态
                this.startPaymentStatusPolling(result.data.sessionId, renewalType);
            } else {
                throw new Error(result.error || '创建续费订单失败');
            }

        } catch (error) {
            this.logManager.log(`续费处理失败: ${error.message}`, 'error');
            this.appState.setProcessing(false);
        }
    }

    // 开始轮询支付状态
    startPaymentStatusPolling(sessionId, renewalType) {
        let pollCount = 0;
        const maxPolls = 60; // 最多轮询5分钟（每5秒一次）

        const pollInterval = setInterval(async () => {
            pollCount++;

            try {
                const status = await this.checkPaymentStatus(sessionId);

                if (status.status === 'completed') {
                    clearInterval(pollInterval);
                    this.appState.setProcessing(false);

                    this.logManager.log('支付成功！正在刷新数据...', 'success');

                    // 刷新SSO Token使用情况
                    await this.refreshSsoUsage();

                    // 显示成功通知
                    this.modalManager.showModal(
                        '续费成功',
                        `<div class="renewal-success-info">
                            <h4>✅ 续费成功！</h4>
                            <div class="renewal-details">
                                <p><strong>续费类型:</strong> ${renewalType === 'hour24' ? '24小时续费' : '30天续费'}</p>
                                <p><strong>支付金额:</strong> ¥${status.renewalData.amount}</p>
                                <p><strong>支付时间:</strong> ${new Date(status.renewalData.paymentTime).toLocaleString('zh-CN')}</p>
                                <p><strong>会话ID:</strong> ${sessionId}</p>
                            </div>
                            <p><strong>提示:</strong> 您的SSO Token有效期已延长，数据已自动刷新。</p>
                        </div>`
                    );

                } else if (status.status === 'failed') {
                    clearInterval(pollInterval);
                    this.appState.setProcessing(false);

                    this.logManager.log('支付失败，请重新尝试', 'error');
                    this.modalManager.showModal(
                        '支付失败',
                        `<div class="renewal-error-info">
                            <h4>❌ 支付失败</h4>
                            <p>支付未能完成，请检查支付信息后重新尝试。</p>
                            <p><strong>会话ID:</strong> ${sessionId}</p>
                        </div>`
                    );

                } else if (pollCount >= maxPolls) {
                    clearInterval(pollInterval);
                    this.appState.setProcessing(false);

                    this.logManager.log('支付状态检查超时，请手动确认支付结果', 'warning');
                    this.modalManager.showModal(
                        '支付状态检查超时',
                        `<div class="renewal-timeout-info">
                            <h4>⏰ 支付状态检查超时</h4>
                            <p>无法确认支付状态，请检查您的支付是否成功。</p>
                            <p>如果支付已完成，请稍后刷新页面查看更新。</p>
                            <p><strong>会话ID:</strong> ${sessionId}</p>
                        </div>`
                    );
                } else {
                    // 继续轮询
                    this.logManager.log(`正在检查支付状态... (${pollCount}/${maxPolls})`, 'info');
                }

            } catch (error) {
                this.logManager.log(`检查支付状态失败: ${error.message}`, 'error');

                if (pollCount >= maxPolls) {
                    clearInterval(pollInterval);
                    this.appState.setProcessing(false);
                }
            }
        }, 5000); // 每5秒检查一次
    }

    // 检查支付状态
    async checkPaymentStatus(sessionId) {
        const response = await fetch(`${this.appState.serverConfig.url}/api/check-renewal-status?session_id=${encodeURIComponent(sessionId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.appState.serverConfig.ssoToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.error || '检查支付状态失败');
        }
    }

    setupEventListeners() {
        // 设置按钮
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.modalManager.showSettingsModal(this.appState.serverConfig);
        });

        // 申请新Token按钮
        document.getElementById('requestNewTokenBtn').addEventListener('click', () => {
            this.tokenManager.requestNewToken();
        });

        // 手动刷新Token按钮
        document.getElementById('manualRefreshBtn').addEventListener('click', async () => {
            if (!this.appState.currentToken) {
                this.logManager.log('没有当前Token，无法刷新', 'warning');
                return;
            }

            if (!this.appState.serverConfig.ssoToken) {
                this.logManager.log('需要配置SSO Token才能刷新', 'warning');
                this.modalManager.showSettingsModal(this.appState.serverConfig);
                return;
            }

            this.logManager.log('开始手动刷新Token...', 'info');
            const success = await this.tokenManager.refreshCurrentToken();
            if (success) {
                this.logManager.log('手动刷新Token成功！', 'success');
            } else {
                this.logManager.log('手动刷新Token失败', 'error');
            }
        });

        // // 打开缓存目录按钮
        // document.getElementById('openCacheDirBtn').addEventListener('click', async () => {
        //     const cachePath = await electronAPI.getAwsSsoCachePath();
        //     // require('electron').shell.openPath(cachePath);
        //     electronAPI.openPath(cachePath);
        // });

        // 测试连接按钮
        document.getElementById('testConnectionBtn').addEventListener('click', () => {
            this.serverManager.testConnection();
        });

        // 清空日志按钮
        document.getElementById('clearLogBtn').addEventListener('click', () => {
            this.logManager.clear();
        });

        // 关闭Antigravity进程按钮
        document.getElementById('closeAntigravityBtn').addEventListener('click', async () => {
            await this.processManager.closeAntigravityProcess();
        });

        // 重启Antigravity进程按钮
        document.getElementById('restartAntigravityBtn').addEventListener('click', async () => {
            await this.processManager.restartAntigravityProcess();
        });

        // 设置保存按钮
        document.getElementById('settingsModalSaveBtn').addEventListener('click', async () => {
            const newConfig = this.modalManager.getSettingsData();

            if (!newConfig.ssoToken) {
                await electronAPI.showErrorBox('错误', '请输入有效的SSO Token');
                return;
            }
            let sourceSsoToken = this.appState.serverConfig.ssoToken;

            // 保持原有的服务器地址配置
            const currentConfig = { ...this.appState.serverConfig, ...newConfig };
            this.appState.setServerConfig(currentConfig);
            const saved = await this.saveConfig();

            if (saved) {
                this.modalManager.hideSettingsModal();

                if (sourceSsoToken !== newConfig.ssoToken) {
                    await this.refreshSsoUsage(newConfig.ssoToken);
                }
            }
        });

        // SSO Token模态框确认按钮
        document.getElementById('ssoTokenModalConfirmBtn').addEventListener('click', async () => {
            const ssoTokenData = this.modalManager.getSsoTokenData();

            if (!ssoTokenData.ssoToken) {
                await electronAPI.showErrorBox('错误', '请输入有效的SSO Token');
                return;
            }

            // 如果用户选择记住Token，保存到配置中
            if (ssoTokenData.remember) {
                const newConfig = { ...this.appState.serverConfig, ssoToken: ssoTokenData.ssoToken };
                this.appState.setServerConfig(newConfig);
                await this.saveConfig();
                this.logManager.log('SSO Token已保存到设置中', 'success');
            }

            // 隐藏模态框
            this.modalManager.hideSsoTokenModal();

            // 使用输入的SSO Token申请新Token
            await this.tokenManager.requestNewTokenWithSsoToken(ssoTokenData.ssoToken);
        });

        // SSO Token输入框回车键支持
        document.getElementById('ssoTokenQuickInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('ssoTokenModalConfirmBtn').click();
            }
        });

        // 修复macOS粘贴问题 - SSO Token输入框
        const ssoTokenInput = document.getElementById('ssoTokenInput');
        const ssoTokenQuickInput = document.getElementById('ssoTokenQuickInput');

        [ssoTokenInput, ssoTokenQuickInput].forEach(input => {
            if (input) {
                // 移除只读和禁用属性
                input.removeAttribute('readonly');
                input.removeAttribute('disabled');

                // 处理paste事件
                input.addEventListener('paste', (e) => {
                    e.stopPropagation();
                    const text = (e.clipboardData || window.clipboardData).getData('text');
                    if (text) {
                        const start = input.selectionStart;
                        const end = input.selectionEnd;
                        const value = input.value;
                        input.value = value.substring(0, start) + text + value.substring(end);
                        input.selectionStart = input.selectionEnd = start + text.length;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });

                // 处理键盘快捷键 Cmd+V / Ctrl+V
                input.addEventListener('keydown', async (e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                        e.preventDefault();
                        try {
                            const text = await navigator.clipboard.readText();
                            if (text) {
                                const start = input.selectionStart;
                                const end = input.selectionEnd;
                                const value = input.value;
                                input.value = value.substring(0, start) + text + value.substring(end);
                                input.selectionStart = input.selectionEnd = start + text.length;
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        } catch (err) {
                            console.error('读取剪贴板失败:', err);
                        }
                    }
                });
            }
        });

        // 监听主进程事件
        electronAPI.onRefreshToken(() => {
            this.tokenManager.loadCurrentToken();
        });

        electronAPI.onShowServerConfig((event, currentUrl) => {
            this.modalManager.showSettingsModal({ url: currentUrl });
        });

        // 监听菜单中的版本检查事件
        electronAPI.onCheckForUpdates(async () => {
            await this.versionManager.checkForUpdates(true);
        });

        // 24小时续费按钮
        document.getElementById('renew24HourBtn').addEventListener('click', async () => {
            // await this.handleRenewal('hour24');
            // 直接打开闲鱼url
            await electronAPI.openExternal(this.renewalConfig.hour24Url);
        });

        // 30天续费按钮
        document.getElementById('renew30DayBtn').addEventListener('click', async () => {
            await this.handleRenewal('day30');
        });

        // Token文件监控事件监听
        electronAPI.onTokenFileDeleted((event, filePath) => {
            this.logManager.log(`检测到Token文件被删除: ${filePath}`, 'warning');
        });

        electronAPI.onTokenSyncRequired(async (event, data) => {
            this.logManager.log(`Token文件删除触发同步: ${data.reason}`, 'info');
            this.logManager.log(`文件路径: ${data.filePath}`, 'info');

            // 自动触发服务器同步机制
            if (this.appState.serverConfig.ssoToken) {
                this.logManager.log('开始自动从服务器重新拉取Token...', 'info');
                try {
                    const success = await this.tokenManager.getSooHoldToken();
                    if (success) {
                        this.logManager.log('Token文件删除后自动同步成功！', 'success');
                    } else {
                        this.logManager.log('Token文件删除后自动同步失败', 'error');
                    }
                } catch (error) {
                    this.logManager.log(`Token文件删除后自动同步异常: ${error.message}`, 'error');
                }
            } else {
                this.logManager.log('未配置SSO Token，无法自动同步，请手动配置后重新申请', 'warning');
                // 显示SSO Token输入模态框
                this.modalManager.showSsoTokenModal();
            }
        });

        electronAPI.onTokenMonitorError((event, errorMessage) => {
            this.logManager.log(`Token文件监控错误: ${errorMessage}`, 'error');
        });

    }

    // 刷新SSO Token使用情况
    async refreshSsoUsage() {
        try {
            if (!this.appState.serverConfig.ssoToken) {
                return;
            }

            this.logManager.log('正在刷新SSO Token使用情况...', 'info');

            // 调用服务器API获取SSO Token配额信息
            const response = await fetch(`${this.appState.serverConfig.url}/api/sso-token-usage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.appState.serverConfig.ssoToken}`
                },
                body: JSON.stringify({
                    ssoToken: this.appState.serverConfig.ssoToken
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    // 更新SSO使用情况
                    this.appState.setSsoUsage(result.data.ssoUsage);
                    this.logManager.log('SSO Token使用情况已刷新', 'success');
                } else {
                    this.logManager.log(`获取SSO Token配额失败: ${result.error || '未知错误'}`, 'warning');
                }
            } else {
                this.logManager.log(`获取SSO Token配额失败: HTTP ${response.status}`, 'warning');
            }

        } catch (error) {
            this.logManager.log(`刷新SSO Token使用情况失败: ${error.message}`, 'error');
        }
    }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    // 初始化标签页管理器
    window.tabManager = new TabManager();

    // 初始化主应用
    window.app = new App();
});

// 全局错误处理
window.addEventListener('error', (event) => {
    if (window.logger && typeof window.logger.error === 'function') {
        window.logger.error('全局错误:', event.error);
    } else {
        console.error('全局错误:', event.error);
    }
    if (window.app && window.app.logManager) {
        window.app.logManager.log(`全局错误: ${event.error.message}`, 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    if (window.logger && typeof window.logger.error === 'function') {
        window.logger.error('未处理的Promise拒绝:', event.reason);
    } else {
        console.error('未处理的Promise拒绝:', event.reason);
    }
    if (window.app && window.app.logManager) {
        window.app.logManager.log(`Promise拒绝: ${event.reason}`, 'error');
    }
});

// 应用关闭时清理资源
window.addEventListener('beforeunload', () => {
    if (window.app && window.app.appState) {
        window.app.appState.clearAutoRefresh();
    }
});