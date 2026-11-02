const authService = require('../services/AuthService');


async function login(req, res) {
    
  try {
    const { email, password } = req.body;

    const result = await authService.login({ email, password });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Login error:', error);

    if (error.message === 'Email and password are required') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message === 'Invalid email or password' ||
      error.message === 'Account is inactive. Please contact admin.'
    ) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
}

// REFRESH TOKEN
async function refreshToken(req, res) {
  try {
    const { refresh_token } = req.body;

    const result = await authService.refreshToken(refresh_token);

    return res.status(200).json(result);

  } catch (error) {
    console.error('Refresh token error:', error);

    if (error.message === 'Refresh token is required') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message === 'Invalid refresh token' ||
      error.message === 'Refresh token expired. Please login again.'
    ) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    if (error.message === 'User not found') {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message ===
      'Account is inactive. Please contact admin.'
    ) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error during token refresh'
    });
  }
}

// CHANGE PASSWORD 

async function changePassword(req, res) {
  try {
    const {
      old_password,
      new_password
    } = req.body;

    // userAuthorize middleware provides the logged-in user
    const userId = req.user.id;

    const result = await authService.changePassword({
      userId,
      oldPassword: old_password,
      newPassword: new_password
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error(
      'Change password error:',
      error
    );

    // Missing passwords
    if (
      error.message ===
      'Old password and new password are required'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Same old and new password
    if (
      error.message ===
      'New password must be different from old password'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Old password does not match
    if (
      error.message ===
      'The old password does not match your current password'
    ) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    // User not found
    if (
      error.message === 'User not found'
    ) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    // User inactive
    if (
      error.message ===
      'Account is inactive. Please contact admin.'
    ) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    // Other errors
    return res.status(500).json({
      success: false,
      message:
        'Internal server error during password change'
    });
  }
}


// FCM TOKEN UPDATE

async function saveFcmToken(req, res) {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required.'
      });
    }

    const result = await authService.saveFcmToken(
      userId,
      token.trim()
    );

    return res.status(200).json(result);

  } catch (error) {
    console.error('saveFcmToken error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to save FCM token.'
    });
  }
}


// FORGOT PASSWORD - SEND OTP

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    const result = await authService.forgotPassword({
      email
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Forgot password error:', error.message);

    if (error.message === 'Email is required.') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to process your password reset request. Please try again later.'
    });
  }
}

// VERIFY RESET OTP


async function verifyResetOtp(req, res) {
  try {
    const { email, otp } = req.body;

    const result = await authService.verifyResetOtp({
      email,
      otp
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Verify reset OTP error:', error.message);

    if (
      error.message === 'Email and OTP are required.' ||
      error.message === 'Invalid or expired OTP.'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to verify OTP. Please try again.'
    });
  }
}

// RESET PASSWORD


async function resetPassword(req, res) {
  try {
    const {
      email,
      reset_token,
      new_password
    } = req.body;

    const result = await authService.resetPassword({
      email,
      reset_token,
      new_password
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Reset password error:', error.message);

    const validationErrors = [
      'Email, reset token and new password are required.',
      'Password must contain at least 8 characters.',
      'Password cannot exceed 128 characters.'
    ];

    if (validationErrors.includes(error.message)) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (
      error.message ===
      'Invalid or expired password reset request.'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to reset password. Please try again.'
    });
  }
}



module.exports = {
  login,
  refreshToken,
  changePassword,
  saveFcmToken,
  forgotPassword,
  verifyResetOtp,
  resetPassword,


};