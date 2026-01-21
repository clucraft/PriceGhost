import axios from 'axios';

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
  const currencySymbol = payload.currency === 'EUR' ? '€' : payload.currency === 'GBP' ? '£' : '$';

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
    const currencySymbol = payload.currency === 'EUR' ? '€' : payload.currency === 'GBP' ? '£' : '$';

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

export async function sendNotifications(
  settings: {
    telegram_bot_token: string | null;
    telegram_chat_id: string | null;
    discord_webhook_url: string | null;
  },
  payload: NotificationPayload
): Promise<void> {
  const promises: Promise<boolean>[] = [];

  if (settings.telegram_bot_token && settings.telegram_chat_id) {
    promises.push(
      sendTelegramNotification(settings.telegram_bot_token, settings.telegram_chat_id, payload)
    );
  }

  if (settings.discord_webhook_url) {
    promises.push(sendDiscordNotification(settings.discord_webhook_url, payload));
  }

  await Promise.allSettled(promises);
}
