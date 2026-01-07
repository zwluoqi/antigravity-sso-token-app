/**
 * Machine ID Module
 * Handles machine ID generation, hashing, and management
 * Reference: Antigravity-Manager/src-tauri/src/modules/
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { getAntigravityToolsPath, getAntigravityConfigPath, getMachineIdPath } = require('./antigravity-paths');

// File names for custom machine ID
const CUSTOM_MACHINE_ID_FILE = 'custom-machine-id';        // SHA256 hashed machine ID
const CUSTOM_MACHINE_ID_RAW_FILE = 'custom-machine-id-raw'; // Original UUID

/**
 * Generate a new UUID v4
 * @returns {string} New UUID v4 string
 */
function generateUUID() {
    return crypto.randomUUID();
}

/**
 * Hash a string using SHA256
 * @param {string} input - Input string to hash
 * @returns {string} SHA256 hash as hex string
 */
function sha256Hash(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Get the path to custom-machine-id file
 * @returns {string} Path to custom-machine-id file
 */
function getCustomMachineIdPath() {
    return path.join(getAntigravityToolsPath(), CUSTOM_MACHINE_ID_FILE);
}

/**
 * Get the path to custom-machine-id-raw file
 * @returns {string} Path to custom-machine-id-raw file
 */
function getCustomMachineIdRawPath() {
    return path.join(getAntigravityToolsPath(), CUSTOM_MACHINE_ID_RAW_FILE);
}

/**
 * Read the current custom machine ID (hashed)
 * @returns {Promise<string|null>} Custom machine ID or null if not set
 */
async function readCustomMachineId() {
    try {
        const filePath = getCustomMachineIdPath();
        if (await fs.pathExists(filePath)) {
            const content = await fs.readFile(filePath, 'utf8');
            return content.trim();
        }
    } catch (error) {
        console.error('Error reading custom machine ID:', error.message);
    }
    return null;
}

/**
 * Read the current custom machine ID raw (original UUID)
 * @returns {Promise<string|null>} Raw UUID or null if not set
 */
async function readCustomMachineIdRaw() {
    try {
        const filePath = getCustomMachineIdRawPath();
        if (await fs.pathExists(filePath)) {
            const content = await fs.readFile(filePath, 'utf8');
            return content.trim();
        }
    } catch (error) {
        console.error('Error reading custom machine ID raw:', error.message);
    }
    return null;
}

/**
 * Read the machine ID from Antigravity config directory
 * This is the system machine ID used by Antigravity
 * @returns {Promise<string|null>} Machine ID or null if not found
 */
async function readAntigravityMachineId() {
    try {
        const filePath = await getMachineIdPath();
        if (await fs.pathExists(filePath)) {
            const content = await fs.readFile(filePath, 'utf8');
            return content.trim();
        }
    } catch (error) {
        console.error('Error reading Antigravity machine ID:', error.message);
    }
    return null;
}

// Keep backward compatibility
async function readKiroMachineId() {
    return readAntigravityMachineId();
}

/**
 * Write custom machine ID files
 * @param {string} uuid - The raw UUID to use
 * @param {string} hashedId - The SHA256 hashed machine ID
 * @returns {Promise<void>}
 */
async function writeCustomMachineId(uuid, hashedId) {
    const antigravityToolsPath = getAntigravityToolsPath();

    // Ensure the .antigravity-sso-token-manager directory exists
    await fs.ensureDir(antigravityToolsPath);

    // Write both files
    await Promise.all([
        fs.writeFile(getCustomMachineIdPath(), hashedId, 'utf8'),
        fs.writeFile(getCustomMachineIdRawPath(), uuid, 'utf8')
    ]);
}

/**
 * Write machine ID to Antigravity config directory
 * @param {string} machineId - The machine ID to write
 * @returns {Promise<void>}
 */
async function writeAntigravityMachineId(machineId) {
    const configPath = await getAntigravityConfigPath();
    const machineIdPath = await getMachineIdPath();

    // Ensure the config directory exists
    await fs.ensureDir(configPath);

    // Write the machine ID
    await fs.writeFile(machineIdPath, machineId, 'utf8');
}

// Keep backward compatibility
async function writeKiroMachineId(machineId) {
    return writeAntigravityMachineId(machineId);
}

/**
 * Generate new machine ID
 * Creates a new UUID and its SHA256 hash
 * @returns {{ uuid: string, hashedId: string }} Object with uuid and hashedId
 */
function generateNewMachineId() {
    const uuid = generateUUID();
    const hashedId = sha256Hash(uuid);
    return { uuid, hashedId };
}

/**
 * Check if custom machine ID is configured
 * @returns {Promise<boolean>} True if custom machine ID exists
 */
async function hasCustomMachineId() {
    const customId = await readCustomMachineId();
    return customId !== null && customId.length > 0;
}

/**
 * Remove custom machine ID files
 * @returns {Promise<void>}
 */
async function removeCustomMachineId() {
    try {
        await Promise.all([
            fs.remove(getCustomMachineIdPath()),
            fs.remove(getCustomMachineIdRawPath())
        ]);
    } catch (error) {
        console.error('Error removing custom machine ID:', error.message);
        throw error;
    }
}

/**
 * Get machine ID status
 * @returns {Promise<object>} Status object with details about machine ID configuration
 */
async function getMachineIdStatus() {
    const [customId, customIdRaw, antigravityId, hasCustom] = await Promise.all([
        readCustomMachineId(),
        readCustomMachineIdRaw(),
        readAntigravityMachineId(),
        hasCustomMachineId()
    ]);

    return {
        hasCustomMachineId: hasCustom,
        customMachineId: customId,
        customMachineIdRaw: customIdRaw,
        antigravityMachineId: antigravityId,
        // Keep backward compatibility
        kiroMachineId: antigravityId,
        customMachineIdPath: getCustomMachineIdPath(),
        customMachineIdRawPath: getCustomMachineIdRawPath()
    };
}

module.exports = {
    generateUUID,
    sha256Hash,
    getCustomMachineIdPath,
    getCustomMachineIdRawPath,
    readCustomMachineId,
    readCustomMachineIdRaw,
    readAntigravityMachineId,
    readKiroMachineId, // backward compatibility
    writeCustomMachineId,
    writeAntigravityMachineId,
    writeKiroMachineId, // backward compatibility
    generateNewMachineId,
    hasCustomMachineId,
    removeCustomMachineId,
    getMachineIdStatus,
    CUSTOM_MACHINE_ID_FILE,
    CUSTOM_MACHINE_ID_RAW_FILE
};