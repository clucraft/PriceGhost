import axios, { AxiosError } from 'axios';
import { load, type CheerioAPI } from 'cheerio';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  parsePrice,
  ParsedPrice,
  findMostLikelyPrice,
} from '../utils/priceParser';

// Add stealth plugin to avoid bot detection (Cloudflare, etc.)
puppeteer.use(StealthPlugin());

export type StockStatus = 'in_stock' | 'out_of_stock' | 'unknown';

// Extraction method types for multi-strategy voting
export type ExtractionMethod = 'json-ld' | 'site-specific' | 'generic-css' | 'ai';

// Price candidate from a single extraction method
export interface PriceCandidate {
  price: number;
  currency: string;
  method: ExtractionMethod;
  context?: string; // Text around the price for user context
  confidence: number; // 0-1 confidence score
}

// Extended scrape result with candidates for voting
export interface ScrapedProductWithCandidates {
  name: string | null;
  price: ParsedPrice | null;
  imageUrl: string | null;
  url: string;
  stockStatus: StockStatus;
  aiStatus: 'verified' | 'corrected' | null;
  priceCandidates: PriceCandidate[];
  needsReview: boolean;
  selectedMethod?: ExtractionMethod; // Which method was used for final price
}

// Check if two prices are "close enough" to be considered the same (within 5%)
function pricesMatch(price1: number, price2: number): boolean {
  if (price1 === price2) return true;
  const diff = Math.abs(price1 - price2);
  const avg = (price1 + price2) / 2;
  return (diff / avg) < 0.05; // Within 5%
}

// Find consensus among price candidates
function findPriceConsensus(candidates: PriceCandidate[]): { price: PriceCandidate | null; hasConsensus: boolean; groups: PriceCandidate[][] } {
  if (candidates.length === 0) return { price: null, hasConsensus: false, groups: [] };
  if (candidates.length === 1) return { price: candidates[0], hasConsensus: true, groups: [[candidates[0]]] };

  // Group prices that match
  const groups: PriceCandidate[][] = [];
  for (const candidate of candidates) {
    let foundGroup = false;
    for (const group of groups) {
      if (pricesMatch(candidate.price, group[0].price)) {
        group.push(candidate);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      groups.push([candidate]);
    }
  }

  // Sort groups by size (most votes first), then by confidence
  groups.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const avgConfA = a.reduce((sum, c) => sum + c.confidence, 0) / a.length;
    const avgConfB = b.reduce((sum, c) => sum + c.confidence, 0) / b.length;
    return avgConfB - avgConfA;
  });

  const largestGroup = groups[0];
  // Consensus if majority agrees (>= 50% of methods) OR if top group has significantly more votes
  const hasConsensus = largestGroup.length >= Math.ceil(candidates.length / 2) ||
                       (groups.length > 1 && largestGroup.length > groups[1].length);

  // Pick the highest confidence candidate from the winning group
  const winner = largestGroup.sort((a, b) => b.confidence - a.confidence)[0];

  return { price: winner, hasConsensus, groups };
}

// Extract price candidates from JSON-LD structured data
function extractJsonLdCandidates($: CheerioAPI): PriceCandidate[] {
  const candidates: PriceCandidate[] = [];
  try {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const content = $(scripts[i]).html();
      if (!content) continue;

      const data = JSON.parse(content) as JsonLdProduct | JsonLdProduct[];
      const product = findProduct(data);

      if (product?.offers) {
        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        const priceValue = offer.lowPrice || offer.price || offer.priceSpecification?.price;
        const currency = offer.priceCurrency || offer.priceSpecification?.priceCurrency || 'USD';

        if (priceValue) {
          const price = parseFloat(String(priceValue));
          if (!isNaN(price) && price > 0) {
            candidates.push({
              price,
              currency,
              method: 'json-ld',
              context: `Structured data: ${product.name || 'Product'}`,
              confidence: 0.9, // JSON-LD is highly reliable
            });
          }
        }
      }
    }
  } catch (_e) {
    // JSON parse error
  }
  return candidates;
}

// Extract price candidates from site-specific scraper
function extractSiteSpecificCandidates($: CheerioAPI, url: string): { candidates: PriceCandidate[]; name: string | null; imageUrl: string | null; stockStatus: StockStatus } {
  const candidates: PriceCandidate[] = [];
  let name: string | null = null;
  let imageUrl: string | null = null;
  let stockStatus: StockStatus = 'unknown';

  const siteScraper = siteScrapers.find((s) => s.match(url));
  if (siteScraper) {
    const siteResult = siteScraper.scrape($, url);
    if (siteResult.price) {
      candidates.push({
        price: siteResult.price.price,
        currency: siteResult.price.currency,
        method: 'site-specific',
        context: `Site-specific extractor for ${new URL(url).hostname}`,
        confidence: 0.85, // Site-specific scrapers are well-tested
      });
    }
    name = siteResult.name || null;
    imageUrl = siteResult.imageUrl || null;
    stockStatus = siteResult.stockStatus || 'unknown';
  }

  return { candidates, name, imageUrl, stockStatus };
}

// Extract price candidates from generic CSS selectors
function extractGenericCssCandidates($: CheerioAPI): PriceCandidate[] {
  const candidates: PriceCandidate[] = [];
  const seen = new Set<number>();

  for (const selector of genericPriceSelectors) {
    const elements = $(selector);
    elements.each((_, el) => {
      const $el = $(el);
      // Skip if this looks like an "original" or "was" price
      const classAttr = $el.attr('class') || '';
      const parentClass = $el.parent().attr('class') || '';
      if (/original|was|old|regular|compare|strikethrough|line-through/i.test(classAttr + parentClass)) {
        return;
      }

      // Check various attributes where price might be stored
      const priceAmount = $el.attr('data-price-amount');
      const dataPrice = $el.attr('data-price');
      const content = $el.attr('content');
      const text = $el.text();

      let parsed: ParsedPrice | null = null;
      let context = selector;

      // Try data-price-amount first (Magento stores numeric value here)
      if (priceAmount) {
        const price = parseFloat(priceAmount);
        if (!isNaN(price) && price > 0) {
          let currency = 'USD';
          const textSources = [text, $el.parent().text(), $el.closest('.price-box').text()];
          for (const source of textSources) {
            if (!source) continue;
            const currencyCodeMatch = source.match(/\b(CHF|EUR|GBP|USD|CAD|AUD|JPY|INR)\b/i);
            if (currencyCodeMatch) {
              currency = currencyCodeMatch[1].toUpperCase();
              break;
            }
            const symbolMatch = source.match(/([$€£¥₹])/);
            if (symbolMatch) {
              const symbolMap: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
              currency = symbolMap[symbolMatch[1]] || 'USD';
              break;
            }
          }
          parsed = { price, currency };
          context = `data-price-amount attribute`;
        }
      }

      if (!parsed) {
        const priceStr = content || dataPrice || text;
        parsed = parsePrice(priceStr);
        if (parsed) {
          context = text.trim().slice(0, 50);
        }
      }

      if (parsed && parsed.price > 0 && !seen.has(parsed.price)) {
        seen.add(parsed.price);
        candidates.push({
          price: parsed.price,
          currency: parsed.currency,
          method: 'generic-css',
          context,
          confidence: 0.6, // Generic CSS is less reliable
        });
      }
    });

    // Only take first few generic candidates to avoid noise
    if (candidates.length >= 3) break;
  }

  return candidates;
}

// Browser-based scraping for sites that block HTTP requests (e.g., Cloudflare)
async function scrapeWithBrowser(url: string): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--start-maximized',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to the page and wait for content to load
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    // Add some human-like behavior
    await page.mouse.move(100, 200);
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.mouse.move(300, 400);

    // Wait for Cloudflare challenge to complete if present
    // Check if we're on a challenge page and wait for it to resolve
    const maxWaitTime = 20000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const title = await page.title();
      // Cloudflare challenge pages have titles like "Just a moment..."
      if (!title.toLowerCase().includes('just a moment') &&
          !title.toLowerCase().includes('checking your browser')) {
        break;
      }
      console.log(`[Browser] Waiting for Cloudflare challenge to complete... (${title})`);
      // Move mouse randomly while waiting
      await page.mouse.move(
        100 + Math.random() * 500,
        100 + Math.random() * 400
      );
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Scroll down a bit like a human would
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    await page.evaluate('window.scrollBy(0, 300)');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get the full HTML content
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

