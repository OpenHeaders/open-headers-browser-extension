/**
 * Storage chunking utilities for handling large data in chrome.storage.sync
 * Chrome has a limit of 8192 bytes per item in storage.sync
 */

import { storage } from './browser-api';
import { logger } from './logger';

// Storage quota constants
const CHUNK_SIZE = 4000; // Conservative size to avoid quota errors (Chrome limit is 8192 bytes per item)

/**
 * Get byte size of a string (UTF-8)
 */
function getByteSize(str: string): number {
    return new Blob([str]).size;
}

/**
 * Split large data into chunks for storage.sync
 */
export function setChunkedData(key: string, data: Record<string, unknown>, callback?: () => void): void {
    const dataStr = JSON.stringify(data);
    const byteSize = getByteSize(dataStr);

    // Chrome's limit is 8192 bytes per item, but we need to account for key name and metadata
    // Use 7000 bytes as safe threshold for single item storage
    if (byteSize < 7000) {
        const storageData: Record<string, unknown> = {};
        storageData[key] = data;
        storageData[`${key}_chunked`] = false;

        // Clear any old chunks asynchronously (don't block the main operation)
        storage.sync.get(null, (items: Record<string, unknown>) => {
            const keysToRemove: string[] = [];
            for (const itemKey in items) {
                if (itemKey.startsWith(`${key}_chunk_`)) {
                    keysToRemove.push(itemKey);
                }
            }
            if (keysToRemove.length > 0) {
                storage.sync.remove(keysToRemove, () => {
                    logger.debug('StorageChunking', `Cleaned up ${keysToRemove.length} old chunks for key: ${key}`);
                });
            }
        });

        storage.sync.set(storageData, callback);
        return;
    }

    // Data needs to be chunked
    const chunks: string[] = [];
    for (let i = 0; i < dataStr.length; i += CHUNK_SIZE) {
        chunks.push(dataStr.slice(i, i + CHUNK_SIZE));
    }

    // Store chunks
    const storageData: Record<string, unknown> = {};
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
 */
export function getChunkedData<T extends Record<string, unknown> = Record<string, unknown>>(key: string, callback: (data: T | null) => void): void {
    storage.sync.get([key, `${key}_chunked`, `${key}_chunks`], (result: Record<string, unknown>) => {
        if (!result[`${key}_chunked`]) {
            // Data is not chunked, return directly
            callback((result[key] as T) || null);
            return;
        }

        // Data is chunked, retrieve all chunks
        const numChunks = (result[`${key}_chunks`] as number) || 0;
        const chunkKeys: string[] = [];
        for (let i = 0; i < numChunks; i++) {
            chunkKeys.push(`${key}_chunk_${i}`);
        }

        storage.sync.get(chunkKeys, (chunkResult: Record<string, unknown>) => {
            // Reconstruct the data
            let reconstructed = '';
            for (let i = 0; i < numChunks; i++) {
                reconstructed += (chunkResult[`${key}_chunk_${i}`] as string) || '';
            }

            try {
                const data = JSON.parse(reconstructed) as T;
                callback(data);
            } catch (e) {
                logger.error('StorageChunking', 'Error parsing chunked data:', e);
                callback(null);
            }
        });
    });
}
