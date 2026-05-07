const User = require('../models/User');
const BillCycle = require('../models/BillCycle');
const TenantBill = require('../models/TenantBill');

/**
 * Build collectionsByMonth blocks for one bedspace (same shape as admin dashboard-summary).
 * @param {import('mongoose').Types.ObjectId} bedspaceId
 * @param {{ cycleLimit?: number }} [options]
 */
async function buildBedspaceCollectionsSummary(bedspaceId, options = {}) {
  const cycleLimit = options.cycleLimit ?? 12;

  const activeTenants = await User.countDocuments({
    role: 'tenant',
    isActive: true,
    bedspaceId,
  });

  const cycles = await BillCycle.find({ bedspaceId })
    .sort({ year: -1, month: -1 })
    .limit(cycleLimit)
    .lean();

  const activeTenantDocs = await User.find({
    role: 'tenant',
    isActive: true,
    bedspaceId,
  })
    .select('nickname roomType')
    .lean();

  const collectionsByMonth = [];

  for (const cycle of cycles) {
    const bills = await TenantBill.find({ billCycleId: cycle._id }).populate(
      'tenantId',
      'nickname roomType email'
    );

    const isUnpaid = (b) => b.isPaid !== true;

    const paidCount = bills.filter((b) => b.isPaid === true).length;
    let unpaidCount = bills.filter(isUnpaid).length;
    const totalCollected = bills
      .filter((b) => b.isPaid === true)
      .reduce((s, b) => s + b.totalAmount, 0);
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

  return { collectionsByMonth, activeTenants, activeTenantDocs };
}

module.exports = { buildBedspaceCollectionsSummary };
