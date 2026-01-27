import axios from 'axios';

// Helper to get currency symbol for display
function getCurrencySymbol(currency?: string): string {
  switch (currency) {
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'CHF': return 'CHF ';
    case 'JPY': return '¥';
    case 'INR': return '₹';
    default: return '$';
  }
}

export interface NotificationPayload {
  productName: string;
  productUrl: string;
  type: 'price_drop' | 'back_in_stock' | 'target_price';
  oldPrice?: number;
  newPrice?: number;
  currency?: string;
  threshold?: number;
  targetPrice?: number;
}

function formatMessage(payload: NotificationPayload): string {
  const currencySymbol = getCurrencySymbol(payload.currency);

  if (payload.type === 'price_drop') {
    const oldPriceStr = payload.oldPrice ? `${currencySymbol}${payload.oldPrice.toFixed(2)}` : 'N/A';
    const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
    const dropAmount = payload.oldPrice && payload.newPrice
      ? `${currencySymbol}${(payload.oldPrice - payload.newPrice).toFixed(2)}`
      : '';

    return `🔔 Price Drop Alert!\n\n` +
      `📦 ${payload.productName}\n\n` +
      `💰 Price dropped from ${oldPriceStr} to ${newPriceStr}` +
      (dropAmount ? ` (-${dropAmount})` : '') + `\n\n` +
      `🔗 ${payload.productUrl}`;
  }

  if (payload.type === 'target_price') {
    const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
    const targetPriceStr = payload.targetPrice ? `${currencySymbol}${payload.targetPrice.toFixed(2)}` : 'N/A';

    return `🎯 Target Price Reached!\n\n` +
      `📦 ${payload.productName}\n\n` +
      `💰 Price is now ${newPriceStr} (your target: ${targetPriceStr})\n\n` +
      `🔗 ${payload.productUrl}`;
  }

  if (payload.type === 'back_in_stock') {
    const priceStr = payload.newPrice ? ` at ${currencySymbol}${payload.newPrice.toFixed(2)}` : '';
    return `🎉 Back in Stock!\n\n` +
      `📦 ${payload.productName}\n\n` +
      `✅ This item is now available${priceStr}\n\n` +
      `🔗 ${payload.productUrl}`;
  }

  return '';
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const message = formatMessage(payload);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    });

    console.log(`Telegram notification sent to chat ${chatId}`);
    return true;
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
    return false;
  }
}

export async function sendDiscordNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const currencySymbol = getCurrencySymbol(payload.currency);

    let embed;
    if (payload.type === 'price_drop') {
      const oldPriceStr = payload.oldPrice ? `${currencySymbol}${payload.oldPrice.toFixed(2)}` : 'N/A';
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';

      embed = {
        title: '🔔 Price Drop Alert!',
        description: payload.productName,
        color: 0x10b981, // Green
        fields: [
          { name: 'Old Price', value: oldPriceStr, inline: true },
          { name: 'New Price', value: newPriceStr, inline: true },
        ],
        url: payload.productUrl,
        timestamp: new Date().toISOString(),
      };
    } else if (payload.type === 'target_price') {
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
      const targetPriceStr = payload.targetPrice ? `${currencySymbol}${payload.targetPrice.toFixed(2)}` : 'N/A';

      embed = {
        title: '🎯 Target Price Reached!',
        description: payload.productName,
        color: 0xf59e0b, // Amber
        fields: [
          { name: 'Current Price', value: newPriceStr, inline: true },
          { name: 'Your Target', value: targetPriceStr, inline: true },
        ],
        url: payload.productUrl,
        timestamp: new Date().toISOString(),
      };
    } else {
      const priceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'Check link';

      embed = {
        title: '🎉 Back in Stock!',
        description: payload.productName,
        color: 0x6366f1, // Indigo
        fields: [
          { name: 'Price', value: priceStr, inline: true },
          { name: 'Status', value: '✅ Available', inline: true },
        ],
        url: payload.productUrl,
        timestamp: new Date().toISOString(),
      };
    }

    await axios.post(webhookUrl, {
      embeds: [embed],
    });

    console.log('Discord notification sent');
    return true;
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
    return false;
  }
}

