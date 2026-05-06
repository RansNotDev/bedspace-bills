/**
 * Seed script — creates the admin user
 * Run: node scripts/seed.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existing = await User.findOne({ role: 'admin' });
    if (existing) {
      console.log(`Admin already exists: "${existing.nickname}"`);
      process.exit(0);
    }

    const admin = await User.create({
      nickname: 'admin',
      role: 'admin',
      roomType: 'non-aircon',
      isActive: true,
    });

    console.log(`✅ Admin created with nickname: "${admin.nickname}"`);
    console.log('You can now log in with nickname: admin');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
