const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const BillCycle = require('../models/BillCycle');
const TenantBill = require('../models/TenantBill');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { calculateBills, calculateLinkExpiry } = require('../utils/billCalculator');
const { sendPaymentLinkEmail } = require('../utils/emailSender');

// ─── GENERATE BILL CYCLE (Admin only) ────────────────────────────────────────

/**
 * POST /api/bills/generate
 * Generate a new monthly bill cycle and calculate each tenant's share
 */
router.post('/generate', protect, adminOnly, async (req, res) => {
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

    const drinkingWater =
      dwIn != null && dwIn !== '' ? Number(dwIn) : 100;
    const trashBags =
      tbIn != null && tbIn !== '' ? Number(tbIn) : 100;

    if (!month || !year || electricityTotal == null || waterBill == null || !deadline) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if cycle already exists
    const existing = await BillCycle.findOne({ month, year });
    if (existing) {
      return res.status(409).json({
        message: `Bill cycle for ${month}/${year} already exists`,
        cycleId: existing._id,
      });
    }

    const cycle = await BillCycle.create({
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

    // Get all active tenants
    const tenants = await User.find({ role: 'tenant', isActive: true });

    if (tenants.length === 0) {
      return res.status(201).json({
        cycle,
        tenantBills: [],
        message: 'Bill cycle created but no active tenants found',
      });
    }

    // Calculate shares
    const shares = calculateBills(tenants, cycle);

    // Create TenantBill documents
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
        totalAmount: share.totalAmount,
        paymentLinkToken: uuidv4(),
        paymentLinkExpiry: expiry,
      };
    });

    const tenantBills = await TenantBill.insertMany(tenantBillDocs);

    // Populate tenant info for response
    const populated = await TenantBill.find({ billCycleId: cycle._id })
      .populate('tenantId', 'nickname roomType email moveInDate');

    res.status(201).json({ cycle, tenantBills: populated });
  } catch (err) {
    console.error('Generate bill error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── SEND PAYMENT LINK ────────────────────────────────────────────────────────

/**
 * POST /api/bills/send-link/:tenantBillId
 * Send payment link to a tenant (email or return shareable URL)
 */
router.post('/send-link/:tenantBillId', protect, adminOnly, async (req, res) => {
  try {
    const bill = await TenantBill.findById(req.params.tenantBillId)
      .populate('tenantId', 'nickname email moveInDate')
      .populate('billCycleId');

    if (!bill) return res.status(404).json({ message: 'Tenant bill not found' });

    // Regenerate token if expired or missing
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
      // Send email
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
    } else {
      // Return shareable URL for manual sharing
      return res.json({
        message: 'No email on file. Share this link manually.',
        paymentLinkUrl,
        sentViaEmail: false,
      });
    }
  } catch (err) {
    console.error('Send link error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── TENANT: VIEW OWN BILLS ───────────────────────────────────────────────────

/**
 * GET /api/bills/my-bills
 * Tenant views their own bill history
 */
router.get('/my-bills', protect, async (req, res) => {
  try {
    const bills = await TenantBill.find({ tenantId: req.user._id })
      .populate('billCycleId')
      .sort({ createdAt: -1 });

    res.json(bills);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/bills/my-bills/current
 * Tenant views current month's bill
 */
router.get('/my-bills/current', protect, async (req, res) => {
  try {
    const cycle = await BillCycle.findOne().sort({ year: -1, month: -1 });
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
