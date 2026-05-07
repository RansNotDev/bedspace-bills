const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    nickname: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'mini_admin', 'tenant'],
      default: 'tenant',
    },
    bedspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bedspace',
      default: null,
      index: true,
    },
    /**
     * Landlord-defined flags for mini admins (one bedspace only).
     * Omitted keys default to “allowed” in the API layer.
     */
    miniAdminPermissions: {
      manageTenants: { type: Boolean, default: true },
      manageBillCycles: { type: Boolean, default: true },
      generateBills: { type: Boolean, default: true },
      sendPaymentLinks: { type: Boolean, default: true },
      markPaid: { type: Boolean, default: true },
      uploadQR: { type: Boolean, default: true },
      viewReports: { type: Boolean, default: true },
      viewCalendar: { type: Boolean, default: true },
    },
    /**
     * What this tenant can see in their portal (landlord configures per tenant).
     */
    tenantPortalVisibility: {
      showCurrentBill: { type: Boolean, default: true },
      showBillHistory: { type: Boolean, default: true },
      showPaymentUpload: { type: Boolean, default: true },
    },
    roomType: {
      type: String,
      enum: ['aircon', 'non-aircon'],
      default: 'non-aircon',
    },
    moveInDate: {
      type: Date,
      default: null,
    },
    /** Monthly rent (PHP) included in each generated bill for this tenant */
    monthlyRent: {
      type: Number,
      default: 0,
      min: 0,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Landlord only — used with bcrypt; never returned in API responses by default (select: false)
    passwordHash: {
      type: String,
      default: null,
      select: false,
    },
    adminLoginFailures: {
      type: Number,
      default: 0,
    },
    adminResetOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    adminResetOtpExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
