import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { load } from 'cheerio';
import { AISettings } from '../models';
import { ParsedPrice } from '../utils/priceParser';
import { StockStatus, PriceCandidate } from './scraper';

// Strip thinking mode tags from model responses (Qwen3, DeepSeek, etc.)
// These models output <think>...</think> blocks before their actual response
function stripThinkingTags(text: string): string {
  // Remove <think>...</think> blocks (including content)
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // If nothing left after stripping, return original (in case regex failed)
  return stripped.length > 0 ? stripped : text;
}

export interface AIExtractionResult {
  name: string | null;
  price: ParsedPrice | null;
  imageUrl: string | null;
  stockStatus: StockStatus;
  confidence: number;
}

export interface AIVerificationResult {
  isCorrect: boolean;
  confidence: number;
  suggestedPrice: ParsedPrice | null;
  reason: string;
  stockStatus?: StockStatus;
}

export interface AIStockStatusResult {
  stockStatus: StockStatus;
  confidence: number;
  reason: string;
}

const VERIFICATION_PROMPT = `/nothink
You are a price and availability verification assistant. I scraped a product page and found a price. Please verify if this price is correct AND if the product is currently available for purchase.

Scraped Price: $SCRAPED_PRICE$ $CURRENCY$

Analyze the HTML content below and determine:
1. Is the scraped price the correct CURRENT/SALE price for the main product?
2. If not, what is the correct price?
3. Is this product currently available for purchase RIGHT NOW?

Common price issues to watch for:
- Scraped price might be a "savings" amount (e.g., "Save $189.99")
- Scraped price might be from a bundle/combo deal section
- Scraped price might be shipping cost or add-on price
- Scraped price might be the original/crossed-out price instead of the sale price

Common availability issues to watch for:
- Product shows "Coming Soon" or "Available [future date]" - NOT in stock
- Product shows "Pre-order" or "Reserve now" - NOT in stock
- Product shows "Notify me when available" or "Sign up for alerts" - NOT in stock
- Product shows "Out of stock" or "Sold out" - NOT in stock
- Product has no "Add to Cart" button but shows a future release date - NOT in stock
- Product CAN be added to cart and purchased today - IN stock

Return a JSON object with:
- isCorrect: boolean - true if the scraped price is correct
- confidence: number from 0 to 1
- suggestedPrice: the correct price as a number (or null if scraped price is correct)
- suggestedCurrency: currency code if suggesting a different price
- stockStatus: "in_stock", "out_of_stock", or "unknown" - based on whether the product can be purchased RIGHT NOW
- reason: brief explanation of your decision (mention both price and availability)

Only return valid JSON, no explanation text outside the JSON.

HTML Content:
`;

const STOCK_STATUS_PROMPT = `/nothink
You are an availability verification assistant. The user is tracking a SPECIFIC product variant priced at $VARIANT_PRICE$ $CURRENCY$.

Your task: Determine if THIS SPECIFIC VARIANT (the one at $VARIANT_PRICE$) is currently in stock and can be purchased.

Important context:
- This page may show MULTIPLE variants (sizes, colors, configurations) at DIFFERENT prices
- Some variants may be out of stock while others are in stock
- ONLY report on the variant priced at $VARIANT_PRICE$ - ignore other variants
- If the $VARIANT_PRICE$ variant exists and can be added to cart, it's IN STOCK
- If only other variants are available but not the $VARIANT_PRICE$ one, it's OUT OF STOCK

Signs the $VARIANT_PRICE$ variant is IN STOCK:
- The price $VARIANT_PRICE$ is displayed with an active "Add to Cart" button
- The variant at this price shows "In Stock" or available quantity
- The product at this exact price can be purchased now

Signs the $VARIANT_PRICE$ variant is OUT OF STOCK:
- The $VARIANT_PRICE$ variant shows "Out of Stock", "Unavailable", or "Sold Out"
- Only a "Notify Me" or "Waitlist" button is shown for this variant
- The price exists but the specific variant cannot be added to cart
- A different price is shown as the main purchasable option

Return a JSON object with:
- stockStatus: "in_stock", "out_of_stock", or "unknown"
- confidence: number from 0 to 1
- reason: brief explanation focusing on the $VARIANT_PRICE$ variant specifically

Only return valid JSON, no explanation text outside the JSON.

HTML Content:
`;

