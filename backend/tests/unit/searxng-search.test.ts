import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { SearchService } from '../../src/services/domain/product/SearchService';
import { settingsCache } from '../../src/utils/cache';

vi.mock('axios');
vi.mock('../../src/utils/cache');
vi.mock('../../src/services/domain/retailer/RetailerQueryService', () => {
  return {
    RetailerQueryService: class {
      getRetailerForUrl = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('amazon.com')) return { domain: 'amazon.com' };
        return null;
      });
    }
  };
});

describe('SearchService', () => {
  let searchService: SearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    searchService = new SearchService();
    
    vi.mocked(settingsCache.isSearXNGEnabled).mockResolvedValue(true);
    vi.mocked(settingsCache.getSearXNGUrl).mockResolvedValue('https://searxng.test');
  });

  it('should throw error if SearXNG is disabled', async () => {
    vi.mocked(settingsCache.isSearXNGEnabled).mockResolvedValue(false);
    await expect(searchService.search('test')).rejects.toThrow('SearXNG search is disabled');
  });

  it('should throw error if SearXNG URL is missing', async () => {
    vi.mocked(settingsCache.getSearXNGUrl).mockResolvedValue(null);
    await expect(searchService.search('test')).rejects.toThrow('SearXNG search is disabled or not configured');
  });

  it('should fetch and process results from SearXNG', async () => {
    const mockResults = {
      data: {
        results: [
          {
            title: 'Amazon Product',
            url: 'https://www.amazon.com/dp/B001',
            content: 'Great product'
          },
          {
            title: 'Generic Product',
            url: 'https://www.other.com/item',
            content: 'Other product'
          }
        ]
      }
    };

    vi.mocked(axios.get).mockResolvedValue(mockResults);

    const results = await searchService.search('test');

    expect(results).toHaveLength(2);
    
    // Check first result (Supported)
    expect(results[0].title).toBe('Amazon Product');
    expect(results[0].domain).toBe('amazon.com');
    expect(results[0].isSupported).toBe(true);
    
    // Check second result (Generic)
    expect(results[1].domain).toBe('other.com');
    expect(results[1].isSupported).toBe(false);
    
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/search'),
      expect.objectContaining({
        params: expect.objectContaining({ q: 'test', format: 'json' })
      })
    );
  });

  it('should handle API timeouts', async () => {
    vi.mocked(axios.get).mockRejectedValue({ code: 'ECONNABORTED' });
    await expect(searchService.search('test')).rejects.toThrow('SearXNG search timed out');
  });

  it('should handle malformed result URLs gracefully', async () => {
    const mockResults = {
      data: {
        results: [
          { title: 'Bad URL', url: 'not-a-url', content: '...' },
          { title: 'Good URL', url: 'https://ok.com', content: '...' }
        ]
      }
    };

    vi.mocked(axios.get).mockResolvedValue(mockResults);

    const results = await searchService.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].domain).toBe('ok.com');
  });
});
