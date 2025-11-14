# 🔗 How to Find Your Vercel Deployment URL

## 📍 Where to Find Your Deployment URL in Vercel

After deploying your backend to Vercel, here's where to find your deployment URL:

### Step 1: Go to Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Sign in to your account
3. You'll see your **Projects** dashboard

### Step 2: Find Your Project
1. Click on your **project name** (e.g., `scope-backend` or whatever you named it)
2. You'll be taken to the project dashboard

### Step 3: Find the Deployment URL
You'll see the deployment URL in **3 places**:

#### Option 1: Project Overview (Main URL)
- At the top of the project page, you'll see:
  - **Production URL**: `https://your-project-name.vercel.app`
  - This is your main deployment URL
  - Example: `https://scope-backend.vercel.app`

#### Option 2: Deployments Tab
1. Click on the **"Deployments"** tab
2. You'll see a list of all deployments
3. Click on the **latest deployment** (usually at the top)
4. You'll see the deployment URL there

#### Option 3: Domain Settings
1. Go to **Settings** → **Domains**
2. You'll see your default Vercel domain: `your-project-name.vercel.app`

## 🎯 Your Backend API URL

Once you have your deployment URL, your backend API will be available at:

```
https://your-project-name.vercel.app/api
```

### Example:
If your project name is `scope-backend`, your API URL will be:
```
https://scope-backend.vercel.app/api
```

## 🔌 How to Use It in Your Frontend

### 1. Update Frontend Environment Variables

In your frontend project, create or update your `.env` file:

```env
# For production
VITE_API_URL=https://your-project-name.vercel.app/api
# or
REACT_APP_API_URL=https://your-project-name.vercel.app/api
# or
NEXT_PUBLIC_API_URL=https://your-project-name.vercel.app/api
```

### 2. Update Your Frontend API Configuration

#### If using Axios:
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://your-project-name.vercel.app/api',
  headers: {
    'Content-Type': 'application/json',
  },
});
```

#### If using Fetch:
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'https://your-project-name.vercel.app/api';

fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email, password }),
});
```

### 3. Example API Calls

#### Login:
```javascript
POST https://your-project-name.vercel.app/api/auth/login
```

#### Signup:
```javascript
POST https://your-project-name.vercel.app/api/auth/signup
```

#### Get User Profile:
```javascript
GET https://your-project-name.vercel.app/api/auth/profile
```

## 🔒 Update CORS Settings (Optional but Recommended)

Your backend currently allows all origins (`app.use(cors())`). For production, it's better to specify allowed origins.

### Update `backend/src/utils/app.js`:

```javascript
import cors from 'cors';

// Update CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000', // Local development
    'http://localhost:5173', // Vite dev server
    'https://your-frontend.vercel.app', // Production frontend
    // Add more allowed origins as needed
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
```

Or if you want to allow all origins (less secure but easier):
```javascript
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
}));
```

## 📋 Quick Checklist

- [ ] Deploy backend to Vercel
- [ ] Copy your deployment URL from Vercel dashboard
- [ ] Update frontend `.env` file with the API URL
- [ ] Update frontend API configuration
- [ ] Update CORS settings in backend (optional but recommended)
- [ ] Test API connection from frontend

## 🧪 Test Your API

You can test your API directly in the browser or using curl:

### Test Health Endpoint (if you have one):
```bash
curl https://your-project-name.vercel.app/api/health
```

### Test Login Endpoint:
```bash
curl -X POST https://your-project-name.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

## 🔍 Finding Your URL After Deployment

### Immediately After Deployment:
1. After clicking "Deploy" in Vercel
2. Wait for the build to complete (2-5 minutes)
3. You'll see a success message with the deployment URL
4. Click on the URL to visit your API

### From Vercel Dashboard:
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Find your project
3. Click on it
4. You'll see the production URL at the top

### From Deployments:
1. Go to your project
2. Click on "Deployments" tab
3. Click on the latest deployment
4. You'll see the deployment URL and status

## 💡 Pro Tips

1. **Custom Domain**: You can add a custom domain in Vercel Settings → Domains
2. **Environment Variables**: Make sure all environment variables are set in Vercel
3. **Preview Deployments**: Each Git push creates a preview deployment with a unique URL
4. **Production vs Preview**: The production URL is your main URL, preview URLs are for testing

## 🎯 Your Backend API Base URL Format

```
https://your-project-name.vercel.app/api
```

All your API endpoints will be:
- `https://your-project-name.vercel.app/api/auth/*`
- `https://your-project-name.vercel.app/api/dean/*`
- `https://your-project-name.vercel.app/api/excel/*`

---

## 📞 Need Help?

If you can't find your deployment URL:
1. Check Vercel dashboard → Projects → Your Project
2. Look for the "Production" or "Deployments" section
3. Check your email for deployment notifications
4. Check Vercel CLI if you used it: `vercel ls`


