import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, UserPlus, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { register } from '../../services/api';
import { setToken, setUser } from '../../services/auth';
import './Register.css';

export default function Register() {
  const [companyName, setCompanyName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Reset notification if inputs change
    if (error) setError('');
  }, [companyName, adminEmail, adminPassword, adminName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await register({
        companyName,
        adminEmail,
        adminPassword,
        adminName,
      });
      const token = response?.token || response?.data?.token;
      const user = response?.user || response?.data?.user;
      if (token) {
        setToken(token);
        if (user) setUser(user);
        setSuccess('Firm vault account provisioned! Redirecting to command dashboard…');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1200);
      } else {
        setError(response?.error || 'Account creation rejected.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Registration error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-ambient-spotlight" />
      <div className="glass-panel auth-card auth-card--register">
        <div className="auth-header">
          <div className="auth-icon-ring">
            <UserPlus size={20} className="auth-lock-icon" />
          </div>
          <h2 className="auth-title">Initialize AcquiSense Vault</h2>
          <div className="auth-subtitle">
            <ShieldCheck size={13} />
            <span>Create your firm organization and primary administrator key</span>
          </div>
        </div>

        {success && (
          <div className="auth-banner auth-banner--success">
            <CheckCircle2 size={16} style={{ marginRight: '8px', flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="auth-banner auth-banner--error">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="companyName" className="auth-label">Firm / Fund Name</label>
            <input
              type="text"
              id="companyName"
              className="glass-input"
              placeholder="e.g. Apex Horizon Capital"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="adminName" className="auth-label">Administrator Full Name</label>
            <input
              type="text"
              id="adminName"
              className="glass-input"
              placeholder="Alexander Wright, Partner"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="adminEmail" className="auth-label">Corporate Email</label>
            <input
              type="email"
              id="adminEmail"
              className="glass-input"
              placeholder="partner@apexhorizon.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="adminPassword" className="auth-label">Administrator Vault Password</label>
            <input
              type="password"
              id="adminPassword"
              className="glass-input"
              placeholder="Minimum 8 characters"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              minLength="8"
            />
          </div>

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Provisioning Firm Vault…</span>
              </>
            ) : (
              <>
                <span>Provision Organization Access</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already provisioned? <Link to="/login">Sign in to existing vault</Link>
          </p>
        </div>
      </div>
    </div>
  );
}