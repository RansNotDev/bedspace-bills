const express = require('express');
const router = express.Router();
const TenantBill = require('../models/TenantBill');

/**
 * GET /api/payment/:token
 * Public route — view bill details via payment link token
 * No authentication required
 */
router.get('/:token', async (req, res) => {
  try {
    const bill = await TenantBill.findOne({ paymentLinkToken: req.params.token })
      .populate('tenantId', 'nickname roomType moveInDate')
      .populate('billCycleId');

    if (!bill) {
      return res.status(404).json({ message: 'Payment link not found' });
    }

    // Check expiry
    if (bill.paymentLinkExpiry && bill.paymentLinkExpiry < new Date()) {
      return res.status(410).json({
        message: 'This payment link has expired',
        expired: true,
      });
    }

    const cycle = bill.billCycleId;

    res.json({
      tenant: {
        nickname: bill.tenantId.nickname,
        roomType: bill.tenantId.roomType,
      },
      bill: {
        _id: bill._id,
        electricityShare: bill.electricityShare,
        waterShare: bill.waterShare,
        drinkingWaterShare: bill.drinkingWaterShare,
        trashBagShare: bill.trashBagShare,
        totalAmount: bill.totalAmount,
        isPaid: bill.isPaid,
        receiptImage: bill.receiptImage,
        receiptUploadedAt: bill.receiptUploadedAt,
        paymentLinkExpiry: bill.paymentLinkExpiry,
      },
      cycle: {
        month: cycle.month,
        year: cycle.year,
        deadline: cycle.deadline,
        gcashNumbers: cycle.gcashNumbers,
        gcashQRImages: cycle.gcashQRImages,
        status: cycle.status,
      },
    });
  } catch (err) {
    console.error('Payment link error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
