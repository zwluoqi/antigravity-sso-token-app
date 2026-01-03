/**
 * Soft Reset Module - Index
 * Exports all soft reset functionality
 */

const antigravityPaths = require('./antigravity-paths');
const machineId = require('./machine-id');
const patch = require('./patch');
const softReset = require('./soft-reset');

module.exports = {
    // Antigravity Paths
    ...antigravityPaths,

    // Machine ID
    ...machineId,

    // Patch
    ...patch,

    // Soft Reset
    ...softReset
};