import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from '../pages/Login';
import { AdminLogin } from '../pages/AdminLogin';
import { Register } from '../pages/Register';
import { DoctorDashboard } from '../pages/DoctorDashboard';
import { PatientDashboard } from '../pages/PatientDashboard';
import { AdminDashboard } from '../pages/AdminDashboard';
import { Unauthorized } from '../pages/Unauthorized';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../context/AuthContext';

export const AppRoutes = () => {
  const { user, isDoctor, isAdmin } = useAuth();

  const getTargetDashboard = () => {
    if (isAdmin) return '/admin-dashboard';
    if (isDoctor) return '/doctor-dashboard';
    return '/patient-dashboard';
  };

  return (
    <Routes>
      {/* Root Redirection */}
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={getTargetDashboard()} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Auth Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route path="/register" element={<Register />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Role-Protected Admin Routes */}
      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Role-Protected Doctor Routes */}
      <Route
        path="/doctor-dashboard"
        element={
          <ProtectedRoute requiredRole="doctor">
            <DoctorDashboard />
          </ProtectedRoute>
        }
      />

      {/* Role-Protected Patient Routes */}
      <Route
        path="/patient-dashboard"
        element={
          <ProtectedRoute requiredRole="patient">
            <PatientDashboard />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
