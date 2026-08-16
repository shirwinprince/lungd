import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight, AlertCircle, Stethoscope, UserCheck, Shield } from 'lucide-react';
import { supabase } from '../services/supabase';
import { GsapPage, GsapButton } from '../components/GsapWrapper';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { login, loginWithGoogle, user, profile } = useAuth();
  const navigate = useNavigate();

  // If user is already logged in (e.g. after OAuth redirect), navigate to dashboard
  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'doctor') {
        navigate('/doctor-dashboard', { replace: true });
      } else {
        navigate('/patient-dashboard', { replace: true });
      }
    }
  }, [user, profile, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      // Navigation will be handled by the useEffect above when profile loads
    } catch (err) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
      setLoading(false);
    }
  };

  const handleQuickDemo = async (role) => {
    if (role === 'admin') {
      setEmail('sujithamahesh25@gmail.com');
      setPassword('Sujitha@2005');
    } else if (role === 'doctor') {
      setEmail('doctor@lungscan.ai');
      setPassword('doctor123');
    } else {
      setEmail('patient@lungscan.ai');
      setPassword('patient123');
    }
  };

  return (
    <GsapPage className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg bg-cyber-card border border-cyber-border rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden hover-lift">
        {/* Decorative ambient gradient */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 mb-4 shadow-lg shadow-cyan-500/20 text-3xl">
            🫁
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">Welcome Back</h2>
          <p className="text-xs text-slate-400 mt-1">Sign in to your Doctor or Patient account</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.org"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-950 border border-cyber-border text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-950 border border-cyber-border text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Google OAuth */}
        {supabase && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
            <button
              onClick={async () => {
                setGoogleLoading(true);
                setError('');
                try {
                  await loginWithGoogle('patient');
                } catch (err) {
                  setError(err.message || 'Google sign-in failed.');
                  setGoogleLoading(false);
                }
              }}
              disabled={googleLoading}
              className="google-auth-btn w-full py-2.5 rounded-xl font-bold bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white flex items-center justify-center gap-3 transition-all disabled:opacity-50 text-sm shadow-sm"
            >
              {googleLoading ? (
                <span className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span className="font-extrabold">Continue with Google</span>
                </>
              )}
            </button>
          </>
        )}

        {/* Dedicated Admin Portal Access Link */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 text-center">
          <Link
            to="/admin-login"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-700 dark:text-purple-300 hover:bg-purple-500/25 text-xs font-bold transition-all shadow-sm"
          >
            <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Switch to Separate Admin Login Portal →
          </Link>
        </div>

        {/* Registration Link */}
        <div className="mt-6 text-center text-xs text-slate-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
            Register here
          </Link>
        </div>
      </div>
    </GsapPage>
  );
};
