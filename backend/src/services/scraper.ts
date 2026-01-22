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
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

    // Wait for Cloudflare challenge to complete if present
    // Check if we're on a challenge page and wait for it to resolve
    const maxWaitTime = 15000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const title = await page.title();
      // Cloudflare challenge pages have titles like "Just a moment..."
      if (!title.toLowerCase().includes('just a moment') &&
          !title.toLowerCase().includes('checking your browser')) {
        break;
      }
      console.log(`[Browser] Waiting for Cloudflare challenge to complete... (${title})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Additional wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the full HTML content
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

export interface ScrapedProduct {
  name: string | null;
  price: ParsedPrice | null;
  imageUrl: string | null;
  url: string;
  stockStatus: StockStatus;
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
      // Try multiple price selectors
      const priceSelectors = [
        '.price-current',
        '.price-current strong',
        '[itemprop="price"]',
        '.product-price .price-current',
        '.product-buy-box .price-current',
        '.price-main-product .price-current',
      ];

      let price: ParsedPrice | null = null;
      for (const selector of priceSelectors) {
        const el = $(selector).first();
        if (el.length) {
          // For price-current, combine the dollar and cents parts
          if (selector.includes('price-current')) {
            const strong = el.find('strong').text().trim() || el.text().trim();
            const sup = el.find('sup').text().trim();
            if (strong) {
              const priceText = `$${strong}${sup ? '.' + sup : ''}`;
              price = parsePrice(priceText);
              if (price) break;
            }
          }
          // Try content attribute for itemprop
          const content = el.attr('content');
          if (content) {
            price = parsePrice(content);
            if (price) break;
          }
          // Try text content
          price = parsePrice(el.text().trim());
          if (price) break;
        }
      }

      // Also try JSON-LD data
      if (!price) {
        try {
          const jsonLd = $('script[type="application/ld+json"]').first().html();
          if (jsonLd) {
            const data = JSON.parse(jsonLd);
            if (data.offers?.price) {
              price = {
                price: parseFloat(String(data.offers.price)),
                currency: data.offers.priceCurrency || 'USD',
              };
            }
          }
        } catch (_e) {
          // Ignore JSON parse errors
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

  // B&H Photo Video
  {
    match: (url) => /bhphotovideo\.com/i.test(url),
    scrape: ($) => {
      let price: ParsedPrice | null = null;
      let name: string | null = null;
      let imageUrl: string | null = null;
      let stockStatus: StockStatus = 'unknown';

      // Debug: Check page title and body length
      const pageTitle = $('title').text();
      const bodyLength = $('body').html()?.length || 0;
      console.log(`[B&H] Page title: "${pageTitle}", body length: ${bodyLength}`);

      // Try to get data from JSON-LD first
      try {
        const scripts = $('script[type="application/ld+json"]');
        console.log(`[B&H] Found ${scripts.length} JSON-LD scripts`);
        scripts.each((_i, script) => {
          const content = $(script).html();
          if (!content) return;
          try {
            const data = JSON.parse(content);
            console.log(`[B&H] JSON-LD type: ${data['@type']}`);
            if (data['@type'] === 'Product' || data.offers) {
              if (data.name && !name) {
                name = data.name;
                console.log(`[B&H] Found name: ${name}`);
              }
              if (data.image && !imageUrl) {
                imageUrl = Array.isArray(data.image) ? data.image[0] : data.image;
              }
              if (data.offers && !price) {
                const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
                console.log(`[B&H] Offer data: ${JSON.stringify(offer).slice(0, 200)}`);
                if (offer.price) {
                  price = {
                    price: parseFloat(String(offer.price)),
                    currency: offer.priceCurrency || 'USD',
                  };
                  console.log(`[B&H] Found price from JSON-LD: ${price.price}`);
                }
                // Check availability from JSON-LD
                if (offer.availability) {
                  const avail = offer.availability.toLowerCase();
                  if (avail.includes('instock')) {
                    stockStatus = 'in_stock';
                  } else if (avail.includes('outofstock')) {
                    stockStatus = 'out_of_stock';
                  }
                }
              }
            }
          } catch (_e) {
            // JSON-LD parse error, continue
          }
        });
      } catch (_e) {
        // JSON-LD extraction error, continue
      }

      // Fallback to HTML selectors
      if (!price) {
        console.log(`[B&H] No price from JSON-LD, trying HTML selectors`);
        const priceSelectors = [
          '[data-selenium="pricingPrice"]',
          '[data-selenium="uppedDecimalPriceFirst"]',
          '.price_1DPoToKrLP1U',
          '[class*="price_"] span',
          '.priceInfo span[class*="price"]',
        ];

        for (const selector of priceSelectors) {
          const el = $(selector).first();
          console.log(`[B&H] Selector "${selector}": found ${el.length} elements`);
          if (el.length) {
            const text = el.text().trim();
            console.log(`[B&H] Element text: "${text.slice(0, 100)}"`);
            price = parsePrice(text);
            if (price) {
              console.log(`[B&H] Parsed price: ${price.price}`);
              break;
            }
          }
        }
      }

      // Try combining dollars and cents if still no price
      if (!price) {
        const priceContainer = $('[data-selenium="pricingPrice"]').first();
        if (priceContainer.length) {
          const fullText = priceContainer.text().replace(/\s+/g, '');
          price = parsePrice(fullText);
        }
      }

      if (!name) {
        name = $('h1[data-selenium="productTitle"]').text().trim() ||
               $('h1[class*="title_"]').text().trim() ||
               $('[data-selenium="productTitle"]').text().trim() ||
               null;
      }

      if (!imageUrl) {
        imageUrl = $('[data-selenium="mainImage"] img').attr('src') ||
                   $('img[data-selenium="mainImage"]').attr('src') ||
                   $('meta[property="og:image"]').attr('content') ||
                   null;
      }

      // Stock status from HTML
      if (stockStatus === 'unknown') {
        const addToCartBtn = $('[data-selenium="addToCartButton"]').length > 0;
        const notifyBtn = $('[data-selenium="notifyAvailabilityButton"]').length > 0;
        const outOfStockText = $('body').text().toLowerCase();

        if (addToCartBtn) {
          stockStatus = 'in_stock';
        } else if (notifyBtn || outOfStockText.includes('notify when available') ||
                   outOfStockText.includes('temporarily unavailable')) {
          stockStatus = 'out_of_stock';
        }
      }

      console.log(`[B&H] Final result - name: ${name?.slice(0, 50)}, price: ${price?.price}, stock: ${stockStatus}`);
      return { name, price, imageUrl, stockStatus };
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
    stockStatus: 'unknown',
  };

  try {
    let html: string;
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

function extractGenericStockStatus($: CheerioAPI): StockStatus {
  // First, check for schema.org availability - most reliable
  const availability = $('[itemprop="availability"]').attr('content') ||
                       $('[itemprop="availability"]').attr('href') || '';
  if (availability.toLowerCase().includes('outofstock') ||
      availability.toLowerCase().includes('discontinued')) {
    return 'out_of_stock';
  }
  if (availability.toLowerCase().includes('instock') ||
      availability.toLowerCase().includes('available')) {
    return 'in_stock';
  }

  // Check for add to cart button - strong indicator of in stock
  const hasAddToCart = $('button[class*="add-to-cart" i]').length > 0 ||
                       $('button[id*="add-to-cart" i]').length > 0 ||
                       $('[data-testid*="add-to-cart" i]').length > 0 ||
                       $('button:contains("Add to Cart")').length > 0 ||
                       $('input[value*="Add to Cart" i]').length > 0;

  if (hasAddToCart) {
    return 'in_stock';
  }

  // Check for explicit out-of-stock elements - be specific
  const hasOutOfStockBadge = $('[class*="out-of-stock" i]').length > 0 ||
                              $('[class*="sold-out" i]').length > 0 ||
                              $('[data-testid*="out-of-stock" i]').length > 0;

  if (hasOutOfStockBadge) {
    return 'out_of_stock';
  }

  // Be conservative - only check main product area text, not entire body
  // to avoid false positives from sidebar recommendations, etc.
  const mainContent = $('main, [role="main"], #main, .main-content, .product-detail, .pdp-main').text().toLowerCase();
  const textToCheck = mainContent || $('body').text().toLowerCase().slice(0, 5000);

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
