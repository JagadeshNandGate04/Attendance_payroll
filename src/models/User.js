const db = require('../config/database');
const bcrypt = require('bcrypt');

class User {
  /**
   * Get all users with optional filters
   * @param {Object} options - Filter options
   * @param {string} options.role - Filter by role (ADMIN/EMPLOYEE)
   * @param {string} options.status - Filter by status (ACTIVE/INACTIVE)
   * @param {boolean} options.active - Get only active users
   * @returns {Promise<Array>} List of users
   */
  static async findAll(options = {}) {
    let query = db('users').select(
      'id',
      'emp_code',
      'name',
      'email',
      'phone',
      'role',
      'date_of_joining',
      'designation',
      'status',
      'fcm_tokens',
      'created_at',
      'updated_at'
    );
    
    if (options.role) {
      query = query.where('role', options.role);
    }
    
    if (options.status) {
      query = query.where('status', options.status);
    }
    
    if (options.active === true) {
      query = query.where('status', 'ACTIVE');
    }
    
    return query.orderBy('name', 'asc');
  }

  /**
   * Find user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  static async findById(id) {
    return db('users')
      .select(
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      )
      .where('id', id)
      .first();
  }

  /**
   * Find user by employee code (matches eSSL device user ID)
   * @param {string} empCode - Employee code
   * @returns {Promise<Object|null>} User object or null
   */
  static async findByEmpCode(empCode) {
    return db('users')
      .select(
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      )
      .where('emp_code', empCode)
      .first();
  }

  /**
   * Find user by email (includes password_hash for authentication)
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object with password_hash or null
   */
  static async findByEmail(email) {
    return db('users')
      .where('email', email)
      .first();
  }

  /**
   * Find user by email for login (includes password_hash)
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object with password_hash or null
   */
  static async findByEmailForAuth(email) {
    return db('users')
      .select('*')
      .where('email', email)
      .first();
  }

