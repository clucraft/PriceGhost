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

    // Don't expose full bot token, just indicate if it's set
    res.json({
      telegram_configured: !!(settings.telegram_bot_token && settings.telegram_chat_id),
      telegram_chat_id: settings.telegram_chat_id,
      discord_configured: !!settings.discord_webhook_url,
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
    const { telegram_bot_token, telegram_chat_id, discord_webhook_url } = req.body;

    const settings = await userQueries.updateNotificationSettings(userId, {
      telegram_bot_token,
      telegram_chat_id,
      discord_webhook_url,
    });

    if (!settings) {
      res.status(400).json({ error: 'No settings to update' });
      return;
    }

    res.json({
      telegram_configured: !!(settings.telegram_bot_token && settings.telegram_chat_id),
      telegram_chat_id: settings.telegram_chat_id,
      discord_configured: !!settings.discord_webhook_url,
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

// Get AI settings
router.get('/ai', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = await userQueries.getAISettings(userId);

    if (!settings) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Don't expose full API keys, just indicate if they're set
    res.json({
      ai_enabled: settings.ai_enabled || false,
      ai_provider: settings.ai_provider || null,
      anthropic_configured: !!settings.anthropic_api_key,
      openai_configured: !!settings.openai_api_key,
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
    const { ai_enabled, ai_provider, anthropic_api_key, openai_api_key } = req.body;

    const settings = await userQueries.updateAISettings(userId, {
      ai_enabled,
      ai_provider,
      anthropic_api_key,
      openai_api_key,
    });

    if (!settings) {
      res.status(400).json({ error: 'No settings to update' });
      return;
    }

    res.json({
      ai_enabled: settings.ai_enabled || false,
      ai_provider: settings.ai_provider || null,
      anthropic_configured: !!settings.anthropic_api_key,
      openai_configured: !!settings.openai_api_key,
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

export default router;
