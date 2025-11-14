import express from 'express';
import prisma from '../utils/prisma.js'; // Keep for /test, will refactor later
import authRoutes from './authRoutes.js';
import excelRoutes from './excelRoutes.js';
import deanRoutes from './deanRoutes.js';

const router = express.Router();

router.get('/test', async (req, res) => {
  const users = await prisma.user.findMany();
  res.json({ message: 'API is working', users });
});

// Mount auth routes
router.use('/auth', authRoutes);

// Mount Excel routes
router.use('/excel', excelRoutes);

// Mount dean routes
router.use('/dean', deanRoutes);

export default router;