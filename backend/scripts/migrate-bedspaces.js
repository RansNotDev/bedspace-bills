/**
 * One-time migration: attach legacy data (no bedspaceId) to a single "Main" property
 * owned by the first landlord account in the database.
 *
 * Run from backend folder: node scripts/migrate-bedspaces.js
 *
 * Also renames role `admin` → `super_admin` on that landlord row (optional but recommended).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Bedspace = require('../models/Bedspace');
const BillCycle = require('../models/BillCycle');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected');

    const landlord = await User.findOne({ role: { $in: ['admin', 'super_admin'] } }).sort({
      createdAt: 1,
    });

    if (!landlord) {
      console.log('No landlord user found. Run seed.js first.');
      process.exit(0);
    }

    let bed = await Bedspace.findOne({ ownerId: landlord._id });
    if (!bed) {
      bed = await Bedspace.create({ name: 'Main', ownerId: landlord._id });
      console.log('Created bedspace:', bed.name, bed._id.toString());
    } else {
      console.log('Using existing bedspace:', bed.name, bed._id.toString());
    }

    if (landlord.role === 'admin') {
      landlord.role = 'super_admin';
      await landlord.save();
      console.log('Updated landlord role to super_admin');
    }

    const tenantUp = await User.updateMany(
      { role: 'tenant', $or: [{ bedspaceId: null }, { bedspaceId: { $exists: false } }] },
      { $set: { bedspaceId: bed._id } }
    );
    console.log('Tenants linked:', tenantUp.modifiedCount);

    const cycleUp = await BillCycle.updateMany(
      { $or: [{ bedspaceId: null }, { bedspaceId: { $exists: false } }] },
      { $set: { bedspaceId: bed._id } }
    );
    console.log('Bill cycles linked:', cycleUp.modifiedCount);

    // Drop legacy unique index on month+year if present (new uniqueness is per bedspace)
    try {
      await BillCycle.collection.dropIndex('month_1_year_1');
      console.log('Dropped legacy index month_1_year_1');
    } catch (e) {
      if (e.code !== 27 && e.codeName !== 'IndexNotFound') {
        console.warn('Could not drop old index (may not exist):', e.message);
      }
    }

    console.log('Done.');
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
