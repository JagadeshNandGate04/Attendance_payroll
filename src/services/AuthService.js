const knex = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendOtpEmail } = require('../config/mailer');

async function login({ email, password, expectedRole }) {
  try {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    if (!['ADMIN', 'EMPLOYEE'].includes(expectedRole)) {
      throw new Error('A valid login type is required');
    }

    const user = await knex('users')
      .where({ email })
      .first();

    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('Account is inactive. Please contact admin.');
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    if (user.role !== expectedRole) {
      throw new Error('Account type does not match this login');
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        emp_code: user.emp_code
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '24h'
      }
    );

    const refreshToken = jwt.sign(
      {
        id: user.id,
        type: 'refresh'
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

   const {
  password_hash,
  fcm_tokens,
  ...userData
} = user;

    return {
      success: true,
      data: {
        user: userData,
        token,
        refresh_token: refreshToken,
        expires_in: 86400
      }
    };
  } catch (error) {
    console.error('Login service error:', error);
    throw error;
  }
}


// REFRESH TOKEN
async function refreshToken(refresh_token) {
  try {
    if (!refresh_token) {
      throw new Error('Refresh token is required');
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refresh_token,
      process.env.JWT_SECRET
    );

    // Make sure this is actually a refresh token
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    // Find user
    const user = await knex('users')
      .where({ id: decoded.id })
      .first();

    if (!user) {
      throw new Error('User not found');
    }

    // Check whether employee is still active
    if (user.status !== 'ACTIVE') {
      throw new Error('Account is inactive. Please contact admin.');
    }

    // Create new access token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        emp_code: user.emp_code
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '24h'
      }
    );

    return {
      success: true,
      data: {
        token,
        expires_in: 86400
      }
    };

  } catch (error) {
    console.error('Refresh token service error:', error);

    // Refresh token expired
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired. Please login again.');
    }

    // Invalid JWT
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    }

    throw error;
  }
}


// CHANGE PASSWORD

