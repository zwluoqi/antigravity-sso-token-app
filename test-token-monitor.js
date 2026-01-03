const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * Token文件监控测试脚本
 * 用于测试Token文件删除监控和同步机制
 */

// Token文件路径
const TOKEN_FILE_PATH = path.join(os.homedir(), '.aws', 'sso', 'cache', 'kiro-auth-token.json');
const BACKUP_FILE_PATH = `${TOKEN_FILE_PATH}.test-backup`;

// 测试用的Token数据
const TEST_TOKEN_DATA = {
    accessToken: 'test-access-token-12345',
    refreshToken: 'aorAAAAAGj1260_YLU...',
    aws_sso_app_session_id: 'test-session-id-67890',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    realExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    authMethod: 'social',
    provider: 'test-provider',
    region: 'us-east-1'
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function backupTokenFile() {
    try {
        if (await fs.pathExists(TOKEN_FILE_PATH)) {
            await fs.copy(TOKEN_FILE_PATH, BACKUP_FILE_PATH);
            console.log('✅ Token文件已备份');
            return true;
        } else {
            console.log('ℹ️  Token文件不存在，无需备份');
            return false;
        }
    } catch (error) {
        console.error('❌ 备份Token文件失败:', error.message);
        return false;
    }
}

async function restoreTokenFile() {
    try {
        if (await fs.pathExists(BACKUP_FILE_PATH)) {
            await fs.copy(BACKUP_FILE_PATH, TOKEN_FILE_PATH);
            await fs.remove(BACKUP_FILE_PATH);
            console.log('✅ Token文件已恢复');
            return true;
        } else {
            console.log('ℹ️  备份文件不存在，无法恢复');
            return false;
        }
    } catch (error) {
        console.error('❌ 恢复Token文件失败:', error.message);
        return false;
    }
}

async function createTestTokenFile() {
    try {
        // 确保目录存在
        await fs.ensureDir(path.dirname(TOKEN_FILE_PATH));
        
        // 创建测试Token文件
        await fs.writeJson(TOKEN_FILE_PATH, TEST_TOKEN_DATA, { spaces: 2 });
        console.log('✅ 测试Token文件已创建');
        return true;
    } catch (error) {
        console.error('❌ 创建测试Token文件失败:', error.message);
        return false;
    }
}

async function deleteTokenFile() {
    try {
        if (await fs.pathExists(TOKEN_FILE_PATH)) {
            await fs.remove(TOKEN_FILE_PATH);
            console.log('✅ Token文件已删除');
            return true;
        } else {
            console.log('ℹ️  Token文件不存在，无需删除');
            return false;
        }
    } catch (error) {
        console.error('❌ 删除Token文件失败:', error.message);
        return false;
    }
}

async function checkTokenFileExists() {
    try {
        const exists = await fs.pathExists(TOKEN_FILE_PATH);
        console.log(`ℹ️  Token文件存在状态: ${exists ? '存在' : '不存在'}`);
        return exists;
    } catch (error) {
        console.error('❌ 检查Token文件失败:', error.message);
        return false;
    }
}

async function runTest() {
    console.log('🚀 开始Token文件监控测试...\n');
    
    try {
        // 1. 备份现有Token文件
        console.log('📋 步骤1: 备份现有Token文件');
        const hasBackup = await backupTokenFile();
        console.log('');
        
        // 2. 创建测试Token文件
        console.log('📋 步骤2: 创建测试Token文件');
        await createTestTokenFile();
        await sleep(1000);
        console.log('');
        
        // 3. 检查文件存在
        console.log('📋 步骤3: 检查Token文件存在');
        await checkTokenFileExists();
        console.log('');
        
        // 4. 删除Token文件（触发监控）
        console.log('📋 步骤4: 删除Token文件（应该触发监控机制）');
        console.log('⚠️  请注意观察应用日志中的监控事件...');
        await deleteTokenFile();
        console.log('');
        
        // 5. 等待监控机制响应
        console.log('📋 步骤5: 等待监控机制响应（10秒）');
        console.log('⏳ 监控器应该检测到文件删除并触发同步...');
        await sleep(10000);
        console.log('');
        
        // 6. 检查文件是否被重新创建
        console.log('📋 步骤6: 检查Token文件是否被重新创建');
        const recreated = await checkTokenFileExists();
        if (recreated) {
            console.log('✅ 测试成功：Token文件已被重新创建');
        } else {
            console.log('⚠️  Token文件未被重新创建，可能需要手动触发同步');
        }
        console.log('');
        
        // 7. 恢复原始文件
        console.log('📋 步骤7: 恢复原始Token文件');
        if (hasBackup) {
            // 如果文件被重新创建，先删除测试文件
            if (recreated) {
                await deleteTokenFile();
                await sleep(500);
            }
            await restoreTokenFile();
        } else {
            console.log('ℹ️  原本没有Token文件，保持当前状态');
        }
        console.log('');
        
        console.log('🎉 Token文件监控测试完成！');
        console.log('');
        console.log('📝 测试说明：');
        console.log('   1. 此测试模拟了Token文件被删除的情况');
        console.log('   2. 监控器应该检测到删除事件并通知渲染进程');
        console.log('   3. 渲染进程应该自动触发服务器同步机制');
        console.log('   4. 请检查应用日志确认监控和同步是否正常工作');
        console.log('');
        console.log('⚠️  注意：');
        console.log('   - 确保应用正在运行且已配置SSO Token');
        console.log('   - 监控机制需要应用启动后才能工作');
        console.log('   - 同步成功需要有效的SSO Token和网络连接');
        
    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        
        // 尝试恢复原始文件
        console.log('\n🔄 尝试恢复原始文件...');
        await restoreTokenFile();
    }
}

// 处理命令行参数
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'test':
        runTest();
        break;
    case 'backup':
        backupTokenFile();
        break;
    case 'restore':
        restoreTokenFile();
        break;
    case 'create':
        createTestTokenFile();
        break;
    case 'delete':
        deleteTokenFile();
        break;
    case 'check':
        checkTokenFileExists();
        break;
    default:
        console.log('Token文件监控测试工具');
        console.log('');
        console.log('用法:');
        console.log('  node test-token-monitor.js test     - 运行完整测试');
        console.log('  node test-token-monitor.js backup   - 备份Token文件');
        console.log('  node test-token-monitor.js restore  - 恢复Token文件');
        console.log('  node test-token-monitor.js create   - 创建测试Token文件');
        console.log('  node test-token-monitor.js delete   - 删除Token文件');
        console.log('  node test-token-monitor.js check    - 检查Token文件存在');
        console.log('');
        console.log('推荐使用: node test-token-monitor.js test');
}