const EXTRACTION_PROMPT = `/nothink
You are a price extraction assistant. Analyze the following HTML content from a product page and extract the product information.

Return a JSON object with these fields:
- name: The product name/title (string or null)
- price: The current selling price as a number (not the original/crossed-out price)
- currency: The currency code (USD, EUR, GBP, etc.)
- imageUrl: The main product image URL (string or null)
- stockStatus: One of "in_stock", "out_of_stock", or "unknown"
- confidence: Your confidence in the extraction from 0 to 1

Important:
- Extract the CURRENT/SALE price, not the original price if there's a discount
- If you can't find a price with confidence, set price to null
- Only return valid JSON, no explanation text

HTML Content:
`;

// Truncate HTML to fit within token limits while preserving important content
function prepareHtmlForAI(html: string): string {
  const $ = load(html);

  // Extract JSON-LD data BEFORE removing scripts (it often contains product info)
  const jsonLdScripts: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const scriptContent = $(el).html();
    if (scriptContent) {
      // Include any JSON-LD that might be product-related
      if (scriptContent.includes('price') ||
          scriptContent.includes('Price') ||
          scriptContent.includes('Product') ||
          scriptContent.includes('Offer')) {
        jsonLdScripts.push(scriptContent);
      }
    }
  });

  // Extract price-related elements specifically
  const priceElements: string[] = [];
  const priceSelectors = [
    '[class*="price"]',
    '[class*="Price"]',
    '[data-testid*="price"]',
    '[itemprop="price"]',
    '[data-price]',
  ];

  for (const selector of priceSelectors) {
    $(selector).each((_, el) => {
      const text = $(el).text().trim();
      const parent = $(el).parent().text().trim().slice(0, 200);
      if (text && text.match(/\$[\d,]+\.?\d*/)) {
        priceElements.push(`Price element: "${text}" (context: "${parent.slice(0, 100)}")`);
      }
    });
  }

  // Now remove script, style, and other non-content elements
  $('script, style, noscript, iframe, svg, path, meta, link, comment').remove();

  // Get the body content
  let content = $('body').html() || html;

  // Try to focus on product-related sections if possible
  const productSelectors = [
    '[itemtype*="Product"]',
    '[class*="product-detail"]',
    '[class*="productDetail"]',
    '[class*="pdp-"]',
    '[id*="product"]',
    'main',
    '[role="main"]',
  ];

  for (const selector of productSelectors) {
    const section = $(selector).first();
    if (section.length && section.html() && section.html()!.length > 500) {
      content = section.html()!;
      break;
    }
  }

  // Build final content with all price-related info at the top
  let finalContent = '';

  if (jsonLdScripts.length > 0) {
    finalContent += `=== JSON-LD Structured Data (MOST RELIABLE) ===\n${jsonLdScripts.join('\n')}\n\n`;
    console.log(`[AI] Found ${jsonLdScripts.length} JSON-LD scripts with product data`);
  }

  if (priceElements.length > 0) {
    finalContent += `=== Price Elements Found ===\n${priceElements.slice(0, 10).join('\n')}\n\n`;
    console.log(`[AI] Found ${priceElements.length} price elements`);
  }

  finalContent += `=== HTML Content ===\n${content}`;

  // Truncate to ~25000 characters to stay within token limits but capture more content
  if (finalContent.length > 25000) {
    finalContent = finalContent.substring(0, 25000) + '\n... [truncated]';
  }

  console.log(`[AI] Prepared HTML content: ${finalContent.length} characters`);
  return finalContent;
}