export type AIStatus = 'verified' | 'corrected' | null;

export interface ScrapedProduct {
  name: string | null;
  price: ParsedPrice | null;
  imageUrl: string | null;
  url: string;
  stockStatus: StockStatus;
  aiStatus: AIStatus;
}

// Site-specific scraper configurations
interface SiteScraper {
  match: (url: string) => boolean;
  scrape: ($: CheerioAPI, url: string) => Partial<Omit<ScrapedProduct, 'url'>>;
}

const siteScrapers: SiteScraper[] = [
  // Amazon
  {
    match: (url) => /amazon\.(com|co\.uk|ca|de|fr|es|it|co\.jp|in|com\.au)/i.test(url),
    scrape: ($) => {
      // Helper to check if element is inside a coupon/savings container
      const isInCouponContainer = (el: ReturnType<typeof $>) => {
        const parents = el.parents().toArray();
        for (const parent of parents) {
          const id = $(parent).attr('id') || '';
          const className = $(parent).attr('class') || '';
          const text = $(parent).text().toLowerCase();
          if (/coupon|savings|save\s*\$|clipcoupon|promoprice/i.test(id + className)) {
            return true;
          }
          // Check if the immediate container mentions "save" or "coupon"
          if (text.includes('save $') || text.includes('coupon') || text.includes('clip')) {
            // Only consider it a coupon if it's a small container
            if (text.length < 100) return true;
          }
        }
        return false;
      };

      // Try to get the main displayed price from specific containers first
      // These are the primary price display areas on Amazon
      const primaryPriceContainers = [
        '#corePrice_feature_div',
        '#corePriceDisplay_desktop_feature_div',
        '#apex_desktop_newAccordionRow',
        '#apex_offerDisplay_desktop',
      ];

      let price: ParsedPrice | null = null;

      // First, try the primary price containers
      for (const containerId of primaryPriceContainers) {
        const container = $(containerId);
        if (!container.length) continue;

        // Look for the main price display (not savings/coupons)
        const priceElements = container.find('.a-price .a-offscreen');

        for (let i = 0; i < priceElements.length; i++) {
          const el = $(priceElements[i]);

          // Skip if this is inside a coupon container
          if (isInCouponContainer(el)) continue;

          // Skip if the parent has "savings" or similar class
          const parentClass = el.parent().attr('class') || '';
          if (/savings|coupon|save/i.test(parentClass)) continue;

          const text = el.text().trim();
          const parsed = parsePrice(text);

          // Validate the price is reasonable (not a $1 coupon)
          if (parsed && parsed.price >= 2) {
            price = parsed;
            break;
          }
        }

        if (price) break;
      }

      // Fallback: try other known price selectors
      if (!price) {
        const fallbackSelectors = [
          '#priceblock_dealprice',
          '#priceblock_saleprice',
          '#priceblock_ourprice',
          '#price_inside_buybox',
          '#newBuyBoxPrice',
          'span[data-a-color="price"] .a-offscreen',
        ];

        for (const selector of fallbackSelectors) {
          const el = $(selector).first();
          if (el.length && !isInCouponContainer(el)) {
            const text = el.text().trim();
            const parsed = parsePrice(text);
            if (parsed && parsed.price >= 2) {
              price = parsed;
              break;
            }
          }
        }
      }

      // Last resort: look for the whole/fraction price format
      if (!price) {
        const whole = $('#corePrice_feature_div .a-price-whole').first().text().replace(',', '');
        const fraction = $('#corePrice_feature_div .a-price-fraction').first().text();
        if (whole) {
          const priceStr = `$${whole}${fraction ? '.' + fraction : ''}`;
          const parsed = parsePrice(priceStr);
          if (parsed && parsed.price >= 2) {
            price = parsed;
          }
        }
      }

      // Product name
      const name = $('#productTitle').text().trim() ||
                   $('h1.a-size-large').text().trim() ||
                   null;

      // Image
      const imageUrl = $('#landingImage').attr('src') ||
                       $('#imgBlkFront').attr('src') ||
                       $('img[data-a-dynamic-image]').attr('src') ||
                       null;

      // Stock status detection
      let stockStatus: StockStatus = 'unknown';
      const availabilityText = $('#availability').text().toLowerCase();
      const outOfStockDiv = $('#outOfStock').length > 0;
      const unavailableText = $('body').text().toLowerCase();

      // Check for out of stock indicators
      if (
        outOfStockDiv ||
        availabilityText.includes('currently unavailable') ||
        availabilityText.includes('out of stock') ||
        availabilityText.includes('not available') ||
        $('#add-to-cart-button').length === 0 && $('#buy-now-button').length === 0
      ) {
        // Verify it's truly out of stock by checking for unavailable messaging
        if (
          unavailableText.includes('currently unavailable') ||
          unavailableText.includes("we don't know when or if this item will be back in stock") ||
          outOfStockDiv ||
          availabilityText.includes('out of stock')
        ) {
          stockStatus = 'out_of_stock';
        }
      } else if (
        availabilityText.includes('in stock') ||
        availabilityText.includes('available') ||
        $('#add-to-cart-button').length > 0
      ) {
        stockStatus = 'in_stock';
      }

      return { name, price, imageUrl, stockStatus };
    },
  },

  // Walmart
  {
    match: (url) => /walmart\.com/i.test(url),
    scrape: ($) => {
      let price: ParsedPrice | null = null;
      let name: string | null = null;
      let imageUrl: string | null = null;
      let stockStatus: StockStatus = 'unknown';

      // Walmart embeds product data in a __NEXT_DATA__ script tag
      try {
        const nextDataScript = $('#__NEXT_DATA__').html();
        if (nextDataScript) {
          const nextData = JSON.parse(nextDataScript);
          const productData = nextData?.props?.pageProps?.initialData?.data?.product ||
                              nextData?.props?.pageProps?.initialProps?.data?.product;

          if (productData) {
            // Get price from embedded data
            const priceInfo = productData.priceInfo?.currentPrice ||
                              productData.priceInfo?.priceRange?.minPrice;
            if (priceInfo) {
              price = {
                price: typeof priceInfo.price === 'number' ? priceInfo.price : parseFloat(priceInfo.price),
                currency: priceInfo.currencyCode || 'USD',
              };
            }

            // Get name
            name = productData.name || null;

            // Get image
            imageUrl = productData.imageInfo?.thumbnailUrl ||
                       productData.imageInfo?.allImages?.[0]?.url ||
                       null;

            // Get stock status
            const availability = productData.availabilityStatus ||
                                 productData.fulfillment?.availabilityStatus;
            if (availability) {
              const availLower = availability.toLowerCase();
              if (availLower === 'in_stock' || availLower === 'available') {
                stockStatus = 'in_stock';
              } else if (availLower === 'out_of_stock' || availLower === 'not_available') {
                stockStatus = 'out_of_stock';
              }
            }
          }
        }
      } catch (_e) {
        // JSON parse error, fall back to HTML scraping
      }

      // Fallback: Try HTML selectors if __NEXT_DATA__ didn't work
      if (!price) {
        const priceSelectors = [
          '[itemprop="price"]',
          '[data-testid="price-wrap"] span[class*="price"]',
          '.price-characteristic',
          '[data-automation="product-price"]',
          'span[data-automation-id="product-price"]',
        ];

        for (const selector of priceSelectors) {
          const el = $(selector).first();
          if (el.length) {
            const content = el.attr('content');
            const text = content || el.text().trim();
            price = parsePrice(text);
            if (price) break;
          }
        }
      }

      // Fallback: Try price from whole dollars + cents pattern
      if (!price) {
        const priceText = $('[itemprop="price"]').attr('content');
        if (priceText) {
          price = parsePrice(priceText);
        }
      }

      if (!name) {
        name = $('h1[itemprop="name"]').text().trim() ||
               $('h1#main-title').text().trim() ||
               $('[data-testid="product-title"]').text().trim() ||
               null;
      }

      if (!imageUrl) {
        imageUrl = $('[data-testid="hero-image-container"] img').attr('src') ||
                   $('img[data-testid="hero-image"]').attr('src') ||
                   $('meta[property="og:image"]').attr('content') ||
                   null;
      }

      // Fallback stock status from HTML if not found
      if (stockStatus === 'unknown') {
        const addToCartBtn = $('[data-testid="add-to-cart-button"]').length > 0 ||
                             $('button[aria-label*="Add to cart"]').length > 0;
        const outOfStockText = $('[data-testid="out-of-stock-message"]').length > 0 ||
                               $('body').text().toLowerCase().includes('out of stock');

        if (addToCartBtn) {
          stockStatus = 'in_stock';
        } else if (outOfStockText) {
          // Only mark as out of stock if we're confident
          const bodyText = $('body').text().toLowerCase();
          // Check specifically for this product being out of stock
          if (bodyText.includes('this item is currently out of stock') ||
              bodyText.includes('this product is currently unavailable') ||
              $('[data-testid="out-of-stock-message"]').length > 0) {
            stockStatus = 'out_of_stock';
          }
        }
      }

      return { name, price, imageUrl, stockStatus };
    },
  },

  // Best Buy
  {
    match: (url) => /bestbuy\.com/i.test(url),
    scrape: ($) => {
      const priceSelectors = [
        '[data-testid="customer-price"] span',
        '.priceView-customer-price span',
        '.priceView-hero-price span',
        '[class*="customerPrice"]',
        '[class*="priceView"] span[aria-hidden="true"]',
        '.pricing-price__regular-price',
        '[data-testid="product-price"]',
        '.price-box span',
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const elements = $(selector);
        console.log(`[BestBuy] Selector "${selector}" found ${elements.length} elements`);
        // Check each element, skip payment plan prices (contain "/mo", "per month", etc.)
        elements.each((_, el) => {
          if (price) return false; // Already found a valid price
          const text = $(el).text().trim();
          if (!text) return true;
          console.log(`[BestBuy] Found text: "${text.slice(0, 50)}"`);
          const lowerText = text.toLowerCase();
          // Skip if it looks like a monthly payment plan
          if (lowerText.includes('/mo') ||
              lowerText.includes('per month') ||
              lowerText.includes('monthly') ||
              lowerText.includes('financing') ||
              lowerText.includes('payment')) {
            console.log(`[BestBuy] Skipping payment plan price: "${text.slice(0, 30)}"`);
            return true; // Continue to next element
          }
          const parsed = parsePrice(text);
          if (parsed) {
            console.log(`[BestBuy] Parsed price: ${parsed.price} ${parsed.currency}`);
            price = parsed;
            return false; // Break the loop
          }
        });
        if (price) break;
      }

      const name = $('h1.heading-5').text().trim() ||
                   $('.sku-title h1').text().trim() ||
                   $('[data-testid="product-title"]').text().trim() ||
                   $('h1').first().text().trim() ||
                   null;
      console.log(`[BestBuy] Found name: "${name?.slice(0, 50)}"`);

      const imageUrl = $('img.primary-image').attr('src') ||
                       $('[data-testid="image-gallery-image"]').attr('src') ||
                       $('img[class*="product-image"]').attr('src') ||
                       null;

      console.log(`[BestBuy] Final result - name: ${!!name}, price: ${price ? (price as ParsedPrice).price : null}, image: ${!!imageUrl}`);
      return { name, price, imageUrl };
    },
  },

  // Target
  {
    match: (url) => /target\.com/i.test(url),
    scrape: ($) => {
      const priceSelectors = [
        '[data-test="product-price"]',
        '[data-test="current-price"]',
        '.styles__CurrentPriceFontSize-sc-1qc6t3e-1',
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          price = parsePrice(el.text().trim());
          if (price) break;
        }
      }

      const name = $('[data-test="product-title"]').text().trim() ||
                   $('h1[class*="Heading"]').text().trim() ||
                   null;

      const imageUrl = $('[data-test="image-gallery-item-0"] img').attr('src') ||
                       null;

      return { name, price, imageUrl };
    },
  },

  // eBay
  {
    match: (url) => /ebay\.(com|co\.uk|de|fr|ca|com\.au)/i.test(url),
    scrape: ($) => {
      const priceSelectors = [
        '[data-testid="x-price-primary"] .ux-textspans',
        '.x-price-primary .ux-textspans',
        '#prcIsum',
        '#mm-saleDscPrc',
        '.vi-price .notranslate',
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          price = parsePrice(el.text().trim());
          if (price) break;
        }
      }

      const name = $('h1.x-item-title__mainTitle span').text().trim() ||
                   $('h1[itemprop="name"]').text().trim() ||
                   null;

      const imageUrl = $('[data-testid="ux-image-carousel"] img').attr('src') ||
                       $('#icImg').attr('src') ||
                       null;

      return { name, price, imageUrl };
    },
  },

  // Newegg
  {
    match: (url) => /newegg\.com/i.test(url),
    scrape: ($) => {
      // Helper to check if element is inside a savings/combo container
      const isInSavingsContainer = (el: ReturnType<typeof $>) => {
        const parents = el.parents().toArray();
        for (const parent of parents) {
          const className = $(parent).attr('class') || '';
          const id = $(parent).attr('id') || '';
          // Skip elements inside combo deals, savings sections, or "you save" areas
          if (/combo|save|saving|deal|bundle|discount/i.test(className + id)) {
            return true;
          }
          // Check for specific Newegg combo/savings containers
          if (className.includes('item-combo') || className.includes('product-combo')) {
            return true;
          }
        }
        // Also check the element's surrounding text for "save" context
        const parentText = el.parent().text().toLowerCase();
        if (parentText.includes('you save') || parentText.includes('save $')) {
          return true;
        }
        return false;
      };

      let price: ParsedPrice | null = null;

      // First, try JSON-LD data - most reliable source
      try {
        const scripts = $('script[type="application/ld+json"]');
        scripts.each((_, script) => {
          if (price) return; // Already found
          const jsonLd = $(script).html();
          if (jsonLd) {
            const data = JSON.parse(jsonLd);
            // Handle array of JSON-LD objects
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item['@type'] === 'Product' && item.offers) {
                const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                if (offer?.price) {
                  price = {
                    price: parseFloat(String(offer.price)),
                    currency: offer.priceCurrency || 'USD',
                  };
                  break;
                }
              }
            }
          }
        });
      } catch (_e) {
        // Ignore JSON parse errors
      }

      // Fallback: Try HTML selectors, but be careful to avoid savings amounts
      if (!price) {
        // Target main product buy box price specifically
        const mainPriceContainers = [
          '.product-buy-box .price-current',
          '.price-main-product .price-current',
          '.product-price .price-current',
          '#app .price-current', // Main app container
        ];

        for (const selector of mainPriceContainers) {
          const elements = $(selector);
          elements.each((_, el) => {
            if (price) return; // Already found

            const $el = $(el);
            // Skip if inside a savings/combo container
            if (isInSavingsContainer($el)) return;

            // Combine dollar and cents parts
            const strong = $el.find('strong').text().trim() || $el.text().trim();
            const sup = $el.find('sup').text().trim();
            if (strong) {
              // Clean the strong text - remove any non-numeric chars except comma
              const cleanStrong = strong.replace(/[^0-9,]/g, '');
              if (cleanStrong) {
                const priceText = `$${cleanStrong}${sup ? '.' + sup : ''}`;
                const parsed = parsePrice(priceText);
                // Validate this looks like a real product price (Ryzen 9 should be $500+)
                if (parsed && parsed.price > 50) {
                  price = parsed;
                }
              }
            }
          });

          if (price) break;
        }
      }

      // Last resort: itemprop price
      if (!price) {
        const itemprop = $('[itemprop="price"]').first();
        if (itemprop.length) {
          const content = itemprop.attr('content');
          if (content) {
            price = parsePrice(content);
          }
        }
      }

      const name = $('h1.product-title').text().trim() ||
                   $('.product-title').text().trim() ||
                   $('[itemprop="name"]').text().trim() ||
                   null;

      const imageUrl = $('img.product-view-img-original').attr('src') ||
                       $('.product-view-img-original').attr('src') ||
                       $('[itemprop="image"]').attr('content') ||
                       null;

      // Stock status detection for Newegg
      let stockStatus: StockStatus = 'unknown';
      const buyButton = $('.btn-primary.btn-wide').text().toLowerCase();
      const soldOutBanner = $('.product-inventory').text().toLowerCase();
      const outOfStockText = $('.product-flag-text').text().toLowerCase();

      if (
        soldOutBanner.includes('out of stock') ||
        soldOutBanner.includes('sold out') ||
        outOfStockText.includes('out of stock') ||
        $('.product-buy-box .btn-message-error').length > 0
      ) {
        stockStatus = 'out_of_stock';
      } else if (
        buyButton.includes('add to cart') ||
        buyButton.includes('buy now') ||
        $('.product-buy-box .btn-primary').length > 0
      ) {
        stockStatus = 'in_stock';
      }

      return { name, price, imageUrl, stockStatus };
    },
  },

  // Home Depot
  {
    match: (url) => /homedepot\.com/i.test(url),
    scrape: ($) => {
      const priceSelectors = [
        '[data-testid="price-format"] span',
        '.price-format__main-price span',
        '#ajaxPrice',
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          price = parsePrice(el.text().trim());
          if (price) break;
        }
      }

      const name = $('h1.product-title__title').text().trim() ||
                   $('h1[class*="product-details"]').text().trim() ||
                   null;

      const imageUrl = $('img[data-testid="media-gallery-image"]').attr('src') || null;

      return { name, price, imageUrl };
    },
  },

  // Costco
  {
    match: (url) => /costco\.com/i.test(url),
    scrape: ($) => {
      const price = parsePrice($('[automation-id="productPriceOutput"]').text().trim()) ||
                    parsePrice($('.price').first().text().trim());

      const name = $('h1[itemprop="name"]').text().trim() ||
                   $('h1.product-title').text().trim() ||
                   null;

      const imageUrl = $('img.product-image').attr('src') || null;

      return { name, price, imageUrl };
    },
  },

  // AliExpress
  {
    match: (url) => /aliexpress\.com/i.test(url),
    scrape: ($) => {
      const priceSelectors = [
        '.product-price-value',
        '[class*="uniformBannerBoxPrice"]',
        '.snow-price_SnowPrice__mainS__1occeh',
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          price = parsePrice(el.text().trim());
          if (price) break;
        }
      }

      const name = $('h1[data-pl="product-title"]').text().trim() ||
                   $('h1.product-title-text').text().trim() ||
                   null;

      const imageUrl = $('img.magnifier-image').attr('src') || null;

      return { name, price, imageUrl };
    },
  },

  // Magento 2 (generic - covers many sites including Degussa)
  {
    match: (url) => {
      // Match common Magento indicators in URL or just try for any .html product page
      return /\.(html|htm)$/i.test(url) || /\/catalog\/product\//i.test(url);
    },
    scrape: ($) => {
      let price: ParsedPrice | null = null;
      let name: string | null = null;
      let imageUrl: string | null = null;

      // Magento 2 stores prices in data-price-amount attribute
      // Look for the final/special price first, then regular price
      const priceSelectors = [
        '.price-box .special-price [data-price-amount]',
        '.price-box .price-final_price [data-price-amount]',
        '.price-box [data-price-type="finalPrice"] [data-price-amount]',
        '.price-box [data-price-amount]',
        '[data-price-amount]',
      ];

      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          const priceAmount = el.attr('data-price-amount');
          if (priceAmount) {
            const priceValue = parseFloat(priceAmount);
            if (!isNaN(priceValue) && priceValue > 0) {
              // Detect currency from the page
              let currency = 'USD';
              const priceText = el.closest('.price-box').text() || el.parent().text() || '';
              const currencyMatch = priceText.match(/\b(CHF|EUR|GBP|USD|CAD|AUD)\b/i);
              if (currencyMatch) {
                currency = currencyMatch[1].toUpperCase();
              } else {
                // Check for currency symbols
                const symbolMatch = priceText.match(/([$€£])/);
                if (symbolMatch) {
                  currency = symbolMatch[1] === '€' ? 'EUR' : symbolMatch[1] === '£' ? 'GBP' : 'USD';
                }
              }
              price = { price: priceValue, currency };
              break;
            }
          }
        }
      }

      // Get product name
      name = $('h1.page-title span').text().trim() ||
             $('h1.product-name').text().trim() ||
             $('.product-info-main h1').text().trim() ||
             $('[data-ui-id="page-title-wrapper"]').text().trim() ||
             null;

      // Get product image
      imageUrl = $('[data-gallery-role="gallery"] img').first().attr('src') ||
                 $('.product.media img').first().attr('src') ||
                 $('.fotorama__stage img').first().attr('src') ||
                 null;

      // Stock status detection for Magento 2
      let stockStatus: StockStatus = 'unknown';

      // Check for Magento's stock status elements
      const stockElement = $('.product-info-stock-sku .stock').first();
      const stockText = stockElement.text().toLowerCase();
      const stockClass = stockElement.attr('class')?.toLowerCase() || '';

      // Magento uses "available" class for in-stock items
      if (stockClass.includes('available') || stockText.includes('in stock')) {
        stockStatus = 'in_stock';
      } else if (stockClass.includes('unavailable') || stockText.includes('out of stock')) {
        stockStatus = 'out_of_stock';
      }

      // Also check for add to cart button as backup
      if (stockStatus === 'unknown') {
        const addToCartBtn = $('#product-addtocart-button, button.tocart, button[title="Add to Cart"], button[title="Add to Basket"]').length > 0;
        const outOfStockMsg = $('.out-of-stock, .unavailable, [class*="outofstock"]').length > 0;

        if (addToCartBtn && !outOfStockMsg) {
          stockStatus = 'in_stock';
        } else if (outOfStockMsg) {
          stockStatus = 'out_of_stock';
        }
      }

      // Only return if we found a price (indicates it's likely a Magento site)
      if (price) {
        return { name, price, imageUrl, stockStatus };
      }
      return {};
    },
  },

];

