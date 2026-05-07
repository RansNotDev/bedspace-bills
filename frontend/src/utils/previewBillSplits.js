/**
 * Preview-only: matches backend billCalculator.js splits for active tenants.
 * drinksTrashCombined is one pool (equal split); backend still stores drinkingWater + trashBags separately when you create a cycle.
 */
export function roundTo2(num) {
  return Math.round(Number(num) * 100) / 100;
}

/**
 * @param {Array<{ _id: string, roomType?: string, monthlyRent?: number, isActive?: boolean, nickname?: string }>} tenants
 * @param {{ electricityTotal: number, waterBill: number, drinksTrashCombined: number }} totals
 * @returns {Array<{
 *   tenantId: string,
 *   nickname: string,
 *   roomType: string,
 *   electricityShare: number,
 *   waterShare: number,
 *   drinksTrashShare: number,
 *   utilitiesSubtotal: number,
 *   rentAmount: number,
 *   totalAmount: number,
 * }>}
 */
export function previewBillSplits(tenants, totals) {
  const activeTenants = (tenants || []).filter((t) => t.isActive !== false);
  const n = activeTenants.length;
  if (n === 0) return [];

  const electricityTotal = Math.max(0, Number(totals.electricityTotal) || 0);
  const waterBill = Math.max(0, Number(totals.waterBill) || 0);
  const drinksTrashCombined = Math.max(0, Number(totals.drinksTrashCombined) || 0);

  const airconCount = activeTenants.filter((t) => t.roomType === 'aircon').length;
  const nonAirconCount = n - airconCount;
  const unitSum = airconCount * 1.0 + nonAirconCount * 0.5;
  const perUnitCost = unitSum > 0 ? electricityTotal / unitSum : 0;
  const airconElecShare = roundTo2(perUnitCost * 1.0);
  const nonAirconElecShare = roundTo2(perUnitCost * 0.5);

  const waterShare = roundTo2(waterBill / n);
  const drinksTrashShare = roundTo2(drinksTrashCombined / n);

  return activeTenants.map((tenant) => {
    const electricityShare = tenant.roomType === 'aircon' ? airconElecShare : nonAirconElecShare;
    const utilitiesSubtotal = roundTo2(electricityShare + waterShare + drinksTrashShare);
    const rentAmount = roundTo2(Math.max(0, Number(tenant.monthlyRent) || 0));
    const totalAmount = roundTo2(utilitiesSubtotal + rentAmount);

    return {
      tenantId: tenant._id,
      nickname: tenant.nickname || '—',
      roomType: tenant.roomType || 'non-aircon',
      electricityShare,
      waterShare,
      drinksTrashShare,
      utilitiesSubtotal,
      rentAmount,
      totalAmount,
    };
  });
}
