import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './base';

describe('resolveApiBase', () => {
  it('uses the base the Mac app injects', () => {
    expect(resolveApiBase('http://127.0.0.1:7481/api', 'http://example/api')).toBe('http://127.0.0.1:7481/api');
  });

  it('falls back to VITE_API_BASE', () => {
    expect(resolveApiBase(undefined, 'http://example/api')).toBe('http://example/api');
  });

  it('falls back to the Vite proxy', () => {
    expect(resolveApiBase(undefined, undefined)).toBe('/api');
    expect(resolveApiBase('', '')).toBe('/api');
  });
});