export async function sendPushoverNotification(
  userKey: string,
  appToken: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const currencySymbol = getCurrencySymbol(payload.currency);

    let title: string;
    let message: string;

    if (payload.type === 'price_drop') {
      const oldPriceStr = payload.oldPrice ? `${currencySymbol}${payload.oldPrice.toFixed(2)}` : 'N/A';
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
      title = '🔔 Price Drop Alert!';
      message = `${payload.productName}\n\nPrice dropped from ${oldPriceStr} to ${newPriceStr}`;
    } else if (payload.type === 'target_price') {
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
      const targetPriceStr = payload.targetPrice ? `${currencySymbol}${payload.targetPrice.toFixed(2)}` : 'N/A';
      title = '🎯 Target Price Reached!';
      message = `${payload.productName}\n\nPrice is now ${newPriceStr} (your target: ${targetPriceStr})`;
    } else {
      const priceStr = payload.newPrice ? ` at ${currencySymbol}${payload.newPrice.toFixed(2)}` : '';
      title = '🎉 Back in Stock!';
      message = `${payload.productName}\n\nThis item is now available${priceStr}`;
    }

    await axios.post('https://api.pushover.net/1/messages.json', {
      token: appToken,
      user: userKey,
      title,
      message,
      url: payload.productUrl,
      url_title: 'View Product',
    });

    console.log('Pushover notification sent');
    return true;
  } catch (error) {
    console.error('Failed to send Pushover notification:', error);
    return false;
  }
}

export async function sendNtfyNotification(
  topic: string,
  payload: NotificationPayload,
  serverUrl?: string | null,
  username?: string | null,
  password?: string | null
): Promise<boolean> {
  try {
    const currencySymbol = getCurrencySymbol(payload.currency);

    let title: string;
    let message: string;
    let tags: string[];

    if (payload.type === 'price_drop') {
      const oldPriceStr = payload.oldPrice ? `${currencySymbol}${payload.oldPrice.toFixed(2)}` : 'N/A';
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
      title = 'Price Drop Alert!';
      message = `${payload.productName}\n\nPrice dropped from ${oldPriceStr} to ${newPriceStr}`;
      tags = ['moneybag', 'chart_with_downwards_trend'];
    } else if (payload.type === 'target_price') {
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
      const targetPriceStr = payload.targetPrice ? `${currencySymbol}${payload.targetPrice.toFixed(2)}` : 'N/A';
      title = 'Target Price Reached!';
      message = `${payload.productName}\n\nPrice is now ${newPriceStr} (your target: ${targetPriceStr})`;
      tags = ['dart', 'white_check_mark'];
    } else {
      const priceStr = payload.newPrice ? ` at ${currencySymbol}${payload.newPrice.toFixed(2)}` : '';
      title = 'Back in Stock!';
      message = `${payload.productName}\n\nThis item is now available${priceStr}`;
      tags = ['package', 'tada'];
    }

    // Use custom server URL or default to ntfy.sh
    const baseUrl = serverUrl ? serverUrl.replace(/\/$/, '') : 'https://ntfy.sh';
    const url = `${baseUrl}/${topic}`;

    // Build headers
    const headers: Record<string, string> = {
      'Title': title,
      'Tags': tags.join(','),
      'Click': payload.productUrl,
    };

    // Add basic auth if credentials provided
    if (username && password) {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    await axios.post(url, message, { headers });

    console.log(`ntfy notification sent to topic ${topic} on ${baseUrl}`);
    return true;
  } catch (error) {
    console.error('Failed to send ntfy notification:', error);
    return false;
  }
}

export async function sendGotifyNotification(
  serverUrl: string,
  appToken: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const currencySymbol = getCurrencySymbol(payload.currency);

    let title: string;
    let message: string;
    let priority: number;

    if (payload.type === 'price_drop') {
      const oldPriceStr = payload.oldPrice ? `${currencySymbol}${payload.oldPrice.toFixed(2)}` : 'N/A';
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
      title = 'Price Drop Alert!';
      message = `${payload.productName}\n\nPrice dropped from ${oldPriceStr} to ${newPriceStr}\n\n${payload.productUrl}`;
      priority = 7; // High priority
    } else if (payload.type === 'target_price') {
      const newPriceStr = payload.newPrice ? `${currencySymbol}${payload.newPrice.toFixed(2)}` : 'N/A';
      const targetPriceStr = payload.targetPrice ? `${currencySymbol}${payload.targetPrice.toFixed(2)}` : 'N/A';
      title = 'Target Price Reached!';
      message = `${payload.productName}\n\nPrice is now ${newPriceStr} (your target: ${targetPriceStr})\n\n${payload.productUrl}`;
      priority = 8; // Higher priority
    } else {
      const priceStr = payload.newPrice ? ` at ${currencySymbol}${payload.newPrice.toFixed(2)}` : '';
      title = 'Back in Stock!';
      message = `${payload.productName}\n\nThis item is now available${priceStr}\n\n${payload.productUrl}`;
      priority = 8; // Higher priority
    }

    // Gotify API: POST /message with token as query param or header
    const url = `${serverUrl.replace(/\/$/, '')}/message`;
    await axios.post(url, {
      title,
      message,
      priority,
    }, {
      headers: {
        'X-Gotify-Key': appToken,
      },
    });

    console.log('Gotify notification sent');
    return true;
  } catch (error) {
    console.error('Failed to send Gotify notification:', error);
    return false;
  }
}

