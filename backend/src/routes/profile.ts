import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { userQueries } from '../models';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get current user profile
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const profile = await userQueries.getProfile(userId);

    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile (name)
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;

    const profile = await userQueries.updateProfile(userId, { name });

    if (!profile) {
      res.status(400).json({ error: 'No changes to save' });
      return;
    }

    res.json(profile);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (new_password.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    // Verify current password
    const user = await userQueries.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isValidPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    // Hash new password and update
    const newPasswordHash = await bcrypt.hash(new_password, 10);
    await userQueries.updatePassword(userId, newPasswordHash);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
