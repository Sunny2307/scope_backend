# Vercel Deployment Guide

This guide will walk you through deploying your backend to Vercel.

## Prerequisites

1. A GitHub account
2. A Vercel account (sign up at [vercel.com](https://vercel.com))
3. A PostgreSQL database (you can use services like Neon, Supabase, or Railway)
4. All environment variables ready

## Step 1: Prepare Your Repository

### 1.1 Initialize Git (if not already done)

```bash
cd backend
git init
```

### 1.2 Create .gitignore (already exists, but verify it includes)

Make sure your `.gitignore` includes:
- `.env` files
- `node_modules/`
- `uploads/` (if you want to exclude uploaded files)

### 1.3 Commit Your Code

```bash
git add .
git commit -m "Initial commit - Ready for Vercel deployment"
```

## Step 2: Push to GitHub

### 2.1 Create a New Repository on GitHub

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it (e.g., `scope-backend`)
3. **Do NOT** initialize with README, .gitignore, or license

### 2.2 Push Your Code

```bash
# Add your GitHub repository as remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 3: Set Up Your Database

### 3.1 Choose a Database Provider

Recommended options:
- **Neon** (https://neon.tech) - Free tier available
- **Supabase** (https://supabase.com) - Free tier available
- **Railway** (https://railway.app) - Free tier available
- **Vercel Postgres** (https://vercel.com/storage/postgres) - Integrated with Vercel

### 3.2 Create Database and Get Connection String

1. Create a new PostgreSQL database
2. Copy the connection string (DATABASE_URL)
3. It should look like: `postgresql://user:password@host:5432/database?sslmode=require`

### 3.3 Run Migrations (Optional but Recommended)

If you want to set up your schema before deployment:

```bash
# Set your DATABASE_URL temporarily
export DATABASE_URL="your-database-url"

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

## Step 4: Deploy to Vercel

### 4.1 Import Your Project

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Select your GitHub repository
5. Click **"Import"**

### 4.2 Configure Project Settings

1. **Framework Preset**: Select "Other" or leave as default
2. **Root Directory**: Set to `backend` (if your repo root is the backend folder, leave blank)
3. **Build Command**: `npm run build` (or leave blank, Vercel will auto-detect)
4. **Output Directory**: Leave blank
5. **Install Command**: `npm install`

### 4.3 Add Environment Variables

In the Vercel project settings, add these environment variables:

1. **DATABASE_URL**
   - Value: Your PostgreSQL connection string
   - Example: `postgresql://user:password@host:5432/database?sslmode=require`

2. **PORT** (optional, Vercel sets this automatically)
   - Value: `3000` or leave blank

3. **EMAIL_HOST**
   - Value: `smtp.gmail.com`

4. **EMAIL_PORT**
   - Value: `587`

5. **EMAIL_USER**
   - Value: Your Gmail address

6. **EMAIL_PASS**
   - Value: Your Gmail app password (not your regular password)
   - To get an app password: Gmail → Account → Security → 2-Step Verification → App Passwords

7. **JWT_SECRET** (if your app uses JWT)
   - Value: A strong random string (generate one using: `openssl rand -base64 32`)

### 4.4 Deploy

1. Click **"Deploy"**
2. Wait for the build to complete (usually 2-5 minutes)
3. Once deployed, you'll get a URL like: `https://your-project.vercel.app`

## Step 5: Verify Deployment

### 5.1 Test Your API

Your API will be available at:
- `https://your-project.vercel.app/api/...`

Test endpoints:
```bash
# Health check (if you have one)
curl https://your-project.vercel.app/api/health

# Or test a specific endpoint
curl https://your-project.vercel.app/api/auth/login
```

### 5.2 Check Logs

1. Go to your Vercel project dashboard
2. Click on the deployment
3. Go to the "Functions" tab to see serverless function logs
4. Check for any errors

## Step 6: Set Up Custom Domain (Optional)

1. Go to your project settings in Vercel
2. Click on "Domains"
3. Add your custom domain
4. Follow the DNS configuration instructions

## Important Notes

### File Uploads

⚠️ **Important**: Vercel serverless functions have limitations:
- **File system is read-only** (except `/tmp`)
- Uploaded files are **ephemeral** and will be deleted after the function execution
- **Recommended**: Use external storage for file uploads:
  - AWS S3
  - Cloudinary
  - Vercel Blob Storage
  - Supabase Storage

If you need to handle file uploads, you'll need to modify your code to upload directly to cloud storage instead of saving to the local filesystem.

### Database Migrations

For production, it's recommended to:
1. Use Prisma Migrate instead of `db push`
2. Run migrations manually or set up a CI/CD pipeline
3. Keep your database schema in version control

### Environment Variables

- Never commit `.env` files to Git
- Always add environment variables in Vercel dashboard
- Use different databases for development and production

## Troubleshooting

### Build Fails

1. Check build logs in Vercel dashboard
2. Ensure all dependencies are in `dependencies` (not `devDependencies`)
3. Verify `package.json` has correct build scripts

### Database Connection Errors

1. Verify `DATABASE_URL` is correct in Vercel environment variables
2. Check if your database allows connections from Vercel's IPs
3. Ensure SSL is enabled (add `?sslmode=require` to connection string)

### Function Timeout

1. Vercel free tier has 10-second timeout for Hobby plan
2. Upgrade to Pro for longer timeouts (60 seconds)
3. Optimize your code to reduce execution time

### CORS Issues

1. Update CORS settings in `src/utils/app.js` to include your frontend domain
2. Add your frontend URL to allowed origins

## Next Steps

1. Set up continuous deployment (automatic deployments on push to main)
2. Configure preview deployments for pull requests
3. Set up monitoring and error tracking
4. Configure file storage for uploads
5. Set up database backups

## Support

If you encounter issues:
1. Check Vercel documentation: https://vercel.com/docs
2. Check Prisma documentation: https://www.prisma.io/docs
3. Review Vercel function logs for errors

