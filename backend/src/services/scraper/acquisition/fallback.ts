import { load, type CheerioAPI } from 'cheerio';
import { logger } from '../../../utils/system/logger';
import { settingsCache } from '../../../utils/cache';
import { 
  detectBotChallenge, 
  fetchRemoteHtml, 
  fetchBrowserHtml, 
  getRandomReferrer
} from '../transport';

export interface FallbackOptions {
  url: string;
  domain: string;
  productId?: number;
  extractionSteps: string[];
  challengeReason: string;
}

export interface FallbackResult {
  html: string;
  $: CheerioAPI;
  challengeReason: string | null;
  learnedFlags: any;
}

export async function handleAcquisitionFallback(options: FallbackOptions): Promise<FallbackResult | null> {
  const { url, domain, productId, extractionSteps, challengeReason } = options;
  
  logger.warn(`Scraper | Block | ${challengeReason} detected. Triggering fallback for ${domain}`, 'Scraper', { product_id: productId });
  extractionSteps.push(`Scraper | Fallback | Triggered by ${challengeReason}`);
  
  let html = '';
  let $;
  let learnedFlags: any = {};
  let finalChallengeReason: string | null = challengeReason;

  const rsUrl = await settingsCache.getRemoteScraperUrl();
  if (rsUrl) {
    try {
      const isDiscovery = !productId;
      const remoteOptions: any = { productId, isDiscovery };
      const defaultReferrer = await settingsCache.getDefaultReferrer();
      remoteOptions.referrer = isDiscovery ? getRandomReferrer() : (defaultReferrer || undefined);

      html = await fetchRemoteHtml(url, rsUrl, remoteOptions);
      logger.info(`Scraper | Fallback | Remote success for ${domain}`, 'Scraper', { product_id: productId });
      extractionSteps.push(`Scraper | Fallback | Remote Success`);
      $ = load(html);
      finalChallengeReason = detectBotChallenge(html, $);
      if (!finalChallengeReason) learnedFlags = { use_browser_scraper: true };
      
      return { html, $, challengeReason: finalChallengeReason, learnedFlags };
    } catch (e) {
      logger.error(`Scraper | Fallback | Remote failed for ${domain}: ${(e as any).message}`, 'Scraper', { product_id: productId, error: e });
      extractionSteps.push(`Scraper | Fallback | Remote Failed: ${(e as any).message}`);
    }
  } else {
    try {
      logger.warn(`Scraper | Fallback | Local browser fallback for ${domain}`, 'Scraper', { product_id: productId });
      html = await fetchBrowserHtml(url, undefined, undefined, undefined, productId, !productId);
      if (html) logger.info(`Scraper | Fallback | Local success for ${domain}`, 'Scraper', { product_id: productId });
      extractionSteps.push(html ? `Scraper | Fallback | Local Success` : `Scraper | Fallback | Local Failed`);
      
      if (html) {
        $ = load(html);
        finalChallengeReason = detectBotChallenge(html, $);
        if (!finalChallengeReason) learnedFlags = { use_browser_scraper: true };
        return { html, $, challengeReason: finalChallengeReason, learnedFlags };
      }
    } catch (e) {
      logger.error(`Scraper | Fallback | Local failed for ${domain}: ${(e as any).message}`, 'Scraper', { product_id: productId, error: e });
      extractionSteps.push(`Scraper | Fallback | Local Failed: ${(e as any).message}`);
    }
  }

  return null;
}
