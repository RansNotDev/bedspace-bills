/**
 * Seed script — creates or updates the landlord (admin) user with a hashed password.
 * Run from backend folder: node scripts/seed.js
 *
 * Set in .env:
 *   ADMIN_INITIAL_PASSWORD=your-strong-password
 * Optional: ADMIN_PASSWORD_RESET_EMAIL=your@email.com (for lockout OTP; can also use landlord email on User)
 *
 * If admin already exists without a password, this script sets passwordHash from ADMIN_INITIAL_PASSWORD.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const initialPwd = process.env.ADMIN_INITIAL_PASSWORD;
    if (!initialPwd || initialPwd.length < 8) {
      console.error(
        'Set ADMIN_INITIAL_PASSWORD in backend/.env (at least 8 characters), then run again.'
      );
      process.exit(1);
    }

    const hash = await bcrypt.hash(initialPwd, 10);

    const existing = await User.findOne({ role: 'admin' }).select('+passwordHash');

    if (existing) {
      if (!existing.passwordHash) {
        existing.passwordHash = hash;
        existing.adminLoginFailures = 0;
        await existing.save();
        console.log(`✅ Set password for existing landlord: "${existing.nickname}"`);
      } else {
        console.log(`Landlord already has a password: "${existing.nickname}"`);
        console.log('To change it, use the app (Change password) or reset after lockout flow.');
      }
      process.exit(0);
    }

    const admin = await User.create({
      nickname: 'admin',
      role: 'admin',
      roomType: 'non-aircon',
      isActive: true,
      passwordHash: hash,
      adminLoginFailures: 0,
    });

    console.log(`✅ Landlord created. Nickname: "${admin.nickname}"`);
    console.log('Log in with this nickname and ADMIN_INITIAL_PASSWORD from .env');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
