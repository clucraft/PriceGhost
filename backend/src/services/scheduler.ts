import cron from 'node-cron';
import { productQueries, priceHistoryQueries, userQueries, stockStatusHistoryQueries, notificationHistoryQueries, NotificationType } from '../models';
import { scrapeProduct, scrapeProductWithVoting, ExtractionMethod } from './scraper';
import { sendNotifications, NotificationPayload } from './notifications';

let isRunning = false;

async function checkPrices(): Promise<void> {
  if (isRunning) {
    console.log('Price check already in progress, skipping...');
    return;
  }

  isRunning = true;
  console.log('Starting scheduled price check...');

  try {
    // Find all products that are due for a refresh
    const products = await productQueries.findDueForRefresh();
    console.log(`Found ${products.length} products to check`);

    for (const product of products) {
      try {
        console.log(`Checking price for product ${product.id}: ${product.url}`);

        // Get preferred extraction method for this product (if user previously selected one)
        const preferredMethod = await productQueries.getPreferredExtractionMethod(product.id);

        // Get anchor price for variant products (the price the user confirmed)
        const anchorPrice = await productQueries.getAnchorPrice(product.id);

        console.log(`[Scheduler] Product ${product.id} - preferredMethod: ${preferredMethod}, anchorPrice: ${anchorPrice}`);

        // Use voting scraper with preferred method and anchor price if available
        const scrapedData = await scrapeProductWithVoting(
          product.url,
          product.user_id,
          preferredMethod as ExtractionMethod | undefined,
          anchorPrice || undefined
        );

        console.log(`[Scheduler] Product ${product.id} - scraped price: ${scrapedData.price?.price}, candidates: ${scrapedData.priceCandidates.map(c => `${c.price}(${c.method})`).join(', ')}`);

        // Check for back-in-stock notification
        const wasOutOfStock = product.stock_status === 'out_of_stock';
        const nowInStock = scrapedData.stockStatus === 'in_stock';

        // Update stock status and record to history
        if (scrapedData.stockStatus !== product.stock_status) {
          await productQueries.updateStockStatus(product.id, scrapedData.stockStatus);

          // Record the status change in history
          await stockStatusHistoryQueries.recordChange(product.id, scrapedData.stockStatus);

          console.log(
            `Stock status changed for product ${product.id}: ${product.stock_status} -> ${scrapedData.stockStatus}`
          );

          // Send back-in-stock notification
          if (wasOutOfStock && nowInStock && product.notify_back_in_stock) {
            try {
              const userSettings = await userQueries.getNotificationSettings(product.user_id);
              if (userSettings) {
                const payload: NotificationPayload = {
                  productName: product.name || 'Unknown Product',
                  productUrl: product.url,
                  type: 'back_in_stock',
                  newPrice: scrapedData.price?.price,
                  currency: scrapedData.price?.currency || 'USD',
                };
                const result = await sendNotifications(userSettings, payload);
                console.log(`Back-in-stock notification sent for product ${product.id}`);

                // Log notification to history
                if (result.channelsNotified.length > 0) {
                  await notificationHistoryQueries.create({
                    user_id: product.user_id,
                    product_id: product.id,
                    notification_type: 'stock_change' as NotificationType,
                    old_stock_status: product.stock_status,
                    new_stock_status: scrapedData.stockStatus,
                    new_price: scrapedData.price?.price,
                    currency: scrapedData.price?.currency || 'USD',
                    channels_notified: result.channelsNotified,
                    product_name: product.name || 'Unknown Product',
                    product_url: product.url,
                  });
                }
              }
            } catch (notifyError) {
              console.error(`Failed to send back-in-stock notification for product ${product.id}:`, notifyError);
            }
          }
        }

        if (scrapedData.price) {
          // Get the latest recorded price to compare
          const latestPrice = await priceHistoryQueries.getLatest(product.id);

          // Only record if price has changed or it's the first entry
          if (!latestPrice || latestPrice.price !== scrapedData.price.price) {
            // Check for price drop notification before recording
            if (latestPrice && product.price_drop_threshold) {
              const oldPrice = parseFloat(String(latestPrice.price));
              const newPrice = scrapedData.price.price;
              const priceDrop = oldPrice - newPrice;

              if (priceDrop >= product.price_drop_threshold) {
                try {
                  const userSettings = await userQueries.getNotificationSettings(product.user_id);
                  if (userSettings) {
                    const payload: NotificationPayload = {
                      productName: product.name || 'Unknown Product',
                      productUrl: product.url,
                      type: 'price_drop',
                      oldPrice: oldPrice,
                      newPrice: newPrice,
                      currency: scrapedData.price.currency,
                      threshold: product.price_drop_threshold,
                    };
                    const result = await sendNotifications(userSettings, payload);
                    console.log(`Price drop notification sent for product ${product.id}: ${priceDrop} drop`);

                    // Log notification to history
                    if (result.channelsNotified.length > 0) {
                      const priceChangePercent = ((oldPrice - newPrice) / oldPrice) * 100;
                      await notificationHistoryQueries.create({
                        user_id: product.user_id,
                        product_id: product.id,
                        notification_type: 'price_drop' as NotificationType,
                        old_price: oldPrice,
                        new_price: newPrice,
                        currency: scrapedData.price.currency,
                        price_change_percent: Math.round(priceChangePercent * 100) / 100,
                        channels_notified: result.channelsNotified,
                        product_name: product.name || 'Unknown Product',
                        product_url: product.url,
                      });
                    }
                  }
                } catch (notifyError) {
                  console.error(`Failed to send price drop notification for product ${product.id}:`, notifyError);
                }
              }
            }

            // Check for target price notification
            if (product.target_price) {
              const newPrice = scrapedData.price.price;
              const targetPrice = parseFloat(String(product.target_price));
              const oldPrice = latestPrice ? parseFloat(String(latestPrice.price)) : null;

              // Only notify if price just dropped to or below target (wasn't already below)
              if (newPrice <= targetPrice && (!oldPrice || oldPrice > targetPrice)) {
                try {
                  const userSettings = await userQueries.getNotificationSettings(product.user_id);
                  if (userSettings) {
                    const payload: NotificationPayload = {
                      productName: product.name || 'Unknown Product',
                      productUrl: product.url,
                      type: 'target_price',
                      newPrice: newPrice,
                      currency: scrapedData.price.currency,
                      targetPrice: targetPrice,
                    };
                    const result = await sendNotifications(userSettings, payload);
                    console.log(`Target price notification sent for product ${product.id}: ${newPrice} <= ${targetPrice}`);

                    // Log notification to history
                    if (result.channelsNotified.length > 0) {
                      await notificationHistoryQueries.create({
                        user_id: product.user_id,
                        product_id: product.id,
                        notification_type: 'price_target' as NotificationType,
                        old_price: oldPrice || undefined,
                        new_price: newPrice,
                        currency: scrapedData.price.currency,
                        target_price: targetPrice,
                        channels_notified: result.channelsNotified,
                        product_name: product.name || 'Unknown Product',
                        product_url: product.url,
                      });
                    }
                  }
                } catch (notifyError) {
                  console.error(`Failed to send target price notification for product ${product.id}:`, notifyError);
                }
              }
            }

            await priceHistoryQueries.create(
              product.id,
              scrapedData.price.price,
              scrapedData.price.currency,
              scrapedData.aiStatus
            );
            console.log(
              `Recorded new price for product ${product.id}: ${scrapedData.price.currency} ${scrapedData.price.price}${scrapedData.aiStatus ? ` (AI: ${scrapedData.aiStatus})` : ''}`
            );
          } else {
            console.log(`Price unchanged for product ${product.id}`);
          }
        } else if (scrapedData.stockStatus === 'out_of_stock') {
          console.log(`Product ${product.id} is out of stock, no price available`);
        } else {
          console.warn(`Could not extract price for product ${product.id}`);
        }

        // Update last_checked and schedule next check with jitter
        await productQueries.updateLastChecked(product.id, product.refresh_interval);

        // Add a randomized delay between requests (2-5 seconds) to avoid rate limiting
        const delay = 2000 + Math.floor(Math.random() * 3000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error) {
        console.error(`Error checking product ${product.id}:`, error);
        // Continue with next product even if one fails
      }
    }
  } catch (error) {
    console.error('Error in scheduled price check:', error);
  } finally {
    isRunning = false;
    console.log('Scheduled price check complete');
  }
}

export function startScheduler(): void {
  // Run every minute
  cron.schedule('* * * * *', () => {
    checkPrices().catch(console.error);
  });

  console.log('Price check scheduler started (runs every minute)');
}

// Allow manual trigger for testing
export { checkPrices };