// Generic selectors as fallback
const genericPriceSelectors = [
  '[itemprop="price"]',
  '[data-price-amount]',  // Magento 2
  '[data-price]',
  '[data-product-price]',
  '.price-wrapper [data-price-amount]',  // Magento 2 price wrapper
  '.price-box .price',  // Magento price box
  '.special-price .price',  // Magento special/sale price
  '.price',
  '.product-price',
  '.current-price',
  '.sale-price',
  '.final-price',
  '.offer-price',
  '#price',
  '[class*="price" i]',
  '[class*="Price" i]',
];

const genericNameSelectors = [
  '[itemprop="name"]',
  'h1[class*="product"]',
  'h1[class*="title"]',
  '.product-title',
  '.product-name',
  'h1',
];

const genericImageSelectors = [
  '[itemprop="image"]',
  '[property="og:image"]',
  '.product-image img',
  '.main-image img',
  '[data-zoom-image]',
  'img[class*="product"]',
];

export async function scrapeProduct(url: string, userId?: number): Promise<ScrapedProduct> {
  const result: ScrapedProduct = {
    name: null,
    price: null,
    imageUrl: null,
    url,
    stockStatus: 'unknown',
    aiStatus: null,
  };

  let html: string = '';

  try {
    let usedBrowser = false;

    try {
      const response = await axios.get<string>(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 20000,
        maxRedirects: 5,
      });
      html = response.data;
    } catch (axiosError) {
      // If we get a 403 (Forbidden), try using a headless browser
      if (axiosError instanceof AxiosError && axiosError.response?.status === 403) {
        console.log(`HTTP request blocked (403) for ${url}, falling back to browser scraping...`);
        html = await scrapeWithBrowser(url);
        usedBrowser = true;
      } else {
        throw axiosError;
      }
    }

    const $ = load(html);

    if (usedBrowser) {
      console.log(`Successfully scraped ${url} using headless browser`);
    }

    // Try site-specific scraper first
    const siteScraper = siteScrapers.find((s) => s.match(url));
    if (siteScraper) {
      const siteResult = siteScraper.scrape($, url);
      if (siteResult.name) result.name = siteResult.name;
      if (siteResult.price) result.price = siteResult.price;
      if (siteResult.imageUrl) result.imageUrl = siteResult.imageUrl;
      if (siteResult.stockStatus) result.stockStatus = siteResult.stockStatus;
    }

    // Try JSON-LD structured data
    if (!result.price || !result.name || result.stockStatus === 'unknown') {
      const jsonLdData = extractJsonLd($);
      if (jsonLdData) {
        if (!result.name && jsonLdData.name) result.name = jsonLdData.name;
        if (!result.price && jsonLdData.price) result.price = jsonLdData.price;
        if (!result.imageUrl && jsonLdData.image) result.imageUrl = jsonLdData.image;
        if (result.stockStatus === 'unknown' && jsonLdData.stockStatus) {
          result.stockStatus = jsonLdData.stockStatus;
        }
      }
    }

    // Fallback to generic scraping
    if (!result.name) {
      result.name = extractGenericName($);
    }

    if (!result.price) {
      result.price = extractGenericPrice($);
    }

    if (!result.imageUrl) {
      result.imageUrl = extractGenericImage($, url);
    }

    // Generic stock status detection if not already set
    if (result.stockStatus === 'unknown') {
      result.stockStatus = extractGenericStockStatus($);
    }

    // Try Open Graph meta tags as last resort
    if (!result.name) {
      result.name = $('meta[property="og:title"]').attr('content') || null;
    }
    if (!result.imageUrl) {
      result.imageUrl = $('meta[property="og:image"]').attr('content') || null;
    }

    // If no price found and we haven't tried browser yet, try Puppeteer
    // This handles JavaScript-rendered prices (Magento, React, Vue, etc.)
    if (!result.price && !usedBrowser) {
      console.log(`[Scraper] No price found in static HTML for ${url}, trying headless browser...`);
      try {
        html = await scrapeWithBrowser(url);
        usedBrowser = true;
        const $browser = load(html);

        // Re-try extraction with browser-rendered HTML
        // Try site-specific scraper
        const siteScraper = siteScrapers.find((s) => s.match(url));
        if (siteScraper) {
          const siteResult = siteScraper.scrape($browser, url);
          if (!result.name && siteResult.name) result.name = siteResult.name;
          if (!result.price && siteResult.price) result.price = siteResult.price;
          if (!result.imageUrl && siteResult.imageUrl) result.imageUrl = siteResult.imageUrl;
          if (result.stockStatus === 'unknown' && siteResult.stockStatus) {
            result.stockStatus = siteResult.stockStatus;
          }
        }

        // Try JSON-LD from browser-rendered HTML
        if (!result.price) {
          const jsonLdData = extractJsonLd($browser);
          if (jsonLdData) {
            if (!result.name && jsonLdData.name) result.name = jsonLdData.name;
            if (!result.price && jsonLdData.price) result.price = jsonLdData.price;
            if (!result.imageUrl && jsonLdData.image) result.imageUrl = jsonLdData.image;
            if (result.stockStatus === 'unknown' && jsonLdData.stockStatus) {
              result.stockStatus = jsonLdData.stockStatus;
            }
          }
        }

        // Try generic extraction from browser-rendered HTML
        if (!result.price) {
          result.price = extractGenericPrice($browser);
        }
        if (!result.name) {
          result.name = extractGenericName($browser);
        }
        if (!result.imageUrl) {
          result.imageUrl = extractGenericImage($browser, url);
        }
        if (result.stockStatus === 'unknown') {
          result.stockStatus = extractGenericStockStatus($browser);
        }

        if (result.price) {
          console.log(`[Scraper] Successfully extracted price ${result.price.price} ${result.price.currency} using headless browser`);
        }
      } catch (browserError) {
        console.error(`[Scraper] Browser fallback failed for ${url}:`, browserError);
      }
    }

    // If we have a price and userId is provided, try AI verification
    if (result.price && userId && html) {
      try {
        const { tryAIVerification } = await import('./ai-extractor');
        const verifyResult = await tryAIVerification(
          url,
          html,
          result.price.price,
          result.price.currency,
          userId
        );

        if (verifyResult) {
          if (verifyResult.isCorrect) {
            console.log(`[AI Verify] Confirmed price $${result.price.price} is correct (confidence: ${verifyResult.confidence})`);
            result.aiStatus = 'verified';
          } else if (verifyResult.suggestedPrice && verifyResult.confidence > 0.6) {
            console.log(`[AI Verify] Price correction: $${result.price.price} -> $${verifyResult.suggestedPrice.price} (${verifyResult.reason})`);
            result.price = verifyResult.suggestedPrice;
            result.aiStatus = 'corrected';
          } else {
            console.log(`[AI Verify] Price might be incorrect but no confident suggestion: ${verifyResult.reason}`);
            // Don't set aiStatus if verification was inconclusive
          }

          // Use AI-detected stock status if we don't have a definitive one yet
          // or if AI says it's out of stock (AI can catch pre-order/coming soon)
          if (verifyResult.stockStatus && verifyResult.stockStatus !== 'unknown') {
            if (result.stockStatus === 'unknown' || verifyResult.stockStatus === 'out_of_stock') {
              console.log(`[AI Verify] Stock status: ${verifyResult.stockStatus} (was: ${result.stockStatus})`);
              result.stockStatus = verifyResult.stockStatus;
            }
          }
        }
      } catch (verifyError) {
        console.error(`[AI Verify] Verification failed for ${url}:`, verifyError);
      }
    }

    // If we still don't have a price and userId is provided, try AI extraction as fallback
    if (!result.price && userId && html) {
      try {
        const { tryAIExtraction } = await import('./ai-extractor');
        const aiResult = await tryAIExtraction(url, html, userId);

        if (aiResult && aiResult.price && aiResult.confidence > 0.5) {
          console.log(`[AI] Successfully extracted price for ${url}: ${aiResult.price.price} (confidence: ${aiResult.confidence})`);
          result.price = aiResult.price;
          if (!result.name && aiResult.name) result.name = aiResult.name;
          if (!result.imageUrl && aiResult.imageUrl) result.imageUrl = aiResult.imageUrl;
          if (result.stockStatus === 'unknown' && aiResult.stockStatus !== 'unknown') {
            result.stockStatus = aiResult.stockStatus;
          }
        }
      } catch (aiError) {
        console.error(`[AI] Extraction failed for ${url}:`, aiError);
      }
    }
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
  }

  return result;
}

