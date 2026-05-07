const mongoose = require('mongoose');

const bedspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Shown on PDFs and reports (e.g. “Unit 3B – Kamuning”) */
    locationName: {
      type: String,
      trim: true,
      default: '',
    },
    /** Optional full address or directions */
    locationAddress: {
      type: String,
      trim: true,
      default: '',
    },
    /**
     * Free-text rules from the landlord (e.g. house rules, payment instructions).
     * Shown on downloadable monthly bill PDFs for this property — not used for calculations.
     */
    pdfRulesText: {
      type: String,
      trim: true,
      default: '',
      maxlength: 6000,
    },
  },
  { timestamps: true }
);

bedspaceSchema.index({ ownerId: 1, name: 1 });

module.exports = mongoose.model('Bedspace', bedspaceSchema);
