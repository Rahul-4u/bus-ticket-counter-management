import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  Building2,
  Bus,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  User,
} from 'lucide-react';
import firebaseConfig from '../../../firebase-applet-config.json';
import { PublicLayout } from '../../components/website/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import type { UserRole } from '../../types/domain';

const FIREBASE_PROVIDERS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;
const FIREBASE_SETTINGS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  displayName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(8, 'Enter a valid mobile number (e.g. +88017...)'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  companyUnitName: z.string().optional(),
});

const forgotSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

const ROLE_OPTIONS: Array<{
  role: UserRole;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: 'passenger',
    title: 'Passenger',
    subtitle: 'Book seats & e-tickets',
    icon: User,
  },
  {
    role: 'owner',
    title: 'Bus Owner',
    subtitle: 'Manage fleet & trips',
    icon: Bus,
  },
  {
    role: 'admin',
    title: 'Admin',
    subtitle: 'Operations console',
    icon: Shield,
  },
];

interface ParsedAuthError {
  code: string;
  title: string;
  detail: string;
  hostname?: string;
}

function formatFirebaseAuthError(err: unknown): ParsedAuthError {
  const raw = err instanceof Error ? err.message : String(err);
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (raw.includes('auth/unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'Domain not authorized for Google Sign-In yet',
      detail: `Add "${hostname}" to Firebase Console -> Authentication -> Settings -> Authorized domains, or sign up with Email & Password.`,
      hostname,
    };
  }
  if (raw.includes('auth/operation-not-allowed')) {
    return {
      code: 'auth/operation-not-allowed',
      title: 'Email/Password sign-in is disabled in Firebase Console',
      detail:
        'Firebase currently has only Google Sign-In enabled for this project. Enable Email/Password in Firebase Console -> Authentication -> Sign-in method, or use Google Sign-In right below.',
    };
  }
  if (raw.includes('auth/email-already-in-use')) {
    return {
      code: 'auth/email-already-in-use',
      title: 'Account already exists',
      detail: 'This email is already registered. Switch to Sign In or reset your password.',
    };
  }
  if (
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found')
  ) {
    return {
      code: 'auth/invalid-credential',
      title: 'Invalid email or password',
      detail: 'Please check your credentials and try again, or use Forgot Password.',
    };
  }
  if (raw.includes('auth/weak-password')) {
    return {
      code: 'auth/weak-password',
      title: 'Weak password',
      detail: 'Use at least 6 characters for your password.',
    };
  }
  if (raw.includes('auth/popup-closed-by-user') || raw.includes('auth/cancelled-popup-request')) {
    return {
      code: 'auth/popup-closed-by-user',
      title: 'Google sign-in popup closed',
      detail: 'Please allow browser popups and try again.',
    };
  }
  return {
    code: 'unknown',
    title: 'Authentication error',
    detail: raw,
  };
}

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const { profile, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPasswordEmail } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [selectedRole, setSelectedRole] = useState<UserRole>('passenger');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<ParsedAuthError | null>(null);
  const [resetSentEmail, setResetSentEmail] = useState<string | null>(null);

  useEffect(() => {
    setAuthError(null);
    setResetSentEmail(null);
  }, [mode]);

  useEffect(() => {
    if (profile) {
      if (profile.role === 'admin') navigate('/admin', { replace: true });
      else if (profile.role === 'owner') navigate('/owner', { replace: true });
      else if (profile.role === 'counter_staff') navigate('/admin/counter-pos', { replace: true });
      else navigate('/passenger', { replace: true });
    }
  }, [profile, navigate]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  const forgotForm = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
  });

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setAuthError(null);
    try {
      const p = await signInWithGoogle(
        mode === 'register'
          ? {
              requestedRole: selectedRole,
              companyUnitName: registerForm.getValues('companyUnitName'),
              phone: registerForm.getValues('phone'),
            }
          : undefined
      );
      if (p) {
        if (p.adminPendingApproval) {
          notify(
            'Account created as Passenger',
            'info',
            'Your Admin role request has been queued for approval in Operations Console.'
          );
        } else {
          notify(`Welcome, ${p.displayName}`, 'success', `Signed in as ${p.role.toUpperCase()}`);
        }
      }
    } catch (err) {
      const parsed = formatFirebaseAuthError(err);
      setAuthError(parsed);
      notify(parsed.title, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLogin = async (values: z.infer<typeof loginSchema>) => {
    setBusy(true);
    setAuthError(null);
    try {
      const p = await signInWithEmail(values.email, values.password);
      if (p) {
        notify(`Welcome back, ${p.displayName}`, 'success', `Portal: ${p.role.toUpperCase()}`);
      }
    } catch (err) {
      const parsed = formatFirebaseAuthError(err);
      setAuthError(parsed);
      notify(parsed.title, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleEmailRegister = async (values: z.infer<typeof registerSchema>) => {
    setBusy(true);
    setAuthError(null);
    try {
      const p = await signUpWithEmail({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        phone: values.phone,
        requestedRole: selectedRole,
        companyUnitName: values.companyUnitName,
      });
      if (p) {
        if (p.adminPendingApproval) {
          notify(
            'Account Created (Pending Admin Approval)',
            'info',
            'Signed in as Passenger while an administrator reviews your Admin access request.'
          );
        } else {
          notify(
            'Registration Successful',
            'success',
            `Welcome ${p.displayName} (${p.role === 'owner' ? 'Bus Owner' : p.role.toUpperCase()})`
          );
        }
      }
    } catch (err) {
      const parsed = formatFirebaseAuthError(err);
      setAuthError(parsed);
      notify(parsed.title, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (values: z.infer<typeof forgotSchema>) => {
    setBusy(true);
    setAuthError(null);
    try {
      await resetPasswordEmail(values.email);
      setResetSentEmail(values.email);
      notify('Password reset link sent', 'success', 'Check your inbox or spam folder.');
    } catch (err) {
      const parsed = formatFirebaseAuthError(err);
      setAuthError(parsed);
      notify(parsed.title, 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyHostname = async (hostname: string) => {
    try {
      await navigator.clipboard.writeText(hostname);
      notify('Domain copied', 'success', hostname);
    } catch {
      notify('Copy domain manually', 'info', hostname);
    }
  };

  return (
    <PublicLayout>
      <section className="bg-slate-50 dark:bg-slate-950 py-12 sm:py-16 min-h-[78vh] flex items-center transition-colors">
        <div className="max-w-lg w-full mx-auto px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-[#0B1F3A] text-orange-400 flex items-center justify-center mx-auto">
                <Bus className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white font-display">
                {mode === 'register'
                  ? 'Create DeshLine Account'
                  : mode === 'forgot'
                    ? 'Reset Your Password'
                    : 'Sign In to DeshLine'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {mode === 'forgot'
                  ? 'Enter your registered email address and we will send you a recovery link.'
                  : mode === 'register'
                    ? 'Choose your role (Passenger, Bus Owner, or Admin) and register in seconds.'
                    : 'Access your bookings, Bus Owner fleet portal, or Operations Console.'}
              </p>
            </div>

            {/* Mode Tabs (Sign In / Sign Up) */}
            {mode !== 'forgot' && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className={`h-10 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className={`h-10 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-950 text-slate-950 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>
            )}

            {/* Inline Error Alert with Actionable Console Shortcuts */}
            {authError && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-red-800 dark:text-red-300">{authError.title}</p>
                    <p className="text-red-700 dark:text-red-400 leading-relaxed">{authError.detail}</p>
                  </div>
                </div>

                {authError.code === 'auth/operation-not-allowed' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 pl-7">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleGoogleSignIn}
                      className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                      Sign Up with Google Now
                    </button>
                    <a
                      href={FIREBASE_PROVIDERS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-950/60"
                    >
                      Enable Email/Password
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {authError.code === 'auth/unauthorized-domain' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 pl-7">
                    {authError.hostname && (
                      <button
                        type="button"
                        onClick={() => copyHostname(authError.hostname!)}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-mono font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Copy: {authError.hostname}
                      </button>
                    )}
                    <a
                      href={FIREBASE_SETTINGS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-800"
                    >
                      Open Authorized Domains
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Role Selector (visible on Signup) */}
            {mode === 'register' && (
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Account Role
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {ROLE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = selectedRole === opt.role;
                    return (
                      <button
                        key={opt.role}
                        type="button"
                        onClick={() => setSelectedRole(opt.role)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-orange-600 bg-orange-50/70 dark:bg-orange-950/30 dark:border-orange-500 ring-1 ring-orange-500/30'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 mb-1.5 ${
                            active ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        />
                        <p className="text-xs font-bold text-slate-950 dark:text-white">{opt.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                          {opt.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {selectedRole === 'admin' && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
                    Admin privileges apply automatically for verified authorized admin emails; other admin requests are verified by the Operations Console administrator.
                  </p>
                )}
              </div>
            )}

            {/* Primary Google Sign-In Button (Visible immediately without scrolling) */}
            {mode !== 'forgot' && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogleSignIn}
                  className="w-full h-11 rounded-xl bg-[#0B1F3A] hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-orange-400" />
                  {busy
                    ? 'Authenticating...'
                    : mode === 'register'
                      ? `Continue with Google (${
                          selectedRole === 'owner'
                            ? 'Bus Owner'
                            : selectedRole === 'admin'
                              ? 'Admin'
                              : 'Passenger'
                        })`
                      : 'Continue with Google'}
                </button>

                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                  <span className="shrink mx-3 text-xs font-medium text-slate-400 dark:text-slate-500">
                    or with Email &amp; Password
                  </span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                </div>
              </>
            )}

            {/* Sign In Form */}
            {mode === 'login' && (
              <form onSubmit={loginForm.handleSubmit(handleEmailLogin)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      {...loginForm.register('email')}
                      placeholder="you@example.com"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {loginForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <Link to="/forgot-password" className="text-xs font-semibold text-orange-600 hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      {...loginForm.register('password')}
                      placeholder="Enter your password"
                      className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {busy ? 'Signing In...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* Sign Up Form */}
            {mode === 'register' && (
              <form onSubmit={registerForm.handleSubmit(handleEmailRegister)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        {...registerForm.register('displayName')}
                        placeholder="e.g. Tanvir Ahmed"
                        className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      />
                    </div>
                    {registerForm.formState.errors.displayName && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {registerForm.formState.errors.displayName.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Mobile Number
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        {...registerForm.register('phone')}
                        placeholder="+88017XXXXXXXX"
                        className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      />
                    </div>
                    {registerForm.formState.errors.phone && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {registerForm.formState.errors.phone.message}
                      </p>
                    )}
                  </div>
                </div>

                {selectedRole === 'owner' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Fleet / Bus Division Name
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        {...registerForm.register('companyUnitName')}
                        placeholder="e.g. Padma Express Fleet Division"
                        className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      {...registerForm.register('email')}
                      placeholder="you@example.com"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                  </div>
                  {registerForm.formState.errors.email && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {registerForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      {...registerForm.register('password')}
                      placeholder="Minimum 6 characters"
                      className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {registerForm.formState.errors.password && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {registerForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {busy
                    ? 'Creating Account...'
                    : `Create ${
                        selectedRole === 'owner'
                          ? 'Bus Owner'
                          : selectedRole === 'admin'
                            ? 'Admin'
                            : 'Passenger'
                      } Account`}
                </button>
              </form>
            )}

            {/* Forgot Password Form */}
            {mode === 'forgot' && (
              <div className="space-y-4">
                {resetSentEmail ? (
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                      <p className="font-bold">Password reset email sent</p>
                      <p>
                        Check <strong>{resetSentEmail}</strong> for instructions to reset your DeshLine password.
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={forgotForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Registered Email
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          {...forgotForm.register('email')}
                          placeholder="you@example.com"
                          className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        />
                      </div>
                      {forgotForm.formState.errors.email && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {forgotForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold cursor-pointer"
                    >
                      {busy ? 'Sending Reset Link...' : 'Send Password Reset Link'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Footer Link */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              {mode === 'login' ? (
                <>
                  <span>New to DeshLine?</span>
                  <Link to="/register" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  <span>Already have an account?</span>
                  <Link to="/login" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
