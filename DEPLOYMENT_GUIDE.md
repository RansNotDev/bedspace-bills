# 🚀 Deployment Guide — Bedspace Bill Manager

This guide walks you through deploying the app from zero to live.

**Your accounts summary:**
| Service | Status | Details |
|---------|--------|---------|
| MongoDB Atlas | ✅ Done | cluster0.pjsofk4.mongodb.net |
| Cloudinary | ✅ Done | Cloud: dzh5lobpl |
| GitHub | ✅ Done | https://github.com/RansNotDev/bedspace-bills |
| Render | 🔄 In Progress | Step 5.4 — adding env variables |
| Vercel | ⏳ Pending | Step 6 |

---

## ✅ STEP 1 — MongoDB Atlas (DONE)

Your cluster is already set up:
- **Connection string:** `mongodb+srv://ranyboytemplado001_db_user:0QgbE8MyXFiaUp99@cluster0.pjsofk4.mongodb.net/bedspace-bills?retryWrites=true&w=majority&appName=Cluster0`
- **Database name:** `bedspace-bills` (already added to the URI)

> ⚠️ Make sure **Network Access** allows `0.0.0.0/0` so Render can connect:
> 1. Go to https://cloud.mongodb.com
> 2. Left sidebar → **Network Access**
> 3. Click **"Add IP Address"** → **"Allow Access from Anywhere"** → `0.0.0.0/0`
> 4. Click **Confirm**

---

## ✅ STEP 2 — Cloudinary (DONE)

Your Cloudinary credentials:
- **Cloud Name:** `dzh5lobpl`
- **API Key:** `876158945691151`
- **API Secret:** `7A4OynLMpWy0scPboQAlovW3dos`

---

## ✅ STEP 3 — GitHub (DONE)

Your repo: **https://github.com/RansNotDev/bedspace-bills**

If you haven't pushed yet, run these commands in your project root:

```bash
git init
git add .
git commit -m "Initial commit — Bedspace Bill Manager"
git branch -M main
git remote add origin https://github.com/RansNotDev/bedspace-bills.git
git push -u origin main
```

If you already pushed and made changes since:
```bash
git add .
git commit -m "Update env and config"
git push
```

> ✅ Your `.gitignore` is set up — `.env` files and `node_modules` will never be uploaded to GitHub.

---

## 🔄 STEP 4 — Seed Admin User (Run Once Locally)

Before going live, create the admin account in your database:

```bash
cd backend
node scripts/seed.js
```

Expected output:
```
✅ Admin created with nickname: "admin"
```

You will log in to the app with nickname: **admin**

---

## 🔄 STEP 5 — Deploy Backend to Render (IN PROGRESS)

You are currently at **Step 5.4 — Environment Variables**.

### 5.1–5.3 Render service settings (for reference)

| Field | Value |
|-------|-------|
| **Name** | `bedspace-bills-backend` |
| **Region** | Singapore |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | Free |

---

### 5.4 — Environment Variables (copy these exactly)

In Render, go to your service → **Environment** tab → add each row:

| Key | Value |
|-----|-------|
| `PORT` | `5000` |
| `MONGODB_URI` | `mongodb+srv://ranyboytemplado001_db_user:0QgbE8MyXFiaUp99@cluster0.pjsofk4.mongodb.net/bedspace-bills?retryWrites=true&w=majority&appName=Cluster0` |
| `JWT_SECRET` | `bedspace_super_secret_jwt_key_2025_change_this` |
| `EMAIL_USER` | `bedspaceph.house@gmail.com` |
| `EMAIL_PASS` | `rqnqqdzi fooqjjbs` |
| `EMAIL_FROM` | `Bedspace Bill Manager <bedspaceph.house@gmail.com>` |
| `CLOUDINARY_CLOUD_NAME` | `dzh5lobpl` |
| `CLOUDINARY_API_KEY` | `876158945691151` |
| `CLOUDINARY_API_SECRET` | `7A4OynLMpWy0scPboQAlovW3dos` |
| `FRONTEND_URL` | `https://bedspace-bills.vercel.app` *(update after Vercel deploy)* |

> 💡 **How to add them in Render:**
> 1. Click **"Add Environment Variable"** for each row
> 2. Paste the Key in the left box, Value in the right box
> 3. After adding all 10, click **"Save Changes"**
> 4. Render will automatically redeploy

### 5.5 — Wait for deployment

After saving, Render will redeploy. Watch the **Logs** tab. You should see:
```
✅ Connected to MongoDB Atlas
✅ Email transporter ready
🚀 Server running on port 5000
```

### 5.6 — Copy your backend URL

Once deployed, your backend URL will be something like:
```
https://bedspace-bills-backend.onrender.com
```

Find it at the top of your Render service page. **Save this URL** — you need it for Vercel.

> ⚠️ Free Render services sleep after 15 minutes of inactivity. The first request after sleeping takes ~30 seconds. This is normal on the free tier.

---

## ⏳ STEP 6 — Deploy Frontend to Vercel