// Default models to use if user hasn't selected one
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-nano-2025-04-14';

async function extractWithAnthropic(
  html: string,
  apiKey: string,
  model?: string | null
): Promise<AIExtractionResult> {
  const anthropic = new Anthropic({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);
  const modelToUse = model || DEFAULT_ANTHROPIC_MODEL;

  const response = await anthropic.messages.create({
    model: modelToUse,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: EXTRACTION_PROMPT + preparedHtml,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Anthropic');
  }

  return parseAIResponse(content.text);
}

async function extractWithOpenAI(
  html: string,
  apiKey: string,
  model?: string | null
): Promise<AIExtractionResult> {
  const openai = new OpenAI({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);
  const modelToUse = model || DEFAULT_OPENAI_MODEL;

  const response = await openai.chat.completions.create({
    model: modelToUse,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: EXTRACTION_PROMPT + preparedHtml,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return parseAIResponse(content);
}

async function extractWithOllama(
  html: string,
  baseUrl: string,
  model: string
): Promise<AIExtractionResult> {
  const preparedHtml = prepareHtmlForAI(html);

  // Ollama uses a chat completions API similar to OpenAI
  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: model,
      messages: [
        {
          role: 'user',
          content: EXTRACTION_PROMPT + preparedHtml,
        },
      ],
      stream: false,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000, // Longer timeout for local models
    }
  );

  const content = response.data?.message?.content;
  if (!content) {
    throw new Error('No response from Ollama');
  }

  return parseAIResponse(content);
}

// Verification functions for each provider
async function verifyWithAnthropic(
  html: string,
  scrapedPrice: number,
  currency: string,
  apiKey: string,
  model?: string | null
): Promise<AIVerificationResult> {
  const anthropic = new Anthropic({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);
  const prompt = VERIFICATION_PROMPT
    .replace('$SCRAPED_PRICE$', scrapedPrice.toString())
    .replace('$CURRENCY$', currency) + preparedHtml;
  const modelToUse = model || DEFAULT_ANTHROPIC_MODEL;

  const response = await anthropic.messages.create({
    model: modelToUse,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Anthropic');
  }

  return parseVerificationResponse(content.text, scrapedPrice, currency);
}

async function verifyWithOpenAI(
  html: string,
  scrapedPrice: number,
  currency: string,
  apiKey: string,
  model?: string | null
): Promise<AIVerificationResult> {
  const openai = new OpenAI({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);
  const prompt = VERIFICATION_PROMPT
    .replace('$SCRAPED_PRICE$', scrapedPrice.toString())
    .replace('$CURRENCY$', currency) + preparedHtml;
  const modelToUse = model || DEFAULT_OPENAI_MODEL;

  const response = await openai.chat.completions.create({
    model: modelToUse,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return parseVerificationResponse(content, scrapedPrice, currency);
}

async function verifyWithOllama(
  html: string,
  scrapedPrice: number,
  currency: string,
  baseUrl: string,
  model: string
): Promise<AIVerificationResult> {
  const preparedHtml = prepareHtmlForAI(html);
  const prompt = VERIFICATION_PROMPT
    .replace('$SCRAPED_PRICE$', scrapedPrice.toString())
    .replace('$CURRENCY$', currency) + preparedHtml;

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    }
  );

  const content = response.data?.message?.content;
  if (!content) {
    throw new Error('No response from Ollama');
  }

  return parseVerificationResponse(content, scrapedPrice, currency);
}

// Stock status verification functions (for variant products with anchor price)
async function verifyStockStatusWithAnthropic(
  html: string,
  variantPrice: number,
  currency: string,
  apiKey: string,
  model?: string | null
): Promise<AIStockStatusResult> {
  const anthropic = new Anthropic({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);
  const prompt = STOCK_STATUS_PROMPT
    .replace(/\$VARIANT_PRICE\$/g, variantPrice.toString())
    .replace(/\$CURRENCY\$/g, currency) + preparedHtml;
  const modelToUse = model || DEFAULT_ANTHROPIC_MODEL;

  const response = await anthropic.messages.create({
    model: modelToUse,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Anthropic');
  }

  return parseStockStatusResponse(content.text);
}

async function verifyStockStatusWithOpenAI(
  html: string,
  variantPrice: number,
  currency: string,
  apiKey: string,
  model?: string | null
): Promise<AIStockStatusResult> {
  const openai = new OpenAI({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);
  const prompt = STOCK_STATUS_PROMPT
    .replace(/\$VARIANT_PRICE\$/g, variantPrice.toString())
    .replace(/\$CURRENCY\$/g, currency) + preparedHtml;
  const modelToUse = model || DEFAULT_OPENAI_MODEL;

  const response = await openai.chat.completions.create({
    model: modelToUse,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return parseStockStatusResponse(content);
}

async function verifyStockStatusWithOllama(
  html: string,
  variantPrice: number,
  currency: string,
  baseUrl: string,
  model: string
): Promise<AIStockStatusResult> {
  const preparedHtml = prepareHtmlForAI(html);
  const prompt = STOCK_STATUS_PROMPT
    .replace(/\$VARIANT_PRICE\$/g, variantPrice.toString())
    .replace(/\$CURRENCY\$/g, currency) + preparedHtml;

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    }
  );

  const content = response.data?.message?.content;
  if (!content) {
    throw new Error('No response from Ollama');
  }

  return parseStockStatusResponse(content);
}

function parseStockStatusResponse(responseText: string): AIStockStatusResult {
  console.log(`[AI Stock] Raw response: ${responseText.substring(0, 500)}...`);

  // Default result if parsing fails
  const defaultResult: AIStockStatusResult = {
    stockStatus: 'unknown',
    confidence: 0,
    reason: 'Failed to parse AI response',
  };

  try {
    // Strip thinking tags from models like Qwen3/DeepSeek
    let jsonStr = stripThinkingTags(responseText);
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find raw JSON
      const rawJsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (rawJsonMatch) {
        jsonStr = rawJsonMatch[0];
      }
    }

    const parsed = JSON.parse(jsonStr);
    console.log(`[AI Stock] Parsed:`, JSON.stringify(parsed, null, 2));

    // Normalize stock status
    let stockStatus: StockStatus = 'unknown';
    if (parsed.stockStatus) {
      const status = parsed.stockStatus.toLowerCase().replace(/[^a-z_]/g, '');
      if (status === 'in_stock' || status === 'instock') {
        stockStatus = 'in_stock';
      } else if (status === 'out_of_stock' || status === 'outofstock') {
        stockStatus = 'out_of_stock';
      }
    }

    return {
      stockStatus,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reason: parsed.reason || 'No reason provided',
    };
  } catch (error) {
    console.error(`[AI Stock] Failed to parse response:`, error);
    return defaultResult;
  }
}

function parseVerificationResponse(
  responseText: string,
  originalPrice: number,
  originalCurrency: string
): AIVerificationResult {
  console.log(`[AI Verify] Raw response: ${responseText.substring(0, 500)}...`);

  // Default result if parsing fails
  const defaultResult: AIVerificationResult = {
    isCorrect: true, // Assume correct if we can't parse
    confidence: 0.5,
    suggestedPrice: null,
    reason: 'Could not parse AI response',
    stockStatus: 'unknown',
  };

  // Strip thinking tags from models like Qwen3/DeepSeek
  let jsonStr = stripThinkingTags(responseText).trim();

  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const data = JSON.parse(jsonStr);
    console.log(`[AI Verify] Parsed:`, JSON.stringify(data, null, 2));

    let suggestedPrice: ParsedPrice | null = null;
    if (!data.isCorrect && data.suggestedPrice !== null && data.suggestedPrice !== undefined) {
      const priceNum = typeof data.suggestedPrice === 'string'
        ? parseFloat(data.suggestedPrice.replace(/[^0-9.]/g, ''))
        : data.suggestedPrice;

      if (!isNaN(priceNum) && priceNum > 0) {
        suggestedPrice = {
          price: priceNum,
          currency: data.suggestedCurrency || originalCurrency,
        };
      }
    }

    // Parse stock status from AI response
    let stockStatus: StockStatus = 'unknown';
    if (data.stockStatus) {
      const status = data.stockStatus.toLowerCase().replace(/[^a-z_]/g, '');
      if (status === 'in_stock' || status === 'instock') {
        stockStatus = 'in_stock';
      } else if (status === 'out_of_stock' || status === 'outofstock') {
        stockStatus = 'out_of_stock';
      }
    }

    return {
      isCorrect: data.isCorrect ?? true,
      confidence: data.confidence ?? 0.5,
      suggestedPrice,
      reason: data.reason || 'No reason provided',
      stockStatus,
    };
  } catch (error) {
    console.error('[AI Verify] Failed to parse response:', responseText);
    return defaultResult;
  }
}

function parseAIResponse(responseText: string): AIExtractionResult {
  console.log(`[AI] Raw response: ${responseText.substring(0, 500)}...`);

  // Strip thinking tags from models like Qwen3/DeepSeek, then try to extract JSON
  let jsonStr = stripThinkingTags(responseText).trim();

  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object in the response
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const data = JSON.parse(jsonStr);
    console.log(`[AI] Parsed data:`, JSON.stringify(data, null, 2));

    let price: ParsedPrice | null = null;
    if (data.price !== null && data.price !== undefined) {
      const priceNum = typeof data.price === 'string'
        ? parseFloat(data.price.replace(/[^0-9.]/g, ''))
        : data.price;

      if (!isNaN(priceNum) && priceNum > 0) {
        price = {
          price: priceNum,
          currency: data.currency || 'USD',
        };
      }
    }

    let stockStatus: StockStatus = 'unknown';
    if (data.stockStatus) {
      const status = data.stockStatus.toLowerCase().replace(/[^a-z_]/g, '');
      if (status === 'in_stock' || status === 'instock') {
        stockStatus = 'in_stock';
      } else if (status === 'out_of_stock' || status === 'outofstock') {
        stockStatus = 'out_of_stock';
      }
    }

    return {
      name: data.name || null,
      price,
      imageUrl: data.imageUrl || data.image || null,
      stockStatus,
      confidence: data.confidence || 0.5,
    };
  } catch (error) {
    console.error('Failed to parse AI response:', responseText);
    return {
      name: null,
      price: null,
      imageUrl: null,
      stockStatus: 'unknown',
      confidence: 0,
    };
  }
}

export async function extractWithAI(
  url: string,
  settings: AISettings
): Promise<AIExtractionResult> {
  // Fetch the page HTML
  const response = await axios.get<string>(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    },
    timeout: 20000,
  });

  const html = response.data;

  // Use the configured provider
  if (settings.ai_provider === 'anthropic' && settings.anthropic_api_key) {
    return extractWithAnthropic(html, settings.anthropic_api_key, settings.anthropic_model);
  } else if (settings.ai_provider === 'openai' && settings.openai_api_key) {
    return extractWithOpenAI(html, settings.openai_api_key, settings.openai_model);
  } else if (settings.ai_provider === 'ollama' && settings.ollama_base_url && settings.ollama_model) {
    return extractWithOllama(html, settings.ollama_base_url, settings.ollama_model);
  }

  throw new Error('No valid AI provider configured');
}

// Export for use in scraper as fallback
export async function tryAIExtraction(
  url: string,
  html: string,
  userId: number
): Promise<AIExtractionResult | null> {
  try {
    // Import dynamically to avoid circular dependencies
    const { userQueries } = await import('../models');
    const settings = await userQueries.getAISettings(userId);

    if (!settings?.ai_enabled) {
      return null;
    }

    // Use the configured provider
    if (settings.ai_provider === 'anthropic' && settings.anthropic_api_key) {
      const modelToUse = settings.anthropic_model || DEFAULT_ANTHROPIC_MODEL;
      console.log(`[AI] Using Anthropic (${modelToUse}) for ${url}`);
      return await extractWithAnthropic(html, settings.anthropic_api_key, settings.anthropic_model);
    } else if (settings.ai_provider === 'openai' && settings.openai_api_key) {
      const modelToUse = settings.openai_model || DEFAULT_OPENAI_MODEL;
      console.log(`[AI] Using OpenAI (${modelToUse}) for ${url}`);
      return await extractWithOpenAI(html, settings.openai_api_key, settings.openai_model);
    } else if (settings.ai_provider === 'ollama' && settings.ollama_base_url && settings.ollama_model) {
      console.log(`[AI] Using Ollama (${settings.ollama_model}) for ${url}`);
      return await extractWithOllama(html, settings.ollama_base_url, settings.ollama_model);
    }

    return null;
  } catch (error) {
    console.error(`[AI] Extraction failed for ${url}:`, error);
    return null;
  }
}

// Export for use in scraper to verify scraped prices
export async function tryAIVerification(
  url: string,
  html: string,
  scrapedPrice: number,
  currency: string,
  userId: number
): Promise<AIVerificationResult | null> {
  try {
    const { userQueries } = await import('../models');
    const settings = await userQueries.getAISettings(userId);

    // Check if AI verification is enabled (separate from AI extraction fallback)
    if (!settings?.ai_verification_enabled) {
      return null;
    }

    // Need a configured provider
    if (settings.ai_provider === 'anthropic' && settings.anthropic_api_key) {
      const modelToUse = settings.anthropic_model || DEFAULT_ANTHROPIC_MODEL;
      console.log(`[AI Verify] Using Anthropic (${modelToUse}) to verify $${scrapedPrice} for ${url}`);
      return await verifyWithAnthropic(html, scrapedPrice, currency, settings.anthropic_api_key, settings.anthropic_model);
    } else if (settings.ai_provider === 'openai' && settings.openai_api_key) {
      const modelToUse = settings.openai_model || DEFAULT_OPENAI_MODEL;
      console.log(`[AI Verify] Using OpenAI (${modelToUse}) to verify $${scrapedPrice} for ${url}`);
      return await verifyWithOpenAI(html, scrapedPrice, currency, settings.openai_api_key, settings.openai_model);
    } else if (settings.ai_provider === 'ollama' && settings.ollama_base_url && settings.ollama_model) {
      console.log(`[AI Verify] Using Ollama (${settings.ollama_model}) to verify $${scrapedPrice} for ${url}`);
      return await verifyWithOllama(html, scrapedPrice, currency, settings.ollama_base_url, settings.ollama_model);
    }

    console.log(`[AI Verify] Verification enabled but no provider configured`);
    return null;
  } catch (error) {
    console.error(`[AI Verify] Verification failed for ${url}:`, error);
    return null;
  }
}

// Export for use in scraper to verify stock status for a specific variant price
export async function tryAIStockStatusVerification(
  url: string,
  html: string,
  variantPrice: number,
  currency: string,
  userId: number
): Promise<AIStockStatusResult | null> {
  try {
    const { userQueries } = await import('../models');
    const settings = await userQueries.getAISettings(userId);

    // Need AI enabled for stock status verification
    if (!settings?.ai_enabled && !settings?.ai_verification_enabled) {
      return null;
    }

    // Need a configured provider
    if (settings.ai_provider === 'anthropic' && settings.anthropic_api_key) {
      const modelToUse = settings.anthropic_model || DEFAULT_ANTHROPIC_MODEL;
      console.log(`[AI Stock] Using Anthropic (${modelToUse}) to verify stock status for $${variantPrice} variant at ${url}`);
      return await verifyStockStatusWithAnthropic(html, variantPrice, currency, settings.anthropic_api_key, settings.anthropic_model);
    } else if (settings.ai_provider === 'openai' && settings.openai_api_key) {
      const modelToUse = settings.openai_model || DEFAULT_OPENAI_MODEL;
      console.log(`[AI Stock] Using OpenAI (${modelToUse}) to verify stock status for $${variantPrice} variant at ${url}`);
      return await verifyStockStatusWithOpenAI(html, variantPrice, currency, settings.openai_api_key, settings.openai_model);
    } else if (settings.ai_provider === 'ollama' && settings.ollama_base_url && settings.ollama_model) {
      console.log(`[AI Stock] Using Ollama (${settings.ollama_model}) to verify stock status for $${variantPrice} variant at ${url}`);
      return await verifyStockStatusWithOllama(html, variantPrice, currency, settings.ollama_base_url, settings.ollama_model);
    }

    console.log(`[AI Stock] No AI provider configured for stock status verification`);
    return null;
  } catch (error) {
    console.error(`[AI Stock] Stock status verification failed for ${url}:`, error);
    return null;
  }
}

// Arbitration prompt for when multiple extraction methods disagree
const ARBITRATION_PROMPT = `/nothink
You are a price arbitration assistant. Multiple price extraction methods found different prices for the same product. Help determine the correct price.

Found prices:
$CANDIDATES$

Analyze the HTML content below and determine which price is the correct CURRENT selling price for the main product.

Consider:
- JSON-LD structured data is usually highly reliable (schema.org standard)
- Site-specific extractors are well-tested for major retailers
- Generic CSS selectors might catch wrong prices (shipping, savings, bundles, etc.)
- Look for the price that appears in the main product display area
- Ignore crossed-out/original prices, shipping costs, subscription prices, or bundle prices

Return a JSON object with:
- selectedIndex: the 0-based index of the correct price from the list above
- confidence: your confidence from 0 to 1
- reason: brief explanation of why this price is correct

Only return valid JSON, no explanation text outside the JSON.

HTML Content:
`;

export interface AIArbitrationResult {
  selectedPrice: PriceCandidate | null;
  confidence: number;
  reason: string;
}

async function arbitrateWithAnthropic(
  html: string,
  candidates: PriceCandidate[],
  apiKey: string,
  model?: string | null
): Promise<AIArbitrationResult> {
  const anthropic = new Anthropic({ apiKey });

  const candidatesList = candidates.map((c, i) =>
    `${i}. ${c.price} ${c.currency} (method: ${c.method}, context: ${c.context || 'none'})`
  ).join('\n');

  const preparedHtml = prepareHtmlForAI(html);
  const prompt = ARBITRATION_PROMPT.replace('$CANDIDATES$', candidatesList) + preparedHtml;
  const modelToUse = model || DEFAULT_ANTHROPIC_MODEL;

  const response = await anthropic.messages.create({
    model: modelToUse,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Anthropic');
  }

  return parseArbitrationResponse(content.text, candidates);
}

async function arbitrateWithOpenAI(
  html: string,
  candidates: PriceCandidate[],
  apiKey: string,
  model?: string | null
): Promise<AIArbitrationResult> {
  const openai = new OpenAI({ apiKey });

  const candidatesList = candidates.map((c, i) =>
    `${i}. ${c.price} ${c.currency} (method: ${c.method}, context: ${c.context || 'none'})`
  ).join('\n');

  const preparedHtml = prepareHtmlForAI(html);
  const prompt = ARBITRATION_PROMPT.replace('$CANDIDATES$', candidatesList) + preparedHtml;
  const modelToUse = model || DEFAULT_OPENAI_MODEL;

  const response = await openai.chat.completions.create({
    model: modelToUse,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return parseArbitrationResponse(content, candidates);
}

async function arbitrateWithOllama(
  html: string,
  candidates: PriceCandidate[],
  baseUrl: string,
  model: string
): Promise<AIArbitrationResult> {
  const candidatesList = candidates.map((c, i) =>
    `${i}. ${c.price} ${c.currency} (method: ${c.method}, context: ${c.context || 'none'})`
  ).join('\n');

  const preparedHtml = prepareHtmlForAI(html);
  const prompt = ARBITRATION_PROMPT.replace('$CANDIDATES$', candidatesList) + preparedHtml;

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    }
  );

  const content = response.data?.message?.content;
  if (!content) {
    throw new Error('No response from Ollama');
  }

  return parseArbitrationResponse(content, candidates);
}

function parseArbitrationResponse(
  responseText: string,
  candidates: PriceCandidate[]
): AIArbitrationResult {
  console.log(`[AI Arbitrate] Raw response: ${responseText.substring(0, 500)}...`);

  const defaultResult: AIArbitrationResult = {
    selectedPrice: null,
    confidence: 0,
    reason: 'Could not parse AI response',
  };

  // Strip thinking tags from models like Qwen3/DeepSeek
  let jsonStr = stripThinkingTags(responseText).trim();

  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  try {
    const data = JSON.parse(jsonStr);
    console.log(`[AI Arbitrate] Parsed:`, JSON.stringify(data, null, 2));

    const selectedIndex = data.selectedIndex;
    if (typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < candidates.length) {
      return {
        selectedPrice: candidates[selectedIndex],
        confidence: data.confidence ?? 0.7,
        reason: data.reason || 'AI selected this price',
      };
    }

    return defaultResult;
  } catch (error) {
    console.error('[AI Arbitrate] Failed to parse response:', responseText);
    return defaultResult;
  }
}

// Export for use in voting scraper to arbitrate between disagreeing methods
export async function tryAIArbitration(
  url: string,
  html: string,
  candidates: PriceCandidate[],
  userId: number
): Promise<AIArbitrationResult | null> {
  try {
    const { userQueries } = await import('../models');
    const settings = await userQueries.getAISettings(userId);

    // Need AI enabled for arbitration
    if (!settings?.ai_enabled && !settings?.ai_verification_enabled) {
      return null;
    }

    // Need at least 2 candidates to arbitrate
    if (candidates.length < 2) {
      return null;
    }

    // Use the configured provider
    if (settings.ai_provider === 'anthropic' && settings.anthropic_api_key) {
      const modelToUse = settings.anthropic_model || DEFAULT_ANTHROPIC_MODEL;
      console.log(`[AI Arbitrate] Using Anthropic (${modelToUse}) to arbitrate ${candidates.length} prices for ${url}`);
      return await arbitrateWithAnthropic(html, candidates, settings.anthropic_api_key, settings.anthropic_model);
    } else if (settings.ai_provider === 'openai' && settings.openai_api_key) {
      const modelToUse = settings.openai_model || DEFAULT_OPENAI_MODEL;
      console.log(`[AI Arbitrate] Using OpenAI (${modelToUse}) to arbitrate ${candidates.length} prices for ${url}`);
      return await arbitrateWithOpenAI(html, candidates, settings.openai_api_key, settings.openai_model);
    } else if (settings.ai_provider === 'ollama' && settings.ollama_base_url && settings.ollama_model) {
      console.log(`[AI Arbitrate] Using Ollama (${settings.ollama_model}) to arbitrate ${candidates.length} prices for ${url}`);
      return await arbitrateWithOllama(html, candidates, settings.ollama_base_url, settings.ollama_model);
    }

    console.log(`[AI Arbitrate] No provider configured`);
    return null;
  } catch (error) {
    console.error(`[AI Arbitrate] Arbitration failed for ${url}:`, error);
    return null;
  }
}
