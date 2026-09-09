import {
  AuthResponseSchema,
  type AuthResponse,
  type LoginInput,
} from '@memory/contracts/auth';

export async function login(input: LoginInput): Promise<AuthResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error('INVALID_CREDENTIALS');
  return AuthResponseSchema.parse(await response.json());
}

export async function getSession(): Promise<AuthResponse | null> {
  const response = await fetch('/api/auth/session', { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('SESSION_REQUEST_FAILED');
  return AuthResponseSchema.parse(await response.json());
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('LOGOUT_FAILED');
}