export async function testGotifyConnection(
  serverUrl: string,
  appToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Test by fetching application info
    const url = `${serverUrl.replace(/\/$/, '')}/application`;
    await axios.get(url, {
      headers: {
        'X-Gotify-Key': appToken,
      },
      timeout: 10000,
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('ECONNREFUSED')) {
      return { success: false, error: 'Cannot connect to Gotify server. Make sure it is running.' };
    }
    if (errorMessage.includes('401') || errorMessage.includes('403')) {
      return { success: false, error: 'Invalid app token. Check your Gotify application token.' };
    }
    return { success: false, error: `Connection failed: ${errorMessage}` };
  }
}

export interface NotificationResult {
  channelsNotified: string[];
  channelsFailed: string[];
}

export async function sendNotifications(
  settings: {
    telegram_bot_token: string | null;
    telegram_chat_id: string | null;
    telegram_enabled?: boolean;
    discord_webhook_url: string | null;
    discord_enabled?: boolean;
    pushover_user_key: string | null;
    pushover_app_token: string | null;
    pushover_enabled?: boolean;
    ntfy_topic: string | null;
    ntfy_server_url?: string | null;
    ntfy_username?: string | null;
    ntfy_password?: string | null;
    ntfy_enabled?: boolean;
    gotify_url: string | null;
    gotify_app_token: string | null;
    gotify_enabled?: boolean;
  },
  payload: NotificationPayload
): Promise<NotificationResult> {
  const channelPromises: { channel: string; promise: Promise<boolean> }[] = [];

  // Only send if channel is configured AND enabled (default to true if not specified)
  if (settings.telegram_bot_token && settings.telegram_chat_id && settings.telegram_enabled !== false) {
    channelPromises.push({
      channel: 'telegram',
      promise: sendTelegramNotification(settings.telegram_bot_token, settings.telegram_chat_id, payload),
    });
  }

  if (settings.discord_webhook_url && settings.discord_enabled !== false) {
    channelPromises.push({
      channel: 'discord',
      promise: sendDiscordNotification(settings.discord_webhook_url, payload),
    });
  }

  if (settings.pushover_user_key && settings.pushover_app_token && settings.pushover_enabled !== false) {
    channelPromises.push({
      channel: 'pushover',
      promise: sendPushoverNotification(settings.pushover_user_key, settings.pushover_app_token, payload),
    });
  }

  if (settings.ntfy_topic && settings.ntfy_enabled !== false) {
    channelPromises.push({
      channel: 'ntfy',
      promise: sendNtfyNotification(
        settings.ntfy_topic,
        payload,
        settings.ntfy_server_url,
        settings.ntfy_username,
        settings.ntfy_password
      ),
    });
  }

  if (settings.gotify_url && settings.gotify_app_token && settings.gotify_enabled !== false) {
    channelPromises.push({
      channel: 'gotify',
      promise: sendGotifyNotification(settings.gotify_url, settings.gotify_app_token, payload),
    });
  }

  const results = await Promise.allSettled(channelPromises.map(c => c.promise));

  const channelsNotified: string[] = [];
  const channelsFailed: string[] = [];

  results.forEach((result, index) => {
    const channel = channelPromises[index].channel;
    if (result.status === 'fulfilled' && result.value === true) {
      channelsNotified.push(channel);
    } else {
      channelsFailed.push(channel);
    }
  });

  return { channelsNotified, channelsFailed };
}
