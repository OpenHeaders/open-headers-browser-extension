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
 * Generate a simple hash of sources to detect changes
 */
export function generateSourcesHash(sources: Source[]): string {
    if (!sources || !Array.isArray(sources)) return '';

    // Create a simplified representation of the sources to compare
    const simplifiedSources = sources.map(source => {
        return {
            id: source.sourceId,
            content: source.sourceContent
        };
    });

    return JSON.stringify(simplifiedSources);
}

/**
 * Generate a hash of saved data to detect meaningful changes
 */
export function generateSavedDataHash(savedData: SavedDataMap): string {
    if (!savedData) return '';

    // Create a simplified representation of the saved data to compare
    const simplifiedData = Object.entries(savedData).map(([id, entry]) => {
        return {
            id,
            name: entry.headerName,
            value: entry.headerValue,
            isDynamic: entry.isDynamic,
            sourceId: entry.sourceId,
            sourceMissing: entry.sourceMissing
        };
    });

    return JSON.stringify(simplifiedData);
}
