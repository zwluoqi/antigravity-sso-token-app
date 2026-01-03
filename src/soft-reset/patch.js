/**
 * Extension Patching Module
 * Handles patching of Antigravity's extension.js to use custom machine ID
 * Reference: Antigravity-Manager/src-tauri/src/modules/
 */

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const { getAntigravityInstallPath, getAntigravityToolsPath } = require('./antigravity-paths');
const { CUSTOM_MACHINE_ID_FILE } = require('./machine-id');

// Patch markers
const PATCH_MARKER_V3 = '/* ANTIGRAVITY_MANAGER_PATCH_V3 */';
const PATCH_MARKER_END = '/* END_ANTIGRAVITY_MANAGER_PATCH */';
const PATCH_MARKER_OLD = '/* ANTIGRAVITY_MANAGER_PATCH */';
// Keep backward compatibility with old Kiro patches
const PATCH_MARKER_KIRO_V3 = '/* KIRO_MANAGER_PATCH_V3 */';
const PATCH_MARKER_KIRO_END = '/* END_KIRO_MANAGER_PATCH */';
const PATCH_MARKER_KIRO_OLD = '/* KIRO_MANAGER_PATCH */';

// Backup file suffix
const BACKUP_SUFFIX = '.backup';

/**
 * Get extension.js path for Antigravity (platform-specific)
 * @returns {Promise<string|null>} Path to extension.js or null if not found
 */
async function getExtensionJSPath() {
    const installPath = await getAntigravityInstallPath();
    if (!installPath) {
        return null;
    }

    const platform = process.platform;
    let extensionPath;

    switch (platform) {
        case 'win32':
        case 'linux':
            extensionPath = path.join(installPath, 'resources', 'app', 'extensions', 'antigravity.antigravity-agent', 'dist', 'extension.js');
            break;
        case 'darwin':
            extensionPath = path.join(installPath, 'Contents', 'Resources', 'app', 'extensions', 'antigravity.antigravity-agent', 'dist', 'extension.js');
            break;
        default:
            return null;
    }

    try {
        if (await fs.pathExists(extensionPath)) {
            return extensionPath;
        }
    } catch (error) {
        // Path doesn't exist
    }

    return null;
}

/**
 * Generate the V3 patch code
 * This code intercepts machine ID lookups and returns the custom machine ID
 * @returns {string} The patch code to inject
 */
