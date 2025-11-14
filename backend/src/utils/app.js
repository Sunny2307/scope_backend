import express from 'express';
import prisma from './prisma.js';
import router from '../routes/router.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Routes
app.use('/api', router);

export default app;