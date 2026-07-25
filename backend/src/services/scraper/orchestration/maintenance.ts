import { logger } from '../../../utils/system/logger';
import { retailerRepository, RetailerConfig } from '../../../models';
import { configCache } from '../../../utils/cache';
import { flagBlockedRetailer, restoreRetailerStatus } from '../retailer-maintenance';
import { ScrapedProductWithVoting } from '../../../types/scraper';

export async function handleRetailerMaintenance(
  domainConfig: RetailerConfig | null,
  challenge: string | null,
  overrideConfig: boolean,
  extractionSteps: string[],
  productId?: number
): Promise<void> {
  if (challenge) {
    logger.info(`Scraper | Block | Persistent challenge: ${challenge}`, 'Scraper', { product_id: productId });
    extractionSteps.push(`Scraper | Block | Persistent: ${challenge}`);
    
    if (domainConfig && !overrideConfig) {
      await flagBlockedRetailer(domainConfig, challenge, extractionSteps);
    }
  }
}

export async function handleAutoMapping(
  options: {
    html: string;
    url: string;
    domain: string;
    currencyHint: string | null;
    localeHint: string;
    productId?: number;
    extractionSteps: string[];
    learnedFlags: any;
    isRefresh?: boolean;
  }
): Promise<RetailerConfig | null> {
  const { html, url, domain, currencyHint, localeHint, productId, extractionSteps, learnedFlags, isRefresh } = options;
  
  try {
    const logMsg = isRefresh 
      ? `Retailer | Auto-Map | Triggering config refresh/re-mapping for: ${domain}`
      : `Retailer | Auto-Map | Triggering for unknown domain: ${domain}`;
    logger.info(logMsg, 'Scraper', { product_id: productId });
    extractionSteps.push(isRefresh ? `Retailer | Auto-Map | Refresh Triggered` : `Retailer | Auto-Map | Triggered`);
    const { generateRetailerConfig } = await import('../../ai');
    const generatedConfig = await generateRetailerConfig(html, url, currencyHint || undefined, localeHint, productId);
    if (generatedConfig) {
      extractionSteps.push(`Retailer | Auto-Map | Success`);
      
      const upsertData = { 
        ...generatedConfig, 
        ...learnedFlags, 
        domain, 
        active: true, 
        currency_hint: generatedConfig.currency_hint || currencyHint 
      };

      const autoMapTrace: string[] = [
        `Name: ${upsertData.name || 'Unknown'}`,
        `Domain: ${upsertData.domain}`,
        `Currency Hint: ${upsertData.currency_hint || 'None'}`,
        `Engine: ${upsertData.use_browser_scraper ? 'Browser Scraper' : 'Standard (HTTP)'}`
      ];
      if (upsertData.name_selectors?.length > 0) autoMapTrace.push(`Name Selectors: ${JSON.stringify(upsertData.name_selectors)}`);
      if (upsertData.price_selectors?.length > 0) autoMapTrace.push(`Price Selectors: ${JSON.stringify(upsertData.price_selectors)}`);
      if (upsertData.deal_price_selectors?.length > 0) autoMapTrace.push(`Deal Price Selectors: ${JSON.stringify(upsertData.deal_price_selectors)}`);
      if (upsertData.member_price_selectors?.length > 0) autoMapTrace.push(`Member Price Selectors: ${JSON.stringify(upsertData.member_price_selectors)}`);
      if (upsertData.original_price_selectors?.length > 0) autoMapTrace.push(`Original Price Selectors: ${JSON.stringify(upsertData.original_price_selectors)}`);
      if (upsertData.image_selectors?.length > 0) autoMapTrace.push(`Image Selectors: ${JSON.stringify(upsertData.image_selectors)}`);
      if (upsertData.stock_selectors?.length > 0) autoMapTrace.push(`Stock Selectors: ${JSON.stringify(upsertData.stock_selectors)}`);
      
      const jsonldKeys = [];
      if (upsertData.jsonld_name_key) jsonldKeys.push(`name: ${upsertData.jsonld_name_key}`);
      if (upsertData.jsonld_price_key) jsonldKeys.push(`price: ${upsertData.jsonld_price_key}`);
      if (upsertData.jsonld_image_key) jsonldKeys.push(`image: ${upsertData.jsonld_image_key}`);
      if (jsonldKeys.length > 0) {
        autoMapTrace.push(`JSON-LD Keys: { ${jsonldKeys.join(', ')} }`);
      }

      const settingsList = [];
      if (upsertData.use_proxy) settingsList.push('Proxy');
      if (settingsList.length > 0) {
        autoMapTrace.push(`Settings: ${settingsList.join(', ')}`);
      }

      logger.info(`Retailer | Auto-Map | Saving config for ${domain}`, 'Scraper', { 
        product_id: productId,
        trace: autoMapTrace
      });

      const domainConfig = await retailerRepository.upsert(upsertData);
      configCache.invalidate();
      extractionSteps.push(`Retailer | Auto-Map | Saved (Currency Hint: ${currencyHint})`);
      return domainConfig;
    }
  } catch (e) {
    extractionSteps.push(`Retailer | Auto-Map | Failed: ${(e as any).message}`);
  }
  return null;
}

export async function handleRestoreStatus(
  result: ScrapedProductWithVoting,
  domainConfig: RetailerConfig | null,
  overrideConfig: boolean,
  challenge: string | null,
  extractionSteps: string[]
): Promise<void> {
  if (result.price && domainConfig && !overrideConfig && !challenge) {
    await restoreRetailerStatus(domainConfig, extractionSteps);
  }
}
