import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import TenantDashboard from './pages/TenantDashboard';
import CalendarPage from './pages/Calendar';
import PaymentLinkPage from './pages/PaymentLinkPage';
import Reports from './pages/Reports';

// Protected route wrapper
function ProtectedRoute({ children, requiredRole }) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token || !userStr) {
    return <Navigate to="/login" replace />;
  }

  const user = JSON.parse(userStr);

  if (requiredRole && user.role !== requiredRole) {
    // Redirect to appropriate dashboard
    return <Navigate to={user.role === 'admin' ? '/admin' : '/tenant'} replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="light"
      />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/pay/:token" element={<PaymentLinkPage />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/calendar"
          element={
            <ProtectedRoute requiredRole="admin">
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute requiredRole="admin">
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* Tenant routes */}
        <Route
          path="/tenant"
          element={
            <ProtectedRoute requiredRole="tenant">
              <TenantDashboard />
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function RootRedirect() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token || !userStr) return <Navigate to="/login" replace />;

  const user = JSON.parse(userStr);
  return <Navigate to={user.role === 'admin' ? '/admin' : '/tenant'} replace />;
}
