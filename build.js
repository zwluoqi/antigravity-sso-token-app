#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 构建配置
const BUILD_CONFIG = {
    platforms: {
        win: 'npm run build-win',
        mac: 'npm run build-mac', 
        linux: 'npm run build-linux',
        all: 'npm run build'
    },
    outputDir: 'dist',
    tempDir: 'temp-build'
};

class Builder {
    constructor() {
        this.startTime = Date.now();
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            info: '📋',
            success: '✅',
            error: '❌',
            warning: '⚠️'
        }[type] || '📋';
        
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async checkPrerequisites() {
        this.log('检查构建环境...');
        
        try {
            // 检查Node.js版本
            const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
            this.log(`Node.js版本: ${nodeVersion}`);
            
            // 检查npm版本
            const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
            this.log(`npm版本: ${npmVersion}`);
            
            // 检查package.json
            if (!fs.existsSync('package.json')) {
                throw new Error('package.json文件不存在');
            }
            
            // 检查源代码目录
            if (!fs.existsSync('src')) {
                throw new Error('src目录不存在');
            }
            
            this.log('环境检查通过', 'success');
            return true;
        } catch (error) {
            this.log(`环境检查失败: ${error.message}`, 'error');
            return false;
        }
    }

    async installDependencies() {
        this.log('检查并安装依赖...');
        
        try {
            if (!fs.existsSync('node_modules')) {
                this.log('node_modules不存在，开始安装依赖...');
                execSync('npm install', { stdio: 'inherit' });
            } else {
                this.log('依赖已存在，跳过安装');
            }
            
            this.log('依赖检查完成', 'success');
            return true;
        } catch (error) {
            this.log(`依赖安装失败: ${error.message}`, 'error');
            return false;
        }
    }

    async cleanBuildDir() {
        this.log('清理构建目录...');
        
        try {
            if (fs.existsSync(BUILD_CONFIG.outputDir)) {
                fs.rmSync(BUILD_CONFIG.outputDir, { recursive: true, force: true });
                this.log('旧的构建文件已清理');
            }
            
            return true;
        } catch (error) {
            this.log(`清理构建目录失败: ${error.message}`, 'warning');
            return true; // 不阻止构建继续
        }
    }

    async buildForPlatform(platform) {
        this.log(`开始构建 ${platform} 平台...`);
        
        try {
            const command = BUILD_CONFIG.platforms[platform];
            if (!command) {
                throw new Error(`不支持的平台: ${platform}`);
            }
            
            execSync(command, { stdio: 'inherit' });
            this.log(`${platform} 平台构建完成`, 'success');
            return true;
        } catch (error) {
            this.log(`${platform} 平台构建失败: ${error.message}`, 'error');
            return false;
        }
    }

    async generateBuildInfo() {
        this.log('生成构建信息...',process.platform);
        
        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            const buildInfo = {
                name: packageJson.name,
                version: packageJson.version,
                buildTime: new Date().toISOString(),
                buildDuration: Date.now() - this.startTime,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            };
            
            const buildInfoPath = path.join(BUILD_CONFIG.outputDir, 'build-info.json');
            fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
            
            this.log('构建信息已生成', 'success');
            return true;
        } catch (error) {
            this.log(`生成构建信息失败: ${error.message}`, 'warning');
            return true; // 不阻止构建继续
        }
    }

    async showBuildSummary() {
        this.log('构建摘要:');
        
        try {
            if (fs.existsSync(BUILD_CONFIG.outputDir)) {
                const files = fs.readdirSync(BUILD_CONFIG.outputDir);
                this.log(`输出目录: ${BUILD_CONFIG.outputDir}`);
                this.log(`生成文件数量: ${files.length}`);
                
                files.forEach(file => {
                    const filePath = path.join(BUILD_CONFIG.outputDir, file);
                    const stats = fs.statSync(filePath);
                    const size = (stats.size / 1024 / 1024).toFixed(2);
                    this.log(`  - ${file} (${size} MB)`);
                });
            }
            
            const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
            this.log(`总构建时间: ${duration}秒`, 'success');
            
        } catch (error) {
            this.log(`生成构建摘要失败: ${error.message}`, 'warning');
        }
    }

    async build(platform = 'all') {
        this.log(`开始构建 Kiro Account Manager (${platform})...`);
        
        // 检查环境
        if (!(await this.checkPrerequisites())) {
            process.exit(1);
        }
        
        // 安装依赖
        if (!(await this.installDependencies())) {
            process.exit(1);
        }
        
        // 清理构建目录
        await this.cleanBuildDir();
        
        // 构建
        if (!(await this.buildForPlatform(platform))) {
            process.exit(1);
        }
        
        // 生成构建信息
        await this.generateBuildInfo();
        
        // 显示构建摘要
        await this.showBuildSummary();
        
        this.log('构建完成！', 'success');
    }
}

// 命令行参数处理
function main() {
    const args = process.argv.slice(2);
    const platform = args[0] || 'all';
    
    if (!BUILD_CONFIG.platforms[platform]) {
        console.error(`❌ 不支持的平台: ${platform}`);
        console.log('支持的平台:', Object.keys(BUILD_CONFIG.platforms).join(', '));
        process.exit(1);
    }
    
    const builder = new Builder();
    builder.build(platform).catch(error => {
        console.error('❌ 构建失败:', error);
        process.exit(1);
    });
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}