const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const BillCycle = require('../models/BillCycle');
const TenantBill = require('../models/TenantBill');
const {
  protect,
  staffOnly,
  requireBedspaceContext,
  requireMiniAdminPermission,
} = require('../middleware/authMiddleware');
const { isSuperAdminRole } = require('../utils/roles');
const { computeTenantBillTotals } = require('../utils/tenantBillMath');
const Bedspace = require('../models/Bedspace');
const { buildBedspaceCollectionsSummary } = require('../utils/buildBedspaceCollectionsSummary');

router.use(protect, staffOnly, requireBedspaceContext);

/**
 * GET /api/admin/tenants
 */
router.get('/tenants', requireMiniAdminPermission('manageTenants'), async (req, res) => {
  try {
    const tenants = await User.find({ role: 'tenant', bedspaceId: req.bedspaceContextId }).sort({
      createdAt: -1,
    });
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/admin/tenants
 */
router.post('/tenants', requireMiniAdminPermission('manageTenants'), async (req, res) => {
  try {
    const { nickname, roomType, moveInDate, email, monthlyRent } = req.body;

    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ message: 'Nickname is required' });
    }

    let targetBedspaceId = req.bedspaceContextId;
    if (isSuperAdminRole(req.user.role) && req.body.bedspaceId) {
      const raw = String(req.body.bedspaceId).trim();
      if (!mongoose.isValidObjectId(raw)) {
        return res.status(400).json({ message: 'Invalid property' });
      }
      const owned = await Bedspace.findOne({ _id: raw, ownerId: req.user._id }).lean();
      if (!owned) {
        return res.status(403).json({ message: 'You can only assign tenants to your own properties' });
      }
      targetBedspaceId = new mongoose.Types.ObjectId(raw);
    }

    const existing = await User.findOne({ nickname: nickname.trim() });
    if (existing) {
      return res.status(409).json({ message: 'Nickname already exists' });
    }

    let rent = 0;
    if (monthlyRent != null && monthlyRent !== '') {
      rent = Math.max(0, Number(monthlyRent));
      if (Number.isNaN(rent)) rent = 0;
    }

    const tenant = await User.create({
      nickname: nickname.trim(),
      role: 'tenant',
      bedspaceId: targetBedspaceId,
      roomType: roomType || 'non-aircon',
      moveInDate: moveInDate || null,
      email: email || null,
      monthlyRent: rent,
      isActive: true,
    });

    res.status(201).json(tenant);
  } catch (err) {
    console.error('Create tenant error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/admin/tenants/:id
 */
router.put('/tenants/:id', requireMiniAdminPermission('manageTenants'), async (req, res) => {
  try {
    const { nickname, roomType, moveInDate, email, isActive, monthlyRent } = req.body;

    const current = await User.findOne({
      _id: req.params.id,
      role: 'tenant',
      bedspaceId: req.bedspaceContextId,
    });
    if (!current) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    if (nickname) {
      const taken = await User.findOne({
        nickname: nickname.trim(),
        _id: { $ne: req.params.id },
      });
      if (taken) {
        return res.status(409).json({ message: 'Nickname already taken' });
      }
    }

    const updates = {
      ...(nickname && { nickname: nickname.trim() }),
      ...(roomType && { roomType }),
      ...(moveInDate !== undefined && { moveInDate }),
      ...(email !== undefined && { email }),
      ...(isActive !== undefined && { isActive }),
    };

    if (monthlyRent !== undefined) {
      let rent = Math.max(0, Number(monthlyRent));
      if (Number.isNaN(rent)) rent = 0;
      updates.monthlyRent = rent;
    }

    const tenant = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json(tenant);
  } catch (err) {
    console.error('Update tenant error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/admin/tenants/:id
 */
router.delete('/tenants/:id', requireMiniAdminPermission('manageTenants'), async (req, res) => {
  try {
    const tenant = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'tenant', bedspaceId: req.bedspaceContextId },
      { isActive: false },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    res.json({ message: 'Tenant deactivated', tenant });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/admin/bill-cycles
 */
router.get('/bill-cycles', requireMiniAdminPermission('manageBillCycles'), async (req, res) => {
  try {
    const cycles = await BillCycle.find({ bedspaceId: req.bedspaceContextId })
      .sort({ year: -1, month: -1 })
      .limit(18);
    res.json(cycles);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/admin/bill-cycles/:id
 */
router.get('/bill-cycles/:id', requireMiniAdminPermission('manageBillCycles'), async (req, res) => {
  try {
    const cycle = await BillCycle.findOne({
      _id: req.params.id,
      bedspaceId: req.bedspaceContextId,
    }).populate('bedspaceId', 'name locationName locationAddress pdfRulesText');
    if (!cycle) return res.status(404).json({ message: 'Bill cycle not found' });

    const tenantBills = await TenantBill.find({ billCycleId: cycle._id })
      .populate('tenantId', 'nickname roomType email moveInDate monthlyRent');

    res.json({ cycle, tenantBills });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/admin/bill-cycles/:id
 */
router.put('/bill-cycles/:id', requireMiniAdminPermission('manageBillCycles'), async (req, res) => {
  try {
    const cycle = await BillCycle.findOneAndUpdate(
      { _id: req.params.id, bedspaceId: req.bedspaceContextId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!cycle) return res.status(404).json({ message: 'Bill cycle not found' });
    res.json(cycle);
  } catch (err) {
    console.error('Update bill cycle error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/admin/tenant-bills/:id/mark-paid
 */
router.patch(
  '/tenant-bills/:id/mark-paid',
  requireMiniAdminPermission('markPaid'),
  async (req, res) => {
    try {
      const bill = await TenantBill.findById(req.params.id).populate('billCycleId');
      if (!bill || !bill.billCycleId) {
        return res.status(404).json({ message: 'Tenant bill not found' });
      }
      if (String(bill.billCycleId.bedspaceId) !== String(req.bedspaceContextId)) {
        return res.status(404).json({ message: 'Tenant bill not found' });
      }

      const { isPaid } = req.body;
      bill.isPaid = isPaid !== undefined ? isPaid : true;
      await bill.save();

      const populated = await TenantBill.findById(bill._id).populate(
        'tenantId',
        'nickname roomType'
      );
      res.json(populated);
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * PATCH /api/admin/tenant-bills/:id/adjustments
 * Body: { discountPercent?, rentAmount? } — discount applies to utilities + rent
 */
router.patch(
  '/tenant-bills/:id/adjustments',
  requireMiniAdminPermission('manageBillCycles'),
  async (req, res) => {
    try {
      const { discountPercent, rentAmount } = req.body;
      const bill = await TenantBill.findById(req.params.id).populate('billCycleId');
      if (!bill || !bill.billCycleId) {
        return res.status(404).json({ message: 'Tenant bill not found' });
      }
      if (String(bill.billCycleId.bedspaceId) !== String(req.bedspaceContextId)) {
        return res.status(404).json({ message: 'Tenant bill not found' });
      }

      const overrides = {};
      if (discountPercent !== undefined) overrides.discountPercent = discountPercent;
      if (rentAmount !== undefined) overrides.rentAmount = rentAmount;

      const next = computeTenantBillTotals(bill, overrides);
      bill.utilitiesSubtotal = next.utilitiesSubtotal;
      bill.rentAmount = next.rentAmount;
      bill.discountPercent = next.discountPercent;
      bill.discountAmount = next.discountAmount;
      bill.totalAmount = next.totalAmount;
      await bill.save();

      const populated = await TenantBill.findById(bill._id).populate(
        'tenantId',
        'nickname roomType email moveInDate monthlyRent'
      );
      res.json(populated);
    } catch (err) {
      console.error('Adjust tenant bill error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * GET /api/admin/dashboard-summary
 */
router.get('/dashboard-summary', async (req, res) => {
  try {
    const { collectionsByMonth, activeTenants, activeTenantDocs } =
      await buildBedspaceCollectionsSummary(req.bedspaceContextId, { cycleLimit: 12 });
    let totalBilled12m = 0;
    let totalCollected12m = 0;
    let outstanding12m = 0;

    for (const block of collectionsByMonth) {
      totalBilled12m += block.totalBilled;
      totalCollected12m += block.totalCollected;
      for (const row of block.billRows) {
        if (!row.isPaid && Number(row.totalAmount) > 0) {
          outstanding12m += Number(row.totalAmount);
        }
      }
    }

    const collectionRate12m =
      totalBilled12m > 0
        ? Math.round((totalCollected12m / totalBilled12m) * 1000) / 10
        : null;

    const airconRooms = activeTenantDocs.filter((t) => t.roomType === 'aircon').length;
    const nonAirconRooms = activeTenantDocs.filter((t) => t.roomType !== 'aircon').length;

    const phNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const currentCalendarMonth = phNow.getMonth() + 1;
    const currentCalendarYear = phNow.getFullYear();
    const hasCycleForCurrentCalendarMonth = collectionsByMonth.some(
      (b) => b.cycle.month === currentCalendarMonth && b.cycle.year === currentCalendarYear
    );

    const recentTrend = collectionsByMonth
      .slice(0, 6)
      .map((b) => ({
        cycleId: String(b.cycle._id),
        month: b.cycle.month,
        year: b.cycle.year,
        totalCollected: b.totalCollected,
        totalBilled: b.totalBilled,
      }))
      .reverse();

    const overviewStats = {
      totalBilled12m,
      totalCollected12m,
      outstanding12m,
      collectionRate12m,
      cycleCount12m: collectionsByMonth.length,
      airconRooms,
      nonAirconRooms,
      hasCycleForCurrentCalendarMonth,
      currentCalendarMonth,
      currentCalendarYear,
    };

    const bedspaceDoc = await Bedspace.findById(req.bedspaceContextId).lean();

    /** Prefer pdfRulesText; legacy DB may still have old billingRules.notes from earlier builds. */
    let pdfRulesText = '';
    if (bedspaceDoc) {
      pdfRulesText = String(bedspaceDoc.pdfRulesText || '').trim();
      if (!pdfRulesText && bedspaceDoc.billingRules && typeof bedspaceDoc.billingRules === 'object') {
        pdfRulesText = String(bedspaceDoc.billingRules.notes || '').trim();
      }
    }

    res.json({
      activeTenants,
      collectionsByMonth,
      overviewStats,
      recentTrend,
      bedspace: bedspaceDoc
        ? {
            _id: bedspaceDoc._id,
            name: bedspaceDoc.name,
            locationName: bedspaceDoc.locationName || '',
            pdfRulesText,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
