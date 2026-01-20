import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import priceRoutes from './routes/prices';
import { startScheduler } from './services/scheduler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/products', priceRoutes);

// Error handling middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`PriceGhost API server running on port ${PORT}`);

  // Start the background price checker
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }
});

export default app;