/**
 * Multi-strategy voting scraper with user review support.
 * Runs all extraction methods, finds consensus, and flags ambiguous cases for user review.
 *
 * @param anchorPrice - The price the user previously confirmed. Used to select the correct
 *                      variant on refresh when multiple prices are found.
 */
export async function scrapeProductWithVoting(
  url: string,
  userId?: number,
  preferredMethod?: ExtractionMethod,
  anchorPrice?: number
): Promise<ScrapedProductWithCandidates> {
  const result: ScrapedProductWithCandidates = {
    name: null,
    price: null,
    imageUrl: null,
    url,
    stockStatus: 'unknown',
    aiStatus: null,
    priceCandidates: [],
    needsReview: false,
  };

  let html: string = '';

  // Sites known to require JavaScript rendering
  const jsHeavySites = [
    /bestbuy\.com/i,
    /target\.com/i,
    /walmart\.com/i,
    /costco\.com/i,
  ];
  const requiresBrowser = jsHeavySites.some(pattern => pattern.test(url));

  try {
    let usedBrowser = false;

    // For JS-heavy sites, go straight to browser
    if (requiresBrowser) {
      console.log(`[Voting] ${new URL(url).hostname} requires browser rendering, using Puppeteer...`);
      html = await scrapeWithBrowser(url);
      usedBrowser = true;
    } else {
      // Fetch HTML
      try {
        const response = await axios.get<string>(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 20000,
        maxRedirects: 5,
      });
      html = response.data;
      } catch (axiosError) {
        if (axiosError instanceof AxiosError && axiosError.response?.status === 403) {
          console.log(`[Voting] HTTP blocked (403) for ${url}, using browser...`);
          html = await scrapeWithBrowser(url);
          usedBrowser = true;
        } else {
          throw axiosError;
        }
      }
    }

    let $ = load(html);

    // Collect candidates from all methods
    const allCandidates: PriceCandidate[] = [];

    // 1. JSON-LD extraction (highest reliability)
    const jsonLdCandidates = extractJsonLdCandidates($);
    allCandidates.push(...jsonLdCandidates);
    console.log(`[Voting] JSON-LD found ${jsonLdCandidates.length} candidates`);

    // 2. Site-specific extraction
    const siteResult = extractSiteSpecificCandidates($, url);
    allCandidates.push(...siteResult.candidates);
    if (siteResult.name) result.name = siteResult.name;
    if (siteResult.imageUrl) result.imageUrl = siteResult.imageUrl;
    if (siteResult.stockStatus !== 'unknown') result.stockStatus = siteResult.stockStatus;
    console.log(`[Voting] Site-specific found ${siteResult.candidates.length} candidates`);

    // 3. Generic CSS extraction
    const genericCandidates = extractGenericCssCandidates($);
    allCandidates.push(...genericCandidates);
    console.log(`[Voting] Generic CSS found ${genericCandidates.length} candidates`);

    // If no candidates found in static HTML, try browser rendering
    if (allCandidates.length === 0 && !usedBrowser) {
      console.log(`[Voting] No candidates in static HTML, trying browser...`);
      try {
        html = await scrapeWithBrowser(url);
        usedBrowser = true;
        $ = load(html);

        // Re-run all extraction methods
        allCandidates.push(...extractJsonLdCandidates($));
        const browserSiteResult = extractSiteSpecificCandidates($, url);
        allCandidates.push(...browserSiteResult.candidates);
        if (!result.name && browserSiteResult.name) result.name = browserSiteResult.name;
        if (!result.imageUrl && browserSiteResult.imageUrl) result.imageUrl = browserSiteResult.imageUrl;
        if (result.stockStatus === 'unknown' && browserSiteResult.stockStatus !== 'unknown') {
          result.stockStatus = browserSiteResult.stockStatus;
        }
        allCandidates.push(...extractGenericCssCandidates($));
        console.log(`[Voting] Browser found ${allCandidates.length} total candidates`);
      } catch (browserError) {
        console.error(`[Voting] Browser fallback failed:`, browserError);
      }
    }

    // Fill in missing metadata
    if (!result.name) {
      result.name = extractGenericName($) || $('meta[property="og:title"]').attr('content') || null;
    }
    if (!result.imageUrl) {
      result.imageUrl = extractGenericImage($, url) || $('meta[property="og:image"]').attr('content') || null;
    }
    if (result.stockStatus === 'unknown') {
      result.stockStatus = extractGenericStockStatus($);
    }

    // Store all candidates
    result.priceCandidates = allCandidates;

    // PRIORITY 1: If we have an anchor price, it takes precedence (user confirmed this price)
    // This handles variant products where multiple prices exist on the page
    if (anchorPrice && allCandidates.length > 0) {
      console.log(`[Voting] Have anchor price ${anchorPrice}, searching ${allCandidates.length} candidates...`);

      // Find the candidate closest to the anchor price
      const closestCandidate = allCandidates.reduce((closest, candidate) => {
        const closestDiff = Math.abs(closest.price - anchorPrice);
        const candidateDiff = Math.abs(candidate.price - anchorPrice);
        return candidateDiff < closestDiff ? candidate : closest;
      });

      const priceDiff = Math.abs(closestCandidate.price - anchorPrice) / anchorPrice;

      // Use anchor matching if within 10% (tight tolerance for variants)
      // or if it's an exact match
      if (closestCandidate.price === anchorPrice || priceDiff < 0.10) {
        console.log(`[Voting] Found match for anchor price ${anchorPrice}: ${closestCandidate.price} via ${closestCandidate.method} (${(priceDiff * 100).toFixed(1)}% diff)`);
        result.price = { price: closestCandidate.price, currency: closestCandidate.currency };
        result.selectedMethod = closestCandidate.method;
        return result;
      } else {
        // No close match - price may have legitimately changed
        console.log(`[Voting] No candidate close to anchor price ${anchorPrice} (closest: ${closestCandidate.price}, ${(priceDiff * 100).toFixed(1)}% diff)`);
        // Fall through to preferred method or consensus
      }
    }

    // PRIORITY 2: If user has a preferred method and no anchor match, try that method
    if (preferredMethod && allCandidates.length > 0) {
      const preferredCandidates = allCandidates.filter(c => c.method === preferredMethod);
      if (preferredCandidates.length > 0) {
        // Use highest confidence candidate from preferred method
        const selectedCandidate = preferredCandidates.sort((a, b) => b.confidence - a.confidence)[0];
        console.log(`[Voting] Using preferred method ${preferredMethod}: ${selectedCandidate.price}`);
        result.price = { price: selectedCandidate.price, currency: selectedCandidate.currency };
        result.selectedMethod = preferredMethod;
        return result;
      }
    }

    // Find consensus
    const { price: consensusPrice, hasConsensus, groups } = findPriceConsensus(allCandidates);
    console.log(`[Voting] Consensus: ${hasConsensus}, Groups: ${groups.length}, Winner: ${consensusPrice?.price}`);

    if (hasConsensus && consensusPrice) {
      // Clear consensus - use the winning price
      result.price = { price: consensusPrice.price, currency: consensusPrice.currency };
      result.selectedMethod = consensusPrice.method;
      console.log(`[Voting] Consensus price: ${consensusPrice.price} via ${consensusPrice.method}`);
    } else if (allCandidates.length > 0) {
      // No consensus - try AI arbitration if available
      if (userId && html) {
        console.log(`[Voting] No consensus, trying AI arbitration...`);
        try {
          const { tryAIArbitration } = await import('./ai-extractor');
          const aiResult = await tryAIArbitration(url, html, allCandidates, userId);

          if (aiResult && aiResult.selectedPrice) {
            console.log(`[Voting] AI selected price: ${aiResult.selectedPrice.price} (reason: ${aiResult.reason})`);
            result.price = { price: aiResult.selectedPrice.price, currency: aiResult.selectedPrice.currency };
            result.selectedMethod = aiResult.selectedPrice.method;
            result.aiStatus = 'verified';

            // Add AI as a candidate for transparency
            if (!allCandidates.find(c => c.method === 'ai')) {
              result.priceCandidates.push({
                price: aiResult.selectedPrice.price,
                currency: aiResult.selectedPrice.currency,
                method: 'ai',
                context: `AI arbitration: ${aiResult.reason}`,
                confidence: aiResult.confidence || 0.8,
              });
            }
          } else {
            // AI couldn't decide either - flag for user review
            console.log(`[Voting] AI couldn't decide, flagging for user review`);
            result.needsReview = true;
            // Use the most confident candidate as default
            const bestCandidate = allCandidates.sort((a, b) => b.confidence - a.confidence)[0];
            result.price = { price: bestCandidate.price, currency: bestCandidate.currency };
            result.selectedMethod = bestCandidate.method;
          }
        } catch (aiError) {
          console.error(`[Voting] AI arbitration failed:`, aiError);
          // Fall back to flagging for user review
          result.needsReview = true;
          const bestCandidate = allCandidates.sort((a, b) => b.confidence - a.confidence)[0];
          result.price = { price: bestCandidate.price, currency: bestCandidate.currency };
          result.selectedMethod = bestCandidate.method;
        }
      } else {
        // No AI available - flag for user review if multiple prices differ significantly
        if (groups.length > 1) {
          result.needsReview = true;
          console.log(`[Voting] Multiple price groups found, flagging for user review`);
        }
        // Use the most confident candidate as default
        const bestCandidate = allCandidates.sort((a, b) => b.confidence - a.confidence)[0];
        result.price = { price: bestCandidate.price, currency: bestCandidate.currency };
        result.selectedMethod = bestCandidate.method;
      }
    } else {
      // No candidates at all - try pure AI extraction
      if (userId && html) {
        console.log(`[Voting] No candidates found, trying AI extraction...`);
        try {
          const { tryAIExtraction } = await import('./ai-extractor');
          const aiResult = await tryAIExtraction(url, html, userId);

          if (aiResult && aiResult.price && aiResult.confidence > 0.5) {
            console.log(`[Voting] AI extracted price: ${aiResult.price.price}`);
            result.price = aiResult.price;
            result.selectedMethod = 'ai';
            result.priceCandidates.push({
              price: aiResult.price.price,
              currency: aiResult.price.currency,
              method: 'ai',
              context: 'AI extraction (no other methods found price)',
              confidence: aiResult.confidence,
            });
            if (!result.name && aiResult.name) result.name = aiResult.name;
            if (!result.imageUrl && aiResult.imageUrl) result.imageUrl = aiResult.imageUrl;
            if (result.stockStatus === 'unknown' && aiResult.stockStatus !== 'unknown') {
              result.stockStatus = aiResult.stockStatus;
            }
          }
        } catch (aiError) {
          console.error(`[Voting] AI extraction failed:`, aiError);
        }
      }
    }

    // If we have a price but AI is available, verify it
    if (result.price && userId && html && !result.aiStatus) {
      try {
        const { tryAIVerification } = await import('./ai-extractor');
        const verifyResult = await tryAIVerification(
          url,
          html,
          result.price.price,
          result.price.currency,
          userId
        );

        if (verifyResult) {
          if (verifyResult.isCorrect) {
            result.aiStatus = 'verified';
          } else if (verifyResult.suggestedPrice && verifyResult.confidence > 0.7) {
            // AI suggests a different price - this might indicate we need review
            const existingCandidate = allCandidates.find(c =>
              pricesMatch(c.price, verifyResult.suggestedPrice!.price)
            );
            if (existingCandidate) {
              // AI agrees with one of our candidates - use that
              result.price = verifyResult.suggestedPrice;
              result.selectedMethod = existingCandidate.method;
              result.aiStatus = 'corrected';
            } else if (!result.needsReview) {
              // AI suggests a price we didn't find - flag for review
              result.needsReview = true;
              result.priceCandidates.push({
                price: verifyResult.suggestedPrice.price,
                currency: verifyResult.suggestedPrice.currency,
                method: 'ai',
                context: `AI suggestion: ${verifyResult.reason}`,
                confidence: verifyResult.confidence,
              });
            }
          }

          // Update stock status from AI
          if (verifyResult.stockStatus && verifyResult.stockStatus !== 'unknown') {
            if (result.stockStatus === 'unknown' || verifyResult.stockStatus === 'out_of_stock') {
              result.stockStatus = verifyResult.stockStatus;
            }
          }
        }
      } catch (verifyError) {
        console.error(`[Voting] AI verification failed:`, verifyError);
      }
    }

  } catch (error) {
    console.error(`[Voting] Error scraping ${url}:`, error);
  }

  return result;
}

