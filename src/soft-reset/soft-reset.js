/**
 * Soft Reset Module
 * Main orchestration for soft reset functionality
 * Reference: Antigravity-Manager/src-tauri/src/modules/
 */

const path = require('path');
const fs = require('fs-extra');
const {
    getAntigravityToolsPath,
    getAntigravityConfigPath,
    getAntigravityAccountsPath,
    getAllPaths
} = require('./antigravity-paths');
const {
    generateNewMachineId,
    readCustomMachineId,
    readCustomMachineIdRaw,
    readAntigravityMachineId,
    writeCustomMachineId,
    writeAntigravityMachineId,
    hasCustomMachineId,
    removeCustomMachineId,
    getMachineIdStatus
} = require('./machine-id');
const {
    checkPatchStatus,
    applyPatch,
    removePatch
} = require('./patch');

/**
 * Get comprehensive soft reset status
 * @returns {Promise<object>} Status object with all relevant information
 */
async function getSoftResetStatus() {
    const [paths, machineIdStatus, patchStatus] = await Promise.all([
        getAllPaths(),
        getMachineIdStatus(),
        checkPatchStatus()
    ]);

    // Check if Antigravity is installed
    const isAntigravityInstalled = paths.installPath !== null;

    // Check if soft reset is active (has custom machine ID and is patched)
    const isSoftResetActive = machineIdStatus.hasCustomMachineId && patchStatus.isPatched;

    return {
        isAntigravityInstalled,
        // Keep backward compatibility
        isKiroInstalled: isAntigravityInstalled,
        isSoftResetActive,
        paths,
        machineId: machineIdStatus,
        patch: patchStatus,
        platform: process.platform
    };
}

/**
 * Clear Antigravity data cache
 * @returns {Promise<object>} Result object
 */
async function clearDataCache(options = {}) {
    const { preserveTokenFile = true } = options;
    const accountsPath = getAntigravityAccountsPath();

    try {
        if (await fs.pathExists(accountsPath)) {
            // List all files in accounts directory
            const files = await fs.readdir(accountsPath);
            let deletedCount = 0;
            let skippedCount = 0;

            for (const file of files) {
                // Skip the current_token.json file to preserve authorization
                if (preserveTokenFile && file === 'current_token.json') {
                    skippedCount++;
                    continue;
                }
                const filePath = path.join(accountsPath, file);
                try {
                    await fs.remove(filePath);
                    deletedCount++;
                } catch (err) {
                    console.error(`Failed to delete ${file}:`, err.message);
                }
            }

            return {
                success: true,
                message: `Cleared ${deletedCount} files from data cache${skippedCount > 0 ? ` (preserved ${skippedCount} token file)` : ''}`,
                deletedCount,
                skippedCount
            };
        }

        return {
            success: true,
            message: 'Data cache directory does not exist',
            deletedCount: 0
        };

    } catch (error) {
        return {
            success: false,
            error: `Failed to clear data cache: ${error.message}`
        };
    }
}

// Keep backward compatibility
async function clearSsoCache(options = {}) {
    return clearDataCache(options);
}

/**
 * Perform soft reset
 * This is the main function that:
 * 1. Generates a new machine ID
 * 2. Writes the custom machine ID files
 * 3. Patches extension.js if not already patched
 * 4. Optionally clears SSO cache
 * 
 * @param {object} options - Options for soft reset
 * @param {boolean} options.clearCache - Whether to clear SSO cache (default: false, preserves token)
 * @param {boolean} options.forcePatch - Force re-patch even if already patched (default: false)
 * @returns {Promise<object>} Result object with details
 */
