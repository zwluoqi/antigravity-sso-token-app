/**
 * Antigravity Paths Module
 * Cross-platform path detection for Antigravity installation and configuration directories
 * Reference: Antigravity-Manager/src-tauri/src/modules/db.rs and process.rs
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');

// Antigravity application names for different platforms
const ANTIGRAVITY_APP_NAMES = {
    win32: 'Antigravity',
    darwin: 'Antigravity.app',
    linux: 'antigravity'
};

/**
 * Get Antigravity tools directory path (~/.antigravity_tools)
 * This is where user-specific Antigravity data is stored
 * @returns {string} Path to ~/.antigravity_tools directory
 */
function getAntigravityToolsPath() {
    return path.join(os.homedir(), '.antigravity_tools');
}

/**
 * Get Antigravity config directory path (platform-specific)
 * Windows: %APPDATA%/Antigravity
 * macOS: ~/Library/Application Support/Antigravity
 * Linux: ~/.config/Antigravity
 * @returns {Promise<string>} Path to Antigravity config directory
 */
async function getAntigravityConfigPath() {
    const platform = process.platform;

    switch (platform) {
        case 'win32': {
            const appData = process.env.APPDATA;
            if (!appData) {
                throw new Error('APPDATA environment variable not found');
            }
            return path.join(appData, 'Antigravity');
        }
        case 'darwin': {
            return path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity');
        }
        case 'linux': {
            const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
            return path.join(configDir, 'Antigravity');
        }
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

/**
 * Get Antigravity installation path (platform-specific)
 * Windows: %LOCALAPPDATA%/Programs/Antigravity or Program Files
 * macOS: /Applications/Antigravity.app or ~/Applications/Antigravity.app
 * Linux: /usr/share/antigravity or /opt/Antigravity
 * @returns {Promise<string|null>} Path to Antigravity installation directory or null if not found
 */
async function getAntigravityInstallPath() {
    const platform = process.platform;
    const possiblePaths = [];

    switch (platform) {
        case 'win32': {
            const localAppData = process.env.LOCALAPPDATA;
            if (localAppData) {
                possiblePaths.push(path.join(localAppData, 'Programs', 'Antigravity'));
            }
            possiblePaths.push(
                'C:\\Program Files\\Antigravity',
                'C:\\Program Files (x86)\\Antigravity',
                path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Antigravity')
            );
            break;
        }
        case 'darwin': {
            possiblePaths.push(
                '/Applications/Antigravity.app',
                path.join(os.homedir(), 'Applications', 'Antigravity.app')
            );
            break;
        }
        case 'linux': {
            possiblePaths.push(
                '/usr/bin/antigravity',
                '/opt/Antigravity/antigravity',
                '/usr/share/antigravity',
                '/usr/local/share/antigravity',
                path.join(os.homedir(), '.local', 'share', 'antigravity'),
                path.join(os.homedir(), '.local', 'bin', 'antigravity')
            );
            break;
        }
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }

    // Find the first existing path
    for (const testPath of possiblePaths) {
        try {
            if (await fs.pathExists(testPath)) {
                return testPath;
            }
        } catch (error) {
            // Continue to next path
        }
    }

    return null;
}

/**
 * Get Antigravity database path (state.vscdb)
 * Windows: %APPDATA%/Antigravity/User/globalStorage/state.vscdb
 * macOS: ~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb
 * Linux: ~/.config/Antigravity/User/globalStorage/state.vscdb
 * @returns {Promise<string|null>} Path to state.vscdb or null if not found
 */
async function getAntigravityDbPath() {
    const platform = process.platform;
    let dbPath;

    switch (platform) {
        case 'win32': {
            const appData = process.env.APPDATA;
            if (!appData) {
                return null;
            }
            dbPath = path.join(appData, 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
            break;
        }
        case 'darwin': {
            dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
            break;
        }
        case 'linux': {
            dbPath = path.join(os.homedir(), '.config', 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
            break;
        }
        default:
            return null;
    }

    try {
        if (await fs.pathExists(dbPath)) {
            return dbPath;
        }
    } catch (error) {
        // Path doesn't exist
    }

    return null;
}

/**
 * Get Antigravity sso token directory path
 * @returns {string} Path to ~/.antigravity_tools/accounts
 */
function getAntigravityAccountsPath() {
    return path.join(os.homedir(), '.antigravity_tools', 'accounts');
}

/**
 * Get current token file path
 * @returns {string} Path to ~/.antigravity_tools/current_token.json
 */
function getAntigravityTokenPath() {
    return path.join(os.homedir(), '.antigravity_tools', 'current_token.json');
}

/**
 * Get accounts index file path
 * @returns {string} Path to ~/.antigravity_tools/accounts.json
 */
function getAntigravityAccountsIndexPath() {
    return path.join(os.homedir(), '.antigravity_tools', 'accounts.json');
}

/**
 * Get machine ID file path in Antigravity config directory
 * Windows: %APPDATA%/Antigravity/machineid
 * macOS: ~/Library/Application Support/Antigravity/machineid
 * Linux: ~/.config/Antigravity/machineid
 * @returns {Promise<string>} Path to machineid file
 */
async function getMachineIdPath() {
    const configPath = await getAntigravityConfigPath();
    return path.join(configPath, 'machineid');
}

/**
 * Get all Antigravity paths for diagnostic purposes
 * @returns {Promise<object>} Object containing all paths
 */
async function getAllPaths() {
    const [installPath, configPath, dbPath, machineIdPath] = await Promise.all([
        getAntigravityInstallPath(),
        getAntigravityConfigPath(),
        getAntigravityDbPath(),
        getMachineIdPath()
    ]);

    return {
        toolsPath: getAntigravityToolsPath(),
        configPath,
        installPath,
        dbPath,
        machineIdPath,
        accountsPath: getAntigravityAccountsPath(),
        tokenPath: getAntigravityTokenPath(),
        accountsIndexPath: getAntigravityAccountsIndexPath(),
        platform: process.platform
    };
}

module.exports = {
    getAntigravityToolsPath,
    getAntigravityConfigPath,
    getAntigravityInstallPath,
    getAntigravityDbPath,
    getAntigravityAccountsPath,
    getAntigravityTokenPath,
    getAntigravityAccountsIndexPath,
    getMachineIdPath,
    getAllPaths,
    ANTIGRAVITY_APP_NAMES
};