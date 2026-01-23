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

      // Only return if we found a price (indicates it's likely a Magento site)
      if (price) {
        return { name, price, imageUrl };
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
  const preOrderComingSoonPhrases = [
    'coming soon',
    'coming in',
    'available soon',
    'available in',
    'arriving soon',
    'arriving in',
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
    'coming this',
    'coming next',
    'available starting',
  ];

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