async function performSoftReset(options = {}) {
    const { clearCache = false, forcePatch = true } = options;

    const result = {
        success: false,
        steps: [],
        oldMachineId: null,
        newMachineId: null,
        error: null
    };

    try {
        // Step 1: Read old machine ID
        const oldCustomId = await readCustomMachineId();
        const oldKiroId = await readKiroMachineId();
        result.oldMachineId = {
            customId: oldCustomId,
            kiroId: oldKiroId
        };
        result.steps.push({
            step: 'read_old_id',
            success: true,
            message: 'Read old machine ID'
        });

        // Step 2: Generate new machine ID
        const { uuid, hashedId } = generateNewMachineId();
        result.newMachineId = {
            uuid,
            hashedId
        };
        result.steps.push({
            step: 'generate_new_id',
            success: true,
            message: `Generated new machine ID: ${hashedId.substring(0, 16)}...`
        });

        // Step 3: Write custom machine ID files
        await writeCustomMachineId(uuid, hashedId);
        result.steps.push({
            step: 'write_custom_id',
            success: true,
            message: 'Wrote custom machine ID files'
        });

        // Step 4: Also write to Antigravity config directory
        try {
            await writeAntigravityMachineId(hashedId);
            result.steps.push({
                step: 'write_antigravity_id',
                success: true,
                message: 'Wrote machine ID to Antigravity config'
            });
        } catch (error) {
            result.steps.push({
                step: 'write_antigravity_id',
                success: false,
                message: `Failed to write Antigravity config: ${error.message}`,
                warning: true
            });
        }

        // Step 5: Apply patch to extension.js
        const patchResult = await applyPatch(forcePatch);
        if (patchResult.success) {
            result.steps.push({
                step: 'apply_patch',
                success: true,
                message: patchResult.alreadyPatched ?
                    'Extension already patched' :
                    'Applied patch to extension.js'
            });
        } else {
            result.steps.push({
                step: 'apply_patch',
                success: false,
                message: patchResult.error,
                warning: true // This is a warning, not a fatal error
            });
        }

        // Step 6: Clear data cache if requested (but always preserve token file)
        if (clearCache) {
            const cacheResult = await clearDataCache({ preserveTokenFile: true });
            result.steps.push({
                step: 'clear_cache',
                success: cacheResult.success,
                message: cacheResult.success ?
                    cacheResult.message :
                    cacheResult.error
            });
        }

        result.success = true;
        result.message = 'Soft reset completed successfully. Please restart Antigravity for changes to take effect.';

    } catch (error) {
        result.success = false;
        result.error = error.message;
        result.steps.push({
            step: 'error',
            success: false,
            message: error.message
        });
    }

    return result;
}

/**
 * Restore to original state
 * This removes custom machine ID and restores extension.js from backup
 * 
 * @param {object} options - Options for restore
 * @param {boolean} options.clearCache - Whether to clear SSO cache (default: false, preserves token)
 * @returns {Promise<object>} Result object with details
 */
async function restoreOriginal(options = {}) {
    const { clearCache = false } = options;

    const result = {
        success: false,
        steps: [],
        error: null
    };

    try {
        // Step 1: Remove patch from extension.js
        const patchResult = await removePatch();
        result.steps.push({
            step: 'remove_patch',
            success: patchResult.success,
            message: patchResult.success ?
                patchResult.message :
                patchResult.error
        });

        // Step 2: Remove custom machine ID files
        try {
            await removeCustomMachineId();
            result.steps.push({
                step: 'remove_custom_id',
                success: true,
                message: 'Removed custom machine ID files'
            });
        } catch (error) {
            result.steps.push({
                step: 'remove_custom_id',
                success: false,
                message: `Failed to remove custom ID: ${error.message}`,
                warning: true
            });
        }

        // Step 3: Clear data cache if requested (but always preserve token file)
        if (clearCache) {
            const cacheResult = await clearDataCache({ preserveTokenFile: true });
            result.steps.push({
                step: 'clear_cache',
                success: cacheResult.success,
                message: cacheResult.success ?
                    cacheResult.message :
                    cacheResult.error
            });
        }

        result.success = true;
        result.message = 'Restored to original state. Please restart Antigravity for changes to take effect.';

    } catch (error) {
        result.success = false;
        result.error = error.message;
        result.steps.push({
            step: 'error',
            success: false,
            message: error.message
        });
    }

    return result;
}

/**
 * Quick reset - just generates new machine ID without full soft reset
 * Useful for quickly changing machine ID when already set up
 * 
 * @param {object} options - Options
 * @param {boolean} options.clearCache - Whether to clear SSO cache (default: true)
 * @returns {Promise<object>} Result object
 */
async function quickReset(options = {}) {
    const { clearCache = false } = options;

    const result = {
        success: false,
        oldMachineId: null,
        newMachineId: null,
        error: null
    };

    try {
        // Read old ID
        const oldId = await readCustomMachineId();
        result.oldMachineId = oldId;

        // Generate and write new ID
        const { uuid, hashedId } = generateNewMachineId();
        await writeCustomMachineId(uuid, hashedId);

        // Also update Antigravity config
        try {
            await writeAntigravityMachineId(hashedId);
        } catch (e) {
            // Non-fatal
        }

        result.newMachineId = hashedId;

        // Clear cache if requested (but always preserve token file)
        if (clearCache) {
            await clearDataCache({ preserveTokenFile: true });
        }

        result.success = true;
        result.message = 'Quick reset completed. Please restart Antigravity.';

    } catch (error) {
        result.success = false;
        result.error = error.message;
    }

    return result;
}

module.exports = {
    getSoftResetStatus,
    clearDataCache,
    clearSsoCache, // backward compatibility
    performSoftReset,
    restoreOriginal,
    quickReset,
    getAllPaths
};