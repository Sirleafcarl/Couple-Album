import { password as promptForPassword } from '@inquirer/prompts';
import {
  createDatabase,
  createUserRepository,
  type CreateUserInput,
  type SessionUser,
} from '@memory/db';
import { pathToFileURL } from 'node:url';
import { hashPassword } from '../auth/password.js';
import { parseConfig } from '../config.js';

export type CreateUserArgs = {
  email: string;
  displayName: string;
};

export type CreateUserCommandDependencies = {
  promptPassword(message: string): Promise<string>;
  hashPassword(password: string): Promise<string>;
  createUser(input: CreateUserInput): Promise<SessionUser>;
  writeLine(line: string): void;
};

export function parseCreateUserArgs(args: string[]): CreateUserArgs {
  let email: string | undefined;
  let displayName: string | undefined;
  const flags = args[0] === '--' ? args.slice(1) : args;

  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];

    if (flag !== '--email' && flag !== '--name') {
      throw new Error(`Unknown flag: ${flag ?? ''}`);
    }

    if (!value || value.startsWith('--')) {
      throw new Error('Both --email and --name are required');
    }

    if (flag === '--email') {
      email = value;
    } else {
      displayName = value;
    }
  }

  if (!email || !displayName) {
    throw new Error('Both --email and --name are required');
  }

  return { email, displayName };
}

export async function runCreateUserCommand(
  args: CreateUserArgs,
  dependencies: CreateUserCommandDependencies,
): Promise<void> {
  const firstPassword = await dependencies.promptPassword('Password');
  const secondPassword = await dependencies.promptPassword('Repeat password');

  if (firstPassword !== secondPassword) {
    throw new Error('Passwords do not match');
  }

  const passwordHash = await dependencies.hashPassword(firstPassword);
  const user = await dependencies.createUser({
    email: args.email,
    displayName: args.displayName,
    passwordHash,
  });

  dependencies.writeLine(`Created user: ${user.displayName} <${user.email}>`);
}

async function main(): Promise<void> {
  const args = parseCreateUserArgs(process.argv.slice(2));
  const config = parseConfig(process.env);
  const database = createDatabase(config.databaseUrl);
  const users = createUserRepository(database.db);

  try {
    await runCreateUserCommand(args, {
      promptPassword: (message) => promptForPassword({ message, mask: '*' }),
      hashPassword,
      createUser: (input) => users.create(input),
      writeLine: (line) => process.stdout.write(`${line}\n`),
    });
  } finally {
    await database.close();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
