/**
 * General Utilities
 */

import type { Source } from '../../types/websocket';
import type { SavedDataMap } from '../../types/header';

/**
 * Create a debounce function to avoid too many rapid updates
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    return function (this: unknown, ...args: Parameters<T>): void {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * Fast numeric hash (FNV-1a 32-bit).
 * Used for change detection — not cryptographic.
 */
function fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash;
}

/**
 * Generate a hash of sources to detect changes.
 * Returns a short numeric string — much faster than JSON.stringify comparison.
 */
export function generateSourcesHash(sources: Source[]): string {
    if (!sources || !Array.isArray(sources) || sources.length === 0) return '';

    let combined = '';
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        combined += (s.sourceId || '') + '\0' + (s.sourceContent || '') + '\x01';
    }

    return fnv1a(combined).toString(36);
}

/**
 * Generate a hash of saved data to detect meaningful changes.
 */
export function generateSavedDataHash(savedData: SavedDataMap): string {
    if (!savedData) return '';

    const keys = Object.keys(savedData);
    if (keys.length === 0) return '';

    let combined = '';
    for (let i = 0; i < keys.length; i++) {
        const id = keys[i];
        const e = savedData[id];
        combined += id + '\0' + e.headerName + '\0' + e.headerValue + '\0'
            + (e.isDynamic ? '1' : '0') + '\0' + (e.sourceId || '') + '\0'
            + (e.sourceMissing ? '1' : '0') + '\x01';
    }

    return fnv1a(combined).toString(36);
}
