import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  login,
  authPreflight,
  requestAdminResetOtp,
  resetAdminPassword,
} from '../utils/api';

export default function Login() {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adminLocked, setAdminLocked] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      const parsed = JSON.parse(user);
      navigate(parsed.role === 'admin' ? '/admin' : '/tenant', { replace: true });
    }
  }, [navigate]);

  const runPreflight = useCallback(async (nick) => {
    const trimmed = nick.trim();
    if (!trimmed) {
      setRequiresPassword(null);
      setAdminLocked(false);
      return;
    }
    try {
      const { data } = await authPreflight(trimmed);
      if (data.found && data.requiresPassword) {
        setRequiresPassword(true);
      } else {
        setRequiresPassword(false);
        setPassword('');
      }
    } catch {
      setRequiresPassword(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runPreflight(nickname), 400);
    return () => clearTimeout(t);
  }, [nickname, runPreflight]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      toast.error('Please enter your nickname');
      return;
    }

    if (requiresPassword && !password) {
      toast.error('Please enter your landlord password');
      return;
    }

    setLoading(true);
    setAdminLocked(false);
    try {
      const { data } = requiresPassword
        ? await login(nickname.trim(), password)
        : await login(nickname.trim());
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success(`Welcome, ${data.user.nickname}!`);
      navigate(data.user.role === 'admin' ? '/admin' : '/tenant', { replace: true });
    } catch (err) {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message || 'Login failed. Check your nickname.';
      toast.error(msg);

      if (code === 'ADMIN_LOCKED') {
        setAdminLocked(true);
      }

      const remaining = err.response?.data?.attemptsRemaining;
      if (typeof remaining === 'number' && remaining > 0) {
        toast.info(`${remaining} attempt(s) left before email reset is required.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetOtp = async () => {
    if (!nickname.trim()) {
      toast.error('Enter your landlord nickname first');
      return;
    }
    setResetLoading(true);
    try {
      const { data } = await requestAdminResetOtp(nickname.trim());
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setResetLoading(true);
    try {
      await resetAdminPassword(nickname.trim(), resetOtp.trim(), newPassword);
      toast.success('Password updated — you can sign in now.');
      setAdminLocked(false);
      setPassword('');
      setResetOtp('');
      setNewPassword('');
      setNewPassword2('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
            <span className="text-3xl">🏠</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bedspace Bill Manager</h1>
          <p className="text-gray-500 text-sm mt-1">
            {requiresPassword
              ? 'Landlord sign-in (nickname + password)'
              : 'Tenants: sign in with nickname only'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="nickname" className="label">
              Nickname
            </label>
            <input
              id="nickname"
              type="text"
              className="input text-base"
              placeholder="Enter your nickname..."
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoFocus
              autoComplete="username"
              disabled={loading}
            />
          </div>

          {requiresPassword === true && (
            <div>
              <label htmlFor="password" className="label">
                Landlord password
              </label>
              <input
                id="password"
                type="password"
                className="input text-base"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full py-3 text-base"
            disabled={loading || requiresPassword === null}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {requiresPassword && adminLocked && (
          <div className="mt-6 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm">
            <p className="font-medium text-amber-900 mb-2">Reset landlord password</p>
            <p className="text-amber-800 mb-3">
              After 3 wrong passwords, request a 6-digit code by email (Gmail must be configured, and{' '}
              <code className="text-xs bg-amber-100 px-1 rounded">ADMIN_PASSWORD_RESET_EMAIL</code> or your
              landlord email in the database).
            </p>
            <button
              type="button"
              onClick={handleSendResetOtp}
              disabled={resetLoading}
              className="w-full mb-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {resetLoading ? 'Sending…' : 'Email me a reset code'}
            </button>
            <form onSubmit={handleResetPassword} className="space-y-2">
              <input
                className="input text-sm"
                placeholder="6-digit code from email"
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value)}
                maxLength={6}
              />
              <input
                type="password"
                className="input text-sm"
                placeholder="New password (8+ chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <input
                type="password"
                className="input text-sm"
                placeholder="Confirm new password"
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-2 rounded-lg border border-amber-700 text-amber-900 text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
              >
                Save new password
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Contact your landlord if you don&apos;t have a nickname yet.
        </p>
      </div>
    </div>
  );
}
