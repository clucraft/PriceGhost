import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { userQueries } from '../models';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get notification settings
router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = await userQueries.getNotificationSettings(userId);

    if (!settings) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      telegram_bot_token: settings.telegram_bot_token || null,
      telegram_chat_id: settings.telegram_chat_id || null,
      telegram_enabled: settings.telegram_enabled ?? true,
      discord_webhook_url: settings.discord_webhook_url || null,
      discord_enabled: settings.discord_enabled ?? true,
      pushover_user_key: settings.pushover_user_key || null,
      pushover_app_token: settings.pushover_app_token || null,
      pushover_enabled: settings.pushover_enabled ?? true,
      ntfy_topic: settings.ntfy_topic || null,
      ntfy_enabled: settings.ntfy_enabled ?? true,
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// Update notification settings
router.put('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      telegram_bot_token,
      telegram_chat_id,
      telegram_enabled,
      discord_webhook_url,
      discord_enabled,
      pushover_user_key,
      pushover_app_token,
      pushover_enabled,
      ntfy_topic,
      ntfy_enabled,
    } = req.body;

    const settings = await userQueries.updateNotificationSettings(userId, {
      telegram_bot_token,
      telegram_chat_id,
      telegram_enabled,
      discord_webhook_url,
      discord_enabled,
      pushover_user_key,
      pushover_app_token,
      pushover_enabled,
      ntfy_topic,
      ntfy_enabled,
    });

    if (!settings) {
      res.status(400).json({ error: 'No settings to update' });
      return;
    }

    res.json({
      telegram_bot_token: settings.telegram_bot_token || null,
      telegram_chat_id: settings.telegram_chat_id || null,
      telegram_enabled: settings.telegram_enabled ?? true,
      discord_webhook_url: settings.discord_webhook_url || null,
      discord_enabled: settings.discord_enabled ?? true,
      pushover_user_key: settings.pushover_user_key || null,
      pushover_app_token: settings.pushover_app_token || null,
      pushover_enabled: settings.pushover_enabled ?? true,
      ntfy_topic: settings.ntfy_topic || null,
      ntfy_enabled: settings.ntfy_enabled ?? true,
      message: 'Notification settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// Test Telegram notification
router.post('/notifications/test/telegram', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = await userQueries.getNotificationSettings(userId);

    if (!settings?.telegram_bot_token || !settings?.telegram_chat_id) {
      res.status(400).json({ error: 'Telegram not configured' });
      return;
    }

    const { sendTelegramNotification } = await import('../services/notifications');
    const success = await sendTelegramNotification(
      settings.telegram_bot_token,
      settings.telegram_chat_id,
      {
        productName: 'Test Product',
        productUrl: 'https://example.com',
        type: 'price_drop',
        oldPrice: 29.99,
        newPrice: 19.99,
        currency: 'USD',
      }
    );

    if (success) {
      res.json({ message: 'Test notification sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Error sending test Telegram notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Test Discord notification
router.post('/notifications/test/discord', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = await userQueries.getNotificationSettings(userId);

    if (!settings?.discord_webhook_url) {
      res.status(400).json({ error: 'Discord not configured' });
      return;
    }

    const { sendDiscordNotification } = await import('../services/notifications');
    const success = await sendDiscordNotification(settings.discord_webhook_url, {
      productName: 'Test Product',
      productUrl: 'https://example.com',
      type: 'price_drop',
      oldPrice: 29.99,
      newPrice: 19.99,
      currency: 'USD',
    });

    if (success) {
      res.json({ message: 'Test notification sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Error sending test Discord notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Test Pushover notification
router.post('/notifications/test/pushover', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = await userQueries.getNotificationSettings(userId);

    if (!settings?.pushover_user_key || !settings?.pushover_app_token) {
      res.status(400).json({ error: 'Pushover not configured' });
      return;
    }

    const { sendPushoverNotification } = await import('../services/notifications');
    const success = await sendPushoverNotification(
      settings.pushover_user_key,
      settings.pushover_app_token,
      {
        productName: 'Test Product',
        productUrl: 'https://example.com',
        type: 'price_drop',
        oldPrice: 29.99,
        newPrice: 19.99,
        currency: 'USD',
      }
    );

    if (success) {
      res.json({ message: 'Test notification sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Error sending test Pushover notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Test ntfy notification
router.post('/notifications/test/ntfy', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = await userQueries.getNotificationSettings(userId);

    if (!settings?.ntfy_topic) {
      res.status(400).json({ error: 'ntfy not configured' });
      return;
    }

    const { sendNtfyNotification } = await import('../services/notifications');
    const success = await sendNtfyNotification(settings.ntfy_topic, {
      productName: 'Test Product',
      productUrl: 'https://example.com',
      type: 'price_drop',
      oldPrice: 29.99,
      newPrice: 19.99,
      currency: 'USD',
    });

    if (success) {
      res.json({ message: 'Test notification sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Error sending test ntfy notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Get AI settings
router.get('/ai', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = await userQueries.getAISettings(userId);

    if (!settings) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      ai_enabled: settings.ai_enabled || false,
      ai_verification_enabled: settings.ai_verification_enabled || false,
      ai_provider: settings.ai_provider || null,
      anthropic_api_key: settings.anthropic_api_key || null,
      openai_api_key: settings.openai_api_key || null,
      ollama_base_url: settings.ollama_base_url || null,
      ollama_model: settings.ollama_model || null,
    });
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// Update AI settings
router.put('/ai', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { ai_enabled, ai_verification_enabled, ai_provider, anthropic_api_key, openai_api_key, ollama_base_url, ollama_model } = req.body;

    const settings = await userQueries.updateAISettings(userId, {
      ai_enabled,
      ai_verification_enabled,
      ai_provider,
      anthropic_api_key,
      openai_api_key,
      ollama_base_url,
      ollama_model,
    });

    if (!settings) {
      res.status(400).json({ error: 'No settings to update' });
      return;
    }

    res.json({
      ai_enabled: settings.ai_enabled || false,
      ai_verification_enabled: settings.ai_verification_enabled || false,
      ai_provider: settings.ai_provider || null,
      anthropic_api_key: settings.anthropic_api_key || null,
      openai_api_key: settings.openai_api_key || null,
      ollama_base_url: settings.ollama_base_url || null,
      ollama_model: settings.ollama_model || null,
      message: 'AI settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating AI settings:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

// Test AI extraction
router.post('/ai/test', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const settings = await userQueries.getAISettings(userId);
    if (!settings?.ai_enabled) {
      res.status(400).json({ error: 'AI extraction is not enabled' });
      return;
    }

    console.log(`[AI Test] Testing URL: ${url} with provider: ${settings.ai_provider}`);

    const { extractWithAI } = await import('../services/ai-extractor');
    const result = await extractWithAI(url, settings);

    console.log(`[AI Test] Result:`, JSON.stringify(result, null, 2));

    res.json({
      success: !!result.price,
      ...result,
    });
  } catch (error) {
    console.error('Error testing AI extraction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to test AI extraction: ${errorMessage}` });
  }
});

// Test Ollama connection and list available models
router.post('/ai/test-ollama', async (req: AuthRequest, res: Response) => {
  try {
    const { base_url } = req.body;

    if (!base_url) {
      res.status(400).json({ error: 'Base URL is required' });
      return;
    }

    // Try to fetch list of models from Ollama
    const axios = (await import('axios')).default;
    const response = await axios.get(`${base_url}/api/tags`, {
      timeout: 10000,
    });

    const models = response.data?.models || [];
    const modelNames = models.map((m: { name: string }) => m.name);

    res.json({
      success: true,
      message: 'Successfully connected to Ollama',
      models: modelNames,
    });
  } catch (error) {
    console.error('Error testing Ollama connection:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('ECONNREFUSED')) {
      res.status(400).json({
        error: 'Cannot connect to Ollama. Make sure Ollama is running.',
        success: false,
      });
    } else {
      res.status(500).json({
        error: `Failed to connect to Ollama: ${errorMessage}`,
        success: false,
      });
    }
  }
});

export default router;
