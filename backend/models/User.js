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
      enum: ['admin', 'tenant'],
      default: 'tenant',
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
