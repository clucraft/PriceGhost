import { ReactNode, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <style>{`
        .layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .navbar {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          padding: 0 1rem;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .navbar-content {
          max-width: 1200px;
          margin: 0 auto;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .navbar-brand {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text);
          text-decoration: none;
        }

        .navbar-brand:hover {
          text-decoration: none;
          color: var(--primary);
        }

        .navbar-brand-icon {
          font-size: 1.5rem;
        }

        .navbar-user {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .navbar-email {
          color: var(--text-muted);
          font-size: 0.875rem;
        }

        .theme-toggle {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          padding: 0.5rem;
          cursor: pointer;
          font-size: 1.25rem;
          line-height: 1;
          transition: all 0.2s;
        }

        .theme-toggle:hover {
          border-color: var(--primary);
        }

        .main-content {
          flex: 1;
          padding: 2rem 1rem;
        }

        .main-content-inner {
          max-width: 1200px;
          margin: 0 auto;
        }

        @media (max-width: 640px) {
          .navbar-email {
            display: none;
          }
        }
      `}</style>

      <nav className="navbar">
        <div className="navbar-content">
          <Link to="/" className="navbar-brand">
            <span className="navbar-brand-icon">👻</span>
            <span>PriceGhost</span>
          </Link>

          <div className="navbar-user">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            {user && (
              <>
                <span className="navbar-email">{user.email}</span>
                <button className="btn btn-secondary" onClick={handleLogout}>
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="main-content">
        <div className="main-content-inner">{children}</div>
      </main>
    </div>
  );
}
