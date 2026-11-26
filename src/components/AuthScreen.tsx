import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { SCHOOL_NAME, SCHOOL_LOGO_URL, SCHOOL_LOGO_FALLBACK_URL } from '../utils/seedData';
import type { AuthUser } from '../utils/auth';
import type { NurseDatabase } from '../utils/nurseLogic';

export interface LoginSuccessPayload {
  token: string;
  expiresAt?: string;
  user: AuthUser;
  db?: NurseDatabase;
  updatedAt?: string;
  appsScriptUrl?: string;
  isCustomAppsScriptUrl?: boolean;
  autoSyncEnabled?: boolean;
  lastSheetsSyncAt?: string;
  lastSheetsSyncMessage?: string;
}

interface AuthScreenProps {
  onLoginSuccess: (payload: LoginSuccessPayload) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password) {
      setErrorMessage('Please enter both your username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? ((await res.json()) as Record<string, unknown>)
        : null;

      if (!res.ok || !data || data.status !== 'ok' || !data.token || !data.user) {
        const msg =
          (data && typeof data.message === 'string' && data.message) ||
          'Incorrect username or password. Please try again.';
        setErrorMessage(msg);
        return;
      }

      onLoginSuccess({
        token: String(data.token),
        expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
        user: data.user as AuthUser,
        db: data.db as NurseDatabase | undefined,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        appsScriptUrl: typeof data.appsScriptUrl === 'string' ? data.appsScriptUrl : undefined,
        isCustomAppsScriptUrl:
          typeof data.isCustomAppsScriptUrl === 'boolean' ? data.isCustomAppsScriptUrl : undefined,
        autoSyncEnabled:
          typeof data.autoSyncEnabled === 'boolean' ? data.autoSyncEnabled : undefined,
        lastSheetsSyncAt:
          typeof data.lastSheetsSyncAt === 'string' ? data.lastSheetsSyncAt : undefined,
        lastSheetsSyncMessage:
          typeof data.lastSheetsSyncMessage === 'string' ? data.lastSheetsSyncMessage : undefined,
      });
    } catch {
      setErrorMessage('Unable to reach authentication server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-7 pt-8 pb-6 text-center">
            <img
              src={SCHOOL_LOGO_URL}
              alt={`${SCHOOL_NAME} Crest`}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = SCHOOL_LOGO_FALLBACK_URL;
              }}
              className="w-14 h-14 rounded-full object-contain bg-white border border-zinc-200/80 p-0.5 mx-auto mb-4"
            />
            <h1 className="text-xl font-semibold text-zinc-950 font-display tracking-tight">
              {SCHOOL_NAME}
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Sign in to the school infirmary portal
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-7 pb-8 space-y-4">
            {errorMessage && (
              <div
                role="alert"
                data-testid="login-error-banner"
                className="p-3 bg-rose-50/80 border border-rose-200/80 rounded-xl flex items-start gap-2.5 text-xs text-rose-800"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  id="login-username"
                  data-testid="login-username-input"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter username"
                  className="w-full h-10 pl-10 pr-3.5 text-sm text-zinc-900 bg-zinc-50/60 border border-zinc-200/90 rounded-xl placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  id="login-password"
                  data-testid="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter password"
                  className="w-full h-10 pl-10 pr-10 text-sm text-zinc-900 bg-zinc-50/60 border border-zinc-200/90 rounded-xl placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-2.5 p-0.5 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                data-testid="login-submit-button"
                disabled={isSubmitting}
                className="w-full h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
              >
                <span>{isSubmitting ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
