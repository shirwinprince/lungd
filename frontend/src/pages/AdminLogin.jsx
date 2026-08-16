import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, Key, CheckCircle2 } from 'lucide-react';
import { GsapPage, GsapButton } from '../components/GsapWrapper';

export const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email || 'sujithamahesh25@gmail.com', password);
      navigate('/admin-dashboard');
    } catch (err) {
      setError(err.message || 'Invalid Admin credentials. Please check your system password.');
    } finally {
      setLoading(false);
    }
  };

  const fillConfidentialPassword = () => {
    setEmail('sujithamahesh25@gmail.com');
    setPassword('Sujitha@2005');
  };

  return (
    <GsapPage className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-cyber-card border border-purple-500/40 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden hover-lift">
        {/* Decorative ambient gradient */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 mb-4 shadow-lg shadow-purple-500/30 text-white text-3xl">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">System Admin Portal</h2>
          <p className="text-xs text-purple-300 mt-1">Superuser Access & Infrastructure Management</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Administrator Access Identifier
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3.5 top-3 text-purple-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter Administrator Email"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-cyber-border text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Admin Confidential Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3 text-purple-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-cyber-border text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:opacity-95 text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 transition-all text-sm disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Authenticate Admin Session</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Autofill for System Admin */}
        <div className="mt-6 pt-5 border-t border-slate-800 text-center space-y-3">
          <button
            type="button"
            onClick={fillConfidentialPassword}
            className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-xs font-semibold flex items-center justify-center gap-2 transition-all mx-auto"
          >
            <Key className="w-3.5 h-3.5" />
            Autofill System Master Access Keys
          </button>

          <div className="pt-2">
            <Link
              to="/login"
              className="text-xs text-slate-400 hover:text-white transition-all underline font-medium"
            >
              ← Back to Doctor & Patient Portal Login
            </Link>
          </div>
        </div>
      </div>
    </GsapPage>
  );
};
