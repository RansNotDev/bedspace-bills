const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary');
const multer = require('multer');
const createCloudinaryStorage = require('multer-storage-cloudinary');
const TenantBill = require('../models/TenantBill');
const BillCycle = require('../models/BillCycle');
const {
  protect,
  staffOnly,
  requireBedspaceContext,
  requireMiniAdminPermission,
} = require('../middleware/authMiddleware');
const { isStaffRole } = require('../utils/roles');

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
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * POST /api/upload/qr/:cycleId/:type
 */
router.post(
  '/qr/:cycleId/:type',
  protect,
  staffOnly,
  requireBedspaceContext,
  requireMiniAdminPermission('uploadQR'),
  uploadQR.single('qr'),
  async (req, res) => {
    try {
      const { cycleId, type } = req.params;
      const validTypes = ['electricity', 'water', 'others'];

      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: 'Invalid QR type. Use: electricity, water, others' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const imageUrl = req.file.path;

      const cycle = await BillCycle.findOneAndUpdate(
        { _id: cycleId, bedspaceId: req.bedspaceContextId },
        { [`gcashQRImages.${type}`]: imageUrl },
        { new: true }
      );

      if (!cycle) return res.status(404).json({ message: 'Bill cycle not found' });

      res.json({ message: 'QR code uploaded', imageUrl, cycle });
    } catch (err) {
      console.error('QR upload error:', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

/**
 * POST /api/upload/receipt/:tenantBillId
 */
router.post('/receipt/:tenantBillId', protect, uploadReceipt.single('receipt'), async (req, res) => {
  try {
    const bill = await TenantBill.findById(req.params.tenantBillId).populate('billCycleId');
    if (!bill || !bill.billCycleId) {
      return res.status(404).json({ message: 'Tenant bill not found' });
    }

    const isOwner = bill.tenantId.toString() === req.user._id.toString();
    let staffAllowed = false;
    if (isStaffRole(req.user.role)) {
      if (req.bedspaceContextId && String(bill.billCycleId.bedspaceId) === String(req.bedspaceContextId)) {
        staffAllowed = true;
      }
    }

    if (!isOwner && !staffAllowed) {
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
 */
router.post('/receipt-public/:token', uploadReceipt.single('receipt'), async (req, res) => {
  try {
    const bill = await TenantBill.findOne({ paymentLinkToken: req.params.token });
    if (!bill) return res.status(404).json({ message: 'Invalid payment link' });

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
