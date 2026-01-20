import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';

interface AuthFormProps {
  mode: 'login' | 'register';
  onSubmit: (email: string, password: string) => Promise<void>;
}

export default function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await onSubmit(email, password);
    } catch (err) {
      if (err instanceof Error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axiosError = err as any;
        setError(axiosError.response?.data?.error || 'An error occurred');
      } else {
        setError('An error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <style>{`
        .auth-form-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .auth-form-card {
          width: 100%;
          max-width: 400px;
          background: var(--surface);
          border-radius: 1rem;
          box-shadow: var(--shadow-lg);
          padding: 2rem;
        }

        .auth-form-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .auth-form-logo {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
        }

        .auth-form-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text);
        }

        .auth-form-subtitle {
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        .auth-form-footer {
          text-align: center;
          margin-top: 1.5rem;
          color: var(--text-muted);
        }

        .auth-form-footer a {
          font-weight: 500;
        }
      `}</style>

      <div className="auth-form-card">
        <div className="auth-form-header">
          <div className="auth-form-logo">👻</div>
          <h1 className="auth-form-title">PriceGhost</h1>
          <p className="auth-form-subtitle">
            {mode === 'login'
              ? 'Sign in to track prices'
              : 'Create your account'}
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="spinner" />
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-form-footer">
          {mode === 'login' ? (
            <>
              Don't have an account? <Link to="/register">Sign up</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