interface JsonLdProduct {
  '@type'?: string;
  '@graph'?: JsonLdProduct[];
  name?: string;
  image?: string | string[] | { url?: string };
  offers?: JsonLdOffer | JsonLdOffer[];
}

interface JsonLdPriceSpecification {
  price?: string | number;
  priceCurrency?: string;
}

interface JsonLdOffer {
  '@type'?: string;
  price?: string | number;
  priceCurrency?: string;
  lowPrice?: string | number;
  priceSpecification?: JsonLdPriceSpecification;
  availability?: string;
}

function extractJsonLd(
  $: CheerioAPI
): { name?: string; price?: ParsedPrice; image?: string; stockStatus?: StockStatus } | null {
  try {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const content = $(scripts[i]).html();
      if (!content) continue;

      const data = JSON.parse(content) as JsonLdProduct | JsonLdProduct[];
      const product = findProduct(data);

      if (product) {
        const result: { name?: string; price?: ParsedPrice; image?: string; stockStatus?: StockStatus } = {};

        if (product.name) {
          result.name = product.name;
        }

        if (product.offers) {
          const offer = Array.isArray(product.offers)
            ? product.offers[0]
            : product.offers;

          // Get price, checking multiple locations:
          // 1. lowPrice (for price ranges)
          // 2. price (direct)
          // 3. priceSpecification.price (nested format used by some sites)
          const priceValue = offer.lowPrice || offer.price || offer.priceSpecification?.price;
          const currency = offer.priceCurrency || offer.priceSpecification?.priceCurrency || 'USD';

          if (priceValue) {
            result.price = {
              price: parseFloat(String(priceValue)),
              currency,
            };
          }

          // Extract stock status from availability
          if (offer.availability) {
            const avail = offer.availability.toLowerCase();
            if (avail.includes('instock') || avail.includes('in_stock')) {
              result.stockStatus = 'in_stock';
            } else if (avail.includes('outofstock') || avail.includes('out_of_stock') ||
                       avail.includes('soldout') || avail.includes('sold_out')) {
              result.stockStatus = 'out_of_stock';
            }
          }
        }

        if (product.image) {
          if (Array.isArray(product.image)) {
            result.image = product.image[0];
          } else if (typeof product.image === 'string') {
            result.image = product.image;
          } else if (product.image.url) {
            result.image = product.image.url;
          }
        }

        return result;
      }
    }
  } catch (_e) {
    // JSON parse error, continue with other methods
  }
  return null;
}

