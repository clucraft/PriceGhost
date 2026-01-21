import axios from 'axios';
import { load, type CheerioAPI } from 'cheerio';
import {
  parsePrice,
  ParsedPrice,
  findMostLikelyPrice,
} from '../utils/priceParser';

export interface ScrapedProduct {
  name: string | null;
  price: ParsedPrice | null;
  imageUrl: string | null;
  url: string;
}

// Site-specific scraper configurations
interface SiteScraper {
  match: (url: string) => boolean;
  scrape: ($: CheerioAPI, url: string) => Partial<ScrapedProduct>;
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

      return { name, price, imageUrl };
    },
  },

  // Walmart
  {
    match: (url) => /walmart\.com/i.test(url),
    scrape: ($) => {
      // Walmart uses various price containers
      const priceSelectors = [
        '[data-testid="price-wrap"] [itemprop="price"]',
        '[itemprop="price"]',
        '.price-characteristic',
        '[data-automation="product-price"]',
        '.prod-PriceHero .price-group',
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          const content = el.attr('content');
          const text = content || el.text().trim();
          price = parsePrice(text);
          if (price) break;
        }
      }

      // Also try to get price from the whole dollars + cents pattern
      if (!price) {
        const dollars = $('[data-testid="price-wrap"] .f2').text().trim();
        const cents = $('[data-testid="price-wrap"] .f6').text().trim();
        if (dollars) {
          price = parsePrice(`$${dollars}${cents ? '.' + cents : ''}`);
        }
      }

      const name = $('h1[itemprop="name"]').text().trim() ||
                   $('h1.prod-ProductTitle').text().trim() ||
                   null;

      const imageUrl = $('[data-testid="hero-image-container"] img').attr('src') ||
                       $('img.prod-hero-image').attr('src') ||
                       null;

      return { name, price, imageUrl };
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
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          price = parsePrice(el.text().trim());
          if (price) break;
        }
      }

      const name = $('h1.heading-5').text().trim() ||
                   $('.sku-title h1').text().trim() ||
                   null;

      const imageUrl = $('img.primary-image').attr('src') ||
                       $('[data-testid="image-gallery-image"]').attr('src') ||
                       null;

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
      const price = parsePrice($('.price-current').text().trim()) ||
                    parsePrice($('[itemprop="price"]').attr('content') || '');

      const name = $('h1.product-title').text().trim() || null;
      const imageUrl = $('img.product-view-img-original').attr('src') || null;

      return { name, price, imageUrl };
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
];

// Generic selectors as fallback
const genericPriceSelectors = [
  '[itemprop="price"]',
  '[data-price]',
  '[data-product-price]',
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

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const result: ScrapedProduct = {
    name: null,
    price: null,
    imageUrl: null,
    url,
  };

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

    const $ = load(response.data);

    // Try site-specific scraper first
    const siteScraper = siteScrapers.find((s) => s.match(url));
    if (siteScraper) {
      const siteResult = siteScraper.scrape($, url);
      if (siteResult.name) result.name = siteResult.name;
      if (siteResult.price) result.price = siteResult.price;
      if (siteResult.imageUrl) result.imageUrl = siteResult.imageUrl;
    }

    // Try JSON-LD structured data
    if (!result.price || !result.name) {
      const jsonLdData = extractJsonLd($);
      if (jsonLdData) {
        if (!result.name && jsonLdData.name) result.name = jsonLdData.name;
        if (!result.price && jsonLdData.price) result.price = jsonLdData.price;
        if (!result.imageUrl && jsonLdData.image) result.imageUrl = jsonLdData.image;
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

    // Try Open Graph meta tags as last resort
    if (!result.name) {
      result.name = $('meta[property="og:title"]').attr('content') || null;
    }
    if (!result.imageUrl) {
      result.imageUrl = $('meta[property="og:image"]').attr('content') || null;
    }
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
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

interface JsonLdOffer {
  '@type'?: string;
  price?: string | number;
  priceCurrency?: string;
  lowPrice?: string | number;
}

function extractJsonLd(
  $: CheerioAPI
): { name?: string; price?: ParsedPrice; image?: string } | null {
  try {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const content = $(scripts[i]).html();
      if (!content) continue;

      const data = JSON.parse(content) as JsonLdProduct | JsonLdProduct[];
      const product = findProduct(data);

      if (product) {
        const result: { name?: string; price?: ParsedPrice; image?: string } = {};

        if (product.name) {
          result.name = product.name;
        }

        if (product.offers) {
          const offer = Array.isArray(product.offers)
            ? product.offers[0]
            : product.offers;

          // Get price, preferring lowPrice for ranges
          const priceValue = offer.lowPrice || offer.price;
          if (priceValue) {
            result.price = {
              price: parseFloat(String(priceValue)),
              currency: offer.priceCurrency || 'USD',
            };
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

      const text = $el.attr('content') || $el.attr('data-price') || $el.text();
      const parsed = parsePrice(text);
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

export async function scrapePrice(url: string): Promise<ParsedPrice | null> {
  const product = await scrapeProduct(url);
  return product.price;
}
