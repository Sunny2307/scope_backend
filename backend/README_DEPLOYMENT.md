# 🚀 Vercel Deployment - Setup Complete!

Your backend has been prepared for Vercel deployment. Here's what was done:

## ✅ Files Created/Modified

### New Files:
1. **`vercel.json`** - Vercel configuration file
2. **`api/index.js`** - Vercel serverless function handler
3. **`DEPLOYMENT.md`** - Complete step-by-step deployment guide
4. **`VERCEL_QUICK_START.md`** - Quick reference guide

### Modified Files:
1. **`package.json`** - Updated for Vercel:
   - Moved `@prisma/client` and `prisma` to `dependencies`
   - Added `build` script: `prisma generate`
   - Added `postinstall` script: `prisma generate`

2. **`.gitignore`** - Added:
   - `.vercel` directory
   - `uploads/*` (files should use cloud storage)

## 📋 Next Steps

### 1. Push to GitHub
```bash
cd backend
git add .
git commit -m "Prepare for Vercel deployment"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Deploy on Vercel

**Quick Steps:**
1. Go to [vercel.com](https://vercel.com) → Sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. **Root Directory**: `backend` (or leave blank if backend is root)
5. Add environment variables (see below)
6. Click **"Deploy"**

### 3. Required Environment Variables

Add these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `EMAIL_USER` | ✅ Yes | Gmail address for sending emails |
| `EMAIL_PASS` | ✅ Yes | Gmail app password |
| `EMAIL_HOST` | ✅ Yes | `smtp.gmail.com` |
| `EMAIL_PORT` | ✅ Yes | `587` |
| `JWT_SECRET` | ⚠️ If used | Secret key for JWT tokens |
| `PORT` | ❌ No | Vercel sets this automatically |

## ⚠️ Important Notes

### File Uploads
Your app uses `multer` with `memoryStorage()`, which is good! However:
- Files saved to disk won't persist on Vercel
- Consider migrating to cloud storage (S3, Cloudinary, Vercel Blob) for production
- The `/uploads` static route won't work on Vercel

### Database
- Set up a PostgreSQL database (Neon, Supabase, or Railway)
- Use connection string with SSL: `?sslmode=require`
- Run migrations: `npx prisma db push` or `npx prisma migrate deploy`

### CORS
Update CORS in `src/utils/app.js` to allow your frontend domain:
```javascript
app.use(cors({
  origin: 'https://your-frontend.vercel.app',
  credentials: true
}));
```

## 📚 Documentation

- **Quick Start**: See `VERCEL_QUICK_START.md`
- **Full Guide**: See `DEPLOYMENT.md`
- **Setup Guide**: See `SETUP.md` (for local development)

## 🎯 Your API Endpoints

After deployment, your API will be available at:
- `https://your-project.vercel.app/api/...`

All your existing routes will work:
- `/api/auth/*` - Authentication routes
- `/api/dean/*` - Dean routes
- `/api/excel/*` - Excel processing routes

## 🐛 Troubleshooting

**Build fails?**
- Check that all dependencies are in `dependencies` (not `devDependencies`)
- Verify `package.json` has `build` and `postinstall` scripts

**Database connection error?**
- Verify `DATABASE_URL` is correct
- Ensure database allows connections from Vercel
- Add `?sslmode=require` to connection string

**Function timeout?**
- Vercel free tier: 10 seconds
- Upgrade to Pro for 60 seconds
- Optimize slow operations

## ✨ You're Ready!

Your backend is now configured for Vercel. Follow the steps above to deploy!

For detailed instructions, see **`DEPLOYMENT.md`**.

