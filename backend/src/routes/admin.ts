import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { userQueries, systemSettingsQueries } from '../models';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Admin middleware - checks if user is admin
const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const user = await userQueries.findById(userId);

    if (!user || !user.is_admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Failed to verify admin status' });
  }
};

router.use(adminMiddleware);

// Get all users
router.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await userQueries.findAll();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete a user
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const targetId = parseInt(req.params.id, 10);

    if (isNaN(targetId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Prevent deleting yourself
    if (targetId === userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    const deleted = await userQueries.delete(targetId);

    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Toggle admin status for a user
router.put('/users/:id/admin', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const targetId = parseInt(req.params.id, 10);
    const { is_admin } = req.body;

    if (isNaN(targetId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Prevent removing your own admin status
    if (targetId === userId && !is_admin) {
      res.status(400).json({ error: 'Cannot remove your own admin status' });
      return;
    }

    const updated = await userQueries.setAdmin(targetId, is_admin);

    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: `Admin status ${is_admin ? 'granted' : 'revoked'} successfully` });
  } catch (error) {
    console.error('Error updating admin status:', error);
    res.status(500).json({ error: 'Failed to update admin status' });
  }
});

// Get system settings
router.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await systemSettingsQueries.getAll();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

// Update system settings
router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { registration_enabled } = req.body;

    if (registration_enabled !== undefined) {
      await systemSettingsQueries.set('registration_enabled', String(registration_enabled));
    }

    const settings = await systemSettingsQueries.getAll();
    res.json(settings);
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
});

export default router;
