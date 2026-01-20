import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { productQueries, priceHistoryQueries } from '../models';
import { scrapeProduct } from '../services/scraper';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all products for the authenticated user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const products = await productQueries.findByUserId(userId);
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Add a new product to track
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { url, refresh_interval } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }

    // Scrape product info
    const scrapedData = await scrapeProduct(url);

    if (!scrapedData.price) {
      res.status(400).json({
        error: 'Could not extract price from the provided URL',
      });
      return;
    }

    // Create product
    const product = await productQueries.create(
      userId,
      url,
      scrapedData.name,
      scrapedData.imageUrl,
      refresh_interval || 3600
    );

    // Record initial price
    await priceHistoryQueries.create(
      product.id,
      scrapedData.price.price,
      scrapedData.price.currency
    );

    // Update last_checked timestamp
    await productQueries.updateLastChecked(product.id);

    // Fetch the product with the price
    const productWithPrice = await productQueries.findById(product.id, userId);

    res.status(201).json(productWithPrice);
  } catch (error) {
    // Handle unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes('duplicate key value')
    ) {
      res.status(409).json({ error: 'You are already tracking this product' });
      return;
    }
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Get a specific product
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const productId = parseInt(req.params.id, 10);

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const product = await productQueries.findById(productId, userId);

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Get price stats
    const stats = await priceHistoryQueries.getStats(productId);

    res.json({ ...product, stats });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Update product settings
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const productId = parseInt(req.params.id, 10);

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const { name, refresh_interval } = req.body;

    const product = await productQueries.update(productId, userId, {
      name,
      refresh_interval,
    });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete a product
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const productId = parseInt(req.params.id, 10);

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const deleted = await productQueries.delete(productId, userId);

    if (!deleted) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
