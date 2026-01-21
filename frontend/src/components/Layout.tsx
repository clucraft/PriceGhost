import { ReactNode, useState, useEffect, useRef } from 'react';
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          padding: 0 0.75rem;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
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

        .user-dropdown {
          position: relative;
        }

        .user-dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0 0.75rem;
          height: 42px;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .user-dropdown-trigger:hover {
          border-color: var(--primary);
        }

        .user-dropdown-avatar {
          width: 28px;
          height: 28px;
          background: var(--primary);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .user-dropdown-email {
          color: var(--text);
          font-size: 0.875rem;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .user-dropdown-arrow {
          color: var(--text-muted);
          transition: transform 0.2s;
        }

        .user-dropdown-trigger.open .user-dropdown-arrow {
          transform: rotate(180deg);
        }

        .user-dropdown-menu {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          min-width: 200px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          z-index: 1000;
        }

        .user-dropdown-menu-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--text);
          text-decoration: none;
          transition: background 0.2s;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          cursor: pointer;
          font-size: 0.875rem;
        }

        .user-dropdown-menu-item:hover {
          background: var(--background);
          text-decoration: none;
        }

        .user-dropdown-menu-item svg {
          width: 18px;
          height: 18px;
          color: var(--text-muted);
        }

        .user-dropdown-divider {
          height: 1px;
          background: var(--border);
          margin: 0.25rem 0;
        }

        .user-dropdown-menu-item.danger {
          color: var(--danger);
        }

        .user-dropdown-menu-item.danger svg {
          color: var(--danger);
        }

        @media (max-width: 640px) {
          .navbar-email, .user-dropdown-email {
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
              <div className="user-dropdown" ref={dropdownRef}>
                <button
                  className={`user-dropdown-trigger ${isDropdownOpen ? 'open' : ''}`}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span className="user-dropdown-avatar">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="user-dropdown-email">{user.email}</span>
                  <svg
                    className="user-dropdown-arrow"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" />
                  </svg>
                </button>
                {isDropdownOpen && (
                  <div className="user-dropdown-menu">
                    <Link
                      to="/settings"
                      className="user-dropdown-menu-item"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Settings
                    </Link>
                    <div className="user-dropdown-divider" />
                    <button
                      className="user-dropdown-menu-item danger"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        handleLogout();
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
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
