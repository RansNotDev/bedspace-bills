import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { login } from '../utils/api';

export default function Login() {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      const parsed = JSON.parse(user);
      navigate(parsed.role === 'admin' ? '/admin' : '/tenant', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      toast.error('Please enter your nickname');
      return;
    }

    setLoading(true);
    try {
      const { data } = await login(nickname.trim());
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success(`Welcome, ${data.user.nickname}!`);
      navigate(data.user.role === 'admin' ? '/admin' : '/tenant', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Check your nickname.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
            <span className="text-3xl">🏠</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bedspace Bill Manager</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in with your nickname</p>
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
              autoComplete="off"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full py-3 text-base"
            disabled={loading}
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

        <p className="text-center text-xs text-gray-400 mt-6">
          Contact your landlord if you don't have a nickname yet.
        </p>
      </div>
    </div>
  );
}
