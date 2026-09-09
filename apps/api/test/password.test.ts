import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password hashing', () => {
  it('uses a salted Argon2id hash', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');

    expect(first).not.toBe(second);
    await expect(verifyPassword(first, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(first, 'wrong password')).resolves.toBe(false);
  });

  it('rejects passwords shorter than 12 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 12 characters');
  });
});
