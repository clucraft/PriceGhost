export interface ParsedPrice {
  price: number;
  currency: string;
}

// Currency symbols and their codes
const currencyMap: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  'CAD': 'CAD',
  'AUD': 'AUD',
  'USD': 'USD',
  'EUR': 'EUR',
  'GBP': 'GBP',
};

// Patterns to match prices in text
const pricePatterns = [
  // $29.99 or $29,99 or $ 29.99
  /(?<currency>[$€£¥₹])\s*(?<price>[\d,]+\.?\d*)/,
  // 29.99 USD or 29,99 EUR
  /(?<price>[\d,]+\.?\d*)\s*(?<currency>USD|EUR|GBP|CAD|AUD|JPY|INR)/i,
  // Plain number with optional decimal (fallback)
  /(?<price>\d{1,3}(?:[,.\s]?\d{3})*(?:[.,]\d{2})?)/,
];

export function parsePrice(text: string): ParsedPrice | null {
  if (!text) return null;

  // Clean up the text
  const cleanText = text.trim().replace(/\s+/g, ' ');

  for (const pattern of pricePatterns) {
    const match = cleanText.match(pattern);
    if (match && match.groups) {
      const priceStr = match.groups.price || match[1];
      const currencySymbol = match.groups.currency || '$';

      if (priceStr) {
        const price = normalizePrice(priceStr);
        if (price !== null && price > 0) {
          const currency = currencyMap[currencySymbol] || 'USD';
          return { price, currency };
        }
      }
    }
  }

  // Try to extract just a number as fallback
  const numberMatch = cleanText.match(/[\d,]+\.?\d*/);
  if (numberMatch) {
    const price = normalizePrice(numberMatch[0]);
    if (price !== null && price > 0) {
      return { price, currency: 'USD' };
    }
  }

  return null;
}

function normalizePrice(priceStr: string): number | null {
  if (!priceStr) return null;

  // Remove spaces
  let normalized = priceStr.replace(/\s/g, '');

  // Handle European format (1.234,56) vs US format (1,234.56)
  const hasCommaDecimal = /,\d{2}$/.test(normalized);
  const hasDotDecimal = /\.\d{2}$/.test(normalized);

  if (hasCommaDecimal && !hasDotDecimal) {
    // European format: 1.234,56 -> 1234.56
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    // US format or plain number: remove commas
    normalized = normalized.replace(/,/g, '');
  }

  const price = parseFloat(normalized);
  return isNaN(price) ? null : Math.round(price * 100) / 100;
}

export function extractPricesFromText(html: string): ParsedPrice[] {
  const prices: ParsedPrice[] = [];
  const seen = new Set<number>();

  // Match all price-like patterns in the HTML
  const allMatches = html.matchAll(
    /(?:[$€£¥₹])\s*[\d,]+\.?\d*|[\d,]+\.?\d*\s*(?:USD|EUR|GBP|CAD|AUD)/gi
  );

  for (const match of allMatches) {
    const parsed = parsePrice(match[0]);
    if (parsed && !seen.has(parsed.price)) {
      seen.add(parsed.price);
      prices.push(parsed);
    }
  }

  return prices;
}

export function findMostLikelyPrice(prices: ParsedPrice[]): ParsedPrice | null {
  if (prices.length === 0) return null;
  if (prices.length === 1) return prices[0];

  // Filter out very small prices (likely not product prices)
  const validPrices = prices.filter((p) => p.price >= 0.99);

  if (validPrices.length === 0) return prices[0];

  // Sort by price and pick the middle one (often the actual price)
  // This helps avoid picking shipping costs or discounts
  validPrices.sort((a, b) => a.price - b.price);

  // Return the first (lowest) valid price - often the current/sale price
  return validPrices[0];
}
