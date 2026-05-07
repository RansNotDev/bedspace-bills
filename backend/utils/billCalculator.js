/**
 * Bill Calculator Utility
 * Handles electricity splitting (aircon vs non-aircon) and equal splits
 */

/**
 * Calculate each tenant's bill shares for a given bill cycle (utilities + monthly rent; discount starts at 0).
 * @param {Array} tenants - Array of active User documents
 * @param {Object} billCycle - BillCycle document
 * @returns {Array} share rows including utilitiesSubtotal, rentAmount, discount fields, totalAmount
 */
function calculateBills(tenants, billCycle) {
  const activeTenants = tenants.filter((t) => t.isActive);
  const totalTenants = activeTenants.length;

  if (totalTenants === 0) return [];

  const { electricityTotal, waterBill, drinkingWater, trashBags } = billCycle;

  // --- Electricity split (weighted): aircon = 1 unit, non-aircon = 0.5 unit ---
  const airconTenants = activeTenants.filter((t) => t.roomType === 'aircon');
  const nonAirconTenants = activeTenants.filter((t) => t.roomType === 'non-aircon');

  const airconCount = airconTenants.length;
  const nonAirconCount = nonAirconTenants.length;

  const totalUnits = airconCount * 1.0 + nonAirconCount * 0.5;
  const perUnitCost = totalUnits > 0 ? electricityTotal / totalUnits : 0;

  const airconElecShare = roundTo2(perUnitCost * 1.0);
  const nonAirconElecShare = roundTo2(perUnitCost * 0.5);

  // --- Equal splits ---
  const waterShare = roundTo2(waterBill / totalTenants);
  const drinkingWaterShare = roundTo2(drinkingWater / totalTenants);
  const trashBagShare = roundTo2(trashBags / totalTenants);

  return activeTenants.map((tenant) => {
    const electricityShare =
      tenant.roomType === 'aircon' ? airconElecShare : nonAirconElecShare;

    const utilitiesSubtotal = roundTo2(
      electricityShare + waterShare + drinkingWaterShare + trashBagShare
    );
    const rentAmount = roundTo2(Math.max(0, Number(tenant.monthlyRent) || 0));
    const subtotalBeforeDiscount = roundTo2(utilitiesSubtotal + rentAmount);
    const discountPercent = 0;
    const discountAmount = 0;
    const totalAmount = subtotalBeforeDiscount;

    return {
      tenantId: tenant._id,
      electricityShare,
      waterShare,
      drinkingWaterShare,
      trashBagShare,
      utilitiesSubtotal,
      rentAmount,
      discountPercent,
      discountAmount,
      totalAmount,
    };
  });
}

/**
 * Calculate payment link expiry:
 * tenant.moveInDate + 1 month + 15 days
 */
function calculateLinkExpiry(moveInDate) {
  if (!moveInDate) {
    // Default: 45 days from now
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 45);
    return expiry;
  }

  const expiry = new Date(moveInDate);
  expiry.setMonth(expiry.getMonth() + 1);
  expiry.setDate(expiry.getDate() + 15);
  return expiry;
}

function roundTo2(num) {
  return Math.round(num * 100) / 100;
}

module.exports = { calculateBills, calculateLinkExpiry };
