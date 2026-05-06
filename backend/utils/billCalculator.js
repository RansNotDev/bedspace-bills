/**
 * Bill Calculator Utility
 * Handles electricity splitting (aircon vs non-aircon) and equal splits
 */

/**
 * Calculate each tenant's bill shares for a given bill cycle.
 * @param {Array} tenants - Array of active User documents
 * @param {Object} billCycle - BillCycle document
 * @returns {Array} Array of { tenantId, electricityShare, waterShare, drinkingWaterShare, trashBagShare, totalAmount }
 */
function calculateBills(tenants, billCycle) {
  const activeTenants = tenants.filter((t) => t.isActive);
  const totalTenants = activeTenants.length;

  if (totalTenants === 0) return [];

  const { electricityTotal, waterBill, drinkingWater, trashBags } = billCycle;

  // --- Electricity split (weighted) ---
  const airconTenants = activeTenants.filter((t) => t.roomType === 'aircon');
  const nonAirconTenants = activeTenants.filter((t) => t.roomType === 'non-aircon');

  const airconCount = airconTenants.length;
  const nonAirconCount = nonAirconTenants.length;

  // Each aircon = 1.0 unit, each non-aircon = 0.5 unit
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

    const totalAmount = roundTo2(
      electricityShare + waterShare + drinkingWaterShare + trashBagShare
    );

    return {
      tenantId: tenant._id,
      electricityShare,
      waterShare,
      drinkingWaterShare,
      trashBagShare,
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
