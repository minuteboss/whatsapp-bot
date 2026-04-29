'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { authApi, setTenantId } from '@/lib/api';
import { useApp } from '@/context/AppContext';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { dispatch } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.login(values.email, values.password);
      setTenantId(response.agent.tenant_id ?? null);
      dispatch({ type: 'SET_AGENT', agent: response.agent });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 50%, #F0FDF4 100%)' }}>
      <div className="w-full max-w-md animate-slide-up">
        <div className="card p-8 space-y-8" style={{ borderRadius: 'var(--radius-lg)' }}>
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'var(--color-primary)', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Welcome back</h1>
            <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>Sign in to your support dashboard</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Email Address
              </label>
              <input
                {...register('email')}
                type="email"
                className="w-full border px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2"
                style={{
                  borderColor: 'var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                  background: 'var(--color-surface)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
                placeholder="email@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Password
              </label>
              <input
                {...register('password')}
                type="password"
                className="w-full border px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2"
                style={{
                  borderColor: 'var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                  background: 'var(--color-surface)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="p-3 text-sm text-center" style={{
                background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(220, 38, 38, 0.2)',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 font-semibold text-white text-sm transition-all cursor-pointer"
              style={{
                background: isLoading ? 'var(--color-text-muted)' : 'var(--color-primary)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: isLoading ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.3)',
              }}
              onMouseEnter={(e) => { if (!isLoading) (e.target as HTMLButtonElement).style.background = 'var(--color-primary-hover)'; }}
              onMouseLeave={(e) => { if (!isLoading) (e.target as HTMLButtonElement).style.background = 'var(--color-primary)'; }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
