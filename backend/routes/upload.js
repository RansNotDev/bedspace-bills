const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary');
const multer = require('multer');
// multer-storage-cloudinary 2.x exports a factory function, not `{ CloudinaryStorage }`.
const createCloudinaryStorage = require('multer-storage-cloudinary');
const TenantBill = require('../models/TenantBill');
const { protect, adminOnly } = require('../middleware/authMiddleware');

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const qrStorage = createCloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bedspace-bills/qr-codes',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'limit' }],
  },
});

const receiptStorage = createCloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bedspace-bills/receipts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    transformation: [{ width: 1200, crop: 'limit' }],
  },
});

const uploadQR = multer({
  storage: qrStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * POST /api/upload/qr/:cycleId/:type
 * Admin uploads GCash QR code image for a bill cycle
 * type: electricity | water | others
 */
router.post('/qr/:cycleId/:type', protect, adminOnly, uploadQR.single('qr'), async (req, res) => {
  try {
    const { cycleId, type } = req.params;
    const validTypes = ['electricity', 'water', 'others'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid QR type. Use: electricity, water, others' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const BillCycle = require('../models/BillCycle');
    const imageUrl = req.file.path;

    const cycle = await BillCycle.findByIdAndUpdate(
      cycleId,
      { [`gcashQRImages.${type}`]: imageUrl },
      { new: true }
    );

    if (!cycle) return res.status(404).json({ message: 'Bill cycle not found' });

    res.json({ message: 'QR code uploaded', imageUrl, cycle });
  } catch (err) {
    console.error('QR upload error:', err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

/**
 * POST /api/upload/receipt/:tenantBillId
 * Tenant uploads payment receipt (authenticated)
 */
router.post('/receipt/:tenantBillId', protect, uploadReceipt.single('receipt'), async (req, res) => {
  try {
    const bill = await TenantBill.findById(req.params.tenantBillId);
    if (!bill) return res.status(404).json({ message: 'Tenant bill not found' });

    // Only the tenant who owns the bill or admin can upload
    if (
      req.user.role !== 'admin' &&
      bill.tenantId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    bill.receiptImage = req.file.path;
    bill.receiptUploadedAt = new Date();
    await bill.save();

    res.json({
      message: 'Receipt uploaded successfully',
      receiptImage: bill.receiptImage,
      receiptUploadedAt: bill.receiptUploadedAt,
    });
  } catch (err) {
    console.error('Receipt upload error:', err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

/**
 * POST /api/upload/receipt-public/:token
 * Public receipt upload via payment link token (no auth required)
 */
router.post('/receipt-public/:token', uploadReceipt.single('receipt'), async (req, res) => {
  try {
    const bill = await TenantBill.findOne({ paymentLinkToken: req.params.token });
    if (!bill) return res.status(404).json({ message: 'Invalid payment link' });

    // Check expiry
    if (bill.paymentLinkExpiry && bill.paymentLinkExpiry < new Date()) {
      return res.status(410).json({ message: 'This payment link has expired' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    bill.receiptImage = req.file.path;
    bill.receiptUploadedAt = new Date();
    await bill.save();

    res.json({
      message: 'Receipt uploaded successfully',
      receiptImage: bill.receiptImage,
    });
  } catch (err) {
    console.error('Public receipt upload error:', err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

module.exports = router;
