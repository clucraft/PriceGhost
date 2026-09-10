export function formatPrice(
  price: number | string | null | undefined,
  currency: string | null | undefined
): string {
  if (price === null || price === undefined) return 'N/A';
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return 'N/A';

  const currencyCode = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(numPrice);
  } catch {
    return `${currencyCode} ${numPrice.toFixed(2)}`;
  }
}