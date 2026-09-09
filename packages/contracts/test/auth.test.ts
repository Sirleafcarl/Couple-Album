import { describe, expect, it } from 'vitest';
import { LoginInputSchema } from '../src/auth.js';

describe('LoginInputSchema', () => {
  it('normalizes email before validating login input', () => {
    expect(
      LoginInputSchema.parse({
        email: ' ALICE@Example.com ',
        password: 'password',
      }),
    ).toEqual({ email: 'alice@example.com', password: 'password' });
  });

  it('rejects empty and excessively large passwords', () => {
    expect(
      LoginInputSchema.safeParse({ email: 'alice@example.com', password: '' }).success,
    ).toBe(false);
    expect(
      LoginInputSchema.safeParse({ email: 'alice@example.com', password: 'x'.repeat(1025) })
        .success,
    ).toBe(false);
  });
});
