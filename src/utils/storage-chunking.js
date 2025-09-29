/**
 * Storage chunking utilities for handling large data in chrome.storage.sync
 * Chrome has a limit of 8192 bytes per item in storage.sync
 */

import { storage } from './browser-api.js';

// Storage quota constants
const CHUNK_SIZE = 4000; // Conservative size to avoid quota errors (Chrome limit is 8192 bytes per item)

/**
 * Get byte size of a string (UTF-8)
 * @param {string} str - String to measure
 * @returns {number} - Size in bytes
 */
function getByteSize(str) {
    return new Blob([str]).size;
}

/**
 * Split large data into chunks for storage.sync
 * @param {string} key - Base key name
 * @param {Object} data - Data to store
 * @param {Function} callback - Callback function
 */
export function setChunkedData(key, data, callback) {
    const dataStr = JSON.stringify(data);
    const byteSize = getByteSize(dataStr);
    
    // Chrome's limit is 8192 bytes per item, but we need to account for key name and metadata
    // Use 7000 bytes as safe threshold for single item storage
    if (byteSize < 7000) {
        const storageData = {};
        storageData[key] = data;
        storageData[`${key}_chunked`] = false;
        
        // Clear any old chunks asynchronously (don't block the main operation)
        storage.sync.get(null, (items) => {
            const keysToRemove = [];
            for (const itemKey in items) {
                if (itemKey.startsWith(`${key}_chunk_`)) {
                    keysToRemove.push(itemKey);
                }
            }
            if (keysToRemove.length > 0) {
                storage.sync.remove(keysToRemove, () => {
                    console.log(`Cleaned up ${keysToRemove.length} old chunks for key: ${key}`);
                });
            }
        });
        
        storage.sync.set(storageData, callback);
        return;
    }
    
    // Data needs to be chunked
    const chunks = [];
    for (let i = 0; i < dataStr.length; i += CHUNK_SIZE) {
        chunks.push(dataStr.slice(i, i + CHUNK_SIZE));
    }
    
    // Store chunks
    const storageData = {};
    storageData[`${key}_chunked`] = true;
    storageData[`${key}_chunks`] = chunks.length;
    
    chunks.forEach((chunk, index) => {
        storageData[`${key}_chunk_${index}`] = chunk;
    });
    
    // Clear the main key to avoid confusion
    storage.sync.remove([key], () => {
        storage.sync.set(storageData, callback);
    });
}

/**
 * Retrieve chunked data from storage.sync
 * @param {string} key - Base key name
 * @param {Function} callback - Callback function with (data) parameter
 */
export function getChunkedData(key, callback) {
    storage.sync.get([key, `${key}_chunked`, `${key}_chunks`], (result) => {
        if (!result[`${key}_chunked`]) {
            // Data is not chunked, return directly
            callback(result[key] || null);
            return;
        }
        
        // Data is chunked, retrieve all chunks
        const numChunks = result[`${key}_chunks`] || 0;
        const chunkKeys = [];
        for (let i = 0; i < numChunks; i++) {
            chunkKeys.push(`${key}_chunk_${i}`);
        }
        
        storage.sync.get(chunkKeys, (chunkResult) => {
            // Reconstruct the data
            let reconstructed = '';
            for (let i = 0; i < numChunks; i++) {
                reconstructed += chunkResult[`${key}_chunk_${i}`] || '';
            }
            
            try {
                const data = JSON.parse(reconstructed);
                callback(data);
            } catch (e) {
                console.error('Error parsing chunked data:', e);
                callback(null);
            }
        });
    });
}