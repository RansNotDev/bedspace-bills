const mongoose = require('mongoose');

const billCycleSchema = new mongoose.Schema(
  {
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    electricityTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    waterBill: {
      type: Number,
      required: true,
      min: 0,
    },
    drinkingWater: {
      type: Number,
      default: 100,
      min: 0,
    },
    trashBags: {
      type: Number,
      default: 100,
      min: 0,
    },
    deadline: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
    gcashNumbers: {
      electricity: { type: String, default: '' },
      water: { type: String, default: '' },
      others: { type: String, default: '' },
    },
    gcashQRImages: {
      electricity: { type: String, default: '' }, // Cloudinary URL
      water: { type: String, default: '' },
      others: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

// Compound unique index: one bill cycle per month/year
billCycleSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('BillCycle', billCycleSchema);