function generatePatchCode() {
    const antigravityToolsPath = getAntigravityToolsPath().replace(/\\/g, '\\\\'); // Escape backslashes for JS string
    const machineIdFile = CUSTOM_MACHINE_ID_FILE;

    return `${PATCH_MARKER_V3}
(function() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const Module = require('module');
    
    // Path to custom machine ID file
    const antigravityToolsPath = '${antigravityToolsPath}';
    const customMachineIdPath = path.join(antigravityToolsPath, '${machineIdFile}');
    
    // Cache for custom machine ID
    let cachedMachineId = null;
    
    // Read custom machine ID from file
    function getCustomMachineId() {
        if (cachedMachineId) {
            return cachedMachineId;
        }
        try {
            if (fs.existsSync(customMachineIdPath)) {
                cachedMachineId = fs.readFileSync(customMachineIdPath, 'utf8').trim();
                return cachedMachineId;
            }
        } catch (e) {
            console.error('[AntigravityManager] Error reading custom machine ID:', e.message);
        }
        return null;
    }
    
    // Store original Module._load
    const originalLoad = Module._load;
    
    // Override Module._load to intercept specific modules
    Module._load = function(request, parent, isMain) {
        const result = originalLoad.apply(this, arguments);
        
        // Intercept node-machine-id module
        if (request === 'node-machine-id') {
            const customId = getCustomMachineId();
            if (customId) {
                return {
                    machineId: function() { return Promise.resolve(customId); },
                    machineIdSync: function() { return customId; }
                };
            }
        }
        
        // Intercept child_process to handle machine ID commands
        if (request === 'child_process') {
            const customId = getCustomMachineId();
            if (customId && result.execSync) {
                const originalExecSync = result.execSync;
                result.execSync = function(command, options) {
                    // Check if command is trying to get machine ID
                    if (typeof command === 'string') {
                        const lowerCmd = command.toLowerCase();
                        if (lowerCmd.includes('wmic') && lowerCmd.includes('csproduct') ||
                            lowerCmd.includes('ioreg') && lowerCmd.includes('ioplatformexpertdevice') ||
                            lowerCmd.includes('cat') && lowerCmd.includes('/etc/machine-id') ||
                            lowerCmd.includes('/var/lib/dbus/machine-id')) {
                            return customId;
                        }
                    }
                    return originalExecSync.apply(this, arguments);
                };
            }
            return result;
        }
        
        return result;
    };
    
    // Override fs.readFileSync to intercept machine-id file reads
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = function(filePath, options) {
        const customId = getCustomMachineId();
        if (customId && typeof filePath === 'string') {
            const normalizedPath = filePath.replace(/\\\\/g, '/');
            if (normalizedPath.includes('/etc/machine-id') || 
                normalizedPath.includes('/var/lib/dbus/machine-id')) {
                return customId;
            }
        }
        return originalReadFileSync.apply(this, arguments);
    };
    
    // Override fs.readFile to intercept async machine-id file reads
    const originalReadFile = fs.readFile;
    fs.readFile = function(filePath, options, callback) {
        const customId = getCustomMachineId();
        if (customId && typeof filePath === 'string') {
            const normalizedPath = filePath.replace(/\\\\/g, '/');
            if (normalizedPath.includes('/etc/machine-id') || 
                normalizedPath.includes('/var/lib/dbus/machine-id')) {
                if (typeof options === 'function') {
                    callback = options;
                }
                if (callback) {
                    setImmediate(() => callback(null, customId));
                    return;
                }
            }
        }
        return originalReadFile.apply(this, arguments);
    };
    
    // Override fs.promises.readFile
    if (fs.promises) {
        const originalReadFilePromise = fs.promises.readFile;
        fs.promises.readFile = async function(filePath, options) {
            const customId = getCustomMachineId();
            if (customId && typeof filePath === 'string') {
                const normalizedPath = filePath.replace(/\\\\/g, '/');
                if (normalizedPath.includes('/etc/machine-id') || 
                    normalizedPath.includes('/var/lib/dbus/machine-id')) {
                    return customId;
                }
            }
            return originalReadFilePromise.apply(this, arguments);
        };
    }
    
    // Intercept vscode.env.machineId if available
    try {
        const vscode = require('vscode');
        if (vscode && vscode.env) {
            const customId = getCustomMachineId();
            if (customId) {
                Object.defineProperty(vscode.env, 'machineId', {
                    get: function() { return customId; },
                    configurable: true
                });
            }
        }
    } catch (e) {
        // vscode module not available in this context
    }
    
    console.log('[AntigravityManager] Machine ID interceptor initialized');
})();
${PATCH_MARKER_END}
`;
}

/**
 * Execute a command with admin privileges on macOS using osascript
 * @param {string} command - Shell command to execute
 * @param {string} description - Description of the operation for the prompt
 * @returns {Promise<object>} Result object
 */