### 6.1 Create a Vercel account
1. Go to **https://vercel.com**
2. Click **"Sign Up"** → sign up with **GitHub** (easiest)
3. Authorize Vercel to access your GitHub

### 6.2 Import your project
1. On the Vercel dashboard, click **"Add New..."** → **"Project"**
2. You'll see your GitHub repos listed
3. Find **`bedspace-bills`** and click **"Import"**

### 6.3 Configure the project

Vercel will auto-detect it. Set these values:

| Field | Value |
|-------|-------|
| **Framework Preset** | `Vite` |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

> 💡 To set Root Directory: click **"Edit"** next to Root Directory and type `frontend`

### 6.4 Add Environment Variable

Before clicking Deploy, scroll down to **"Environment Variables"**:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://bedspace-bills-backend.onrender.com` |

> Replace with your actual Render URL from Step 5.6

### 6.5 Deploy
Click **"Deploy"**. Vercel builds in about 1 minute.

Your live frontend URL will be:
```
https://bedspace-bills.vercel.app
```
(or similar — Vercel shows the exact URL after deploy)

### 6.6 Update FRONTEND_URL on Render

Now that you have your Vercel URL:
1. Go back to **Render** → your backend service → **Environment** tab
2. Find `FRONTEND_URL` and update it to your actual Vercel URL
3. Click **"Save Changes"** — Render redeploys automatically

---

## ✅ STEP 7 — Final Verification

### Test the live app
1. Open your Vercel URL: `https://bedspace-bills.vercel.app`
2. Log in with nickname: **`admin`**
3. You should land on the Admin Dashboard

### Test adding a tenant
1. Go to **Tenants** tab → **"+ Add Tenant"**
2. Fill in nickname, room type, move-in date
3. Click **"Add Tenant"**

### Test generating a bill
1. Go to **Generate Bill** tab
2. Fill in electricity total, water bill, deadline
3. Click **"⚡ Generate Bill Cycle"**
4. Go to **Bill Details** tab — you should see the tenant's calculated share

### Test payment link
1. In **Bill Details**, click **"🔗 Copy Link"** on a tenant
2. Open the copied URL in a new browser tab (no login needed)
3. You should see the bill breakdown and GCash section

### Test email (if tenant has email)
1. Edit a tenant and add an email address
2. In **Bill Details**, click **"📧 Send Link"**
3. Check the inbox — the bill email should arrive

---

## 📋 All Your Credentials (Keep This Safe)

```
=== MongoDB Atlas ===
User:     ranyboytemplado001_db_user
Password: 0QgbE8MyXFiaUp99
Cluster:  cluster0.pjsofk4.mongodb.net
DB Name:  bedspace-bills

=== Cloudinary ===
Cloud Name:  dzh5lobpl
API Key:     876158945691151
API Secret:  7A4OynLMpWy0scPboQAlovW3dos

=== Gmail SMTP ===
Email:    bedspaceph.house@gmail.com
App Pass: rqnqqdzi fooqjjbs

=== GitHub ===
Repo: https://github.com/RansNotDev/bedspace-bills

=== App Login ===
Admin nickname: admin
```

---

## 🔧 Troubleshooting

### Backend logs show "MongoDB connection error"
- Go to Atlas → **Network Access** → make sure `0.0.0.0/0` is listed
- Double-check the `MONGODB_URI` in Render env variables has no extra spaces

### Frontend shows "Network Error" or blank data
- Check that `VITE_API_URL` in Vercel matches your exact Render URL
- Make sure `FRONTEND_URL` in Render matches your exact Vercel URL
- Both URLs should have **no trailing slash**

### Email not sending
- The app password `rqnqqdzi fooqjjbs` — spaces are ignored by Gmail, it works
- Make sure 2-Step Verification is ON for `bedspaceph.house@gmail.com`
- Check Render logs for the exact error message

### Render service sleeping
- Free tier sleeps after 15 min of inactivity
- First request after sleep takes ~30 seconds — this is normal
- To avoid: upgrade to Render Starter ($7/month) or use a free uptime monitor like **UptimeRobot** to ping your backend every 10 minutes

### How to set up UptimeRobot (free, keeps Render awake)
1. Go to **https://uptimerobot.com** → sign up free
2. Click **"Add New Monitor"**
3. Monitor Type: **HTTP(s)**
4. URL: `https://your-backend.onrender.com/api/health`
5. Monitoring Interval: **5 minutes**
6. Click **"Create Monitor"**

---

## 🔄 How to Update the App Later

Whenever you make code changes:

```bash
# From your project root
git add .
git commit -m "describe your change"
git push
```

Both **Render** and **Vercel** are connected to your GitHub repo and will **auto-deploy** every time you push to `main`.

---

## Quick Commands

```bash
# Run locally
cd backend && npm run dev      # backend on http://localhost:5000
cd frontend && npm run dev     # frontend on http://localhost:5173

# Seed admin user (run once)
cd backend && node scripts/seed.js

# Push updates to GitHub (triggers auto-deploy)
git add .
git commit -m "your message"
git push
```
