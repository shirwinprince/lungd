import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Unauthorized = () => {
  const { profile, isDoctor } = useAuth();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-cyber-card border border-rose-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4 text-3xl">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h2 className="text-2xl font-extrabold text-rose-400">403 — Access Denied</h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          You do not have permission to view this portal. Your current account role is{' '}
          <strong className="text-white uppercase font-mono">{profile?.role || 'Guest'}</strong>.
        </p>

        <Link
          to={isDoctor ? '/doctor-dashboard' : '/patient-dashboard'}
          className="mt-6 inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold bg-slate-900 border border-cyber-border hover:bg-slate-800 text-white transition-all text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to My Dashboard</span>
        </Link>
      </div>
    </div>
  );
};