async function executeWithAdminPrivileges(command, description = 'perform this operation') {
    if (process.platform !== 'darwin') {
        return { success: false, error: 'Not macOS' };
    }

    try {
        // Use osascript to run command with admin privileges
        // This will prompt the user for their password
        const escapedCommand = command.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        const osascriptCommand = `osascript -e 'do shell script "${escapedCommand}" with administrator privileges'`;

        execSync(osascriptCommand, {
            encoding: 'utf8',
            timeout: 120000, // 2 minutes timeout for user to enter password
            stdio: 'pipe'
        });

        return { success: true };
    } catch (error) {
        console.error('[Patch] Failed to execute with admin privileges:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Remove quarantine attributes from a specific file on macOS
 * Only operates on the specific file, not the entire app bundle
 * @param {string} filePath - Path to the specific file (e.g., extension.js)
 * @returns {Promise<object>} Result object
 */
async function removeQuarantineAttribute(filePath) {
    if (process.platform !== 'darwin') {
        return { success: true, message: 'Not macOS, skipping quarantine removal' };
    }

    try {
        // Only remove quarantine attribute from the specific file, not recursively
        // Use -c (clear all) without -r (recursive) to avoid touching the entire app bundle
        const escapedPath = filePath.replace(/"/g, '\\"');

        // First try without admin privileges
        try {
            execSync(`xattr -c "${escapedPath}" 2>/dev/null || true`, {
                encoding: 'utf8',
                timeout: 10000
            });
            console.log('[Patch] Quarantine attributes cleared from:', filePath);
            return { success: true, message: 'Quarantine attributes cleared' };
        } catch (e) {
            // If failed, just log and continue - this is not critical
            console.log('[Patch] xattr command not needed or failed (non-critical):', e.message);
            return { success: true, message: 'Quarantine removal skipped (non-critical)' };
        }
    } catch (error) {
        // Don't fail the whole operation if xattr fails
        console.warn('[Patch] Could not clear quarantine attributes (non-critical):', error.message);
        return {
            success: true, // Return success anyway as this is not critical
            message: 'Quarantine removal skipped'
        };
    }
}

/**
 * Re-sign Antigravity.app with ad-hoc signature on macOS
 * NOTE: This usually fails due to macOS security restrictions
 * We now skip signing and provide instructions for manual bypass
 * @param {string} appPath - Path to Antigravity.app
 * @returns {Promise<object>} Result object
 */
async function resignMacApp(appPath) {
    if (process.platform !== 'darwin') {
        return { success: true, message: 'Not macOS, skipping code signing' };
    }

    // Skip signing and return success with instructions
    // Signing third-party apps on macOS is very difficult due to:
    // 1. Nested components (Antigravity Helper.app, frameworks)
    // 2. SIP protection
    // 3. Gatekeeper restrictions
    console.log('[Patch] Skipping app re-signing (not reliable on modern macOS)');
    console.log('[Patch] User should bypass Gatekeeper manually if needed');

    return {
        success: true,
        message: 'Signing skipped - user may need to bypass Gatekeeper manually',
        skipped: true
    };
}

/**
 * Perform macOS-specific post-patch operations
 * Only operates on the specific extension.js file, not the entire app bundle
 * @param {string} extensionPath - Path to extension.js (optional, will be auto-detected if not provided)
 * @returns {Promise<object>} Result object
 */
async function performMacOSPostPatch(extensionPath = null) {
    if (process.platform !== 'darwin') {
        return { success: true, message: 'Not macOS, skipping post-patch operations' };
    }

    // Get extension.js path if not provided
    if (!extensionPath) {
        extensionPath = await getExtensionJSPath();
    }

    if (!extensionPath) {
        return {
            success: false,
            error: 'extension.js path not found'
        };
    }

    console.log('[Patch] Performing macOS post-patch operations on:', extensionPath);

    // Only try to remove quarantine attributes from the specific file
    // This avoids the permission errors from trying to modify the entire app bundle
    const quarantineResult = await removeQuarantineAttribute(extensionPath);

    // Always return success - user may need to manually bypass Gatekeeper
    return {
        success: true,
        message: 'macOS post-patch completed. If Antigravity fails to launch, right-click and select "Open" or check Security settings.',
        quarantineRemoved: quarantineResult.success,
        needsManualBypass: true,
        instructions: [
            '如果Antigravity无法启动，请尝试以下方法：',
            '1. 右键点击Antigravity应用，选择"打开"',
            '2. 或者打开 系统设置 > 隐私与安全性，点击"仍要打开"',
            '3. 或在终端执行: xattr -c /Applications/Antigravity.app/Contents/Resources/app/extensions/extension.js'
        ]
    };
}

/**
 * Get backup file path for extension.js
 * @param {string} extensionPath - Path to extension.js
 * @returns {string} Path to backup file
 */
function getBackupPath(extensionPath) {
    return extensionPath + BACKUP_SUFFIX;
}

/**
 * Check if extension.js is patched with V3 patch
 * @param {string} content - Content of extension.js
 * @returns {boolean} True if V3 patched
 */
function isPatched(content) {
    return content.includes(PATCH_MARKER_V3) || content.includes(PATCH_MARKER_KIRO_V3);
}

/**
 * Check if extension.js has old patch (V1 or V2)
 * @param {string} content - Content of extension.js
 * @returns {boolean} True if has old patch
 */
function isOldPatched(content) {
    return (content.includes(PATCH_MARKER_OLD) || content.includes(PATCH_MARKER_KIRO_OLD)) &&
           !content.includes(PATCH_MARKER_V3) && !content.includes(PATCH_MARKER_KIRO_V3);
}

/**
 * Remove old patch from content
 * @param {string} content - Content with old patch
 * @returns {string} Content without old patch
 */
function removeOldPatch(content) {
    // Find and remove Antigravity old patch markers
    let startIdx = content.indexOf(PATCH_MARKER_OLD);
    if (startIdx !== -1) {
        const endIdx = content.indexOf(PATCH_MARKER_END);
        if (endIdx !== -1) {
            content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_MARKER_END.length);
        }
    }
    
    // Also remove old Kiro patch markers for backward compatibility
    startIdx = content.indexOf(PATCH_MARKER_KIRO_OLD);
    if (startIdx !== -1) {
        const endIdx = content.indexOf(PATCH_MARKER_KIRO_END);
        if (endIdx !== -1) {
            content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_MARKER_KIRO_END.length);
        }
    }

    return content;
}

/**
 * Check the patch status of extension.js
 * @returns {Promise<object>} Status object
 */
async function checkPatchStatus() {
    const extensionPath = await getExtensionJSPath();

    if (!extensionPath) {
        return {
            extensionFound: false,
            isPatched: false,
            isOldPatched: false,
            hasBackup: false,
            extensionPath: null,
            backupPath: null
        };
    }

    const backupPath = getBackupPath(extensionPath);

    let content = '';
    try {
        content = await fs.readFile(extensionPath, 'utf8');
    } catch (error) {
        return {
            extensionFound: false,
            isPatched: false,
            isOldPatched: false,
            hasBackup: false,
            extensionPath,
            backupPath
        };
    }

    const hasBackup = await fs.pathExists(backupPath);

    return {
        extensionFound: true,
        isPatched: isPatched(content),
        isOldPatched: isOldPatched(content),
        hasBackup,
        extensionPath,
        backupPath
    };
}

/**
/**
 * Write file with admin privileges on macOS
 * This function handles macOS security restrictions by:
 * 1. Removing quarantine attributes
 * 2. Changing file permissions
 * 3. Copying the new content
 * @param {string} content - Content to write
 * @param {string} targetPath - Target file path
 * @returns {Promise<object>} Result object
 */
async function writeFileWithAdminPrivileges(content, targetPath) {
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `antigravity-patch-${Date.now()}.tmp`);

    try {
        // Write content to a temporary file first (no admin privileges needed)
        await fs.writeFile(tmpFile, content, 'utf8');

        const escapedTmpFile = tmpFile.replace(/"/g, '\\"');
        const escapedTargetPath = targetPath.replace(/"/g, '\\"');

        // Build a comprehensive command that:
        // 1. Removes extended attributes from target file
        // 2. Removes immutable flags
        // 3. Makes file writable
        // 4. Copies the new content
        // 5. Restores read permissions
        const commands = [
            `xattr -c "${escapedTargetPath}" 2>/dev/null || true`,           // Remove extended attributes
            `chflags nouchg "${escapedTargetPath}" 2>/dev/null || true`,     // Remove immutable flag
            `chmod 644 "${escapedTargetPath}" 2>/dev/null || true`,          // Make writable
            `cat "${escapedTmpFile}" > "${escapedTargetPath}"`,              // Write content using cat redirect
            `chmod 444 "${escapedTargetPath}" 2>/dev/null || true`           // Restore read-only
        ].join(' && ');

        const result = await executeWithAdminPrivileges(commands, 'patch Antigravity extension');

        // Clean up temp file
        try {
            await fs.remove(tmpFile);
        } catch (e) {
            // Ignore cleanup errors
        }

        return result;
    } catch (error) {
        // Clean up temp file on error
        try {
            await fs.remove(tmpFile);
        } catch (e) {
            // Ignore cleanup errors
        }
        throw error;
    }
}

/**
 * Backup file with admin privileges on macOS
 * @param {string} sourcePath - Source file path
 * @param {string} backupPath - Backup file path
 * @returns {Promise<object>} Result object
 */
async function backupFileWithAdminPrivileges(sourcePath, backupPath) {
    const escapedSource = sourcePath.replace(/"/g, '\\"');
    const escapedBackup = backupPath.replace(/"/g, '\\"');
    const command = `cp "${escapedSource}" "${escapedBackup}"`;

    return await executeWithAdminPrivileges(command, 'backup Antigravity extension');
}

/**
 * Apply the V3 patch to extension.js
 * @param {boolean} force - Force re-patch even if already patched
 * @returns {Promise<object>} Result object with success status
 */
async function applyPatch(force = true) {
    console.log('[Patch] applyPatch called, platform:', process.platform);
    const extensionPath = await getExtensionJSPath();

    if (!extensionPath) {
        console.warn('[Patch] Antigravity extension.js not found. Please make sure Antigravity is installed.');
        return {
            success: false,
            error: 'Antigravity extension.js not found. Please make sure Antigravity is installed.',
            extensionPath: null
        };
    }

    const backupPath = getBackupPath(extensionPath);
    const isMacOS = process.platform === 'darwin';
    const needsAdminPrivileges = isMacOS && extensionPath.startsWith('/Applications');

    try {
        // Read current content
        let content = await fs.readFile(extensionPath, 'utf8');

        // Check if already patched
        if (isPatched(content) && !force) {
            console.log('[Patch] Extension is already patched with V3');
            return {
                success: true,
                message: 'Extension is already patched with V3',
                alreadyPatched: true,
                extensionPath
            };
        }

        // Create backup if not exists
        if (!await fs.pathExists(backupPath)) {
            let backupContent = content;
            // If there's an old patch, use the content without patch for backup
            if (isOldPatched(content)) {
                console.log('[Patch] Removing old patch for backup');
                backupContent = removeOldPatch(content);
            } else if (isPatched(content)) {
                // Don't backup if already has V3 patch
                backupContent = null;
            }

            if (backupContent) {
                if (needsAdminPrivileges) {
                    console.log('[Patch] Creating backup with admin privileges...');
                    const backupResult = await backupFileWithAdminPrivileges(extensionPath, backupPath);
                    if (!backupResult.success) {
                        console.warn('[Patch] Failed to create backup:', backupResult.error);
                        // Continue anyway, backup is not critical
                    }
                } else {
                    await fs.writeFile(backupPath, backupContent, 'utf8');
                }
            }
        }

        // Remove old patch if exists
        if (isOldPatched(content)) {
            console.log('[Patch] Removing old patch');
            content = removeOldPatch(content);
        }

        // Remove existing V3 patch if force re-patch
        if (isPatched(content) && force) {
            console.log('[Patch] Removing existing V3 patch for re-patch');
            // Remove Antigravity patch
            let startIdx = content.indexOf(PATCH_MARKER_V3);
            let endIdx = content.indexOf(PATCH_MARKER_END);
            if (startIdx !== -1 && endIdx !== -1) {
                content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_MARKER_END.length);
            }
            // Also remove old Kiro patch for backward compatibility
            startIdx = content.indexOf(PATCH_MARKER_KIRO_V3);
            endIdx = content.indexOf(PATCH_MARKER_KIRO_END);
            if (startIdx !== -1 && endIdx !== -1) {
                content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_MARKER_KIRO_END.length);
            }
        }

        // Generate and prepend patch code
        const patchCode = generatePatchCode();
        const patchedContent = patchCode + '\n' + content;

        // Write patched content
        if (needsAdminPrivileges) {
            console.log('[Patch] Writing patched content with admin privileges...');
            const writeResult = await writeFileWithAdminPrivileges(patchedContent, extensionPath);
            if (!writeResult.success) {
                return {
                    success: false,
                    error: `Failed to write patched content: ${writeResult.error}`,
                    extensionPath
                };
            }
        } else {
            await fs.writeFile(extensionPath, patchedContent, 'utf8');
        }

        // Perform macOS post-patch operations (remove quarantine from extension.js)
        let macOSResult = { success: true };
        if (isMacOS) {
            console.log('[Patch] Performing macOS post-patch operations...');
            macOSResult = await performMacOSPostPatch(extensionPath);
            if (!macOSResult.success) {
                console.warn('[Patch] macOS post-patch operations failed:', macOSResult.error);
                // Return success with warning about signing
                return {
                    success: true,
                    message: 'Extension patched but macOS signing failed. You may need to manually allow the app in Security settings.',
                    warning: macOSResult.error,
                    extensionPath,
                    backupPath,
                    macOSSigned: false
                };
            }
        }

        // Build result object
        const result = {
            success: true,
            message: 'Extension patched successfully',
            extensionPath,
            backupPath,
            macOSSigned: macOSResult.success
        };

        // Include macOS-specific instructions if available
        if (isMacOS && macOSResult.instructions) {
            result.instructions = macOSResult.instructions;
            result.needsManualBypass = macOSResult.needsManualBypass;
            result.message = macOSResult.message || result.message;
        }

        return result;

    } catch (error) {
        console.error('[Patch] Failed to patch extension:', error);
        return {
            success: false,
            error: `Failed to patch extension: ${error.message}`,
            extensionPath
        };
    }
}

/**
 * Remove patch and restore original extension.js
 * @returns {Promise<object>} Result object with success status
 */
async function removePatch() {
    const extensionPath = await getExtensionJSPath();

    if (!extensionPath) {
        return {
            success: false,
            error: 'Antigravity extension.js not found'
        };
    }

    const backupPath = getBackupPath(extensionPath);

    try {
        // Check if backup exists
        if (await fs.pathExists(backupPath)) {
            // Restore from backup
            await fs.copy(backupPath, extensionPath, { overwrite: true });

            // Perform macOS post-patch operations after restoring
            if (process.platform === 'darwin') {
                console.log('[Patch] Performing macOS post-restore operations...');
                const macOSResult = await performMacOSPostPatch();
                if (!macOSResult.success) {
                    console.warn('[Patch] macOS post-restore operations failed:', macOSResult.error);
                }
            }

            return {
                success: true,
                message: 'Extension restored from backup',
                extensionPath
            };
        }

        // If no backup, try to remove patch from current file
        let content = await fs.readFile(extensionPath, 'utf8');

        if (isPatched(content)) {
            // Remove Antigravity patch
            let startIdx = content.indexOf(PATCH_MARKER_V3);
            let endIdx = content.indexOf(PATCH_MARKER_END);
            if (startIdx !== -1 && endIdx !== -1) {
                content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_MARKER_END.length);
            }
            // Also remove Kiro patch for backward compatibility
            startIdx = content.indexOf(PATCH_MARKER_KIRO_V3);
            endIdx = content.indexOf(PATCH_MARKER_KIRO_END);
            if (startIdx !== -1 && endIdx !== -1) {
                content = content.substring(0, startIdx) + content.substring(endIdx + PATCH_MARKER_KIRO_END.length);
            }
            // Remove leading newline if present
            content = content.replace(/^\n+/, '');
            await fs.writeFile(extensionPath, content, 'utf8');
            return {
                success: true,
                message: 'Patch removed from extension',
                extensionPath
            };
        }

        if (isOldPatched(content)) {
            content = removeOldPatch(content);
            content = content.replace(/^\n+/, '');
            await fs.writeFile(extensionPath, content, 'utf8');
            return {
                success: true,
                message: 'Old patch removed from extension',
                extensionPath
            };
        }

        return {
            success: true,
            message: 'Extension is not patched',
            extensionPath
        };

    } catch (error) {
        return {
            success: false,
            error: `Failed to remove patch: ${error.message}`,
            extensionPath
        };
    }
}

/**
 * Delete backup file
 * @returns {Promise<object>} Result object
 */
async function deleteBackup() {
    const extensionPath = await getExtensionJSPath();

    if (!extensionPath) {
        return {
            success: false,
            error: 'Extension path not found'
        };
    }

    const backupPath = getBackupPath(extensionPath);

    try {
        if (await fs.pathExists(backupPath)) {
            await fs.remove(backupPath);
            return {
                success: true,
                message: 'Backup deleted'
            };
        }
        return {
            success: true,
            message: 'No backup to delete'
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to delete backup: ${error.message}`
        };
    }
}

module.exports = {
    generatePatchCode,
    getExtensionJSPath,
    getBackupPath,
    isPatched,
    isOldPatched,
    removeOldPatch,
    checkPatchStatus,
    applyPatch,
    removePatch,
    deleteBackup,
    performMacOSPostPatch,
    removeQuarantineAttribute,
    resignMacApp,
    PATCH_MARKER_V3,
    PATCH_MARKER_END,
    PATCH_MARKER_OLD,
    // Backward compatibility
    PATCH_MARKER_KIRO_V3,
    PATCH_MARKER_KIRO_END,
    PATCH_MARKER_KIRO_OLD
};