async function changePassword({
  userId,
  oldPassword,
  newPassword
}) {
  try {
    // Validate input
    if (!oldPassword || !newPassword) {
      throw new Error(
        'Old password and new password are required'
      );
    }

    // Check new password is different
    if (oldPassword === newPassword) {
      throw new Error(
        'New password must be different from old password'
      );
    }

    // Get logged-in user
    const user = await knex('users')
      .where({ id: userId })
      .first();

    // Check user exists
    if (!user) {
      throw new Error('User not found');
    }

    // Check user is active
    if (user.status !== 'ACTIVE') {
      throw new Error(
        'Account is inactive. Please contact admin.'
      );
    }

    // Verify old password
    const validPassword = await bcrypt.compare(
      oldPassword,
      user.password_hash
    );

    if (!validPassword) {
      throw new Error(
        'The old password does not match your current password'
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(
      newPassword,
      10
    );

    // Update password + audit log in one transaction
    await knex.transaction(async (trx) => {

      // Update users.password_hash
      await trx('users')
        .where({ id: userId })
        .update({
          password_hash: newPasswordHash,
          updated_at: trx.fn.now()
        });

      // Insert audit log
    //   await trx('audit_log').insert({
    //     user_id: userId,
    //     action: 'CHANGE_PASSWORD',
    //     created_at: trx.fn.now()
    //   });

     });

    return {
      success: true,
      message: 'Password changed successfully'
    };

  } catch (error) {
    console.error(
      'Change password service error:',
      error
    );

    throw error;
  }
}

// FCM TOKEN:

// ==========================================
// FCM TOKEN REGISTRATION
// ==========================================

async function saveFcmToken(userId, token) {
  return knex.transaction(async (trx) => {
    const user = await trx("users")
      .select("id", "fcm_tokens")
      .where({ id: userId })
      .forUpdate()
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    let tokens = [];

    if (Array.isArray(user.fcm_tokens)) {
      tokens = user.fcm_tokens;
    } else if (typeof user.fcm_tokens === "string") {
      try {
        tokens = JSON.parse(user.fcm_tokens);
      } catch {
        tokens = [];
      }
    }

    if (!Array.isArray(tokens)) {
      tokens = [];
    }

    tokens = [...new Set(tokens.filter(
      (item) => typeof item === "string" && item.trim()
    ))];

    if (tokens.includes(token)) {
      return {
        success: true,
        message: "FCM token already registered."
      };
    }

    tokens.push(token);

    await trx("users")
      .where({ id: userId })
      .update({
        fcm_tokens: JSON.stringify(tokens),
        updated_at: trx.fn.now()
      });

    return {
      success: true,
      message: "FCM token registered successfully."
    };
  });
}


// ==========================================
// REMOVE FCM TOKEN
// ==========================================

async function removeFcmToken(userId, token) {
  if (!token || typeof token !== "string" || !token.trim()) {
    throw new Error("FCM token is required.");
  }

  const normalizedToken = token.trim();

  return knex.transaction(async (trx) => {
    const user = await trx("users")
      .select("id", "fcm_tokens")
      .where({ id: userId })
      .forUpdate()
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    let tokens = [];

    if (Array.isArray(user.fcm_tokens)) {
      tokens = user.fcm_tokens;
    } else if (typeof user.fcm_tokens === "string") {
      try {
        tokens = JSON.parse(user.fcm_tokens);
      } catch {
        tokens = [];
      }
    }

    if (!Array.isArray(tokens)) {
      tokens = [];
    }

    const updatedTokens = tokens.filter(
      (item) => item !== normalizedToken
    );

    await trx("users")
      .where({ id: userId })
      .update({
        fcm_tokens: JSON.stringify(updatedTokens),
        updated_at: trx.fn.now()
      });

    return {
      success: true,
      message: "FCM token removed successfully."
    };
  });
}


// ==========================================
// LOGOUT
// ==========================================

async function logout({ userId, fcmToken }) {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  // Remove only the current device's FCM token.
  // If no token is provided, do not remove other devices.
  if (fcmToken) {
    await removeFcmToken(userId, fcmToken);
  }

  return {
    success: true,
    message: "Logged out successfully."
  };
}

// FORGOT PASSWORD - REQUEST OTP

const hashResetValue = (value, userId) => {
  if (!process.env.OTP_SECRET) {
    throw new Error('OTP_SECRET is not configured.');
  }

  return crypto
    .createHmac('sha256', process.env.OTP_SECRET)
    .update(`${userId}:${value}`)
    .digest('hex');
};

async function forgotPassword({ email }) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new Error('Email is required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Always use the same response for unknown and known emails.
  const genericResponse = {
    success: true,
    message: 'If an account exists with this email, a password reset OTP has been sent.'
  };

  const user = await knex('users')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .first();

  if (!user || user.status !== 'ACTIVE') {
    return genericResponse;
  }

  // Generate a cryptographically secure six-digit OTP.
  const otp = crypto
    .randomInt(100000, 1000000)
    .toString();

  const otpHash = hashResetValue(otp, user.id);

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Invalidate previous unused OTPs for this user.
  await knex('password_reset_otps')
    .where({ user_id: user.id })
    .whereNull('used_at')
    .update({
      used_at: knex.fn.now()
    });

  // Save hashed OTP.
  const [otpRecord] = await knex('password_reset_otps')
    .insert({
      user_id: user.id,
      otp_hash: otpHash,
      expires_at: expiresAt,
      attempts: 0
    })
    .returning('id');

  try {
    // Send the actual OTP through SMTP.
    await sendOtpEmail(user.email, otp);
  } catch (error) {
    // Invalidate OTP if email delivery fails.
    await knex('password_reset_otps')
      .where({ id: otpRecord.id })
      .update({
        used_at: knex.fn.now()
      });

    console.error('OTP email delivery failed:', error.message);

    throw new Error('Unable to send verification email. Please try again later.');
  }

  return genericResponse;
}


// VERIFY PASSWORD RESET OTP

async function verifyResetOtp({ email, otp }) {
  if (
    !email ||
    typeof email !== 'string' ||
    !otp ||
    typeof otp !== 'string'
  ) {
    throw new Error('Email and OTP are required.');
  }

  if (!/^\d{6}$/.test(otp)) {
    throw new Error('Invalid or expired OTP.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await knex('users')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .first();

  if (!user || user.status !== 'ACTIVE') {
    throw new Error('Invalid or expired OTP.');
  }

  const verification = await knex.transaction(async (trx) => {
    const otpRecord = await trx('password_reset_otps')
      .where({ user_id: user.id })
      .whereNull('used_at')
      .whereNull('verified_at')
      .orderBy('created_at', 'desc')
      .forUpdate()
      .first();

    if (
      !otpRecord ||
      new Date(otpRecord.expires_at) <= new Date() ||
      otpRecord.attempts >= 5
    ) {
      return { valid: false };
    }

    // Count each verification attempt.
    const nextAttempts = otpRecord.attempts + 1;

    await trx('password_reset_otps')
      .where({ id: otpRecord.id })
      .update({
        attempts: nextAttempts
      });

    const submittedHash = hashResetValue(otp, user.id);

    const storedBuffer = Buffer.from(otpRecord.otp_hash, 'hex');
    const submittedBuffer = Buffer.from(submittedHash, 'hex');

    const matches =
      storedBuffer.length === submittedBuffer.length &&
      crypto.timingSafeEqual(storedBuffer, submittedBuffer);

    if (!matches) {
      return { valid: false };
    }

    // Generate a separate password reset token.
    const resetToken = crypto.randomBytes(32).toString('hex');

    const resetTokenHash = hashResetValue(
      resetToken,
      user.id
    );

    const resetExpiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    // Mark OTP as verified, but NOT used.
    await trx('password_reset_otps')
      .where({ id: otpRecord.id })
      .update({
        verified_at: trx.fn.now(),
        reset_token_hash: resetTokenHash,
        reset_token_expires_at: resetExpiresAt
      });

    return {
      valid: true,
      resetToken
    };
  });

  if (!verification.valid) {
    throw new Error('Invalid or expired OTP.');
  }

  return {
    success: true,
    message: 'OTP verified successfully.',
    data: {
      reset_token: verification.resetToken,
      expires_in: 600
    }
  };
}


// RESET PASSWORD

async function resetPassword({
  email,
  reset_token,
  new_password
}) {
  if (
    !email ||
    typeof email !== 'string' ||
    !reset_token ||
    typeof reset_token !== 'string' ||
    !new_password ||
    typeof new_password !== 'string'
  ) {
    throw new Error(
      'Email, reset token and new password are required.'
    );
  }

  if (new_password.length < 8) {
    throw new Error(
      'Password must contain at least 8 characters.'
    );
  }

  if (new_password.length > 128) {
    throw new Error(
      'Password cannot exceed 128 characters.'
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await knex('users')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .first();

  if (!user || user.status !== 'ACTIVE') {
    throw new Error(
      'Invalid or expired password reset request.'
    );
  }

  // Generate reset token hash.
  const resetTokenHash = hashResetValue(
    reset_token,
    user.id
  );

  // Hash the new password once.
  const newPasswordHash = await bcrypt.hash(
    new_password,
    10
  );

  // Use one transaction for password update and token consumption.
  const updated = await knex.transaction(async (trx) => {

    const resetRecord = await trx('password_reset_otps')
      .where({
        user_id: user.id,
        reset_token_hash: resetTokenHash
      })
      .whereNotNull('verified_at')
      .whereNull('used_at')
      .where('reset_token_expires_at', '>', trx.fn.now())
      .forUpdate()
      .first();

    if (!resetRecord) {
      return false;
    }

    // Update user's password.
    await trx('users')
      .where({ id: user.id })
      .update({
        password_hash: newPasswordHash,
        updated_at: trx.fn.now()
      });

    // Mark reset request as used.
    await trx('password_reset_otps')
      .where({ id: resetRecord.id })
      .update({
        used_at: trx.fn.now()
      });

    // Invalidate any other outstanding reset requests for this user.
    await trx('password_reset_otps')
      .where({ user_id: user.id })
      .whereNull('used_at')
      .update({
        used_at: trx.fn.now()
      });

    return true;
  });

  if (!updated) {
    throw new Error(
      'Invalid or expired password reset request.'
    );
  }

  return {
    success: true,
    message: 'Password reset successfully. Please sign in with your new password.'
  };
}


// ADMIN CHANGE PASSWORD

async function adminChangePassword({ userId, oldPassword, newPassword }) {
  // Same validation as changePassword
  if (!oldPassword || !newPassword) {
    throw new Error('Old password and new password are required');
  }

  if (oldPassword === newPassword) {
    throw new Error('New password must be different from old password');
  }

  const user = await knex('users').where({ id: userId }).first();

  if (!user) {
    throw new Error('User not found');
  }

  // Extra guard: only admins can use this service
  if (user.role !== 'ADMIN') {
    throw new Error('Only admin accounts can use this endpoint');
  }

  if (user.status !== 'ACTIVE') {
    throw new Error('Account is inactive. Please contact admin.');
  }

  const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
  if (!validPassword) {
    throw new Error('The old password does not match your current password');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await knex.transaction(async (trx) => {
    await trx('users')
      .where({ id: userId })
      .update({
        password_hash: newPasswordHash,
        updated_at: trx.fn.now(),
      });

    // await trx('audit_log').insert({
    //   user_id: userId,
    //   action: 'ADMIN_CHANGE_PASSWORD',
    //   created_at: trx.fn.now(),
    // });
  });

  return {
    success: true,
    message: 'Password changed successfully',
  };
}

module.exports = {
  login,
  refreshToken,
  changePassword,
  saveFcmToken,
  removeFcmToken,
  logout,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  adminChangePassword
};