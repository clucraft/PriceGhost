import { log } from '../utils/logger.js';
import type { LogContext, ScraperPage } from '../types.js';
import { errorMessage } from '../types.js';

/**
 * Simulates human interaction
 */
export async function performHumanLikeActions(page: ScraperPage, context: LogContext = {}) {
  try {
    if (context.forceDebug) log('Performing human-like actions (mouse moves & scroll)...', 'DEBUG', context);
    
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(Math.random() * 800) + 100;
      const y = Math.floor(Math.random() * 600) + 100;
      if (context.forceDebug) log(`Moving mouse to ${x},${y}...`, 'DEBUG', context);
      await page.mouse.move(x, y, { steps: 5 });
      await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    }

    const scrollAmount = Math.floor(200 + Math.random() * 400);
    if (context.forceDebug) log(`Scrolling by ${scrollAmount}px...`, 'DEBUG', context);
    await page.evaluate((amount: number) => {
      window.scrollBy({ top: amount, behavior: 'smooth' });
    }, scrollAmount);
    
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
  } catch (error) {
    log(`Human actions failed (non-critical): ${errorMessage(error)}`, 'WARN', context);
  }
}