function findProduct(data: JsonLdProduct | JsonLdProduct[]): JsonLdProduct | null {
  if (!data) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProduct(item);
      if (found) return found;
    }
    return null;
  }

  if (data['@type'] === 'Product') {
    return data;
  }

  if (data['@graph'] && Array.isArray(data['@graph'])) {
    for (const item of data['@graph']) {
      const found = findProduct(item);
      if (found) return found;
    }
  }

  return null;
}

function extractGenericPrice($: CheerioAPI): ParsedPrice | null {
  const prices: ParsedPrice[] = [];

  for (const selector of genericPriceSelectors) {
    const elements = $(selector);
    elements.each((_, el) => {
      const $el = $(el);
      // Skip if this looks like an "original" or "was" price
      const classAttr = $el.attr('class') || '';
      const parentClass = $el.parent().attr('class') || '';
      if (/original|was|old|regular|compare|strikethrough|line-through/i.test(classAttr + parentClass)) {
        return;
      }

      // Check various attributes where price might be stored
      const priceAmount = $el.attr('data-price-amount');  // Magento 2
      const dataPrice = $el.attr('data-price');
      const content = $el.attr('content');
      const text = $el.text();

      // Try data-price-amount first (Magento stores numeric value here)
      if (priceAmount) {
        const price = parseFloat(priceAmount);
        if (!isNaN(price) && price > 0) {
          // Try to detect currency from nearby elements, parent, or page
          let currency = 'USD';

          // Look for currency in the element's text, parent, and price-box container
          const textSources = [
            text,
            $el.parent().text(),
            $el.closest('.price-box').text(),
            $el.closest('.price-wrapper').text(),
            $el.closest('[class*="price"]').text(),
          ];

          for (const source of textSources) {
            if (!source) continue;
            // Look for known currency codes first (more specific)
            const currencyCodeMatch = source.match(/\b(CHF|EUR|GBP|USD|CAD|AUD|JPY|INR)\b/i);
            if (currencyCodeMatch) {
              currency = currencyCodeMatch[1].toUpperCase();
              break;
            }
            // Then try currency symbols
            const symbolMatch = source.match(/([$€£¥₹])/);
            if (symbolMatch) {
              const symbolMap: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
              currency = symbolMap[symbolMatch[1]] || 'USD';
              break;
            }
          }

          prices.push({ price, currency });
          return;
        }
      }

      const priceStr = content || dataPrice || text;
      const parsed = parsePrice(priceStr);
      if (parsed && parsed.price > 0) {
        prices.push(parsed);
      }
    });

    if (prices.length > 0) break;
  }

  return findMostLikelyPrice(prices);
}

