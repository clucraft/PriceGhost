import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { load } from 'cheerio';
import { AISettings } from '../models';
import { ParsedPrice } from '../utils/priceParser';
import { StockStatus } from './scraper';

export interface AIExtractionResult {
  name: string | null;
  price: ParsedPrice | null;
  imageUrl: string | null;
  stockStatus: StockStatus;
  confidence: number;
}

const EXTRACTION_PROMPT = `You are a price extraction assistant. Analyze the following HTML content from a product page and extract the product information.

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
          scriptContent.includes('Product') ||
          scriptContent.includes('Offer')) {
        jsonLdScripts.push(scriptContent);
      }
    }
  });

  // Now remove script, style, and other non-content elements
  $('script, style, noscript, iframe, svg, path, meta, link, comment').remove();

  // Get the body content
  let content = $('body').html() || html;

  // Try to focus on product-related sections if possible
  const productSelectors = [
    '[itemtype*="Product"]',
    '[class*="product"]',
    '[id*="product"]',
    '[class*="pdp"]',
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

  // Combine JSON-LD data with HTML content
  let finalContent = content;
  if (jsonLdScripts.length > 0) {
    finalContent = `JSON-LD Structured Data:\n${jsonLdScripts.join('\n')}\n\nHTML Content:\n${content}`;
    console.log(`[AI] Found ${jsonLdScripts.length} JSON-LD scripts with product data`);
  }

  // Truncate to ~15000 characters to stay within token limits
  if (finalContent.length > 15000) {
    finalContent = finalContent.substring(0, 15000) + '\n... [truncated]';
  }

  console.log(`[AI] Prepared HTML content: ${finalContent.length} characters`);
  return finalContent;
}

async function extractWithAnthropic(
  html: string,
  apiKey: string
): Promise<AIExtractionResult> {
  const anthropic = new Anthropic({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
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
  apiKey: string
): Promise<AIExtractionResult> {
  const openai = new OpenAI({ apiKey });

  const preparedHtml = prepareHtmlForAI(html);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
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

function parseAIResponse(responseText: string): AIExtractionResult {
  console.log(`[AI] Raw response: ${responseText.substring(0, 500)}...`);

  // Try to extract JSON from the response
  let jsonStr = responseText.trim();

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
    return extractWithAnthropic(html, settings.anthropic_api_key);
  } else if (settings.ai_provider === 'openai' && settings.openai_api_key) {
    return extractWithOpenAI(html, settings.openai_api_key);
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
      console.log(`[AI] Using Anthropic for ${url}`);
      return await extractWithAnthropic(html, settings.anthropic_api_key);
    } else if (settings.ai_provider === 'openai' && settings.openai_api_key) {
      console.log(`[AI] Using OpenAI for ${url}`);
      return await extractWithOpenAI(html, settings.openai_api_key);
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
