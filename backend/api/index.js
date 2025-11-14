import dotenv from 'dotenv';
import app from '../src/utils/app.js';

// Load environment variables
dotenv.config();

// Vercel serverless function handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle the request using Express app
  return new Promise((resolve, reject) => {
    app(req, res, (err) => {
      if (err) {
        console.error('Error handling request:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal Server Error' });
        }
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

