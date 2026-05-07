import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AdminBillingHub, {
  BillingIndexRedirect,
  BillingGeneratePage,
  BillingElectricityPage,
  BillingWaterPage,
  BillingDrinkingTrashPage,
  BillingDetailsPage,
  BillingGcashElectricityPage,
  BillingGcashWaterPage,
  BillingGcashPoolsPage,
} from './pages/AdminBillingHub';
import AdminRulesPage from './pages/AdminRulesPage';
import TenantDashboard from './pages/TenantDashboard';
import CalendarPage from './pages/Calendar';
import PaymentLinkPage from './pages/PaymentLinkPage';
import Reports from './pages/Reports';
import SelectBedspace from './pages/SelectBedspace';
import { isStaff } from './utils/authHelpers';

// Protected route wrapper
function ProtectedRoute({ children, requiredStaff, requiredTenant }) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token || !userStr) {
    return <Navigate to="/login" replace />;
  }

  const user = JSON.parse(userStr);

  if (requiredStaff && !isStaff(user)) {
    return <Navigate to="/tenant" replace />;
  }

  if (requiredTenant && user.role !== 'tenant') {
    return <Navigate to={isStaff(user) ? '/admin' : '/tenant'} replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

        {/* Staff */}
        <Route
          path="/admin/select-bedspace"
          element={
            <ProtectedRoute requiredStaff>
              <SelectBedspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredStaff>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/billing"
          element={
            <ProtectedRoute requiredStaff>
              <AdminBillingHub />
            </ProtectedRoute>
          }
        >
          <Route index element={<BillingIndexRedirect />} />
          <Route path="generate" element={<BillingGeneratePage />} />
          <Route path="electricity" element={<BillingElectricityPage />} />
          <Route path="water" element={<BillingWaterPage />} />
          <Route path="drinking-trash" element={<BillingDrinkingTrashPage />} />
          <Route path="details" element={<BillingDetailsPage />} />
          <Route path="gcash-electricity" element={<BillingGcashElectricityPage />} />
          <Route path="gcash-water" element={<BillingGcashWaterPage />} />
          <Route path="gcash-pools" element={<BillingGcashPoolsPage />} />
        </Route>
        <Route
          path="/admin/rules"
          element={
            <ProtectedRoute requiredStaff>
              <AdminRulesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/calendar"
          element={
            <ProtectedRoute requiredStaff>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute requiredStaff>
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* Tenant routes */}
        <Route
          path="/tenant"
          element={
            <ProtectedRoute requiredTenant>
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

  if (isStaff(user) && user.needsBedspaceSelection) {
    return <Navigate to="/admin/select-bedspace" replace />;
  }

  return <Navigate to={isStaff(user) ? '/admin' : '/tenant'} replace />;
}
