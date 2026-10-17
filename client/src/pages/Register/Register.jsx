import React, { useState, useEffect } from 'react';
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
    // Clear success message when fields change
    const clearSuccess = () => setSuccess('');
    // We'll implement this by resetting success on any change, but for simplicity we'll do it in each handler
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
        adminName
      });
      const token = response?.token || response?.data?.token;
      const user = response?.user || response?.data?.user;
      if (token) {
        setToken(token);
        if (user) setUser(user);
        setSuccess('Registration successful! Redirecting to dashboard...');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1200);
      } else {
        setError(response?.error || 'Registration failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <h2>Create your AcquiSense account</h2>
        <p className="register-subtitle">
          Enter your company details and create an admin user to get started.
        </p>
        {success && <div className="form-success">{success}</div>}
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="companyName">Company Name</label>
            <input
              type="text"
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="adminName">Admin Full Name</label>
            <input
              type="text"
              id="adminName"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="adminEmail">Admin Email</label>
            <input
              type="email"
              id="adminEmail"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="adminPassword">Password</label>
            <input
              type="password"
              id="adminPassword"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              minLength="8"
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <div className="register-footer">
          <p>
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}