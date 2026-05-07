/**
 * Rent, utilities, and percentage discount math for tenant bills.
 */

function roundTo2(num) {
  return Math.round(Number(num) * 100) / 100;
}

function utilitiesFromShares(bill) {
  return roundTo2(
    (Number(bill.electricityShare) || 0) +
      (Number(bill.waterShare) || 0) +
      (Number(bill.drinkingWaterShare) || 0) +
      (Number(bill.trashBagShare) || 0)
  );
}

function getUtilitiesSubtotal(bill) {
  if (bill.utilitiesSubtotal != null && bill.utilitiesSubtotal !== '') {
    return roundTo2(Number(bill.utilitiesSubtotal));
  }
  return utilitiesFromShares(bill);
}

/**
 * Returns updated numeric fields for a tenant bill document (does not save).
 * @param {object} bill mongoose doc or plain object with share fields
 * @param {{ discountPercent?: number, rentAmount?: number }=} overrides
 */
function computeTenantBillTotals(bill, overrides = {}) {
  const utilitiesSubtotal = getUtilitiesSubtotal(bill);
  const rentAmount =
    overrides.rentAmount !== undefined
      ? roundTo2(Math.max(0, Number(overrides.rentAmount)))
      : roundTo2(Math.max(0, Number(bill.rentAmount) || 0));

  let discountPercent =
    overrides.discountPercent !== undefined ? Number(overrides.discountPercent) : Number(bill.discountPercent) || 0;
  if (Number.isNaN(discountPercent)) discountPercent = 0;
  discountPercent = Math.min(100, Math.max(0, discountPercent));

  const subtotalBeforeDiscount = roundTo2(utilitiesSubtotal + rentAmount);
  const discountAmount = roundTo2(subtotalBeforeDiscount * (discountPercent / 100));
  const totalAmount = roundTo2(subtotalBeforeDiscount - discountAmount);

  return {
    utilitiesSubtotal,
    rentAmount,
    discountPercent,
    discountAmount,
    subtotalBeforeDiscount,
    totalAmount,
  };
}

module.exports = {
  roundTo2,
  utilitiesFromShares,
  getUtilitiesSubtotal,
  computeTenantBillTotals,
};
