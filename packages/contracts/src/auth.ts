import { z } from 'zod';

export const LoginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(1024),
});

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
});

export const AuthResponseSchema = z.object({ user: SessionUserSchema });

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type SessionUser = z.infer<typeof SessionUserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
