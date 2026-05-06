# 🏠 Bedspace Bill Management System

A full-stack web app for managing shared utility bills in a Filipino bedspace/boarding house.

## Features

- **Nickname-only login** (no password) with JWT sessions
- **Electricity bill splitting** — aircon tenants pay 2× non-aircon tenants
- **Water, drinking water, trash bags** split equally among all tenants
- **Payment links** sent via email (Gmail SMTP) or copyable URL
- **GCash QR code** display per bill category
- **Receipt upload** via Cloudinary
- **PDF report generation** per month
- **Philippine calendar** with bill deadlines and move-in dates
- **Admin dashboard** with full tenant and bill management
- **Tenant dashboard** with bill history and payment upload

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | MongoDB Atlas (Mongoose) |
| Storage | Cloudinary |
| Email | Nodemailer + Gmail SMTP |
| PDF | jsPDF + jspdf-autotable |
| Calendar | react-big-calendar |
| Hosting | Vercel (frontend) + Render (backend) |

---

## Setup

### 1. Clone and install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment variables

**Backend** — copy `.env.example` to `.env` and fill in:
```
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_secret_here
EMAIL_USER=bedspaceph@gmail.com
EMAIL_PASS=rqnq qdzi fooq jjbs
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
FRONTEND_URL=http://localhost:5173
```

**Frontend** — copy `.env.example` to `.env`:
```
VITE_API_URL=http://localhost:5000
```

### 3. Seed the admin user

```bash
cd backend
node scripts/seed.js
```

This creates an admin with nickname `admin`. Log in with that nickname.

### 4. Run locally

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open http://localhost:5173

---

## Deployment

### Backend → Render
1. Push `backend/` to GitHub
2. New Web Service on Render → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add all environment variables

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. Import project on Vercel
3. Set `VITE_API_URL` to your Render backend URL
4. Deploy

---

## Bill Splitting Logic

### Electricity
- Aircon tenant = **1.0 unit**
- Non-aircon tenant = **0.5 unit**
- Per unit cost = `electricityTotal / totalUnits`

**Example:** 3 aircon + 2 non-aircon, bill = PHP 3,000
- Total units = 3×1 + 2×0.5 = 4
- Per unit = 3000/4 = 750
- Aircon pays = PHP 750
- Non-aircon pays = PHP 375

### Water, Drinking Water, Trash Bags
- Split **equally** among all active tenants
- Defaults: Drinking Water = PHP 100, Trash Bags = PHP 100

---

## Payment Link System

1. Admin clicks "Send Bill Link" per tenant
2. System generates a UUID token stored in `TenantBill.paymentLinkToken`
3. Expiry = `tenant.moveInDate + 1 month + 15 days`
4. If tenant has email → sends via Gmail SMTP
5. If no email → returns shareable URL (copy to clipboard)
6. Public page at `/pay/:token` — no login required

---

## Folder Structure

```
bedspace-bills/
├── backend/
│   ├── models/          # Mongoose schemas
│   ├── routes/          # Express routes
│   ├── middleware/       # JWT auth middleware
│   ├── utils/           # Bill calculator, email sender
│   ├── scripts/         # Seed script
│   └── server.js
└── frontend/
    └── src/
        ├── pages/       # Login, Admin, Tenant, Calendar, Reports, PaymentLink
        ├── components/  # Layout, BillCard, QRCodeDisplay, ReceiptUpload, PDFReport
        └── utils/       # API client, helpers
```
