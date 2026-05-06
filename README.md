# 🏠 Bedspace Bill Management System

A full-stack web app for managing shared utility bills in a Filipino bedspace or boarding house. **All bill amounts in the product are Philippine Peso (PHP).**

---

## Table of contents

1. [Overview](#overview)  
2. [Features & capabilities](#features--capabilities)  
3. [Tech stack](#tech-stack)  
4. [User roles & authentication](#user-roles--authentication)  
5. [Application routes (frontend)](#application-routes-frontend)  
6. [Backend API (summary)](#backend-api-summary)  
7. [Environment variables](#environment-variables)  
8. [Local setup](#local-setup)  
9. [Deployment (production)](#deployment-production)  
10. [Bill splitting logic](#bill-splitting-logic)  
11. [Payment links & uploads](#payment-links--uploads)  
12. [Folder structure](#folder-structure)  
13. [Personal deployment file (not in Git)](#personal-deployment-file-not-in-git)

---

## Overview

The system lets a **landlord (admin)** manage **tenants**, generate **monthly bill cycles** (electricity, water, drinking water, trash bags), split shares automatically, collect via **GCash** (QR + numbers), track **paid/unpaid**, send **payment links** by email or clipboard, and export **PDF** reports. **Tenants** see their current bill, history, and can upload receipts. A **public payment page** works from a link token without logging in.

---

## Features & capabilities

### Admin (landlord)

- **Dashboard (Overview)** — active tenant count; per–bill-cycle month selector; house totals (electricity, water, drinking water, trash); collection progress; tenant bill table (paid/unpaid).
- **Tenants** — add/edit/deactivate tenants; nickname, room type (aircon vs non-aircon), optional email, move-in date.
- **Generate bill cycle** — month/year, electricity total, water bill, drinking-water pool (default ₱100), trash-bags pool (default ₱100), deadline, optional GCash numbers; creates cycle + one **tenant bill** per active tenant with calculated shares.
- **Bill details** — select cycle; cycle summary; per-tenant cards: breakdown (electricity, water, drinking water, trash), send payment link, mark paid/unpaid, receipt thumbnail.
- **GCash setup** — per selected cycle: save GCash numbers and upload QR images (electricity / water / others) stored via Cloudinary.
- **Calendar** — Philippine-time view of bill deadlines and related dates.
- **Reports** — monthly summary, tenant breakdown table, **download PDF**.
- **Change password** — landlord can update password while logged in.
- **Auth** — after failed login attempts, **lockout** + **email OTP** flow to reset admin password (requires working Gmail + `ADMIN_PASSWORD_RESET_EMAIL`).

### Tenant

- **Dashboard** — current month bill (when it exists), line items (electricity, water, drinking water, trash), total, due date, paid status; bill history list.

### Public (no account)

- **Payment link page** (`/pay/:token`) — bill breakdown, GCash QR display, optional receipt upload for that bill.

### Cross-cutting

- **JWT** sessions; role checks on admin vs tenant routes.
- **Cloudinary** for receipt images and GCash QR images.
- **Gmail SMTP** for payment-link emails and admin password-reset OTP.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios |
| Backend | Node.js, Express.js, Mongoose |
| Database | MongoDB (Atlas) |
| File storage | Cloudinary |
| Email | Nodemailer + Gmail (App Password) |
| PDF | jsPDF, jspdf-autotable |
| Calendar | react-big-calendar |
| Hosting | **Vercel** (frontend SPA) + **Node.js host** for API (see [Deployment](#deployment-production)) |

---

## User roles & authentication

| Role | Login | Notes |
|------|--------|------|
| **admin** | **Nickname** (`admin` after seed) + **password** | Password comes from `ADMIN_INITIAL_PASSWORD` at seed time; can be changed in-app. |
| **tenant** | **Nickname** only (no password) | Preflight API determines whether a password field is shown. |

Tokens are stored in `localStorage` and sent as `Authorization: Bearer …` to the API.

---

## Application routes (frontend)

| Path | Who | Purpose |
|------|-----|--------|
| `/` | Anyone | Redirects to `/login` or role-specific dashboard |
| `/login` | Public | Login + admin lockout / OTP reset UI |
| `/pay/:token` | Public | Payment instructions + receipt upload |
| `/admin` | Admin | Main admin dashboard (Overview, Tenants, Generate Bill, Bill Details, GCash Setup) |
| `/admin/calendar` | Admin | Calendar |
| `/admin/reports` | Admin | Reports + PDF download |
| `/tenant` | Tenant | Tenant dashboard |

---

## Backend API (summary)

The browser uses `VITE_API_URL` as the API **origin**; all routes below are under **`/api`**.

| Area | Examples | Notes |
|------|-----------|------|
| Health | `GET /api/health` | Public |
| Auth | `POST /api/auth/preflight`, `POST /api/auth/login`, admin OTP reset + `POST /api/auth/change-password`, `GET /api/auth/me` | |
| Admin | `/api/admin/tenants`, `/api/admin/bill-cycles`, `/api/admin/bill-cycles/:id`, mark-paid, `GET /api/admin/dashboard-summary` | JWT + admin role |
| Bills | `POST /api/bills/generate`, `POST /api/bills/send-link/:tenantBillId`, `GET /api/bills/my-bills`, `GET /api/bills/my-bills/current` | Admin vs tenant as enforced in routes |
| Upload | `POST /api/upload/qr/...`, `POST /api/upload/receipt/...`, `POST /api/upload/receipt-public/:token` | QR admin-only |
| Payment (public) | `GET /api/payment/:token` | No JWT |

---

## Environment variables

**Backend** (`backend/.env`) — full list in `backend/.env.example`:

| Variable | Purpose |
|----------|---------|
| `PORT` | Local dev; often set by host |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `ADMIN_INITIAL_PASSWORD` | Landlord password at seed (min 8 characters) |
| `ADMIN_PASSWORD_RESET_EMAIL` | OTP destination when admin is locked out |
| `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | Gmail SMTP (`EMAIL_PASS` = App Password) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image uploads |
| `FRONTEND_URL` | CORS + valid links in email (production: Vercel URL) |

**Frontend** (`frontend/.env`):

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API origin only (`http://localhost:5000` or `https://your-api.host`) — **no** `/api` suffix |

Never commit `.env` files.

---

## Local setup

### 1. Clone and install

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

Copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env`, then edit. Typical local values: `FRONTEND_URL=http://localhost:5173`, `VITE_API_URL=http://localhost:5000`.

### 3. Seed the admin user

```bash
cd backend
node scripts/seed.js
```

Creates user **`admin`** with password from `ADMIN_INITIAL_PASSWORD`.

### 4. Run

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open **http://localhost:5173**.

---

## Deployment (production)

This section contains **no secrets**. Put real values in hosting dashboards or `.env` only.

### How the pieces fit together

| Piece | Role | Typical host |
|--------|------|----------------|
| **Frontend** | React SPA | **Vercel** (import repo, root folder **`frontend`**) |
| **API** | Express + MongoDB | **Node.js** host (Railway, Fly.io, Koyeb, etc.) — long-running `npm start` |
| **Database** | MongoDB | **Atlas** |
| **Media** | Images | **Cloudinary** |
| **Email** | SMTP | **Gmail** App Password |

**Suggested order:** Atlas + Cloudinary + Gmail → push **GitHub** → deploy **API** → **seed** admin once → **Vercel** → set **`FRONTEND_URL`** on API → verify.

### Prerequisites

1. **MongoDB Atlas** — cluster, database user, `MONGODB_URI`; **Network Access** allows your API.
2. **Cloudinary** — dashboard credentials.
3. **Gmail** — 2FA + App Password.
4. **GitHub** — repository for this monorepo.

### 1. Push to GitHub

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "Bedspace bill system"
git push -u origin main
```

Never commit `.env` or secrets. After cloning elsewhere:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# edit both
```

### 2. Deploy the API (Node.js host)

1. Connect the **same** GitHub repo; set **root directory** to **`backend`**.
2. Install: `npm install`; start: `npm start` (`node server.js`).
3. Add every variable from **`backend/.env.example`** for production.
4. Note the public **HTTPS** API base URL — **no** trailing slash, **no** `/api`.
5. Test `GET https://YOUR_API/api/health` → `status: ok`.

### 3. Seed production admin

Run **once** with production `MONGODB_URI`:

```bash
cd backend
node scripts/seed.js
```

(from your PC with prod env, or the host’s one-off command runner.)

### 4. Deploy frontend (Vercel)

1. **New Project** → import repo → **Root Directory:** `frontend`.
2. Framework **Vite**; **Build:** `npm run build`; **Output:** `dist`.
3. Environment: `VITE_API_URL=https://YOUR_API_ORIGIN` (no `/api`).

### 5. Finish wiring

1. On the API host, set **`FRONTEND_URL`** to your **Vercel** URL (exact origin, no trailing slash); restart/redeploy API.
2. Redeploy Vercel if `VITE_API_URL` changed.

### Production checklist

- [ ] `/api/health` OK  
- [ ] Seed done; `admin` login on production site  
- [ ] No browser CORS errors  
- [ ] Bills, payment links, email, uploads work  

### Troubleshooting

- **CORS** — `FRONTEND_URL` must match the browser origin exactly (`https://…`).  
- **API 404 from app** — `VITE_API_URL` must be hostname only; the client appends `/api/...`.  
- **Mongo** — Atlas network rules and correct URI.

---

## Bill splitting logic

### Electricity

- Aircon tenant = **1.0** unit; non-aircon = **0.5** unit.  
- Per-unit cost = `electricityTotal / totalUnits`.  
- Each tenant pays `units × per-unit`.

**Example:** 3 aircon + 2 non-aircon, bill PHP 3,000 → total units = 4 → per unit 750 → aircon PHP 750, non-aircon PHP 375.

### Water, drinking water, trash bags

- Each **pool** (water bill, drinking-water total, trash-bags total) is split **equally** among active tenants.  
- **Defaults** for house pools when omitted: drinking water **₱100**, trash bags **₱100** (per generate form / API).

---

## Payment links & uploads

1. Admin sends a payment link per tenant bill (email if tenant has email, otherwise URL copy).
2. Each link uses a token on `TenantBill`; route **`/pay/:token`** is public.
3. Link expiry is computed from tenant move-in (and related rules in `calculateLinkExpiry`).
4. Receipts go to **Cloudinary** (authenticated or public token upload).

---

## Folder structure

```
bedspacebillsystem/
├── backend/
│   ├── models/
│   ├── routes/          # auth, admin, bills, upload, paymentLink
│   ├── middleware/
│   ├── utils/
│   ├── scripts/         # seed.js
│   └── server.js
├── frontend/
│   └── src/
│       ├── pages/
│       ├── components/
│       └── utils/       # api.js, helpers.js
├── README.md            # Committed — this document
└── DEPLOYMENT_GUIDE.md  # Optional local checklist — gitignored (see below)
```

---

## Personal deployment file (not in Git)

**`DEPLOYMENT_GUIDE.md`** in the project root is listed in **`.gitignore`**. You can keep that file open on your machine as a **short manual / checklist**; Git will **not** commit it. If you clone the repo on a new computer and want the same workflow, copy or recreate `DEPLOYMENT_GUIDE.md` locally — it will stay private to your machine.

**Committed documentation** for setup, deployment, and how the system works is this **`README.md`** only.
