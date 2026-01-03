import fs from 'fs-extra';
import os from 'os';
import { spawn, exec } from 'child_process';

// Windows注册表扫描函数
async function scanKiroRegistryEntries() {
    if (process.platform !== 'win32') {
        console.log('非Windows系统，跳过注册表扫描');
        return;
    }
    
    console.log('=== 开始扫描Windows注册表中的kiro相关项 ===');
    
    // 定义要搜索的注册表根键
    const registryRoots = [
        'HKEY_CURRENT_USER',
        'HKEY_LOCAL_MACHINE\\SOFTWARE',
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node'
    ];
    
    for (const root of registryRoots) {
        console.log(`\n--- 搜索 ${root} ---`);
        
        try {
            // 搜索包含"kiro"的键名（不区分大小写）
            await searchRegistryKeys(root, 'kiro');
            
            // 搜索包含"kiro"的值名
            await searchRegistryValues(root, 'kiro');
            
        } catch (error) {
            console.log(`搜索 ${root} 时出错: ${error.message}`);
        }
    }
    
    console.log('=== 注册表扫描完成 ===\n');
}

// 搜索注册表键名
function searchRegistryKeys(rootKey, searchTerm) {
    return new Promise((resolve) => {
        const command = `reg query "${rootKey}" /s /f "${searchTerm}" /k 2>nul`;
        
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (stdout && stdout.trim()) {
                console.log(`找到包含"${searchTerm}"的注册表键:`);
                const lines = stdout.split('\n').filter(line => line.trim());
                lines.forEach(line => {
                    if (line.trim() && !line.includes('搜索结束') && !line.includes('End of search')) {
                        console.log(`  键: ${line.trim()}`);
                    }
                });
            } else {
                console.log(`未找到包含"${searchTerm}"的注册表键`);
            }
            resolve();
        });
    });
}

// 搜索注册表值名和数据
function searchRegistryValues(rootKey, searchTerm) {
    return new Promise((resolve) => {
        // 分别搜索值名和值数据
        console.log(`  正在搜索值名包含"${searchTerm}"的项...`);
        
        // 搜索值名
        const valueNameCommand = `reg query "${rootKey}" /s /f "${searchTerm}" /v 2>nul`;
        
        exec(valueNameCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (stdout && stdout.trim()) {
                console.log(`  找到包含"${searchTerm}"的注册表值名:`);
                parseRegistryOutput(stdout, searchTerm, 'valuename');
            } else {
                console.log(`  未找到值名包含"${searchTerm}"的注册表项`);
            }
            
            // 继续搜索值数据
            console.log(`  正在搜索值数据包含"${searchTerm}"的项...`);
            const valueDataCommand = `reg query "${rootKey}" /s /f "${searchTerm}" /d 2>nul`;
            
            exec(valueDataCommand, { maxBuffer: 1024 * 1024 * 10 }, (error2, stdout2, stderr2) => {
                if (stdout2 && stdout2.trim()) {
                    console.log(`  找到包含"${searchTerm}"的注册表值数据:`);
                    parseRegistryOutput(stdout2, searchTerm, 'valuedata');
                } else {
                    console.log(`  未找到值数据包含"${searchTerm}"的注册表项`);
                }
                resolve();
            });
        });
    });
}

// 解析注册表输出
function parseRegistryOutput(output, searchTerm, searchType) {
    const lines = output.split('\n').filter(line => line.trim());
    let currentKey = '';
    
    lines.forEach(line => {
        line = line.trim();
        if (!line || line.includes('搜索结束') || line.includes('End of search')) return;
        
        // 检查是否是注册表键路径
        if (line.startsWith('HKEY_')) {
            currentKey = line;
            console.log(`    在键: ${currentKey}`);
        } else if (line.includes('REG_')) {
            // 这是一个注册表值
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                const valueName = parts[0];
                const valueType = parts[1];
                const valueData = parts.slice(2).join(' ');
                console.log(`      值名: ${valueName}`);
                console.log(`      类型: ${valueType}`);
                console.log(`      数据: ${valueData}`);
                console.log(`      ---`);
            }
        }
    });
}

console.log('开始扫描Windows注册表中的kiro相关项...');
await scanKiroRegistryEntries();