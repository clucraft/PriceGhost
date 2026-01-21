import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { userQueries, systemSettingsQueries } from '../models';
import { generateToken } from '../middleware/auth';

const router = Router();

// Check if registration is enabled (public endpoint for login page)
router.get('/registration-status', async (_req: Request, res: Response) => {
  try {
    const enabled = await systemSettingsQueries.get('registration_enabled');
    res.json({ registration_enabled: enabled !== 'false' });
  } catch (error) {
    console.error('Error checking registration status:', error);
    res.json({ registration_enabled: true }); // Default to true on error
  }
});

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Check if registration is enabled
    const registrationEnabled = await systemSettingsQueries.get('registration_enabled');
    if (registrationEnabled === 'false') {
      res.status(403).json({ error: 'Registration is currently disabled' });
      return;
    }

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const existingUser = await userQueries.findByEmail(email);
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await userQueries.create(email, passwordHash);

    // Make first user an admin
    const allUsers = await userQueries.findAll();
    if (allUsers.length === 1) {
      await userQueries.setAdmin(user.id, true);
    }

    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await userQueries.findByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
