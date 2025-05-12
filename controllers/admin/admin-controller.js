const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const sendOTPEmail = require('../utils/sendOTPEmail');

exports.signup = async (req, res) => {
  // 1. Validate fields
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstname, lastname, phone, email, password } = req.body;

  try {
    // 2. Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ message: "Email or phone already registered" });
    }

    // 3. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // valid for 10 minutes

    // 5. Create and save new user
    const newUser = new User({
      firstname,
      lastname,
      phone,
      email,
      password: hashedPassword,
      otp: {
        code: otpCode,
        expiresAt: otpExpiry,
      },
    });

    await newUser.save();

    // 6. Send OTP email
    await sendOTPEmail(email, otpCode);

    res.status(201).json({ message: "User created. OTP sent to email." });

  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};
