import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { productQueries, priceHistoryQueries, stockStatusHistoryQueries } from '../models';
import { scrapeProduct } from '../services/scraper';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get price history for a product
router.get('/:productId/prices', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    // Verify product belongs to user
    const product = await productQueries.findById(productId, userId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Get optional days filter from query
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;

    const priceHistory = await priceHistoryQueries.findByProductId(
      productId,
      days
    );

    res.json({
      product,
      prices: priceHistory,
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

// Force immediate price refresh
router.post('/:productId/refresh', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    // Verify product belongs to user
    const product = await productQueries.findById(productId, userId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Scrape product data including price and stock status (pass userId for AI verification)
    const scrapedData = await scrapeProduct(product.url, userId);

    // Update stock status and record change if different
    if (scrapedData.stockStatus !== product.stock_status) {
      await productQueries.updateStockStatus(productId, scrapedData.stockStatus);
      await stockStatusHistoryQueries.recordChange(productId, scrapedData.stockStatus);
    }

    // Record new price if available
    let newPrice = null;
    if (scrapedData.price) {
      newPrice = await priceHistoryQueries.create(
        productId,
        scrapedData.price.price,
        scrapedData.price.currency,
        scrapedData.aiStatus
      );
    }

    // Update last_checked timestamp and schedule next check
    await productQueries.updateLastChecked(productId, product.refresh_interval);

    res.json({
      message: scrapedData.stockStatus === 'out_of_stock'
        ? 'Product is currently out of stock'
        : 'Price refreshed successfully',
      price: newPrice,
      stockStatus: scrapedData.stockStatus,
      aiStatus: scrapedData.aiStatus,
    });
  } catch (error) {
    console.error('Error refreshing price:', error);
    res.status(500).json({ error: 'Failed to refresh price' });
  }
});

// Get stock status history for a product
router.get('/:productId/stock-history', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    // Verify product belongs to user
    const product = await productQueries.findById(productId, userId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Get optional days filter from query (default 30 days)
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

    const stockHistory = await stockStatusHistoryQueries.getByProductId(productId, days);
    const stats = await stockStatusHistoryQueries.getStats(productId, days);

    res.json({
      history: stockHistory,
      stats,
    });
  } catch (error) {
    console.error('Error fetching stock status history:', error);
    res.status(500).json({ error: 'Failed to fetch stock status history' });
  }
});

export default router;
