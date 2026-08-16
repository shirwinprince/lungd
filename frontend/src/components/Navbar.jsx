import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Stethoscope, User, LogOut, Activity, Sun, Moon, Shield } from 'lucide-react';

export const Navbar = () => {
  const { user, profile, logout, isDoctor, isAdmin } = useAuth();
  const { toggleTheme, isLight } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getDashboardPath = () => {
    if (isAdmin) return '/admin-dashboard';
    if (isDoctor) return '/doctor-dashboard';
    return '/patient-dashboard';
  };

  return (
    <nav className="border-b border-cyber-border bg-cyber-bg/95 backdrop-blur-md sticky top-0 z-50 max-w-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-lg shadow-cyan-500/20">
              🫁
            </div>
            <div>
              <span className="text-base sm:text-xl font-extrabold grad-title tracking-tight block">LungScan AI</span>
              <span className="text-[9px] sm:text-[10px] font-mono hidden sm:block text-cyan-400 tracking-wider">v4.5 PRO · MEDICAL APP</span>
            </div>
          </Link>

          {/* Nav Controls */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Theme Toggle Button (Light/Dark) */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-cyber-border text-amber-400 transition-all flex items-center gap-1.5 text-xs font-semibold"
              title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {isLight ? (
                <>
                  <Moon className="w-4 h-4 text-purple-400" />
                  <span className="hidden md:inline text-purple-300">Dark Mode</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden md:inline text-amber-300">Light Mode</span>
                </>
              )}
            </button>

            {user && profile ? (
              <div className="flex items-center gap-1.5 sm:gap-3">
                {/* Role Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/80 border border-cyber-border text-xs font-semibold">
                  {isAdmin ? (
                    <>
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-300 hidden sm:inline">Admin Portal</span>
                    </>
                  ) : isDoctor ? (
                    <>
                      <Stethoscope className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-purple-300 hidden sm:inline">Doctor Mode</span>
                    </>
                  ) : (
                    <>
                      <User className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-cyan-300 hidden sm:inline">Patient Portal</span>
                    </>
                  )}
                </div>

                {/* User Name */}
                <span className="text-sm font-medium text-slate-200 hidden lg:inline max-w-[120px] truncate">
                  {profile.full_name}
                </span>

                {/* Dashboard Quick Link */}
                <Link
                  to={getDashboardPath()}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/20 transition-all flex items-center gap-1"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all text-xs flex items-center gap-1 font-semibold"
                  title="Log Out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-all"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/20 hover:opacity-95 transition-all"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