  /**
   * Create a new user
   * @param {Object} data - User data
   * @param {string} data.emp_code - Employee code (matches eSSL device)
   * @param {string} data.name - Full name
   * @param {string} data.email - Email address (used for login)
   * @param {string} data.password - Plain password (will be hashed with bcrypt)
   * @param {string} data.phone - Phone number
   * @param {string} data.role - ADMIN or EMPLOYEE
   * @param {string} data.date_of_joining - Join date (YYYY-MM-DD)
   * @param {string} data.designation - Job title
   * @returns {Promise<Object>} Created user
   */
  static async create(data) {
    const { password, ...rest } = data;
    const passwordHash = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_ROUNDS) || 10
    );
    
    const [user] = await db('users')
      .insert({
        ...rest,
        password_hash: passwordHash,
        fcm_tokens: JSON.stringify([]) // Default empty array
      })
      .returning([
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      ]);
    
    return user;
  }

  /**
   * Update an existing user
   * @param {number} id - User ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Updated user
   */
  static async update(id, data) {
    // If password is being updated, hash it with bcrypt
    if (data.password) {
      data.password_hash = await bcrypt.hash(
        data.password,
        parseInt(process.env.BCRYPT_ROUNDS) || 10
      );
      delete data.password;
    }
    
    const [user] = await db('users')
      .where('id', id)
      .update({
        ...data,
        updated_at: db.fn.now()
      })
      .returning([
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      ]);
    
    return user;
  }

  /**
   * Update user status (ACTIVE / INACTIVE)
   * @param {number} id - User ID
   * @param {string} status - ACTIVE or INACTIVE
   * @returns {Promise<Object>} Updated user
   */
  static async updateStatus(id, status) {
    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      throw new Error('Status must be ACTIVE or INACTIVE');
    }
    
    const [user] = await db('users')
      .where('id', id)
      .update({
        status: status,
        updated_at: db.fn.now()
      })
      .returning([
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      ]);
    
    return user;
  }

  /**
   * Update password only (called from AuthService)
   * @param {number} userId - User ID
   * @param {string} newPasswordHash - Hashed password
   * @returns {Promise<Object>} Updated user
   */
  static async updatePassword(userId, newPasswordHash) {
    const [user] = await db('users')
      .where('id', userId)
      .update({
        password_hash: newPasswordHash,
        updated_at: db.fn.now()
      })
      .returning([
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      ]);
    
    return user;
  }

  /**
   * Add FCM token to user's token array (deduplicated)
   * @param {number} userId - User ID
   * @param {string} fcmToken - FCM device token
   * @returns {Promise<Object|null>} Updated user or null
   */
  static async updateFcmToken(userId, fcmToken) {
    const user = await db('users').where('id', userId).first();
    if (!user) return null;
    
    // Parse existing tokens (stored as JSONB array)
    let tokens = user.fcm_tokens || [];
    if (typeof tokens === 'string') {
      try {
        tokens = JSON.parse(tokens);
      } catch {
        tokens = [];
      }
    }
    
    // Deduplicate - only add if not already present
    if (!tokens.includes(fcmToken)) {
      tokens.push(fcmToken);
    }
    
    const [updated] = await db('users')
      .where('id', userId)
      .update({
        fcm_tokens: JSON.stringify(tokens), // Store as JSONB
        updated_at: db.fn.now()
      })
      .returning([
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      ]);
    
    return updated;
  }

  /**
   * Remove FCM token from user's token array
   * @param {number} userId - User ID
   * @param {string} fcmToken - FCM device token to remove
   * @returns {Promise<Object|null>} Updated user or null
   */
  static async removeFcmToken(userId, fcmToken) {
    const user = await db('users').where('id', userId).first();
    if (!user) return null;
    
    // Parse existing tokens
    let tokens = user.fcm_tokens || [];
    if (typeof tokens === 'string') {
      try {
        tokens = JSON.parse(tokens);
      } catch {
        tokens = [];
      }
    }
    
    // Remove the token
    tokens = tokens.filter(token => token !== fcmToken);
    
    const [updated] = await db('users')
      .where('id', userId)
      .update({
        fcm_tokens: JSON.stringify(tokens),
        updated_at: db.fn.now()
      })
      .returning([
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'date_of_joining',
        'designation',
        'status',
        'fcm_tokens',
        'created_at',
        'updated_at'
      ]);
    
    return updated;
  }

  /**
   * Validate user credentials for login
   * @param {string} email - User email
   * @param {string} password - Plain password
   * @returns {Promise<Object|null>} User object if valid, null otherwise
   */
  static async validateCredentials(email, password) {
    const user = await this.findByEmailForAuth(email);
    if (!user) return null;
    
    // Check if user is active
    if (user.status !== 'ACTIVE') {
      return null;
    }
    
    // Verify password with bcrypt
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return null;
    
    // Remove sensitive data
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get user profile (excludes sensitive data, includes leave balance)
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} User profile or null
   */
  static async getProfile(userId) {
    const user = await this.findById(userId);
    if (!user) return null;
    
    // Get leave balance from leave_ledger
    const leaveBalance = await this.getLeaveBalance(userId);
    
    return {
      ...user,
      leave_balance: leaveBalance
    };
  }

  /**
   * Get user's leave balance from leave_ledger
   * @param {number} userId - User ID
   * @returns {Promise<number>} Leave balance
   */
  static async getLeaveBalance(userId) {
    const result = await db('leave_ledger')
      .where('user_id', userId)
      .sum('delta as balance')
      .first();
    
    return parseFloat(result.balance) || 0;
  }

  /**
   * Get user's permission usage for a specific month
   * @param {number} userId - User ID
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @returns {Promise<number>} Used permission minutes
   */
  static async getPermissionBalance(userId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const result = await db('permission_requests')
      .where('user_id', userId)
      .whereIn('status', ['PENDING', 'APPROVED'])
      .whereBetween('perm_date', [startDate, endDate])
      .sum('minutes as used')
      .first();
    
    return parseFloat(result.used) || 0;
  }

  /**
   * Check if user is admin
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True if admin
   */
  static async isAdmin(userId) {
    const user = await this.findById(userId);
    return user ? user.role === 'ADMIN' : false;
  }

  /**
   * Get all active employees (non-admin users)
   * @returns {Promise<Array>} List of active employees
   */
  static async getActiveEmployees() {
    return this.findAll({
      role: 'EMPLOYEE',
      active: true
    });
  }

  /**
   * Count total users with optional filters
   * @param {Object} filters - Optional filters
   * @returns {Promise<number>} Total count
   */
  static async count(filters = {}) {
    let query = db('users').count('id as count');
    
    if (filters.role) {
      query = query.where('role', filters.role);
    }
    
    if (filters.status) {
      query = query.where('status', filters.status);
    }
    
    const result = await query.first();
    return parseInt(result.count) || 0;
  }

  /**
   * Find users who joined in a specific month (for leave accrual)
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @returns {Promise<Array>} List of users
   */
  static async findByJoiningMonth(month, year) {
    return db('users')
      .select(
        'id',
        'emp_code',
        'name',
        'email',
        'role',
        'date_of_joining',
        'status'
      )
      .where('status', 'ACTIVE')
      .whereRaw('EXTRACT(MONTH FROM date_of_joining) = ?', [month])
      .whereRaw('EXTRACT(YEAR FROM date_of_joining) = ?', [year]);
  }

  /**
   * Search users by name or emp_code
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} List of matching users
   */
  static async search(searchTerm) {
    return db('users')
      .select(
        'id',
        'emp_code',
        'name',
        'email',
        'phone',
        'role',
        'designation',
        'status'
      )
      .where('status', 'ACTIVE')
      .andWhere(function() {
        this.where('name', 'ilike', `%${searchTerm}%`)
          .orWhere('emp_code', 'ilike', `%${searchTerm}%`)
          .orWhere('email', 'ilike', `%${searchTerm}%`);
      })
      .orderBy('name', 'asc')
      .limit(20);
  }
}

module.exports = User;