function extractGenericName($: CheerioAPI): string | null {
  for (const selector of genericNameSelectors) {
    const element = $(selector).first();
    if (element.length) {
      const text = element.text().trim();
      if (text && text.length > 0 && text.length < 500) {
        return text;
      }
    }
  }
  return null;
}

function extractGenericImage($: CheerioAPI, baseUrl: string): string | null {
  for (const selector of genericImageSelectors) {
    const element = $(selector).first();
    if (element.length) {
      const src =
        element.attr('src') ||
        element.attr('content') ||
        element.attr('data-zoom-image') ||
        element.attr('data-src');
      if (src) {
        try {
          return new URL(src, baseUrl).href;
        } catch (_e) {
          return src;
        }
      }
    }
  }
  return null;
}

function extractGenericStockStatus($: CheerioAPI): StockStatus {
  // First, check for schema.org availability - most reliable
  const availability = $('[itemprop="availability"]').attr('content') ||
                       $('[itemprop="availability"]').attr('href') || '';
  if (availability.toLowerCase().includes('outofstock') ||
      availability.toLowerCase().includes('discontinued') ||
      availability.toLowerCase().includes('preorder')) {
    return 'out_of_stock';
  }
  if (availability.toLowerCase().includes('instock') ||
      availability.toLowerCase().includes('available')) {
    return 'in_stock';
  }

  // Be conservative - only check main product area text, not entire body
  // to avoid false positives from sidebar recommendations, etc.
  const mainContent = $('main, [role="main"], #main, .main-content, .product-detail, .pdp-main').text().toLowerCase();
  const textToCheck = mainContent || $('body').text().toLowerCase().slice(0, 5000);

  // Check for pre-order / coming soon indicators BEFORE checking add to cart
  // Some sites show a "Pre-order" button that looks like add to cart
  // NOTE: Be careful with generic phrases - "available in" matches "available in stock"!
  const preOrderComingSoonPhrases = [
    'coming soon',
    'available soon',
    'arriving soon',
    'releases on',
    'release date',
    'expected release',
    'launches on',
    'launching soon',
    'pre-order',
    'preorder',
    'pre order',
    'notify me when available',
    'notify when available',
    'sign up to be notified',
    'sign up for availability',
    'email me when available',
    'get notified when',
    'join the waitlist',
    'join waitlist',
    'not yet released',
    'not yet available',
    // Specific future availability phrases (avoid generic "available in" which matches "available in stock")
    'available starting',
    'available from',  // Usually followed by a date
    'ships in',        // Usually indicates future shipping
    'expected to ship',
    'estimated arrival',
  ];

  // Phrases that indicate the product is NOT coming soon (should not trigger out of stock)
  const inStockPhrases = [
    'in stock',
    'add to cart',
    'add to basket',
    'buy now',
    'available now',
    'ships today',
    'ships immediately',
    'ready to ship',
  ];

  // First, check if the page has strong in-stock indicators
  // If so, don't let pre-order phrase matching override it
  let hasInStockIndicator = false;
  for (const phrase of inStockPhrases) {
    if (textToCheck.includes(phrase)) {
      hasInStockIndicator = true;
      break;
    }
  }

  // Only check for pre-order/coming soon if we don't have a clear in-stock indicator
  if (!hasInStockIndicator) {
    for (const phrase of preOrderComingSoonPhrases) {
      if (textToCheck.includes(phrase)) {
        // Double check it's not just a section about pre-orders in general
        // by looking for the phrase near price/product context
        const phraseIndex = textToCheck.indexOf(phrase);
        const contextStart = Math.max(0, phraseIndex - 200);
        const contextEnd = Math.min(textToCheck.length, phraseIndex + 200);
        const context = textToCheck.substring(contextStart, contextEnd);

        // If the context mentions price, buy, cart, or product, it's likely about this product
        if (context.includes('$') || context.includes('price') ||
            context.includes('buy') || context.includes('cart') ||
            context.includes('order') || context.includes('purchase')) {
          return 'out_of_stock';
        }
      }
    }
  }

  // Check for explicit pre-order/coming soon elements
  const hasPreOrderBadge = $('[class*="pre-order" i]').length > 0 ||
                           $('[class*="preorder" i]').length > 0 ||
                           $('[class*="coming-soon" i]').length > 0 ||
                           $('[class*="comingsoon" i]').length > 0 ||
                           $('[data-testid*="pre-order" i]').length > 0 ||
                           $('[data-testid*="coming-soon" i]').length > 0 ||
                           $('button:contains("Pre-order")').length > 0 ||
                           $('button:contains("Preorder")').length > 0 ||
                           $('button:contains("Notify Me")').length > 0;

  if (hasPreOrderBadge) {
    return 'out_of_stock';
  }

  // Check for add to cart button - strong indicator of in stock
  // But make sure it's not a pre-order button
  const addToCartButtons = $('button[class*="add-to-cart" i], button[id*="add-to-cart" i], [data-testid*="add-to-cart" i], button:contains("Add to Cart"), input[value*="Add to Cart" i]');
  let hasRealAddToCart = false;

  addToCartButtons.each((_, el) => {
    const buttonText = $(el).text().toLowerCase();
    const buttonClass = $(el).attr('class')?.toLowerCase() || '';
    // Make sure it's not a pre-order or notify button
    if (!buttonText.includes('pre-order') &&
        !buttonText.includes('preorder') &&
        !buttonText.includes('notify') &&
        !buttonText.includes('waitlist') &&
        !buttonClass.includes('pre-order') &&
        !buttonClass.includes('preorder')) {
      hasRealAddToCart = true;
    }
  });

  if (hasRealAddToCart) {
    return 'in_stock';
  }

  // Check for explicit out-of-stock elements - be specific
  const hasOutOfStockBadge = $('[class*="out-of-stock" i]').length > 0 ||
                              $('[class*="sold-out" i]').length > 0 ||
                              $('[data-testid*="out-of-stock" i]').length > 0;

  if (hasOutOfStockBadge) {
    return 'out_of_stock';
  }

  // Strong out-of-stock phrases (must be exact matches to avoid false positives)
  const strongOutOfStockPhrases = [
    'this item is out of stock',
    'this product is out of stock',
    'currently out of stock',
    'this item is currently unavailable',
    'this product is currently unavailable',
    'temporarily out of stock',
    'this item is sold out',
  ];

  for (const phrase of strongOutOfStockPhrases) {
    if (textToCheck.includes(phrase)) {
      return 'out_of_stock';
    }
  }

  // Default to unknown rather than guessing
  return 'unknown';
}

export async function scrapePrice(url: string): Promise<ParsedPrice | null> {
  const product = await scrapeProduct(url);
  return product.price;
}
