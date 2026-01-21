import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { settingsApi, NotificationSettings } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<'telegram' | 'discord' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await settingsApi.getNotifications();
      setSettings(response.data);
      if (response.data.telegram_chat_id) {
        setTelegramChatId(response.data.telegram_chat_id);
      }
    } catch {
      setError('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTelegram = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await settingsApi.updateNotifications({
        telegram_bot_token: telegramBotToken || null,
        telegram_chat_id: telegramChatId || null,
      });
      setSettings(response.data);
      setTelegramBotToken('');
      setSuccess('Telegram settings saved successfully');
    } catch {
      setError('Failed to save Telegram settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDiscord = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await settingsApi.updateNotifications({
        discord_webhook_url: discordWebhookUrl || null,
      });
      setSettings(response.data);
      setDiscordWebhookUrl('');
      setSuccess('Discord settings saved successfully');
    } catch {
      setError('Failed to save Discord settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsTesting('telegram');
    setError('');
    setSuccess('');
    try {
      await settingsApi.testTelegram();
      setSuccess('Test notification sent to Telegram!');
    } catch {
      setError('Failed to send test notification. Check your settings.');
    } finally {
      setIsTesting(null);
    }
  };

  const handleTestDiscord = async () => {
    setIsTesting('discord');
    setError('');
    setSuccess('');
    try {
      await settingsApi.testDiscord();
      setSuccess('Test notification sent to Discord!');
    } catch {
      setError('Failed to send test notification. Check your webhook URL.');
    } finally {
      setIsTesting(null);
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
        .settings-header {
          margin-bottom: 2rem;
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

        .settings-subtitle {
          color: var(--text-muted);
          margin-top: 0.25rem;
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

        .settings-form-group .hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        .settings-form-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .settings-help-link {
          color: var(--primary);
          font-size: 0.875rem;
        }

        .settings-help-link:hover {
          text-decoration: underline;
        }
      `}</style>

      <div className="settings-header">
        <Link to="/" className="settings-back">
          ← Back to Dashboard
        </Link>
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Configure notifications and preferences</p>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem', background: '#f0fdf4', color: '#16a34a', padding: '0.75rem 1rem', borderRadius: '0.5rem' }}>{success}</div>}

      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">📱</span>
          <h2 className="settings-section-title">Telegram Notifications</h2>
          <span className={`settings-section-status ${settings?.telegram_configured ? 'configured' : 'not-configured'}`}>
            {settings?.telegram_configured ? 'Configured' : 'Not configured'}
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
            placeholder={settings?.telegram_configured ? '••••••••••••••••' : 'Enter your bot token'}
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
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Telegram Settings'}
          </button>
          {settings?.telegram_configured && (
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
          <span className={`settings-section-status ${settings?.discord_configured ? 'configured' : 'not-configured'}`}>
            {settings?.discord_configured ? 'Configured' : 'Not configured'}
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
            placeholder={settings?.discord_configured ? '••••••••••••••••' : 'https://discord.com/api/webhooks/...'}
          />
          <p className="hint">Server Settings → Integrations → Webhooks → New Webhook</p>
        </div>

        <div className="settings-form-actions">
          <button
            className="btn btn-primary"
            onClick={handleSaveDiscord}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Discord Settings'}
          </button>
          {settings?.discord_configured && (
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
    </Layout>
  );
}
