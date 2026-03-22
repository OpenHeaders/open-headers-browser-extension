import { vi } from 'vitest';
import { chrome } from './__mocks__/chrome';

// Make chrome globally available
vi.stubGlobal('chrome', chrome);
