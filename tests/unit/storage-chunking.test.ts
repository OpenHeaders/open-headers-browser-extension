import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared backing store for the mock
const syncStore: Record<string, unknown> = {};

// We need to mock the browser-api storage module since storage-chunking imports from it
vi.mock('../../src/utils/browser-api', () => {
  // We cannot reference outer `syncStore` directly in vi.mock factory due to hoisting.
  // Instead we attach it to globalThis so the mock can access it.
  return {
    storage: {
      sync: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
  };
});

import { setChunkedData, getChunkedData } from '../../src/utils/storage-chunking';
import { storage } from '../../src/utils/browser-api';

function clearStore(): void {
  for (const key of Object.keys(syncStore)) {
    delete syncStore[key];
  }
}

function setupStorageMocks(): void {
  vi.mocked(storage.sync.get).mockImplementation(
    (keys: string | string[] | null, callback: (items: Record<string, unknown>) => void) => {
      const result: Record<string, unknown> = {};
      if (keys === null) {
        Object.assign(result, syncStore);
      } else {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const k of keyArray) {
          if (k in syncStore) {
            result[k] = syncStore[k];
          }
        }
      }
      callback(result);
    },
  );

  vi.mocked(storage.sync.set).mockImplementation(
    (items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(syncStore, items);
      callback?.();
    },
  );

  vi.mocked(storage.sync.remove).mockImplementation(
    (keys: string | string[], callback?: () => void) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      for (const k of keyArray) {
        delete syncStore[k];
      }
      callback?.();
    },
  );
}

// Factory for small data under 7000 bytes
function makeSmallData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Acme Corp Production Headers',
    url: 'https://api.acme-corp.com/v2/resources',
    token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.stub',
    createdAt: '2025-11-15T09:30:00.000Z',
    enabled: true,
    ...overrides,
  };
}

// Factory for large data that exceeds 7000 bytes
function makeLargeData(sizeKB: number = 10): Record<string, unknown> {
  const entries: Record<string, string> = {};
  const charCount = Math.ceil((sizeKB * 1024) / 100);
  for (let i = 0; i < charCount; i++) {
    entries[`header_${i}_${String(i).padStart(36, '0')}`] = `value_${'x'.repeat(60)}_${i}`;
  }
  return {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    url: 'https://enterprise.megacorp.io/api/gateway',
    headers: entries,
    createdAt: '2025-09-22T14:00:00.000Z',
  };
}

