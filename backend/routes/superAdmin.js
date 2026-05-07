const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Bedspace = require('../models/Bedspace');
const BillCycle = require('../models/BillCycle');
const TenantBill = require('../models/TenantBill');
const { protect, superAdminOnly } = require('../middleware/authMiddleware');
const { DEFAULT_MINI_ADMIN_PERMISSIONS, mergePermissionMap } = require('../utils/roles');
const { buildBedspaceCollectionsSummary } = require('../utils/buildBedspaceCollectionsSummary');

router.use(protect, superAdminOnly);

/**
 * GET /api/super/calendar-data
 * Bill cycles + tenants across every bedspace this landlord owns (for merged “general” calendar).
 */
router.get('/calendar-data', async (req, res) => {
  try {
    const bedspaces = await Bedspace.find({ ownerId: req.user._id }).sort({ name: 1 }).lean();
    const ids = bedspaces.map((b) => b._id);
    if (ids.length === 0) {
      return res.json({ bedspaces: [], billCycles: [], tenants: [] });
    }

    const [billCycles, tenants] = await Promise.all([
      BillCycle.find({ bedspaceId: { $in: ids } })
        .sort({ year: -1, month: -1 })
        .limit(200)
        .lean(),
      User.find({ role: 'tenant', bedspaceId: { $in: ids } })
        .sort({ nickname: 1 })
        .lean(),
    ]);

    res.json({
      bedspaces: bedspaces.map((b) => ({
        _id: b._id,
        name: b.name,
        locationName: b.locationName || '',
      })),
      billCycles,
      tenants,
    });
  } catch (err) {
    console.error('Super calendar data error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/super/dashboard-overview
 * Per-bedspace collection series + merged-by-calendar-month series for multi-property charts.
 */
router.get('/dashboard-overview', async (req, res) => {
  try {
    const bedspaces = await Bedspace.find({ ownerId: req.user._id }).sort({ name: 1 }).lean();
    if (bedspaces.length === 0) {
      return res.json({
        bedspaces: [],
        perBedspace: [],
        mergedSeries: [],
        mergedTotals: {
          sumBilled: 0,
          sumCollected: 0,
          collectionRate: null,
          propertiesCount: 0,
          totalActiveTenants: 0,
        },
      });
    }

    const perBedspace = [];
    const mergeMap = new Map();

    for (const b of bedspaces) {
      const { collectionsByMonth, activeTenants } = await buildBedspaceCollectionsSummary(b._id, {
        cycleLimit: 12,
      });

      const seriesChrono = collectionsByMonth
        .slice()
        .reverse()
        .map((row) => ({
          cycleId: String(row.cycle._id),
          month: row.cycle.month,
          year: row.cycle.year,
          totalBilled: row.totalBilled,
          totalCollected: row.totalCollected,
        }));

      let sumB = 0;
      let sumC = 0;
      for (const row of collectionsByMonth) {
        sumB += row.totalBilled;
        sumC += row.totalCollected;
        const k = `${row.cycle.year}-${row.cycle.month}`;
        const cur = mergeMap.get(k) || { totalBilled: 0, totalCollected: 0 };
        cur.totalBilled += row.totalBilled;
        cur.totalCollected += row.totalCollected;
        mergeMap.set(k, cur);
      }

      const displayLabel = b.locationName ? `${b.locationName} (${b.name})` : b.name;

      perBedspace.push({
        bedspaceId: String(b._id),
        name: b.name,
        locationName: b.locationName || '',
        displayLabel,
        activeTenants,
        series: seriesChrono,
        totals: {
          sumBilled: sumB,
          sumCollected: sumC,
          cycleCount: collectionsByMonth.length,
          collectionRate: sumB > 0 ? Math.round((sumC / sumB) * 1000) / 10 : null,
        },
      });
    }

    const mergedSeries = Array.from(mergeMap.entries())
      .map(([key, v]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          year,
          month,
          totalBilled: v.totalBilled,
          totalCollected: v.totalCollected,
        };
      })
      .sort((a, b) => a.year - b.year || a.month - b.month);

    const mergedTotals = mergedSeries.reduce(
      (acc, p) => ({
        sumBilled: acc.sumBilled + p.totalBilled,
        sumCollected: acc.sumCollected + p.totalCollected,
      }),
      { sumBilled: 0, sumCollected: 0 }
    );

    const totalActiveTenants = perBedspace.reduce((s, x) => s + x.activeTenants, 0);

    res.json({
      bedspaces: bedspaces.map((x) => ({
        _id: x._id,
        name: x.name,
        locationName: x.locationName || '',
      })),
      perBedspace,
      mergedSeries,
      mergedTotals: {
        ...mergedTotals,
        propertiesCount: bedspaces.length,
        totalActiveTenants,
        collectionRate:
          mergedTotals.sumBilled > 0
            ? Math.round((mergedTotals.sumCollected / mergedTotals.sumBilled) * 1000) / 10
            : null,
      },
    });
  } catch (err) {
    console.error('Super dashboard overview error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/super/bedspaces
 * All bedspaces owned by this landlord.
 */
router.get('/bedspaces', async (req, res) => {
  try {
    const list = await Bedspace.find({ ownerId: req.user._id }).sort({ name: 1 });
    res.json(list);
  } catch (err) {
    console.error('List bedspaces error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/super/bedspaces
 * Body: { name }
 */
router.post('/bedspaces', async (req, res) => {
  try {
    const name = req.body.name && String(req.body.name).trim();
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const locationName =
      req.body.locationName != null ? String(req.body.locationName).trim() : '';
    const locationAddress =
      req.body.locationAddress != null ? String(req.body.locationAddress).trim() : '';

    const created = await Bedspace.create({
      name,
      ownerId: req.user._id,
      locationName,
      locationAddress,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('Create bedspace error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/super/bedspaces/:id
 * Body: { name }
 */
router.put('/bedspaces/:id', async (req, res) => {
  try {
    const bed = await Bedspace.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!bed) return res.status(404).json({ message: 'Bedspace not found' });

    if (req.body.name != null && String(req.body.name).trim()) {
      bed.name = String(req.body.name).trim();
    }
    if (req.body.locationName !== undefined) {
      bed.locationName = String(req.body.locationName || '').trim();
    }
    if (req.body.locationAddress !== undefined) {
      bed.locationAddress = String(req.body.locationAddress || '').trim();
    }
    if (req.body.pdfRulesText !== undefined) {
      bed.pdfRulesText = String(req.body.pdfRulesText || '').trim().slice(0, 6000);
    }
    await bed.save();
    res.json(bed);
  } catch (err) {
    console.error('Update bedspace error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/super/bedspaces/:id
 * Only if no bill cycles and no users reference it.
 */
router.delete('/bedspaces/:id', async (req, res) => {
  try {
    const bedId = req.params.id;
    const bed = await Bedspace.findOne({ _id: bedId, ownerId: req.user._id });
    if (!bed) return res.status(404).json({ message: 'Bedspace not found' });

    const [cycles, users] = await Promise.all([
      BillCycle.countDocuments({ bedspaceId: bed._id }),
      User.countDocuments({ bedspaceId: bed._id }),
    ]);

    if (cycles > 0 || users > 0) {
      return res.status(400).json({
        message:
          'Cannot delete this bedspace while it still has tenants, staff, or bill history. Move or remove them first.',
      });
    }

    await Bedspace.deleteOne({ _id: bed._id });
    res.json({ message: 'Bedspace deleted' });
  } catch (err) {
    console.error('Delete bedspace error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/super/bedspaces/:id/people
 * Tenants and mini admins for configuration UI.
 */
router.get('/bedspaces/:id/people', async (req, res) => {
  try {
    const bed = await Bedspace.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!bed) return res.status(404).json({ message: 'Bedspace not found' });

    const [tenants, miniAdmins] = await Promise.all([
      User.find({ role: 'tenant', bedspaceId: bed._id }).sort({ nickname: 1 }),
      User.find({ role: 'mini_admin', bedspaceId: bed._id }).sort({ nickname: 1 }),
    ]);

    res.json({
      bedspace: { _id: bed._id, name: bed.name },
      tenants,
      miniAdmins,
    });
  } catch (err) {
    console.error('List people error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/super/bedspaces/:id/mini-admins
 * Body: { nickname, password, miniAdminPermissions? }
 */
router.post('/bedspaces/:id/mini-admins', async (req, res) => {
  try {
    const bed = await Bedspace.findOne({ _id: req.params.id, ownerId: req.user._id });
    if (!bed) return res.status(404).json({ message: 'Bedspace not found' });

    const nickname = req.body.nickname && String(req.body.nickname).trim();
    const password = req.body.password && String(req.body.password);

    if (!nickname || !password || password.length < 8) {
      return res.status(400).json({
        message: 'Nickname and password (at least 8 characters) are required',
      });
    }

    const existing = await User.findOne({ nickname });
    if (existing) {
      return res.status(409).json({ message: 'Nickname already exists' });
    }

    const perms = mergePermissionMap(req.body.miniAdminPermissions, DEFAULT_MINI_ADMIN_PERMISSIONS);

    const passwordHash = await bcrypt.hash(password, 10);

    const mini = await User.create({
      nickname,
      role: 'mini_admin',
      bedspaceId: bed._id,
      passwordHash,
      adminLoginFailures: 0,
      isActive: true,
      roomType: 'non-aircon',
      miniAdminPermissions: perms,
    });

    const safe = mini.toObject();
    delete safe.passwordHash;
    res.status(201).json(safe);
  } catch (err) {
    console.error('Create mini admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/super/mini-admins/:userId
 * Body: { miniAdminPermissions?, isActive?, newPassword? }
 */
router.put('/mini-admins/:userId', async (req, res) => {
  try {
    const mini = await User.findOne({
      _id: req.params.userId,
      role: 'mini_admin',
    });

    if (!mini) {
      return res.status(404).json({ message: 'Mini admin not found' });
    }

    const bed = await Bedspace.findOne({ _id: mini.bedspaceId, ownerId: req.user._id });
    if (!bed) {
      return res.status(403).json({ message: 'You do not manage this bedspace' });
    }

    if (req.body.miniAdminPermissions !== undefined) {
      mini.miniAdminPermissions = mergePermissionMap(
        req.body.miniAdminPermissions,
        DEFAULT_MINI_ADMIN_PERMISSIONS
      );
    }

    if (req.body.isActive !== undefined) {
      mini.isActive = !!req.body.isActive;
    }

    if (req.body.newPassword) {
      const np = String(req.body.newPassword);
      if (np.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters' });
      }
      mini.passwordHash = await bcrypt.hash(np, 10);
      mini.adminLoginFailures = 0;
    }

    await mini.save();
    const safe = mini.toObject();
    delete safe.passwordHash;
    res.json(safe);
  } catch (err) {
    console.error('Update mini admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/super/tenants/:userId/portal
 * Body: { tenantPortalVisibility }
 */
router.put('/tenants/:userId/portal', async (req, res) => {
  try {
    const tenant = await User.findOne({ _id: req.params.userId, role: 'tenant' });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const bed = await Bedspace.findOne({ _id: tenant.bedspaceId, ownerId: req.user._id });
    if (!bed) {
      return res.status(403).json({ message: 'You do not manage this bedspace' });
    }

    const defaults = {
      showCurrentBill: true,
      showBillHistory: true,
      showPaymentUpload: true,
    };
    tenant.tenantPortalVisibility = mergePermissionMap(req.body.tenantPortalVisibility, defaults);
    await tenant.save();
    res.json(tenant);
  } catch (err) {
    console.error('Update tenant portal error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
