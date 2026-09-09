import { describe, expect, it } from 'vitest';
import {
  parseCreateUserArgs,
  runCreateUserCommand,
  type CreateUserCommandDependencies,
} from '../src/users/create-user.js';

describe('parseCreateUserArgs', () => {
  it('parses the required flags', () => {
    expect(parseCreateUserArgs(['--email', 'a@example.com', '--name', 'Alice'])).toEqual({
      email: 'a@example.com',
      displayName: 'Alice',
    });
  });

  it('accepts the pnpm argument separator', () => {
    expect(parseCreateUserArgs(['--', '--email', 'a@example.com', '--name', 'Alice'])).toEqual({
      email: 'a@example.com',
      displayName: 'Alice',
    });
  });

  it('rejects missing and unknown flags', () => {
    expect(() => parseCreateUserArgs(['--email', 'a@example.com'])).toThrow(
      'Both --email and --name are required',
    );
    expect(() => parseCreateUserArgs(['--wat', 'value'])).toThrow('Unknown flag: --wat');
  });
});

describe('runCreateUserCommand', () => {
  it('rejects mismatched passwords before creating a user', async () => {
    const answers = ['a secure password', 'a different password'];
    let created = false;
    const dependencies: CreateUserCommandDependencies = {
      promptPassword: async () => answers.shift() ?? '',
      hashPassword: async () => 'unused',
      createUser: async () => {
        created = true;
        throw new Error('must not be called');
      },
      writeLine: () => undefined,
    };

    await expect(
      runCreateUserCommand(
        { email: 'a@example.com', displayName: 'Alice' },
        dependencies,
      ),
    ).rejects.toThrow('Passwords do not match');
    expect(created).toBe(false);
  });

  it('hashes the password and prints only non-secret account details', async () => {
    const clearTextPassword = 'a secure password';
    const output: string[] = [];
    let storedPasswordHash = '';
    const dependencies: CreateUserCommandDependencies = {
      promptPassword: async () => clearTextPassword,
      hashPassword: async () => 'argon2-hash',
      createUser: async (input) => {
        storedPasswordHash = input.passwordHash;
        return { id: 'user-id', email: input.email, displayName: input.displayName };
      },
      writeLine: (line) => output.push(line),
    };

    await runCreateUserCommand(
      { email: 'a@example.com', displayName: 'Alice' },
      dependencies,
    );

    expect(storedPasswordHash).toBe('argon2-hash');
    expect(output.join('\n')).toContain('a@example.com');
    expect(output.join('\n')).toContain('Alice');
    expect(output.join('\n')).not.toContain(clearTextPassword);
  });
});
