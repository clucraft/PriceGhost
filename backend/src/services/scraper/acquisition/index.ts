import { load, type CheerioAPI } from 'cheerio';
import { logger } from '../../../utils/system/logger';
import { detectBotChallenge, PageNotAvailableError } from '../transport';
import { RetailerConfig } from '../../../models';

import { acquireRemoteHtml } from './remote';
import { acquireStandardHtml, BotChallengeError } from './standard';
import { handleAcquisitionFallback } from './fallback';

export interface AcquisitionOptions {
  url: string;
  domain: string;
  domainConfig?: RetailerConfig;
  productId?: number;
  extractionSteps: string[];
  requestId?: string;
}

export interface AcquisitionResult {
  html: string;
  $: CheerioAPI;
  challengeReason: string | null;
  usedRemoteFallback: boolean;
  learnedFlags: any;
}

export async function acquireHtml(options: AcquisitionOptions): Promise<AcquisitionResult> {
  const { url, domain, domainConfig, productId, extractionSteps, requestId } = options;
  let html = '';
  let learnedFlags: any = {};
  let challengeReason: string | null = null;
  let usedRemoteFallback = false;

  const useBrowserScraper = domainConfig?.use_browser_scraper || false;

  // --- Attempt 1: Remote/Browser (if configured) ---
  if (useBrowserScraper) {
    usedRemoteFallback = true;
    const remoteHtml = await acquireRemoteHtml(options);
    if (remoteHtml) {
      html = remoteHtml;
    }
  }

  // --- Attempt 2: Standard HTTP (if remote failed or not configured) ---
  if (!html) {
    try {
      html = await acquireStandardHtml({
        url,
        domain,
        domainConfig,
        extractionSteps,
        requestId
      });
    } catch (e) {
      if (e instanceof BotChallengeError) {
        challengeReason = e.message;
      } else {
        throw e;
      }
    }
  }

  let $ = load(html || '');
  
  if (html) {
     const htmlChallenge = detectBotChallenge(html, $);
     if (htmlChallenge) {
       challengeReason = htmlChallenge;
     } else {
       checkSoft404($, html, extractionSteps);
     }
  }

  // --- Attempt 3: Dynamic Fallback (if blocked and no config exists) ---
  if (challengeReason && !usedRemoteFallback && !domainConfig) {
    const fallbackResult = await handleAcquisitionFallback({
      url,
      domain,
      productId,
      extractionSteps,
      challengeReason
    });

    if (fallbackResult) {
      return {
        ...fallbackResult,
        usedRemoteFallback: true
      };
    }
  }

  return { html, $, challengeReason, usedRemoteFallback, learnedFlags };
}

function checkSoft404($: CheerioAPI, html: string, extractionSteps: string[]) {
  // 1. Check title for "not found" / "404" markers
  const title = $('title').text().trim().toLowerCase();
  const notFoundPatterns = [
    'product not found',
    'page not found',
    '404 not found',
    '404 error',
    'item not found',
    'not found'
  ];
  
  if (title) {
    for (const pattern of notFoundPatterns) {
      if (title === pattern || (pattern !== 'not found' && title.includes(pattern))) {
        extractionSteps.push(`Soft-404 | Title match: "${title}" contains "${pattern}"`);
        throw new PageNotAvailableError(`Soft 404: Title matches "${pattern}"`);
      }
    }
  }

  // 2. Check meta robots noindex (as a strong signal of soft 404 / deactivated page)
  const robots = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
  if (robots.includes('noindex') || robots === 'none') {
    const hasPriceMeta = $('meta[itemprop="price"], meta[itemprop="lowPrice"], [itemprop="price"], [itemprop="lowPrice"], meta[property="product:price:amount"], meta[property="og:price:amount"]').length > 0;
    
    let hasJsonLdProduct = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).html();
        if (text && (text.includes('"Product"') || text.includes('"Offer"') || text.includes('"price"'))) {
          hasJsonLdProduct = true;
        }
      } catch (e) {}
    });

    if (!hasPriceMeta && !hasJsonLdProduct) {
      extractionSteps.push(`Soft-404 | Robots meta tag contains noindex: "${robots}"`);
      throw new PageNotAvailableError(`Soft 404: Robots meta tag contains noindex (${robots})`);
    } else {
      extractionSteps.push(`Soft-404 | Robots meta has noindex but page has valid product/price metadata. Skipping robots check.`);
    }
  }

  // 3. Check for specific page content or elements commonly indicating not found
  const soft404Selectors = [
    '.error-404',
    '.product-not-found',
    '.no-results',
    '#not-found',
    '.page-not-found'
  ];
  for (const selector of soft404Selectors) {
    if ($(selector).length > 0) {
      extractionSteps.push(`Soft-404 | Found error selector: "${selector}"`);
      throw new PageNotAvailableError(`Soft 404: Found error element "${selector}"`);
    }
  }
}
