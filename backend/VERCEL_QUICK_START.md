# Quick Start: Deploy to Vercel

## 🚀 Quick Deployment Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. **Root Directory**: Set to `backend` (if your backend folder is at root, leave blank)
5. **Build Command**: `npm run build` (or leave blank)
6. **Install Command**: `npm install`

### 3. Add Environment Variables in Vercel

Go to **Settings → Environment Variables** and add:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `EMAIL_USER` | Gmail address | `your-email@gmail.com` |
| `EMAIL_PASS` | Gmail app password | `xxxx xxxx xxxx xxxx` |
| `EMAIL_HOST` | SMTP host | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP port | `587` |
| `JWT_SECRET` | JWT secret key | Generate with: `openssl rand -base64 32` |

### 4. Deploy!

Click **"Deploy"** and wait 2-5 minutes.

Your API will be live at: `https://your-project.vercel.app/api/...`

## 📝 Important Notes

- **File Uploads**: Vercel serverless functions can't store files permanently. Use cloud storage (S3, Cloudinary, etc.)
- **Database**: Use Neon, Supabase, or Railway for PostgreSQL
- **CORS**: Update CORS settings in `src/utils/app.js` with your frontend URL

## 🔍 Full Guide

See `DEPLOYMENT.md` for detailed instructions.

