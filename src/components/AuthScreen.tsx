import React, { useState } from 'react';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { authenticateUser, type AuthUser } from '../utils/auth';
import { SCHOOL_NAME, SCHOOL_LOGO_URL, SCHOOL_LOGO_FALLBACK_URL } from '../utils/seedData';

interface AuthScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    setTimeout(() => {
      const user = authenticateUser(username, password);
      if (user) {
        onLoginSuccess(user);
      } else {
        setErrorMessage('Invalid username or password');
        setIsSubmitting(false);
      }
    }, 150);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FBFAF8] text-zinc-900 font-sans selection:bg-teal-100 selection:text-teal-900 px-4 py-8">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Blended School Logo without bounding box */}
        <img
          src={SCHOOL_LOGO_URL}
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== SCHOOL_LOGO_FALLBACK_URL) {
              target.src = SCHOOL_LOGO_FALLBACK_URL;
            }
          }}
          alt={SCHOOL_NAME}
          className="h-20 w-auto object-contain mix-blend-multiply drop-shadow-[0_2px_8px_rgba(0,0,0,0.06)] select-none"
        />

        {/* School Name */}
        <h1 className="mt-3 text-lg sm:text-xl font-bold font-display tracking-tight text-zinc-900 text-center">
          {SCHOOL_NAME}
        </h1>

        {/* Minimalist Card */}
        <div className="w-full mt-6 bg-white border border-stone-200/90 rounded-2xl p-6 sm:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          {errorMessage && (
            <div className="mb-4 py-2 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center animate-in fade-in duration-150">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Username Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="auth-username"
                type="text"
                autoFocus
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full pl-10 pr-3.5 py-2.5 bg-stone-50/60 focus:bg-white text-zinc-900 text-sm rounded-xl border border-stone-200 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none transition-all placeholder:text-zinc-400"
              />
            </div>

            {/* Password Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full pl-10 pr-10 py-2.5 bg-stone-50/60 focus:bg-white text-zinc-900 text-sm rounded-xl border border-stone-200 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none transition-all placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Log In Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] text-white text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Logging in...' : 'Log In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
