import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  settingsApi,
  profileApi,
  adminApi,
  NotificationSettings,
  UserProfile,
  SystemSettings,
} from '../api/client';

type SettingsSection = 'profile' | 'notifications' | 'admin';

export default function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Notification state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isTesting, setIsTesting] = useState<'telegram' | 'discord' | null>(null);

  // Admin state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [profileRes, notificationsRes] = await Promise.all([
        profileApi.get(),
        settingsApi.getNotifications(),
      ]);
      setProfile(profileRes.data);
      setProfileName(profileRes.data.name || '');
      setNotificationSettings(notificationsRes.data);
      if (notificationsRes.data.telegram_chat_id) {
        setTelegramChatId(notificationsRes.data.telegram_chat_id);
      }
    } catch {
      setError('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (!profile?.is_admin) return;
    setIsLoadingAdmin(true);
    try {
      const [usersRes, settingsRes] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getSettings(),
      ]);
      setUsers(usersRes.data);
      setSystemSettings(settingsRes.data);
    } catch {
      setError('Failed to load admin data');
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'admin' && profile?.is_admin && users.length === 0) {
      fetchAdminData();
    }
  }, [activeSection, profile]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // Profile handlers
  const handleSaveProfile = async () => {
    clearMessages();
    setIsSavingProfile(true);
    try {
      const response = await profileApi.update({ name: profileName });
      setProfile(response.data);
      setSuccess('Profile updated successfully');
    } catch {
      setError('Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    clearMessages();
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setIsChangingPassword(true);
    try {
      await profileApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password changed successfully');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Notification handlers
  const handleSaveTelegram = async () => {
    clearMessages();
    setIsSavingNotifications(true);
    try {
      const response = await settingsApi.updateNotifications({
        telegram_bot_token: telegramBotToken || null,
        telegram_chat_id: telegramChatId || null,
      });
      setNotificationSettings(response.data);
      setTelegramBotToken('');
      setSuccess('Telegram settings saved successfully');
    } catch {
      setError('Failed to save Telegram settings');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleSaveDiscord = async () => {
    clearMessages();
    setIsSavingNotifications(true);
    try {
      const response = await settingsApi.updateNotifications({
        discord_webhook_url: discordWebhookUrl || null,
      });
      setNotificationSettings(response.data);
      setDiscordWebhookUrl('');
      setSuccess('Discord settings saved successfully');
    } catch {
      setError('Failed to save Discord settings');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleTestTelegram = async () => {
    clearMessages();
    setIsTesting('telegram');
    try {
      await settingsApi.testTelegram();
      setSuccess('Test notification sent to Telegram!');
    } catch {
      setError('Failed to send test notification');
    } finally {
      setIsTesting(null);
    }
  };

  const handleTestDiscord = async () => {
    clearMessages();
    setIsTesting('discord');
    try {
      await settingsApi.testDiscord();
      setSuccess('Test notification sent to Discord!');
    } catch {
      setError('Failed to send test notification');
    } finally {
      setIsTesting(null);
    }
  };

  // Admin handlers
  const handleToggleRegistration = async () => {
    clearMessages();
    setIsSavingAdmin(true);
    try {
      const newValue = systemSettings?.registration_enabled !== 'true';
      const response = await adminApi.updateSettings({ registration_enabled: newValue });
      setSystemSettings(response.data);
      setSuccess(`Registration ${newValue ? 'enabled' : 'disabled'}`);
    } catch {
      setError('Failed to update settings');
    } finally {
      setIsSavingAdmin(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? All their data will be lost.')) {
      return;
    }
    clearMessages();
    try {
      await adminApi.deleteUser(userId);
      setUsers(users.filter(u => u.id !== userId));
      setSuccess('User deleted successfully');
    } catch {
      setError('Failed to delete user');
    }
  };

  const handleToggleAdmin = async (userId: number, currentStatus: boolean) => {
    clearMessages();
    try {
      await adminApi.setUserAdmin(userId, !currentStatus);
      setUsers(users.map(u => u.id === userId ? { ...u, is_admin: !currentStatus } : u));
      setSuccess(`Admin status ${!currentStatus ? 'granted' : 'revoked'}`);
    } catch {
      setError('Failed to update admin status');
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <span className="spinner" style={{ width: '3rem', height: '3rem' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <style>{`
        .settings-container {
          display: flex;
          gap: 2rem;
          min-height: calc(100vh - 200px);
        }

        .settings-sidebar {
          width: 220px;
          flex-shrink: 0;
        }

        .settings-nav {
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          overflow: hidden;
          position: sticky;
          top: 80px;
        }

        .settings-nav-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          color: var(--text);
          text-decoration: none;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 0.9375rem;
        }

        .settings-nav-item:hover {
          background: var(--background);
        }

        .settings-nav-item.active {
          background: var(--primary);
          color: white;
        }

        .settings-nav-item svg {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .settings-content {
          flex: 1;
          min-width: 0;
        }

        .settings-header {
          margin-bottom: 1.5rem;
        }

        .settings-back {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-muted);
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .settings-back:hover {
          color: var(--primary);
          text-decoration: none;
        }

        .settings-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text);
        }

        .settings-section {
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .settings-section-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .settings-section-icon {
          font-size: 1.5rem;
        }

        .settings-section-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text);
        }

        .settings-section-status {
          margin-left: auto;
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .settings-section-status.configured {
          background: #f0fdf4;
          color: #16a34a;
        }

        [data-theme="dark"] .settings-section-status.configured {
          background: rgba(22, 163, 74, 0.2);
          color: #4ade80;
        }

        .settings-section-status.not-configured {
          background: #fef3c7;
          color: #d97706;
        }

        [data-theme="dark"] .settings-section-status.not-configured {
          background: rgba(217, 119, 6, 0.2);
          color: #fbbf24;
        }

        .settings-section-description {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .settings-form-group {
          margin-bottom: 1rem;
        }

        .settings-form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text);
          margin-bottom: 0.375rem;
        }

        .settings-form-group input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 0.375rem;
          background: var(--background);
          color: var(--text);
          font-size: 0.875rem;
        }

        .settings-form-group input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
        }

        .settings-form-group input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-form-group .hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        .settings-form-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .settings-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          background: var(--background);
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }

        .settings-toggle-label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .settings-toggle-title {
          font-weight: 500;
          color: var(--text);
        }

        .settings-toggle-description {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .toggle-switch {
          position: relative;
          width: 48px;
          height: 26px;
          background: var(--border);
          border-radius: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .toggle-switch.active {
          background: var(--primary);
        }

        .toggle-switch::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }

        .toggle-switch.active::after {
          transform: translateX(22px);
        }

        .users-table {
          width: 100%;
          border-collapse: collapse;
        }

        .users-table th,
        .users-table td {
          text-align: left;
          padding: 0.75rem;
          border-bottom: 1px solid var(--border);
        }

        .users-table th {
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .users-table td {
          font-size: 0.875rem;
        }

        .users-table .user-email {
          font-weight: 500;
        }

        .users-table .user-badge {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          border-radius: 1rem;
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .users-table .user-badge.admin {
          background: #dbeafe;
          color: #1d4ed8;
        }

        [data-theme="dark"] .users-table .user-badge.admin {
          background: rgba(29, 78, 216, 0.2);
          color: #60a5fa;
        }

        .users-table .actions {
          display: flex;
          gap: 0.5rem;
        }

        .users-table .btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
        }

        .alert {
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }

        .alert-error {
          background: #fef2f2;
          color: #dc2626;
        }

        [data-theme="dark"] .alert-error {
          background: rgba(220, 38, 38, 0.2);
          color: #f87171;
        }

        .alert-success {
          background: #f0fdf4;
          color: #16a34a;
        }

        [data-theme="dark"] .alert-success {
          background: rgba(22, 163, 74, 0.2);
          color: #4ade80;
        }

        @media (max-width: 768px) {
          .settings-container {
            flex-direction: column;
          }

          .settings-sidebar {
            width: 100%;
          }

          .settings-nav {
            position: static;
            display: flex;
            overflow-x: auto;
          }

          .settings-nav-item {
            flex-shrink: 0;
          }
        }
      `}</style>

      <div className="settings-header">
        <Link to="/" className="settings-back">
          ← Back to Dashboard
        </Link>
        <h1 className="settings-title">Settings</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="settings-container">
        <div className="settings-sidebar">
          <nav className="settings-nav">
            <button
              className={`settings-nav-item ${activeSection === 'profile' ? 'active' : ''}`}
              onClick={() => { setActiveSection('profile'); clearMessages(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Profile
            </button>
            <button
              className={`settings-nav-item ${activeSection === 'notifications' ? 'active' : ''}`}
              onClick={() => { setActiveSection('notifications'); clearMessages(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Notifications
            </button>
            {profile?.is_admin && (
              <button
                className={`settings-nav-item ${activeSection === 'admin' ? 'active' : ''}`}
                onClick={() => { setActiveSection('admin'); clearMessages(); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Admin
              </button>
            )}
          </nav>
        </div>

        <div className="settings-content">
          {activeSection === 'profile' && (
            <>
              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">👤</span>
                  <h2 className="settings-section-title">Profile Information</h2>
                </div>
                <p className="settings-section-description">
                  Update your display name and email preferences.
                </p>

                <div className="settings-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    disabled
                  />
                  <p className="hint">Email cannot be changed</p>
                </div>

                <div className="settings-form-group">
                  <label>Display Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>

                <div className="settings-form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">🔒</span>
                  <h2 className="settings-section-title">Change Password</h2>
                </div>
                <p className="settings-section-description">
                  Update your password to keep your account secure.
                </p>

                <div className="settings-form-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="settings-form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>

                <div className="settings-form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                <div className="settings-form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !currentPassword || !newPassword}
                  >
                    {isChangingPassword ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeSection === 'notifications' && (
            <>
              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">📱</span>
                  <h2 className="settings-section-title">Telegram Notifications</h2>
                  <span className={`settings-section-status ${notificationSettings?.telegram_configured ? 'configured' : 'not-configured'}`}>
                    {notificationSettings?.telegram_configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <p className="settings-section-description">
                  Receive price drop and back-in-stock alerts via Telegram. You'll need to create a Telegram bot
                  and get your chat ID.
                </p>

                <div className="settings-form-group">
                  <label>Bot Token</label>
                  <input
                    type="password"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder={notificationSettings?.telegram_configured ? '••••••••••••••••' : 'Enter your bot token'}
                  />
                  <p className="hint">Create a bot via @BotFather on Telegram to get a token</p>
                </div>

                <div className="settings-form-group">
                  <label>Chat ID</label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="Enter your chat ID"
                  />
                  <p className="hint">Send /start to @userinfobot to get your chat ID</p>
                </div>

                <div className="settings-form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveTelegram}
                    disabled={isSavingNotifications}
                  >
                    {isSavingNotifications ? 'Saving...' : 'Save Telegram Settings'}
                  </button>
                  {notificationSettings?.telegram_configured && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleTestTelegram}
                      disabled={isTesting === 'telegram'}
                    >
                      {isTesting === 'telegram' ? 'Sending...' : 'Send Test'}
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">💬</span>
                  <h2 className="settings-section-title">Discord Notifications</h2>
                  <span className={`settings-section-status ${notificationSettings?.discord_configured ? 'configured' : 'not-configured'}`}>
                    {notificationSettings?.discord_configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <p className="settings-section-description">
                  Receive price drop and back-in-stock alerts in a Discord channel. Create a webhook in your
                  Discord server settings.
                </p>

                <div className="settings-form-group">
                  <label>Webhook URL</label>
                  <input
                    type="password"
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    placeholder={notificationSettings?.discord_configured ? '••••••••••••••••' : 'https://discord.com/api/webhooks/...'}
                  />
                  <p className="hint">Server Settings → Integrations → Webhooks → New Webhook</p>
                </div>

                <div className="settings-form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveDiscord}
                    disabled={isSavingNotifications}
                  >
                    {isSavingNotifications ? 'Saving...' : 'Save Discord Settings'}
                  </button>
                  {notificationSettings?.discord_configured && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleTestDiscord}
                      disabled={isTesting === 'discord'}
                    >
                      {isTesting === 'discord' ? 'Sending...' : 'Send Test'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeSection === 'admin' && profile?.is_admin && (
            <>
              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">⚙️</span>
                  <h2 className="settings-section-title">System Settings</h2>
                </div>
                <p className="settings-section-description">
                  Configure system-wide settings for PriceGhost.
                </p>

                <div className="settings-toggle">
                  <div className="settings-toggle-label">
                    <span className="settings-toggle-title">User Registration</span>
                    <span className="settings-toggle-description">
                      Allow new users to register accounts
                    </span>
                  </div>
                  <button
                    className={`toggle-switch ${systemSettings?.registration_enabled === 'true' ? 'active' : ''}`}
                    onClick={handleToggleRegistration}
                    disabled={isSavingAdmin}
                  />
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">👥</span>
                  <h2 className="settings-section-title">User Management</h2>
                </div>
                <p className="settings-section-description">
                  Manage user accounts and permissions.
                </p>

                {isLoadingAdmin ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <span className="spinner" />
                  </div>
                ) : (
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td className="user-email">{user.email}</td>
                          <td>{user.name || '-'}</td>
                          <td>
                            {user.is_admin && <span className="user-badge admin">Admin</span>}
                          </td>
                          <td>{new Date(user.created_at).toLocaleDateString()}</td>
                          <td className="actions">
                            {user.id !== profile?.id && (
                              <>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleToggleAdmin(user.id, user.is_admin)}
                                >
                                  {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleDeleteUser(user.id)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {user.id === profile?.id && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                (You)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
