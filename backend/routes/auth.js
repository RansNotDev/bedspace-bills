const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

/**
 * POST /api/auth/login
 * Login with nickname only — no password
 */
router.post('/login', async (req, res) => {
  try {
    const { nickname } = req.body;

    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ message: 'Nickname is required' });
    }

    const user = await User.findOne({
      nickname: nickname.trim(),
      isActive: true,
    });

    if (!user) {
      return res.status(401).json({ message: 'Nickname not found or account inactive' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        nickname: user.nickname,
        role: user.role,
        roomType: user.roomType,
        moveInDate: user.moveInDate,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current logged-in user info
 */
router.get('/me', protect, async (req, res) => {
  res.json({
    _id: req.user._id,
    nickname: req.user.nickname,
    role: req.user.role,
    roomType: req.user.roomType,
    moveInDate: req.user.moveInDate,
    email: req.user.email,
    isActive: req.user.isActive,
  });
});

module.exports = router;
