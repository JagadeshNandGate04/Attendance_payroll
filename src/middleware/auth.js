const jwt = require('jsonwebtoken');
const knex = require('../config/database');

const secret = process.env.JWT_SECRET;



// =====================================================
// EMPLOYEE AUTHORIZATION
// =====================================================

function userAuthorize() {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message: 'Authorization token is required'
        });
      }

      const parts = authHeader.split(' ');

      if (
        parts.length !== 2 ||
        parts[0] !== 'Bearer'
      ) {
        return res.status(401).json({
          success: false,
          message: 'Invalid authorization format'
        });
      }

      const token = parts[1];

      const decoded = jwt.verify(
        token,
        secret,
        {
          algorithms: ['HS256']
        }
      );

      const userId = decoded.id;

      const user = await knex('users')
        .where({ id: userId })
        .first();

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      if (user.status !== 'ACTIVE') {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive'
        });
      }

      // EMPLOYEE ONLY
      if (user.role !== 'EMPLOYEE') {
        return res.status(403).json({
          success: false,
          message: 'Employee access required'
        });
      }

      const {
        password_hash,
        ...userData
      } = user;

      req.user = userData;
      req.auth = decoded;
      req.auth.user_type = 2;

      next();

    } catch (error) {

      console.error(
        'Employee authorization error:',
        error
      );

      if (
        error.name === 'TokenExpiredError'
      ) {
        return res.status(401).json({
          success: false,
          message: 'Access token expired'
        });
      }

      if (
        error.name === 'JsonWebTokenError'
      ) {
        return res.status(401).json({
          success: false,
          message: 'Invalid access token'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
  };
}



module.exports = {
  userAuthorize
};