describe('storage-chunking', () => {
  beforeEach(() => {
    clearStore();
    vi.clearAllMocks();
    setupStorageMocks();
  });

  describe('setChunkedData', () => {
    it('stores small data as a single item with _chunked=false', () => {
      const data = makeSmallData();
      const callback = vi.fn();

      setChunkedData('profileHeaders', data, callback);

      expect(syncStore['profileHeaders']).toEqual(data);
      expect(syncStore['profileHeaders_chunked']).toBe(false);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('stores empty object as single item', () => {
      const callback = vi.fn();

      setChunkedData('emptyConfig', {}, callback);

      expect(syncStore['emptyConfig']).toEqual({});
      expect(syncStore['emptyConfig_chunked']).toBe(false);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('chunks large data exceeding 7000 bytes', () => {
      const data = makeLargeData(10);
      const callback = vi.fn();

      setChunkedData('largeHeaders', data, callback);

      expect(syncStore['largeHeaders_chunked']).toBe(true);
      expect(typeof syncStore['largeHeaders_chunks']).toBe('number');

      const numChunks = syncStore['largeHeaders_chunks'] as number;
      expect(numChunks).toBeGreaterThan(1);

      for (let i = 0; i < numChunks; i++) {
        expect(syncStore[`largeHeaders_chunk_${i}`]).toBeDefined();
        expect(typeof syncStore[`largeHeaders_chunk_${i}`]).toBe('string');
      }

      // The main key should have been removed
      expect(syncStore['largeHeaders']).toBeUndefined();
      expect(callback).toHaveBeenCalledOnce();
    });

    it('chunks very large data (50KB+)', () => {
      const data = makeLargeData(55);
      const callback = vi.fn();

      setChunkedData('hugePayload', data, callback);

      expect(syncStore['hugePayload_chunked']).toBe(true);
      const numChunks = syncStore['hugePayload_chunks'] as number;
      expect(numChunks).toBeGreaterThan(10);

      // Reconstruct and verify
      let reconstructed = '';
      for (let i = 0; i < numChunks; i++) {
        reconstructed += syncStore[`hugePayload_chunk_${i}`] as string;
      }
      expect(JSON.parse(reconstructed)).toEqual(data);
    });

    it('cleans up old chunks when switching from chunked to non-chunked', () => {
      // First, store large data (creates chunks)
      const largeData = makeLargeData(10);
      setChunkedData('configData', largeData);

      const numChunks = syncStore['configData_chunks'] as number;
      expect(numChunks).toBeGreaterThan(1);

      // Now store small data under the same key
      const smallData = makeSmallData();
      setChunkedData('configData', smallData);

      // Small data should be stored directly
      expect(syncStore['configData']).toEqual(smallData);
      expect(syncStore['configData_chunked']).toBe(false);

      // Old chunks should be cleaned up (async, but our mock is sync)
      for (let i = 0; i < numChunks; i++) {
        expect(syncStore[`configData_chunk_${i}`]).toBeUndefined();
      }
    });

    it('handles data with special characters in keys and values', () => {
      const data: Record<string, unknown> = {
        'X-Custom-Header: with colons': 'value with "quotes" and \'apostrophes\'',
        'unicode-key-\u00e9\u00e8\u00ea': '\u2603 snowman \u2764 heart',
        'emoji-key': 'value with newlines\n\ttabs\r\nand more',
      };
      const callback = vi.fn();

      setChunkedData('specialChars', data, callback);

      expect(syncStore['specialChars']).toEqual(data);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('works without a callback', () => {
      const data = makeSmallData();

      expect(() => setChunkedData('noCallback', data)).not.toThrow();

      expect(syncStore['noCallback']).toEqual(data);
    });
  });

  describe('getChunkedData', () => {
    it('retrieves non-chunked data directly', () => {
      const data = makeSmallData();
      syncStore['userProfile'] = data;
      syncStore['userProfile_chunked'] = false;

      const callback = vi.fn();
      getChunkedData('userProfile', callback);

      expect(callback).toHaveBeenCalledWith(data);
    });

    it('returns null when key does not exist', () => {
      const callback = vi.fn();
      getChunkedData('nonExistentKey', callback);

      expect(callback).toHaveBeenCalledWith(null);
    });

    it('reconstructs chunked data from multiple chunks', () => {
      const data = makeLargeData(10);

      // Store it chunked
      setChunkedData('chunkedHeaders', data);

      // Now retrieve it
      const callback = vi.fn();
      getChunkedData('chunkedHeaders', callback);

      expect(callback).toHaveBeenCalledWith(data);
    });

    it('returns null when chunked data has corrupted JSON', () => {
      syncStore['corrupt_chunked'] = true;
      syncStore['corrupt_chunks'] = 2;
      syncStore['corrupt_chunk_0'] = '{"broken":';
      syncStore['corrupt_chunk_1'] = 'not valid json}}}';

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const callback = vi.fn();
      getChunkedData('corrupt', callback);

      expect(callback).toHaveBeenCalledWith(null);
      consoleSpy.mockRestore();
    });

    it('reconstructs data when some chunks are empty strings', () => {
      syncStore['partial_chunked'] = true;
      syncStore['partial_chunks'] = 3;
      syncStore['partial_chunk_0'] = '{"id":"abc",';
      // chunk_1 is missing — getChunkedData uses || '' for missing chunks
      syncStore['partial_chunk_2'] = '"extra":"val"}';

      const callback = vi.fn();
      getChunkedData('partial', callback);

      // Missing chunk_1 concatenates as empty string: '{"id":"abc",' + '' + '"extra":"val"}'
      // This happens to be valid JSON
      expect(callback).toHaveBeenCalledWith({ id: 'abc', extra: 'val' });
    });

    it('handles zero chunks', () => {
      syncStore['empty_chunked'] = true;
      syncStore['empty_chunks'] = 0;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const callback = vi.fn();
      getChunkedData('empty', callback);

      // Empty string -> JSON.parse('') throws
      expect(callback).toHaveBeenCalledWith(null);
      consoleSpy.mockRestore();
    });

    it('retrieves data that was stored directly without _chunked flag', () => {
      syncStore['legacyData'] = { id: 'c9a1f2b3-d4e5-6789-0abc-def012345678', name: 'Legacy Config' };

      const callback = vi.fn();
      getChunkedData('legacyData', callback);

      // _chunked is falsy so it returns result[key] directly
      expect(callback).toHaveBeenCalledWith({
        id: 'c9a1f2b3-d4e5-6789-0abc-def012345678',
        name: 'Legacy Config',
      });
    });

    it('round-trips data with special characters through chunking', () => {
      const data: Record<string, unknown> = {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhY21lIn0.stub-sig',
        'X-Request-Id': 'req_7f3a2b1c-d4e5-6789-abcd-ef0123456789',
        'notes': 'Contains special chars: <>&"\' and unicode: \u00fc\u00f6\u00e4\u00df',
      };

      setChunkedData('specialRoundTrip', data);

      const callback = vi.fn();
      getChunkedData('specialRoundTrip', callback);

      expect(callback).toHaveBeenCalledWith(data);
    });

    it('uses generic type parameter for typed retrieval', () => {
      type ProfileConfig = Record<string, unknown> & {
        id: string;
        enabled: boolean;
      };

      const data: ProfileConfig = {
        id: 'b2c3d4e5-f6a7-8901-bcde-f01234567890',
        enabled: true,
      };
      syncStore['typedData'] = data;
      syncStore['typedData_chunked'] = false;

      const callback = vi.fn();
      getChunkedData<ProfileConfig>('typedData', callback);

      const result = callback.mock.calls[0][0] as ProfileConfig | null;
      expect(result).not.toBeNull();
      expect(result!.id).toBe('b2c3d4e5-f6a7-8901-bcde-f01234567890');
      expect(result!.enabled).toBe(true);
    });
  });
});
