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
const Bedspace = require('../models/Bedspace');

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

    const existing = await User.findOne({ role: { $in: ['admin', 'super_admin'] } }).select(
      '+passwordHash'
    );

    if (existing) {
      if (existing.role === 'admin') {
        existing.role = 'super_admin';
      }
      if (!existing.passwordHash) {
        existing.passwordHash = hash;
        existing.adminLoginFailures = 0;
        await existing.save();
        console.log(`✅ Set password for existing landlord: "${existing.nickname}"`);
      } else {
        await existing.save();
        console.log(`Landlord already has a password: "${existing.nickname}"`);
        console.log('To change it, use the app (Change password) or reset after lockout flow.');
      }
      const hasBed = await Bedspace.exists({ ownerId: existing._id });
      if (!hasBed) {
        await Bedspace.create({ name: 'Main', ownerId: existing._id });
        console.log('✅ Created default bedspace "Main" for this landlord');
      }
      process.exit(0);
    }

    const admin = await User.create({
      nickname: 'admin',
      role: 'super_admin',
      roomType: 'non-aircon',
      isActive: true,
      passwordHash: hash,
      adminLoginFailures: 0,
    });

    await Bedspace.create({ name: 'Main', ownerId: admin._id });

    console.log(`✅ Landlord created. Nickname: "${admin.nickname}" (super_admin)`);
    console.log('✅ Default bedspace "Main" created — log in and pick it if you have more than one.');
    console.log('Log in with this nickname and ADMIN_INITIAL_PASSWORD from .env');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
