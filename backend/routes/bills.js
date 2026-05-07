const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const BillCycle = require('../models/BillCycle');
const TenantBill = require('../models/TenantBill');
const User = require('../models/User');
const {
  protect,
  staffOnly,
  requireBedspaceContext,
  requireMiniAdminPermission,
} = require('../middleware/authMiddleware');
const { calculateBills, calculateLinkExpiry } = require('../utils/billCalculator');
const { sendPaymentLinkEmail } = require('../utils/emailSender');

/**
 * POST /api/bills/generate
 */
router.post(
  '/generate',
  protect,
  staffOnly,
  requireBedspaceContext,
  requireMiniAdminPermission('generateBills'),
  async (req, res) => {
    try {
      const {
        month,
        year,
        electricityTotal,
        waterBill,
        drinkingWater: dwIn,
        trashBags: tbIn,
        deadline,
        gcashNumbers,
        gcashQRImages,
      } = req.body;

      const drinkingWater = dwIn != null && dwIn !== '' ? Number(dwIn) : 100;
      const trashBags = tbIn != null && tbIn !== '' ? Number(tbIn) : 100;

      if (!month || !year || electricityTotal == null || waterBill == null || !deadline) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const existing = await BillCycle.findOne({
        bedspaceId: req.bedspaceContextId,
        month,
        year,
      });
      if (existing) {
        return res.status(409).json({
          message: `Bill cycle for ${month}/${year} already exists`,
          cycleId: existing._id,
        });
      }

      const cycle = await BillCycle.create({
        bedspaceId: req.bedspaceContextId,
        month,
        year,
        electricityTotal,
        waterBill,
        drinkingWater,
        trashBags,
        deadline: new Date(deadline),
        gcashNumbers: gcashNumbers || {},
        gcashQRImages: gcashQRImages || {},
      });

      const tenants = await User.find({
        role: 'tenant',
        isActive: true,
        bedspaceId: req.bedspaceContextId,
      });

      if (tenants.length === 0) {
        return res.status(201).json({
          cycle,
          tenantBills: [],
          message: 'Bill cycle created but no active tenants found',
        });
      }

      const shares = calculateBills(tenants, cycle);

      const tenantBillDocs = shares.map((share) => {
        const tenant = tenants.find((t) => t._id.toString() === share.tenantId.toString());
        const expiry = calculateLinkExpiry(tenant?.moveInDate);

        return {
          billCycleId: cycle._id,
          tenantId: share.tenantId,
          electricityShare: share.electricityShare,
          waterShare: share.waterShare,
          drinkingWaterShare: share.drinkingWaterShare,
          trashBagShare: share.trashBagShare,
          utilitiesSubtotal: share.utilitiesSubtotal,
          rentAmount: share.rentAmount,
          discountPercent: share.discountPercent,
          discountAmount: share.discountAmount,
          totalAmount: share.totalAmount,
          paymentLinkToken: uuidv4(),
          paymentLinkExpiry: expiry,
        };
      });

      await TenantBill.insertMany(tenantBillDocs);

      const populated = await TenantBill.find({ billCycleId: cycle._id })
        .populate('tenantId', 'nickname roomType email moveInDate');

      res.status(201).json({ cycle, tenantBills: populated });
    } catch (err) {
      console.error('Generate bill error:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * POST /api/bills/send-link/:tenantBillId
 */
router.post(
  '/send-link/:tenantBillId',
  protect,
  staffOnly,
  requireBedspaceContext,
  requireMiniAdminPermission('sendPaymentLinks'),
  async (req, res) => {
    try {
      const bill = await TenantBill.findById(req.params.tenantBillId)
        .populate('tenantId', 'nickname email moveInDate')
        .populate('billCycleId');

      if (!bill || !bill.billCycleId) {
        return res.status(404).json({ message: 'Tenant bill not found' });
      }

      if (String(bill.billCycleId.bedspaceId) !== String(req.bedspaceContextId)) {
        return res.status(404).json({ message: 'Tenant bill not found' });
      }

      if (!bill.paymentLinkToken || (bill.paymentLinkExpiry && bill.paymentLinkExpiry < new Date())) {
        bill.paymentLinkToken = uuidv4();
        bill.paymentLinkExpiry = calculateLinkExpiry(bill.tenantId?.moveInDate);
      }

      bill.paymentLinkSentAt = new Date();
      await bill.save();

      const paymentLinkUrl = `${process.env.FRONTEND_URL}/pay/${bill.paymentLinkToken}`;
      const cycle = bill.billCycleId;
      const monthLabel = new Date(cycle.year, cycle.month - 1).toLocaleString('en-PH', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Manila',
      });

      const tenant = bill.tenantId;

      if (tenant.email) {
        await sendPaymentLinkEmail({
          toEmail: tenant.email,
          nickname: tenant.nickname,
          monthLabel,
          bill,
          billCycle: cycle,
          paymentLinkUrl,
        });

        return res.json({
          message: `Payment link sent to ${tenant.email}`,
          paymentLinkUrl,
          sentViaEmail: true,
        });
      }

      return res.json({
        message: 'No email on file. Share this link manually.',
        paymentLinkUrl,
        sentViaEmail: false,
      });
    } catch (err) {
      console.error('Send link error:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * GET /api/bills/my-bills
 */
router.get('/my-bills', protect, async (req, res) => {
  try {
    if (req.user.role !== 'tenant') {
      return res.status(403).json({ message: 'Tenants only' });
    }

    const bills = await TenantBill.find({ tenantId: req.user._id })
      .populate({
        path: 'billCycleId',
        match: { bedspaceId: req.user.bedspaceId },
      })
      .sort({ createdAt: -1 });

    const filtered = bills.filter((b) => b.billCycleId);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/bills/my-bills/current
 */
router.get('/my-bills/current', protect, async (req, res) => {
  try {
    if (req.user.role !== 'tenant') {
      return res.status(403).json({ message: 'Tenants only' });
    }

    if (!req.user.bedspaceId) {
      return res.status(400).json({ message: 'Tenant has no bedspace assigned' });
    }

    const cycle = await BillCycle.findOne({ bedspaceId: req.user.bedspaceId })
      .sort({ year: -1, month: -1 });

    if (!cycle) {
      return res.status(404).json({ message: 'No bill cycles yet' });
    }

    const bill = await TenantBill.findOne({
      billCycleId: cycle._id,
      tenantId: req.user._id,
    }).populate('billCycleId');

    if (!bill) {
      return res.status(404).json({ message: 'No bill found for the latest cycle' });
    }

    res.json(bill);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
