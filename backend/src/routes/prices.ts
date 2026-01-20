import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { productQueries, priceHistoryQueries } from '../models';
import { scrapePrice } from '../services/scraper';

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

    // Scrape new price
    const priceData = await scrapePrice(product.url);

    if (!priceData) {
      res.status(400).json({ error: 'Could not extract price from URL' });
      return;
    }

    // Record new price
    const newPrice = await priceHistoryQueries.create(
      productId,
      priceData.price,
      priceData.currency
    );

    // Update last_checked timestamp
    await productQueries.updateLastChecked(productId);

    res.json({
      message: 'Price refreshed successfully',
      price: newPrice,
    });
  } catch (error) {
    console.error('Error refreshing price:', error);
    res.status(500).json({ error: 'Failed to refresh price' });
  }
});

export default router;
