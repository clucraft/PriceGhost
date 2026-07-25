import { logger } from '../../../utils/system/logger';
import { settingsCache } from '../../../utils/cache';
import { 
  fetchRemoteHtml, 
  getRandomReferrer,
  PageNotAvailableError
} from '../transport';
import { RetailerConfig } from '../../../models';

export interface RemoteAcquisitionOptions {
  url: string;
  domain: string;
  domainConfig?: RetailerConfig;
  productId?: number;
  extractionSteps: string[];
  requestId?: string;
}

export async function acquireRemoteHtml(options: RemoteAcquisitionOptions): Promise<string | null> {
  const { url, domain, domainConfig, productId, extractionSteps, requestId } = options;
  
  const rsUrl = await settingsCache.getRemoteScraperUrl();
  if (!rsUrl) {
    extractionSteps.push(`Scraper | Remote | URL not configured, falling back`);
    logger.warn(`Scraper | Remote | Enabled for ${domain} but remote_scraper_url is not configured.`, 'Scraper');
    return null;
  }

  try {
    const useProxy = domainConfig?.use_proxy || false;
    const useBrowserScraper = domainConfig?.use_browser_scraper || false;
    
    logger.info(`Scraper | Remote | Requesting ${domain} (Browser: ${useBrowserScraper})`, 'Scraper');
    extractionSteps.push(`Scraper | Remote | Requesting via ${rsUrl}`);
    
    const isDiscovery = !productId;
    const currentProxy = useProxy ? await settingsCache.getScraperProxy() : undefined;
    const remoteOptions: any = { productId, isDiscovery, requestId };
    
    if (domainConfig?.user_agent) {
      remoteOptions.userAgent = domainConfig.user_agent;
    }

    if (currentProxy) {
      remoteOptions.useProxy = true;
      remoteOptions.proxyUrl = currentProxy;
    }

    if (domainConfig?.referrer) {
      remoteOptions.referrer = domainConfig.referrer;
    } else if (isDiscovery) {
      remoteOptions.referrer = getRandomReferrer();
    } else {
      const defaultReferrer = await settingsCache.getDefaultReferrer();
      if (defaultReferrer) remoteOptions.referrer = defaultReferrer;
    }
    
    logger.debug(`Scraper | Remote | Details | UA: ${remoteOptions.userAgent || 'Default'}, Proxy: ${remoteOptions.proxyUrl || 'None'}, Ref: ${remoteOptions.referrer || 'None'}`, 'Scraper');
    extractionSteps.push(`Scraper | Remote | UA: ${remoteOptions.userAgent ? 'Custom' : 'Default'} | Proxy: ${remoteOptions.proxyUrl ? 'Yes' : 'No'}`);
    
    const html = await fetchRemoteHtml(url, rsUrl, remoteOptions);
    extractionSteps.push(`Scraper | Remote | Success`);
    return html;
  } catch (e) {
    if (e instanceof PageNotAvailableError) throw e;
    extractionSteps.push(`Scraper | Remote | Failed: ${(e as any).message}`);
    logger.warn(`Scraper | Remote | Failed for ${domain}, will fallback: ${(e as any).message}`, 'Scraper');
    return null;
  }
}
