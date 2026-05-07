const mongoose = require('mongoose');

const tenantBillSchema = new mongoose.Schema(
  {
    billCycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillCycle',
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    electricityShare: {
      type: Number,
      default: 0,
    },
    waterShare: {
      type: Number,
      default: 0,
    },
    drinkingWaterShare: {
      type: Number,
      default: 0,
    },
    trashBagShare: {
      type: Number,
      default: 0,
    },
    /** Sum of electricity + water + drinking + trash (computed) */
    utilitiesSubtotal: {
      type: Number,
      default: null,
    },
    /** Monthly rent snapshot for this billing month */
    rentAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Applied to (utilities + rent); 0–100 */
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    receiptImage: {
      type: String,
      default: null, // Cloudinary URL
    },
    receiptUploadedAt: {
      type: Date,
      default: null,
    },
    paymentLinkToken: {
      type: String,
      default: null,
    },
    paymentLinkExpiry: {
      type: Date,
      default: null,
    },
    paymentLinkSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound unique index: one bill per tenant per cycle
tenantBillSchema.index({ billCycleId: 1, tenantId: 1 }, { unique: true });

module.exports = mongoose.model('TenantBill', tenantBillSchema);
