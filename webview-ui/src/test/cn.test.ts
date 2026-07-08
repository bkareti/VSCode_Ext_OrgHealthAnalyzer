import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/cn';

describe('cn()', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('resolves tailwind conflicts — last wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('filters falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });
});
