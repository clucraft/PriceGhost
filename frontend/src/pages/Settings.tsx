import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  settingsApi,
  profileApi,
  adminApi,
  NotificationSettings,
  AISettings,
  UserProfile,
  SystemSettings,
} from '../api/client';

type SettingsSection = 'profile' | 'notifications' | 'ai' | 'admin';

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
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [pushoverUserKey, setPushoverUserKey] = useState('');
  const [pushoverAppToken, setPushoverAppToken] = useState('');
  const [pushoverEnabled, setPushoverEnabled] = useState(true);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isTesting, setIsTesting] = useState<'telegram' | 'discord' | 'pushover' | null>(null);

  // AI state
  const [aiSettings, setAISettings] = useState<AISettings | null>(null);
  const [aiEnabled, setAIEnabled] = useState(false);
  const [aiProvider, setAIProvider] = useState<'anthropic' | 'openai' | 'ollama'>('anthropic');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [isSavingAI, setIsSavingAI] = useState(false);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [testUrl, setTestUrl] = useState('');

  // Admin state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [profileRes, notificationsRes, aiRes] = await Promise.all([
        profileApi.get(),
        settingsApi.getNotifications(),
        settingsApi.getAI(),
      ]);
      setProfile(profileRes.data);
      setProfileName(profileRes.data.name || '');
      setNotificationSettings(notificationsRes.data);
      if (notificationsRes.data.telegram_chat_id) {
        setTelegramChatId(notificationsRes.data.telegram_chat_id);
      }
      setTelegramEnabled(notificationsRes.data.telegram_enabled ?? true);
      setDiscordEnabled(notificationsRes.data.discord_enabled ?? true);
      setPushoverEnabled(notificationsRes.data.pushover_enabled ?? true);
      setAISettings(aiRes.data);
      setAIEnabled(aiRes.data.ai_enabled);
      if (aiRes.data.ai_provider) {
        setAIProvider(aiRes.data.ai_provider);
      }
      if (aiRes.data.ollama_base_url) {
        setOllamaBaseUrl(aiRes.data.ollama_base_url);
      }
      if (aiRes.data.ollama_model) {
        setOllamaModel(aiRes.data.ollama_model);
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

  const handleSavePushover = async () => {
    clearMessages();
    setIsSavingNotifications(true);
    try {
      const response = await settingsApi.updateNotifications({
        pushover_user_key: pushoverUserKey || null,
        pushover_app_token: pushoverAppToken || null,
      });
      setNotificationSettings(response.data);
      setPushoverUserKey('');
      setPushoverAppToken('');
      setSuccess('Pushover settings saved successfully');
    } catch {
      setError('Failed to save Pushover settings');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleTestPushover = async () => {
    clearMessages();
    setIsTesting('pushover');
    try {
      await settingsApi.testPushover();
      setSuccess('Test notification sent to Pushover!');
    } catch {
      setError('Failed to send test notification');
    } finally {
      setIsTesting(null);
    }
  };

  const handleToggleTelegram = async (enabled: boolean) => {
    setTelegramEnabled(enabled);
    try {
      const response = await settingsApi.updateNotifications({ telegram_enabled: enabled });
      setNotificationSettings(response.data);
    } catch {
      setTelegramEnabled(!enabled);
      setError('Failed to update Telegram status');
    }
  };

  const handleToggleDiscord = async (enabled: boolean) => {
    setDiscordEnabled(enabled);
    try {
      const response = await settingsApi.updateNotifications({ discord_enabled: enabled });
      setNotificationSettings(response.data);
    } catch {
      setDiscordEnabled(!enabled);
      setError('Failed to update Discord status');
    }
  };

  const handleTogglePushover = async (enabled: boolean) => {
    setPushoverEnabled(enabled);
    try {
      const response = await settingsApi.updateNotifications({ pushover_enabled: enabled });
      setNotificationSettings(response.data);
    } catch {
      setPushoverEnabled(!enabled);
      setError('Failed to update Pushover status');
    }
  };

  // AI handlers
  const handleSaveAI = async () => {
    clearMessages();
    setIsSavingAI(true);
    try {
      const response = await settingsApi.updateAI({
        ai_enabled: aiEnabled,
        ai_provider: aiProvider,
        anthropic_api_key: anthropicApiKey || undefined,
        openai_api_key: openaiApiKey || undefined,
        ollama_base_url: aiProvider === 'ollama' ? ollamaBaseUrl || null : undefined,
        ollama_model: aiProvider === 'ollama' ? ollamaModel || null : undefined,
      });
      setAISettings(response.data);
      setAnthropicApiKey('');
      setOpenaiApiKey('');
      setSuccess('AI settings saved successfully');
    } catch {
      setError('Failed to save AI settings');
    } finally {
      setIsSavingAI(false);
    }
  };

  const handleTestOllama = async () => {
    clearMessages();
    if (!ollamaBaseUrl) {
      setError('Please enter the Ollama base URL');
      return;
    }
    setIsTestingOllama(true);
    try {
      const response = await settingsApi.testOllama(ollamaBaseUrl);
      if (response.data.success) {
        setAvailableOllamaModels(response.data.models || []);
        setSuccess(`Connected to Ollama! Found ${response.data.models?.length || 0} models.`);
      } else {
        setError(response.data.error || 'Failed to connect to Ollama');
      }
    } catch {
      setError('Failed to connect to Ollama. Make sure it is running.');
    } finally {
      setIsTestingOllama(false);
    }
  };

  const handleTestAI = async () => {
    clearMessages();
    if (!testUrl) {
      setError('Please enter a URL to test');
      return;
    }
    setIsTestingAI(true);
    try {
      const response = await settingsApi.testAI(testUrl);
      if (response.data.success && response.data.price) {
        setSuccess(
          `AI extraction successful! Found: ${response.data.name || 'Unknown'} - ` +
          `${response.data.price.currency} ${response.data.price.price.toFixed(2)} ` +
          `(confidence: ${(response.data.confidence * 100).toFixed(0)}%)`
        );
      } else {
        setError('AI could not extract price from this URL');
      }
    } catch {
      setError('Failed to test AI extraction');
    } finally {
      setIsTestingAI(false);
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

  const handleCreateUser = async () => {
    clearMessages();
    if (!newUserEmail || !newUserPassword) {
      setError('Email and password are required');
      return;
    }
    if (newUserPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsCreatingUser(true);
    try {
      await adminApi.createUser(newUserEmail, newUserPassword, newUserRole === 'admin');
      // Refresh users list
      const usersRes = await adminApi.getUsers();
      setUsers(usersRes.data);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setShowAddUser(false);
      setSuccess('User created successfully');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to create user');
    } finally {
      setIsCreatingUser(false);
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

  const handleRoleChange = async (userId: number, newRole: 'user' | 'admin') => {
    clearMessages();
    const isAdmin = newRole === 'admin';
    try {
      await adminApi.setUserAdmin(userId, isAdmin);
      setUsers(users.map(u => u.id === userId ? { ...u, is_admin: isAdmin } : u));
      setSuccess(`User role updated to ${newRole}`);
    } catch {
      setError('Failed to update user role');
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
            <button
              className={`settings-nav-item ${activeSection === 'ai' ? 'active' : ''}`}
              onClick={() => { setActiveSection('ai'); clearMessages(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                <path d="M9 14v2" />
                <path d="M15 14v2" />
              </svg>
              AI Extraction
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

                {notificationSettings?.telegram_configured && (
                  <div className="settings-toggle">
                    <div className="settings-toggle-label">
                      <span className="settings-toggle-title">Enable Telegram Notifications</span>
                      <span className="settings-toggle-description">
                        Toggle to enable or disable Telegram alerts
                      </span>
                    </div>
                    <button
                      className={`toggle-switch ${telegramEnabled ? 'active' : ''}`}
                      onClick={() => handleToggleTelegram(!telegramEnabled)}
                    />
                  </div>
                )}

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

                {notificationSettings?.discord_configured && (
                  <div className="settings-toggle">
                    <div className="settings-toggle-label">
                      <span className="settings-toggle-title">Enable Discord Notifications</span>
                      <span className="settings-toggle-description">
                        Toggle to enable or disable Discord alerts
                      </span>
                    </div>
                    <button
                      className={`toggle-switch ${discordEnabled ? 'active' : ''}`}
                      onClick={() => handleToggleDiscord(!discordEnabled)}
                    />
                  </div>
                )}

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

              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">🔔</span>
                  <h2 className="settings-section-title">Pushover Notifications</h2>
                  <span className={`settings-section-status ${notificationSettings?.pushover_configured ? 'configured' : 'not-configured'}`}>
                    {notificationSettings?.pushover_configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <p className="settings-section-description">
                  Receive price drop and back-in-stock alerts via Pushover. You'll need to create a Pushover account
                  and an application to get your keys.
                </p>

                {notificationSettings?.pushover_configured && (
                  <div className="settings-toggle">
                    <div className="settings-toggle-label">
                      <span className="settings-toggle-title">Enable Pushover Notifications</span>
                      <span className="settings-toggle-description">
                        Toggle to enable or disable Pushover alerts
                      </span>
                    </div>
                    <button
                      className={`toggle-switch ${pushoverEnabled ? 'active' : ''}`}
                      onClick={() => handleTogglePushover(!pushoverEnabled)}
                    />
                  </div>
                )}

                <div className="settings-form-group">
                  <label>User Key</label>
                  <input
                    type="password"
                    value={pushoverUserKey}
                    onChange={(e) => setPushoverUserKey(e.target.value)}
                    placeholder={notificationSettings?.pushover_configured ? '••••••••••••••••' : 'Enter your user key'}
                  />
                  <p className="hint">Find your User Key on the Pushover dashboard after logging in</p>
                </div>

                <div className="settings-form-group">
                  <label>Application API Token</label>
                  <input
                    type="password"
                    value={pushoverAppToken}
                    onChange={(e) => setPushoverAppToken(e.target.value)}
                    placeholder={notificationSettings?.pushover_configured ? '••••••••••••••••' : 'Enter your app token'}
                  />
                  <p className="hint">Create an application at pushover.net/apps to get an API token</p>
                </div>

                <div className="settings-form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSavePushover}
                    disabled={isSavingNotifications}
                  >
                    {isSavingNotifications ? 'Saving...' : 'Save Pushover Settings'}
                  </button>
                  {notificationSettings?.pushover_configured && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleTestPushover}
                      disabled={isTesting === 'pushover'}
                    >
                      {isTesting === 'pushover' ? 'Sending...' : 'Send Test'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeSection === 'ai' && (
            <>
              <div className="settings-section">
                <div className="settings-section-header">
                  <span className="settings-section-icon">🤖</span>
                  <h2 className="settings-section-title">AI-Powered Price Extraction</h2>
                  <span className={`settings-section-status ${aiSettings?.ai_enabled ? 'configured' : 'not-configured'}`}>
                    {aiSettings?.ai_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="settings-section-description">
                  Enable AI-powered price extraction for better compatibility with websites that standard scraping can't handle.
                  When enabled, AI will be used as a fallback when regular scraping fails to find a price.
                </p>

                <div className="settings-toggle">
                  <div className="settings-toggle-label">
                    <span className="settings-toggle-title">Enable AI Extraction</span>
                    <span className="settings-toggle-description">
                      Use AI as a fallback when standard scraping fails
                    </span>
                  </div>
                  <button
                    className={`toggle-switch ${aiEnabled ? 'active' : ''}`}
                    onClick={() => setAIEnabled(!aiEnabled)}
                  />
                </div>

                {aiEnabled && (
                  <>
                    <div className="settings-form-group">
                      <label>AI Provider</label>
                      <select
                        value={aiProvider}
                        onChange={(e) => setAIProvider(e.target.value as 'anthropic' | 'openai' | 'ollama')}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          border: '1px solid var(--border)',
                          borderRadius: '0.375rem',
                          background: 'var(--background)',
                          color: 'var(--text)',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="openai">OpenAI (GPT)</option>
                        <option value="ollama">Ollama (Local)</option>
                      </select>
                    </div>

                    {aiProvider === 'anthropic' && (
                      <div className="settings-form-group">
                        <label>Anthropic API Key</label>
                        <input
                          type="password"
                          value={anthropicApiKey}
                          onChange={(e) => setAnthropicApiKey(e.target.value)}
                          placeholder={aiSettings?.anthropic_configured ? '••••••••••••••••' : 'sk-ant-...'}
                        />
                        <p className="hint">
                          Get your API key from{' '}
                          <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
                            console.anthropic.com
                          </a>
                          {aiSettings?.anthropic_configured && ' (key already saved)'}
                        </p>
                      </div>
                    )}

                    {aiProvider === 'openai' && (
                      <div className="settings-form-group">
                        <label>OpenAI API Key</label>
                        <input
                          type="password"
                          value={openaiApiKey}
                          onChange={(e) => setOpenaiApiKey(e.target.value)}
                          placeholder={aiSettings?.openai_configured ? '••••••••••••••••' : 'sk-...'}
                        />
                        <p className="hint">
                          Get your API key from{' '}
                          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                            platform.openai.com
                          </a>
                          {aiSettings?.openai_configured && ' (key already saved)'}
                        </p>
                      </div>
                    )}

                    {aiProvider === 'ollama' && (
                      <>
                        <div className="settings-form-group">
                          <label>Ollama Base URL</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              type="text"
                              value={ollamaBaseUrl}
                              onChange={(e) => setOllamaBaseUrl(e.target.value)}
                              placeholder="http://localhost:11434"
                              style={{ flex: 1 }}
                            />
                            <button
                              className="btn btn-secondary"
                              onClick={handleTestOllama}
                              disabled={isTestingOllama || !ollamaBaseUrl}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              {isTestingOllama ? 'Testing...' : 'Test Connection'}
                            </button>
                          </div>
                          <p className="hint">
                            The URL where Ollama is running. Default is http://localhost:11434
                          </p>
                        </div>

                        <div className="settings-form-group">
                          <label>Model</label>
                          {availableOllamaModels.length > 0 ? (
                            <select
                              value={ollamaModel}
                              onChange={(e) => setOllamaModel(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.625rem 0.75rem',
                                border: '1px solid var(--border)',
                                borderRadius: '0.375rem',
                                background: 'var(--background)',
                                color: 'var(--text)',
                                fontSize: '0.875rem'
                              }}
                            >
                              <option value="">Select a model...</option>
                              {availableOllamaModels.map((model) => (
                                <option key={model} value={model}>{model}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={ollamaModel}
                              onChange={(e) => setOllamaModel(e.target.value)}
                              placeholder={aiSettings?.ollama_model || 'llama3.2, mistral, etc.'}
                            />
                          )}
                          <p className="hint">
                            {availableOllamaModels.length > 0
                              ? 'Select from available models or test connection to refresh list'
                              : 'Enter model name or test connection to see available models'
                            }
                            {aiSettings?.ollama_configured && ` (currently: ${aiSettings.ollama_model})`}
                          </p>
                        </div>
                      </>
                    )}
                  </>
                )}

                <div className="settings-form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveAI}
                    disabled={isSavingAI}
                  >
                    {isSavingAI ? 'Saving...' : 'Save AI Settings'}
                  </button>
                </div>
              </div>

              {aiSettings?.ai_enabled && (aiSettings.anthropic_configured || aiSettings.openai_configured || aiSettings.ollama_configured) && (
                <div className="settings-section">
                  <div className="settings-section-header">
                    <span className="settings-section-icon">🧪</span>
                    <h2 className="settings-section-title">Test AI Extraction</h2>
                  </div>
                  <p className="settings-section-description">
                    Test AI extraction on a product URL to see if it can successfully extract the price.
                  </p>

                  <div className="settings-form-group">
                    <label>Product URL</label>
                    <input
                      type="url"
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                      placeholder="https://example.com/product"
                    />
                  </div>

                  <div className="settings-form-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={handleTestAI}
                      disabled={isTestingAI || !testUrl}
                    >
                      {isTestingAI ? 'Testing...' : 'Test Extraction'}
                    </button>
                  </div>
                </div>
              )}
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

                {!showAddUser ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowAddUser(true)}
                    style={{ marginBottom: '1rem' }}
                  >
                    + Add User
                  </button>
                ) : (
                  <div className="add-user-form" style={{
                    background: 'var(--background)',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>Add New User</h3>
                    <div className="settings-form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="settings-form-group">
                      <label>Password</label>
                      <input
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                      />
                    </div>
                    <div className="settings-form-group">
                      <label>Role</label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as 'user' | 'admin')}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          border: '1px solid var(--border)',
                          borderRadius: '0.375rem',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="settings-form-actions">
                      <button
                        className="btn btn-primary"
                        onClick={handleCreateUser}
                        disabled={isCreatingUser}
                      >
                        {isCreatingUser ? 'Creating...' : 'Create User'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowAddUser(false);
                          setNewUserEmail('');
                          setNewUserPassword('');
                          setNewUserRole('user');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

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
                            {user.id === profile?.id ? (
                              <span className="user-badge admin">Admin (You)</span>
                            ) : (
                              <select
                                value={user.is_admin ? 'admin' : 'user'}
                                onChange={(e) => handleRoleChange(user.id, e.target.value as 'user' | 'admin')}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  border: '1px solid var(--border)',
                                  borderRadius: '0.25rem',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                  fontSize: '0.75rem'
                                }}
                              >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                              </select>
                            )}
                          </td>
                          <td>{new Date(user.created_at).toLocaleDateString()}</td>
                          <td className="actions">
                            {user.id !== profile?.id && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteUser(user.id)}
                              >
                                Delete
                              </button>
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
