const express = require('express');
const router = express.Router();
const User = require('../models/User');
const BillCycle = require('../models/BillCycle');
const TenantBill = require('../models/TenantBill');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ─── TENANT MANAGEMENT ───────────────────────────────────────────────────────

/**
 * GET /api/admin/tenants
 * List all tenants (active and inactive)
 */
router.get('/tenants', async (req, res) => {
  try {
    const tenants = await User.find({ role: 'tenant' }).sort({ createdAt: -1 });
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/admin/tenants
 * Create a new tenant
 */
router.post('/tenants', async (req, res) => {
  try {
    const { nickname, roomType, moveInDate, email } = req.body;

    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ message: 'Nickname is required' });
    }

    const existing = await User.findOne({ nickname: nickname.trim() });
    if (existing) {
      return res.status(409).json({ message: 'Nickname already exists' });
    }

    const tenant = await User.create({
      nickname: nickname.trim(),
      role: 'tenant',
      roomType: roomType || 'non-aircon',
      moveInDate: moveInDate || null,
      email: email || null,
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
 * Update tenant info
 */
router.put('/tenants/:id', async (req, res) => {
  try {
    const { nickname, roomType, moveInDate, email, isActive } = req.body;

    // Check nickname uniqueness if changing
    if (nickname) {
      const existing = await User.findOne({
        nickname: nickname.trim(),
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(409).json({ message: 'Nickname already taken' });
      }
    }

    const tenant = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(nickname && { nickname: nickname.trim() }),
        ...(roomType && { roomType }),
        ...(moveInDate !== undefined && { moveInDate }),
        ...(email !== undefined && { email }),
        ...(isActive !== undefined && { isActive }),
      },
      { new: true, runValidators: true }
    );

    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    res.json(tenant);
  } catch (err) {
    console.error('Update tenant error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/admin/tenants/:id
 * Soft-delete (deactivate) a tenant
 */
router.delete('/tenants/:id', async (req, res) => {
  try {
    const tenant = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    res.json({ message: 'Tenant deactivated', tenant });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── BILL CYCLE MANAGEMENT ───────────────────────────────────────────────────

/**
 * GET /api/admin/bill-cycles
 * List all bill cycles (last 18 months)
 */
router.get('/bill-cycles', async (req, res) => {
  try {
    const cycles = await BillCycle.find()
      .sort({ year: -1, month: -1 })
      .limit(18);
    res.json(cycles);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/admin/bill-cycles/:id
 * Get a single bill cycle with all tenant bills
 */
router.get('/bill-cycles/:id', async (req, res) => {
  try {
    const cycle = await BillCycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ message: 'Bill cycle not found' });

    const tenantBills = await TenantBill.find({ billCycleId: cycle._id })
      .populate('tenantId', 'nickname roomType email moveInDate');

    res.json({ cycle, tenantBills });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/admin/bill-cycles/:id
 * Update bill cycle (GCash numbers, QR images, deadline, status)
 */
router.put('/bill-cycles/:id', async (req, res) => {
  try {
    const updates = req.body;
    const cycle = await BillCycle.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!cycle) return res.status(404).json({ message: 'Bill cycle not found' });
    res.json(cycle);
  } catch (err) {
    console.error('Update bill cycle error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/admin/tenant-bills/:id/mark-paid
 * Admin manually marks a tenant bill as paid
 */
router.patch('/tenant-bills/:id/mark-paid', async (req, res) => {
  try {
    const { isPaid } = req.body;
    const bill = await TenantBill.findByIdAndUpdate(
      req.params.id,
      { isPaid: isPaid !== undefined ? isPaid : true },
      { new: true }
    ).populate('tenantId', 'nickname roomType');

    if (!bill) return res.status(404).json({ message: 'Tenant bill not found' });
    res.json(bill);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/admin/dashboard-summary
 * activeTenants: global count
 * collectionsByMonth: each bill cycle (newest first), with per-cycle totals and each tenant bill row (not one grand total)
 */
router.get('/dashboard-summary', async (req, res) => {
  try {
    const activeTenants = await User.countDocuments({ role: 'tenant', isActive: true });
    const cycles = await BillCycle.find().sort({ year: -1, month: -1 }).limit(12).lean();
    const activeTenantDocs = await User.find({ role: 'tenant', isActive: true })
      .select('nickname roomType')
      .lean();

    const collectionsByMonth = [];

    for (const cycle of cycles) {
      const bills = await TenantBill.find({ billCycleId: cycle._id }).populate(
        'tenantId',
        'nickname roomType email'
      );

      const isUnpaid = (b) => b.isPaid !== true;

      let paidCount = bills.filter((b) => b.isPaid === true).length;
      let unpaidCount = bills.filter(isUnpaid).length;
      const totalCollected = bills.filter((b) => b.isPaid === true).reduce((s, b) => s + b.totalAmount, 0);
      const totalBilled = bills.reduce((s, b) => s + b.totalAmount, 0);

      const billedTenantIds = new Set(
        bills.map((b) => (b.tenantId && b.tenantId._id ? String(b.tenantId._id) : null)).filter(Boolean)
      );

      const billRows = bills.map((b) => ({
        tenantBillId: b._id,
        nickname: b.tenantId?.nickname || 'Unknown',
        roomType: b.tenantId?.roomType,
        totalAmount: b.totalAmount,
        isPaid: b.isPaid === true,
        notInCycle: false,
      }));
      // Unpaid bills first, then paid
      billRows.sort((a, b) => {
        if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
        return (a.nickname || '').localeCompare(b.nickname || '');
      });

      for (const t of activeTenantDocs) {
        if (!billedTenantIds.has(String(t._id))) {
          unpaidCount += 1;
          billRows.unshift({
            tenantBillId: null,
            tenantUserId: t._id,
            nickname: t.nickname,
            roomType: t.roomType,
            totalAmount: 0,
            isPaid: false,
            notInCycle: true,
          });
        }
      }

      collectionsByMonth.push({
        cycle,
        paidCount,
        unpaidCount,
        totalCollected,
        totalBilled,
        billRows,
      });
    }

    res.json({
      activeTenants,
      collectionsByMonth,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
