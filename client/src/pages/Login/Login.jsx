import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { login } from '../../services/api';
import { setToken, setUser } from '../../services/auth';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await login({ email, password });
      const token = response?.token || response?.data?.token;
      const user = response?.user || response?.data?.user;
      if (token) {
        setToken(token);
        if (user) setUser(user);
        window.location.href = '/dashboard';
      } else {
        setError(response?.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-ambient-spotlight" />
      <div className="glass-panel auth-card">
        <div className="auth-header">
          <div className="auth-icon-ring">
            <Lock size={20} className="auth-lock-icon" />
          </div>
          <h2 className="auth-title">Sign in to AcquiSense</h2>
          <div className="auth-subtitle">
            <ShieldCheck size={13} />
            <span>256-Bit Encrypted Virtual Data Room Access</span>
          </div>
        </div>

        {error && (
          <div className="auth-banner auth-banner--error">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Corporate Email</label>
            <input
              type="email"
              id="email"
              className="glass-input"
              placeholder="analyst@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="password" className="auth-label">Vault Password</label>
            </div>
            <input
              type="password"
              id="password"
              className="glass-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Authenticating Credentials…</span>
              </>
            ) : (
              <>
                <span>Access Diligence Terminal</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            New institutional user? <Link to="/register">Create firm account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}