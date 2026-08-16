import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Stethoscope, User, Mail, Lock, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../services/supabase';
import { GsapPage, GsapButton } from '../components/GsapWrapper';

export const Register = () => {
  const [role, setRole] = useState('patient'); // 'patient' or 'doctor'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [specialization, setSpecialization] = useState('Pulmonology');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { register, loginWithGoogle, user, profile } = useAuth();
  const navigate = useNavigate();

  // Auto-navigate when profile is ready (after register or OAuth)
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
      await register({
        email,
        password,
        fullName,
        role,
        specialization: role === 'doctor' ? specialization : null,
      });

      if (role === 'doctor') {
        navigate('/doctor-dashboard');
      } else {
        navigate('/patient-dashboard');
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GsapPage className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg bg-cyber-card border border-cyber-border rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden hover-lift">
        {/* Decorative ambient gradient */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 mb-4 shadow-lg shadow-cyan-500/20 text-3xl">
            🫁
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">Create Your Account</h2>
          <p className="text-xs text-slate-400 mt-1">Select your role to register on LungScan AI</p>
        </div>

        {/* Role Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-950 border border-cyber-border mb-6">
          <button
            type="button"
            onClick={() => setRole('patient')}
            className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              role === 'patient'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            Patient Registration
          </button>
          <button
            type="button"
            onClick={() => setRole('doctor')}
            className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              role === 'doctor'
                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            Doctor Registration
          </button>
        </div>

        {/* Role-based Information Banner */}
        {role === 'patient' ? (
          <div className="mb-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-start gap-2.5">
            <UserCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-cyan-200">Automatic Doctor Assignment:</strong>
              As a Patient, you will be automatically assigned to the Doctor currently having the least assigned patients (Max 15 capacity per Doctor).
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-start gap-2.5">
            <Stethoscope className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-purple-200">Doctor Patient Limit:</strong>
              Each Doctor account is capped at 15 active assigned patients for high-precision patient care and prompt scan reviews.
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Full Name
            </label>
            <div className="relative">
              <User className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={role === 'doctor' ? 'Dr. Arjun Mehta' : 'Aarav Sharma'}
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-950 border border-cyber-border text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
          </div>

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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-950 border border-cyber-border text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
          </div>

          {role === 'doctor' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Medical Specialization
              </label>
              <select
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-cyber-border text-sm text-white focus:outline-none focus:border-cyan-500 transition-all"
              >
                <option value="Pulmonology">Pulmonology & Respiratory Medicine</option>
                <option value="Radiology">Diagnostic Radiology</option>
                <option value="Critical Care">Intensive Care & Critical Care</option>
                <option value="Internal Medicine">Internal Medicine</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Complete Registration</span>
                <CheckCircle2 className="w-4 h-4" />
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
                  await loginWithGoogle(role, specialization);
                } catch (err) {
                  setError(err.message || 'Google sign-up failed.');
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
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="font-extrabold text-slate-900 dark:text-white">Sign up with Google as {role === 'doctor' ? 'Doctor' : 'Patient'}</span>
                </>
              )}
            </button>
          </>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Already registered?{' '}
          <Link to="/login" className="text-cyan-400 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </GsapPage>
  );
};
