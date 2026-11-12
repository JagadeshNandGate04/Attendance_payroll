
const knex = require("../config/database");

const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

// =====================================================
// HELPERS
// =====================================================

// Never return encrypted or plaintext sensitive identifiers
// from profile change-request JSON.
function sanitizeSensitiveData(value) {
  const sensitiveKeyPattern =
    /(aadhaar|pan_number|voter_id_number|driving_license_number|account_number|uan_no|esi_no|pf_account_no|password|token|secret)/i;

  if (Array.isArray(value)) {
    return value.map(sanitizeSensitiveData);
  }

  if (value && typeof value === "object") {
    const sanitized = {};

    for (const [key, item] of Object.entries(value)) {
      if (sensitiveKeyPattern.test(key)) {
        sanitized[key] = item == null || item === ""
          ? item
          : "[REDACTED]";
      } else {
        sanitized[key] = sanitizeSensitiveData(item);
      }
    }

    return sanitized;
  }

  return value;
}

// =====================================================
// GET MY EMPLOYEE PROFILE
// =====================================================

async function getMyEmployeeProfile({ userId }) {
  if (
    !userId ||
    !Number.isInteger(Number(userId)) ||
    Number(userId) <= 0
  ) {
    const error = new Error("Invalid employee ID");
    error.code = "INVALID_EMPLOYEE_ID";
    throw error;
  }

  const normalizedUserId = Number(userId);

  // FETCH EMPLOYEE AND PROFILE
  

  const employee = await knex("users as u")
    .leftJoin(
      "employee_profiles as ep",
      "ep.user_id",
      "u.id"
    )
    .select(
      "u.id",
      "u.emp_code",
      "u.name",
      "u.email",
      "u.phone",
      "u.designation",
      "u.date_of_joining",
      "u.role",
      "u.status",
      "ep.id as profile_id",
      "ep.profile_picture_mime_type",
      "ep.profile_picture_size_bytes",
      "ep.marital_status",
      "ep.father_spouse_name",
      "ep.religion",
      "ep.caste",
      "ep.mother_tongue",
      "ep.cug_mobile_no",
      "ep.city_of_birth",
      "ep.country_of_birth",
      "ep.nationality",
      "ep.community",
      "ep.official_email",
      "ep.retirement_age",
      "ep.highest_qualification_level",
      "ep.blood_group",
      "ep.height_cm",
      "ep.weight_kg",
      "ep.date_of_birth",
      "ep.secondary_mobile_no",
      "ep.contact_email",
      "ep.created_at as profile_created_at",
      "ep.updated_at as profile_updated_at"
    )
    .where("u.id", normalizedUserId)
    .first();

  if (!employee || String(employee.role).toUpperCase() !== "EMPLOYEE") {
    const error = new Error("Employee not found");
    error.code = "EMPLOYEE_NOT_FOUND";
    throw error;
  }

  if (!employee.profile_id) {
    const error = new Error("Employee profile not found");
    error.code = "PROFILE_NOT_FOUND";
    throw error;
  }

  // FETCH ALL PROFILE SECTIONS
 
  const [
    addresses,
    emergencyContacts,
    familyMembers,
    qualifications,
    workExperiences,
    identityDetails,
    statutoryDetails,
    bankDetails,
    documents,
    pendingRequests,
  ] = await Promise.all([

    // ADDRESSES
    knex("employee_addresses")
      .select(
        "id",
        "address_type",
        "address_line_1",
        "address_line_2",
        "address_line_3",
        "city",
        "district",
        "state",
        "pincode",
        "country",
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .orderBy("address_type", "asc"),

    // EMERGENCY CONTACTS
    knex("employee_emergency_contacts")
      .select(
        "id",
        "contact_name",
        "relation",
        "mobile_no",
        "alternate_mobile_no",
        "address",
        "is_primary",
        "status",
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .orderBy("is_primary", "desc")
      .orderBy("id", "asc"),

    // FAMILY MEMBERS
    knex("employee_family_members")
      .select(
        "id",
        "name",
        "relation",
        "gender",
        "date_of_birth",
        "profession",
        "family_member_type",
        "address",
        "status",
        "remarks",
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .orderBy("id", "asc"),

    // QUALIFICATIONS
    knex("employee_qualifications")
      .select(
        "id",
        "qualification_type",
        "qualification",
        "institute_name",
        "specialization",
        "from_year",
        "to_year",
        "status",
        "remarks",
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .orderBy("to_year", "desc"),

    // WORK EXPERIENCES
    knex("employee_work_experiences")
      .select(
        "id",
        "previous_org_name",
        "designation",
        "from_date",
        "to_date",
        "status",
        "remarks",
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .orderBy("from_date", "desc"),

    // IDENTITY DETAILS
    // Encrypted identity numbers are deliberately not selected.
    knex("employee_identity_details")
      .select(
        "id",
        knex.raw(
          "CASE WHEN aadhaar_number_encrypted IS NOT NULL AND aadhaar_number_encrypted <> '' THEN TRUE ELSE FALSE END AS aadhaar_number_available"
        ),
        knex.raw(
          "CASE WHEN pan_number_encrypted IS NOT NULL AND pan_number_encrypted <> '' THEN TRUE ELSE FALSE END AS pan_number_available"
        ),
        knex.raw(
          "CASE WHEN voter_id_number_encrypted IS NOT NULL AND voter_id_number_encrypted <> '' THEN TRUE ELSE FALSE END AS voter_id_number_available"
        ),
        knex.raw(
          "CASE WHEN driving_license_number_encrypted IS NOT NULL AND driving_license_number_encrypted <> '' THEN TRUE ELSE FALSE END AS driving_license_number_available"
        ),
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .first(),

    // PF / ESI DETAILS
    // Encrypted statutory numbers are deliberately not selected.
    knex("employee_statutory_details")
      .select(
        "id",
        "is_pf_eligible",
        knex.raw(
          "CASE WHEN pf_account_no_encrypted IS NOT NULL AND pf_account_no_encrypted <> '' THEN TRUE ELSE FALSE END AS pf_account_no_available"
        ),
        knex.raw(
          "CASE WHEN uan_no_encrypted IS NOT NULL AND uan_no_encrypted <> '' THEN TRUE ELSE FALSE END AS uan_no_available"
        ),
        "is_esi_eligible",
        knex.raw(
          "CASE WHEN esi_no_encrypted IS NOT NULL AND esi_no_encrypted <> '' THEN TRUE ELSE FALSE END AS esi_no_available"
        ),
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .first(),

    // BANK DETAILS
    // Account number is encrypted and deliberately not selected.
    knex("employee_bank_details")
      .select(
        "id",
        "bank_name",
        "branch_name",
        "ifsc_code",
        knex.raw(
          "CASE WHEN account_number_encrypted IS NOT NULL AND account_number_encrypted <> '' THEN TRUE ELSE FALSE END AS account_number_available"
        ),
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .first(),

    // DOCUMENTS
    // Internal file paths are not exposed.
    knex("employee_documents")
      .select(
        "id",
        "change_request_id",
        "document_type",
        "document_name",
        "original_file_name",
        "mime_type",
        "file_size_bytes",
        "file_extension",
        "description",
        "status",
        "reviewed_by",
        "reviewed_at",
        "approval_remarks",
        "created_at",
        "updated_at"
      )
      .where({ user_id: normalizedUserId })
      .orderBy("created_at", "desc"),

    // PENDING PROFILE CHANGE REQUESTS
    knex("employee_profile_change_requests")
      .select(
        "id",
        "section",
        "record_id",
        "request_type",
        "existing_data",
        "requested_data",
        "status",
        "created_at",
        "updated_at"
      )
      .where({
        user_id: normalizedUserId,
        status: "PENDING",
      })
      .orderBy("created_at", "desc"),
  ]);

  // RESPONSE

  const {
    profile_id,
    profile_picture_mime_type,
    profile_picture_size_bytes,
    role,
    ...employeeData
  } = employee;

  return {
    success: true,
    message: "Employee profile fetched successfully",
    data: {
      employee: employeeData,

      profile: {
        profile_picture: {
  available: Boolean(profile_picture_mime_type),
  mime_type: profile_picture_mime_type,
  size_bytes: profile_picture_size_bytes,
  url: profile_picture_mime_type
    ? "/api/v1/employee-profile/me/profile-picture"
    : null,
},

        marital_status: employee.marital_status,
        father_spouse_name: employee.father_spouse_name,
        religion: employee.religion,
        caste: employee.caste,
        mother_tongue: employee.mother_tongue,
        cug_mobile_no: employee.cug_mobile_no,
        city_of_birth: employee.city_of_birth,
        country_of_birth: employee.country_of_birth,
        nationality: employee.nationality,
        community: employee.community,
        official_email: employee.official_email,
        retirement_age: employee.retirement_age,
        highest_qualification_level:
          employee.highest_qualification_level,
        blood_group: employee.blood_group,
        height_cm: employee.height_cm,
        weight_kg: employee.weight_kg,
        date_of_birth: employee.date_of_birth,
        secondary_mobile_no: employee.secondary_mobile_no,
        contact_email: employee.contact_email,
        created_at: employee.profile_created_at,
        updated_at: employee.profile_updated_at,
      },

      addresses,
      emergency_contacts: emergencyContacts,
      family_members: familyMembers,
      qualifications,
      work_experiences: workExperiences,

      identity_details: identityDetails || null,
      statutory_details: statutoryDetails || null,
      bank_details: bankDetails || null,

      documents,

      pending_requests: pendingRequests.map((request) => ({
        ...request,
        existing_data: sanitizeSensitiveData(
          request.existing_data
        ),
        requested_data: sanitizeSensitiveData(
          request.requested_data
        ),
      })),
    },
  };
}



// Private storage outside the public uploads directory
const PRIVATE_STORAGE_ROOT = path.resolve(
  __dirname,
  "../../storage/private"
);

const PROFILE_PICTURE_DIRECTORY = path.join(
  PRIVATE_STORAGE_ROOT,
  "profile-pictures"
);

function createProfileError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Detect image format using actual file signatures.
// Do not trust the MIME type or extension supplied by the client.
function detectImageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      mimeType: "image/jpeg",
      extension: "jpg",
    };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
      ])
    )
  ) {
    return {
      mimeType: "image/png",
      extension: "png",
    };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return {
      mimeType: "image/webp",
      extension: "webp",
    };
  }

  return null;
}

// Resolve only paths belonging to our private profile-picture directory.
function resolveProfilePicturePath(storedPath) {
  if (
    typeof storedPath !== "string" ||
    !storedPath.startsWith("profile-pictures/")
  ) {
    return null;
  }

  const filename = storedPath.slice("profile-pictures/".length);

  if (
    !filename ||
    filename !== path.basename(filename)
  ) {
    return null;
  }

  const absolutePath = path.resolve(
    PROFILE_PICTURE_DIRECTORY,
    filename
  );

  const relativePath = path.relative(
    PROFILE_PICTURE_DIRECTORY,
    absolutePath
  );

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return absolutePath;
}

// =====================================================
// UPLOAD / REPLACE PROFILE PICTURE
// =====================================================

async function uploadMyProfilePicture({ userId, file }) {
  if (!file || !file.buffer) {
    throw createProfileError(
      "PROFILE_PICTURE_REQUIRED",
      "Please select a profile picture"
    );
  }

  if (file.size > 2 * 1024 * 1024) {
    throw createProfileError(
      "FILE_TOO_LARGE",
      "Profile picture must not exceed 2 MB"
    );
  }

  const detectedImage = detectImageType(file.buffer);

  if (!detectedImage) {
    throw createProfileError(
      "INVALID_IMAGE_CONTENT",
      "The uploaded file is not a valid supported image"
    );
  }

  if (file.mimetype !== detectedImage.mimeType) {
    throw createProfileError(
      "IMAGE_TYPE_MISMATCH",
      "Image content does not match the uploaded file type"
    );
  }

  const profile = await knex("employee_profiles")
    .select(
      "id",
      "profile_picture_path"
    )
    .where({ user_id: userId })
    .first();

  if (!profile) {
    throw createProfileError(
      "PROFILE_NOT_FOUND",
      "Employee profile not found"
    );
  }

  await fs.mkdir(PROFILE_PICTURE_DIRECTORY, {
    recursive: true,
    mode: 0o700,
  });

  const filename =
    `${crypto.randomUUID()}.${detectedImage.extension}`;

  const absolutePath = path.join(
    PROFILE_PICTURE_DIRECTORY,
    filename
  );

  const databasePath = `profile-pictures/${filename}`;

  // Save new image before updating the database.
  await fs.writeFile(absolutePath, file.buffer, {
    flag: "wx",
    mode: 0o600,
  });

  try {
    await knex("employee_profiles")
      .where({ user_id: userId })
      .update({
        profile_picture_path: databasePath,
        profile_picture_mime_type: detectedImage.mimeType,
        profile_picture_size_bytes: file.size,
        updated_at: knex.fn.now(),
      });
  } catch (error) {
    // Remove newly uploaded image if DB update fails.
    await fs.unlink(absolutePath).catch(() => {});
    throw error;
  }

  // Remove previous image only after successful DB update.
  if (profile.profile_picture_path) {
    const oldPath = resolveProfilePicturePath(
      profile.profile_picture_path
    );

    if (oldPath && oldPath !== absolutePath) {
      await fs.unlink(oldPath).catch((error) => {
        console.error(
          "Old profile picture cleanup failed:",
          error.message
        );
      });
    }
  }

  return {
    success: true,
    message: "Profile picture uploaded successfully",
    data: {
      profile_picture: {
        available: true,
        mime_type: detectedImage.mimeType,
        size_bytes: file.size,
        url: "/api/v1/employee-profile/me/profile-picture",
      },
    },
  };
}

// =====================================================
// GET MY PROFILE PICTURE
// =====================================================

async function getMyProfilePicture({ userId }) {
  const profile = await knex("employee_profiles")
    .select(
      "profile_picture_path",
      "profile_picture_mime_type",
      "profile_picture_size_bytes"
    )
    .where({ user_id: userId })
    .first();

  if (!profile) {
    throw createProfileError(
      "PROFILE_NOT_FOUND",
      "Employee profile not found"
    );
  }

  if (!profile.profile_picture_path) {
    throw createProfileError(
      "PROFILE_PICTURE_NOT_FOUND",
      "Profile picture has not been uploaded"
    );
  }

  const absolutePath = resolveProfilePicturePath(
    profile.profile_picture_path
  );

  if (!absolutePath) {
    throw createProfileError(
      "INVALID_PROFILE_PICTURE_PATH",
      "Invalid profile picture storage path"
    );
  }

  let imageBuffer;

  try {
    imageBuffer = await fs.readFile(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw createProfileError(
        "PROFILE_PICTURE_FILE_NOT_FOUND",
        "Profile picture file not found"
      );
    }

    throw error;
  }

  return {
    buffer: imageBuffer,
    mimeType: profile.profile_picture_mime_type,
    sizeBytes: profile.profile_picture_size_bytes,
  };
}



// =====================================================
// SUBMIT PERSONAL DETAILS FOR ADMIN APPROVAL
// =====================================================

const PERSONAL_DETAIL_FIELDS = {
  marital_status: { type: "string", max: 50 },
  father_spouse_name: { type: "string", max: 150 },
  religion: { type: "string", max: 100 },
  caste: { type: "string", max: 100 },
  mother_tongue: { type: "string", max: 100 },
  cug_mobile_no: { type: "string", max: 20 },
  city_of_birth: { type: "string", max: 100 },
  country_of_birth: { type: "string", max: 100 },
  nationality: { type: "string", max: 100 },
  community: { type: "string", max: 100 },
  official_email: { type: "email", max: 255 },
  retirement_age: { type: "integer", min: 18, max: 100 },
  highest_qualification_level: {
    type: "string",
    max: 150,
  },
  blood_group: { type: "string", max: 10 },
  height_cm: { type: "decimal", min: 30, max: 300 },
  weight_kg: { type: "decimal", min: 1, max: 500 },
  date_of_birth: { type: "date" },
};

function createPersonalRequestError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validatePersonalDetails(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw createPersonalRequestError(
      "INVALID_PERSONAL_DETAILS",
      "Personal details must be provided as an object"
    );
  }

  const entries = Object.entries(input);

  if (entries.length === 0) {
    throw createPersonalRequestError(
      "EMPTY_PERSONAL_DETAILS",
      "Please provide at least one personal detail"
    );
  }

  const requestedData = {};

  for (const [key, rawValue] of entries) {
    const rule = PERSONAL_DETAIL_FIELDS[key];

    if (!rule) {
      throw createPersonalRequestError(
        "INVALID_PERSONAL_FIELD",
        `Field '${key}' is not allowed in personal details`
      );
    }

    // Allow null to clear a previously saved value.
    if (rawValue === null || rawValue === "") {
      requestedData[key] = null;
      continue;
    }

    if (rule.type === "string" || rule.type === "email") {
      if (typeof rawValue !== "string") {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          `${key} must be a string`
        );
      }

      const value = rawValue.trim();

      if (value.length > rule.max) {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          `${key} must not exceed ${rule.max} characters`
        );
      }

      if (
        rule.type === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ) {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          `${key} must be a valid email address`
        );
      }

      requestedData[key] = value;
      continue;
    }

    if (rule.type === "integer") {
      const value = Number(rawValue);

      if (
        !Number.isInteger(value) ||
        value < rule.min ||
        value > rule.max
      ) {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          `${key} must be an integer between ${rule.min} and ${rule.max}`
        );
      }

      requestedData[key] = value;
      continue;
    }

    if (rule.type === "decimal") {
      const value = Number(rawValue);

      if (
        !Number.isFinite(value) ||
        value < rule.min ||
        value > rule.max
      ) {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          `${key} must be between ${rule.min} and ${rule.max}`
        );
      }

      requestedData[key] = value;
      continue;
    }

    if (rule.type === "date") {
      if (
        typeof rawValue !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(rawValue)
      ) {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          "date_of_birth must use YYYY-MM-DD format"
        );
      }

      const [year, month, day] = rawValue
        .split("-")
        .map(Number);

      const parsedDate = new Date(
        Date.UTC(year, month - 1, day)
      );

      const isValidDate =
        parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day;

      if (!isValidDate) {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          "Please provide a valid date of birth"
        );
      }

      if (parsedDate > new Date()) {
        throw createPersonalRequestError(
          "INVALID_PERSONAL_FIELD_VALUE",
          "Date of birth cannot be in the future"
        );
      }

      requestedData[key] = rawValue;
    }
  }

  return requestedData;
}

// PERSONAL DETAILS REQUEST

async function submitPersonalDetailsRequest({
  userId,
  personalDetails,
}) {
  const requestedData = validatePersonalDetails(
    personalDetails
  );

  return knex.transaction(async (trx) => {
    // Lock the employee profile while creating a request.
    const profile = await trx("employee_profiles")
      .select("id", ...Object.keys(requestedData))
      .where({ user_id: userId })
      .forUpdate()
      .first();

    if (!profile) {
      throw createPersonalRequestError(
        "PROFILE_NOT_FOUND",
        "Employee profile not found"
      );
    }

    // Allow only one pending PERSONAL request at a time.
    const existingPendingRequest = await trx(
      "employee_profile_change_requests"
    )
      .select("id")
      .where({
        user_id: userId,
        section: "PERSONAL",
        status: "PENDING",
      })
      .first();

    if (existingPendingRequest) {
      throw createPersonalRequestError(
        "PERSONAL_REQUEST_ALREADY_PENDING",
        "You already have a pending personal details request. Wait for the admin to review it."
      );
    }

    // Snapshot only the fields the employee is changing.
    const existingData = {};

    for (const key of Object.keys(requestedData)) {
      existingData[key] = profile[key];
    }

    const [request] = await trx(
      "employee_profile_change_requests"
    )
      .insert({
        user_id: userId,
        section: "PERSONAL",
        record_id: profile.id,
        request_type: "UPDATE",
        existing_data: JSON.stringify(existingData),
        requested_data: JSON.stringify(requestedData),
        status: "PENDING",
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning([
        "id",
        "user_id",
        "section",
        "record_id",
        "request_type",
        "existing_data",
        "requested_data",
        "status",
        "created_at",
      ]);

    return {
      success: true,
      message: "Personal details submitted for admin approval",
      data: {
        request,
      },
    };
  });
}



// =====================================================
// ADMIN: LIST EMPLOYEE PROFILE CHANGE REQUESTS
// =====================================================


async function getAdminProfileChangeRequests({
  status = "PENDING",
  section,
  user_id,
  emp_code,
  request_type,
  from_date,
  to_date,
  page = 1,
  limit = 20,
}) {
  const normalizedStatus = String(status).trim().toUpperCase();
  const normalizedSection = section
    ? String(section).trim().toUpperCase()
    : null;
  const normalizedRequestType = request_type
    ? String(request_type).trim().toUpperCase()
    : null;

  const allowedStatuses = [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "ALL",
  ];

  const allowedSections = [
    "PERSONAL",
    "ADDRESS",
    "FAMILY",
    "QUALIFICATION",
    "IDENTITY",
    "STATUTORY",
    "BANK",
    "EXPERIENCE",
    "EMERGENCY_CONTACT",
    "DOCUMENT",
  ];

  const allowedRequestTypes = ["CREATE", "UPDATE", "DELETE"];

  if (!allowedStatuses.includes(normalizedStatus)) {
    throw createProfileError(
      "INVALID_REQUEST_STATUS",
      "Status must be PENDING, APPROVED, REJECTED, or ALL"
    );
  }

  if (
    normalizedSection &&
    !allowedSections.includes(normalizedSection)
  ) {
    throw createProfileError(
      "INVALID_REQUEST_SECTION",
      "Invalid profile request section"
    );
  }

  if (
    normalizedRequestType &&
    !allowedRequestTypes.includes(normalizedRequestType)
  ) {
    throw createProfileError(
      "INVALID_REQUEST_TYPE",
      "Request type must be CREATE, UPDATE, or DELETE"
    );
  }

  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isInteger(limitNumber) ||
    limitNumber < 1 ||
    limitNumber > 100
  ) {
    throw createProfileError(
      "INVALID_PAGINATION",
      "Page must be positive and limit must be between 1 and 100"
    );
  }

  let normalizedUserId = null;

  if (user_id !== undefined && user_id !== "") {
    normalizedUserId = Number(user_id);

    if (
      !Number.isInteger(normalizedUserId) ||
      normalizedUserId <= 0
    ) {
      throw createProfileError(
        "INVALID_USER_ID",
        "Invalid employee user ID"
      );
    }
  }

  const normalizedEmpCode = emp_code
    ? String(emp_code).trim()
    : null;

  if (normalizedEmpCode && normalizedEmpCode.length > 50) {
    throw createProfileError(
      "INVALID_EMP_CODE",
      "Employee code is invalid"
    );
  }

  function isValidDate(value) {
    if (!value) return true;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  if (!isValidDate(from_date) || !isValidDate(to_date)) {
    throw createProfileError(
      "INVALID_DATE_FILTER",
      "Dates must be valid and use YYYY-MM-DD format"
    );
  }

  if (from_date && to_date && from_date > to_date) {
    throw createProfileError(
      "INVALID_DATE_RANGE",
      "from_date cannot be later than to_date"
    );
  }

  const buildQuery = () => {
    const query = knex("employee_profile_change_requests as r")
      .leftJoin("users as u", "u.id", "r.user_id");

    if (normalizedStatus !== "ALL") {
      query.where("r.status", normalizedStatus);
    }

    if (normalizedSection) {
      query.andWhere("r.section", normalizedSection);
    }

    if (normalizedUserId !== null) {
      query.andWhere("r.user_id", normalizedUserId);
    }

    if (normalizedEmpCode) {
      query.andWhere("u.emp_code", normalizedEmpCode);
    }

    if (normalizedRequestType) {
      query.andWhere("r.request_type", normalizedRequestType);
    }

    if (from_date) {
      query.andWhereRaw(
        "r.created_at::date >= ?::date",
        [from_date]
      );
    }

    if (to_date) {
      query.andWhereRaw(
        "r.created_at::date <= ?::date",
        [to_date]
      );
    }

    return query;
  };

  const countResult = await buildQuery()
    .countDistinct({ total: "r.id" })
    .first();

  const total = Number(countResult.total || 0);

  const requests = await buildQuery()
    .select(
      "r.id",
      "r.user_id",
      "r.section",
      "r.record_id",
      "r.request_type",
      "r.existing_data",
      "r.requested_data",
      "r.status",
      "r.reviewed_by",
      "r.reviewed_at",
      "r.approval_remarks",
      "r.created_at",
      "r.updated_at",
      "u.emp_code",
      "u.name as employee_name",
      "u.email as employee_email",
      "u.designation"
    )
    .orderBy("r.created_at", "desc")
    .orderBy("r.id", "desc")
    .limit(limitNumber)
    .offset((pageNumber - 1) * limitNumber);

  return {
    success: true,
    message: "Employee profile requests fetched successfully",
    data: {
      requests: requests.map((request) => ({
        ...request,
        existing_data: sanitizeSensitiveData(
          request.existing_data
        ),
        requested_data: sanitizeSensitiveData(
          request.requested_data
        ),
      })),
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        total_pages: Math.ceil(total / limitNumber),
      },
    },
  };
}



// =====================================================
// ADMIN: GET EMPLOYEE PROFILE CHANGE REQUEST DETAIL
// =====================================================

async function getAdminProfileChangeRequestById({ requestId }) {
  const normalizedRequestId = Number(requestId);

  if (
    !Number.isInteger(normalizedRequestId) ||
    normalizedRequestId <= 0
  ) {
    throw createProfileError(
      "INVALID_REQUEST_ID",
      "Invalid profile change request ID"
    );
  }

  const request = await knex("employee_profile_change_requests as r")
    .leftJoin("users as u", "u.id", "r.user_id")
    .select(
      "r.id",
      "r.user_id",
      "r.section",
      "r.record_id",
      "r.request_type",
      "r.existing_data",
      "r.requested_data",
      "r.status",
      "r.reviewed_by",
      "r.reviewed_at",
      "r.approval_remarks",
      "r.created_at",
      "r.updated_at",
      "u.emp_code",
      "u.name as employee_name",
      "u.email as employee_email",
      "u.phone as employee_phone",
      "u.designation",
      "u.date_of_joining"
    )
    .where("r.id", normalizedRequestId)
    .first();

  if (!request) {
    throw createProfileError(
      "PROFILE_REQUEST_NOT_FOUND",
      "Employee profile change request not found"
    );
  }

  return {
    success: true,
    message: "Employee profile request fetched successfully",
    data: {
      request: {
        ...request,
        existing_data: sanitizeSensitiveData(request.existing_data),
        requested_data: sanitizeSensitiveData(request.requested_data),
      },
    },
  };
}


// =====================================================
// ADMIN: APPROVE PERSONAL DETAILS REQUEST
// =====================================================

async function approvePersonalDetailsRequest({
  requestId,
  adminId,
  approvalRemarks = null,
}) {
  const normalizedRequestId = Number(requestId);

  if (
    !Number.isInteger(normalizedRequestId) ||
    normalizedRequestId <= 0
  ) {
    throw createProfileError(
      "INVALID_REQUEST_ID",
      "Invalid profile change request ID"
    );
  }

  if (
    approvalRemarks !== null &&
    (
      typeof approvalRemarks !== "string" ||
      approvalRemarks.trim().length > 2000
    )
  ) {
    throw createProfileError(
      "INVALID_APPROVAL_REMARKS",
      "Approval remarks must be a string not exceeding 2000 characters"
    );
  }

  return knex.transaction(async (trx) => {
    const request = await trx("employee_profile_change_requests")
      .where({ id: normalizedRequestId })
      .forUpdate()
      .first();

    if (!request) {
      throw createProfileError(
        "PROFILE_REQUEST_NOT_FOUND",
        "Employee profile change request not found"
      );
    }

    if (request.status !== "PENDING") {
      throw createProfileError(
        "PROFILE_REQUEST_NOT_PENDING",
        "This profile request has already been reviewed"
      );
    }

    // This approval handler currently supports PERSONAL only.
    if (
      request.section !== "PERSONAL" ||
      request.request_type !== "UPDATE"
    ) {
      throw createProfileError(
        "UNSUPPORTED_PROFILE_REQUEST",
        "This approval endpoint currently supports PERSONAL update requests only"
      );
    }

    // Revalidate the stored request before applying it.
    const requestedData = validatePersonalDetails(
      request.requested_data
    );

    const profile = await trx("employee_profiles")
      .where({
        id: request.record_id,
        user_id: request.user_id,
      })
      .forUpdate()
      .first();

    if (!profile) {
      throw createProfileError(
        "PROFILE_NOT_FOUND",
        "Employee profile associated with this request was not found"
      );
    }

    // Update only the explicitly allowed personal fields.
    await trx("employee_profiles")
      .where({
        id: profile.id,
        user_id: request.user_id,
      })
      .update({
        ...requestedData,
        updated_at: trx.fn.now(),
      });

    await trx("employee_profile_change_requests")
      .where({ id: normalizedRequestId })
      .update({
        status: "APPROVED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks:
          approvalRemarks && approvalRemarks.trim()
            ? approvalRemarks.trim()
            : null,
        updated_at: trx.fn.now(),
      });

    return {
      success: true,
      message: "Personal details request approved successfully",
      data: {
        request_id: request.id,
        user_id: request.user_id,
        section: request.section,
        status: "APPROVED",
        updated_fields: Object.keys(requestedData),
        reviewed_by: adminId,
        approval_remarks:
          approvalRemarks && approvalRemarks.trim()
            ? approvalRemarks.trim()
            : null,
      },
    };
  });
}


// =====================================================
// ADMIN: REJECT PERSONAL DETAILS REQUEST
// =====================================================

async function rejectPersonalDetailsRequest({
  requestId,
  adminId,
  approvalRemarks,
}) {
  const normalizedRequestId = Number(requestId);

  if (
    !Number.isInteger(normalizedRequestId) ||
    normalizedRequestId <= 0
  ) {
    throw createProfileError(
      "INVALID_REQUEST_ID",
      "Invalid profile change request ID"
    );
  }

  if (
    typeof approvalRemarks !== "string" ||
    !approvalRemarks.trim() ||
    approvalRemarks.trim().length > 2000
  ) {
    throw createProfileError(
      "INVALID_APPROVAL_REMARKS",
      "Rejection remarks are required and must not exceed 2000 characters"
    );
  }

  return knex.transaction(async (trx) => {
    const request = await trx("employee_profile_change_requests")
      .where({ id: normalizedRequestId })
      .forUpdate()
      .first();

    if (!request) {
      throw createProfileError(
        "PROFILE_REQUEST_NOT_FOUND",
        "Employee profile change request not found"
      );
    }

    if (request.status !== "PENDING") {
      throw createProfileError(
        "PROFILE_REQUEST_NOT_PENDING",
        "This profile request has already been reviewed"
      );
    }

    if (
      request.section !== "PERSONAL" ||
      request.request_type !== "UPDATE"
    ) {
      throw createProfileError(
        "UNSUPPORTED_PROFILE_REQUEST",
        "This rejection endpoint currently supports PERSONAL update requests only"
      );
    }

    await trx("employee_profile_change_requests")
      .where({ id: normalizedRequestId })
      .update({
        status: "REJECTED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks: approvalRemarks.trim(),
        updated_at: trx.fn.now(),
      });

    return {
      success: true,
      message: "Personal details request rejected successfully",
      data: {
        request_id: request.id,
        user_id: request.user_id,
        section: request.section,
        status: "REJECTED",
        reviewed_by: adminId,
        approval_remarks: approvalRemarks.trim(),
      },
    };
  });
}



// ADDRESS RELATED API FUNCTION


/* =====================================================
   EMPLOYEE ADDRESS DETAILS
   ===================================================== */

const ADDRESS_FIELDS = [
  "address_line_1",
  "address_line_2",
  "address_line_3",
  "city",
  "district",
  "state",
  "pincode",
  "country",
];

const ADDRESS_TYPES = ["PERMANENT", "COMMUNICATION"];

function createAddressError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateAddressData(addressData) {
  if (
    !addressData ||
    typeof addressData !== "object" ||
    Array.isArray(addressData)
  ) {
    throw createAddressError(
      "INVALID_ADDRESS_DATA",
      "Address details must be a valid object"
    );
  }

  const addressType = String(
    addressData.address_type || ""
  ).trim().toUpperCase();

  if (!ADDRESS_TYPES.includes(addressType)) {
    throw createAddressError(
      "INVALID_ADDRESS_TYPE",
      "Address type must be PERMANENT or COMMUNICATION"
    );
  }

  const unknownFields = Object.keys(addressData).filter(
    (field) =>
      field !== "address_type" &&
      !ADDRESS_FIELDS.includes(field)
  );

  if (unknownFields.length > 0) {
    throw createAddressError(
      "INVALID_ADDRESS_FIELD",
      `Invalid address fields: ${unknownFields.join(", ")}`
    );
  }

  const normalizedData = {
    address_type: addressType,
  };

  for (const field of ADDRESS_FIELDS) {
    const value = addressData[field];

    if (value === undefined) {
      throw createAddressError(
        "MISSING_ADDRESS_FIELD",
        `${field} is required`
      );
    }

    if (value !== null && typeof value !== "string") {
      throw createAddressError(
        "INVALID_ADDRESS_FIELD_VALUE",
        `${field} must be a string or null`
      );
    }

    const normalizedValue =
      typeof value === "string" ? value.trim() : null;

    if (
      normalizedValue &&
      normalizedValue.length > 255
    ) {
      throw createAddressError(
        "INVALID_ADDRESS_FIELD_VALUE",
        `${field} cannot exceed 255 characters`
      );
    }

    normalizedData[field] = normalizedValue || null;
  }

  if (!normalizedData.address_line_1) {
    throw createAddressError(
      "INVALID_ADDRESS_FIELD_VALUE",
      "Address line 1 is required"
    );
  }

  if (!normalizedData.city) {
    throw createAddressError(
      "INVALID_ADDRESS_FIELD_VALUE",
      "City is required"
    );
  }

  if (!normalizedData.state) {
    throw createAddressError(
      "INVALID_ADDRESS_FIELD_VALUE",
      "State is required"
    );
  }

  if (!normalizedData.pincode) {
    throw createAddressError(
      "INVALID_ADDRESS_FIELD_VALUE",
      "Pincode is required"
    );
  }

  return normalizedData;
}


// =====================================================
// EMPLOYEE: SUBMIT ADDRESS REQUEST
// =====================================================

async function submitAddressRequest({
  userId,
  addressData,
}) {
  const normalizedData = validateAddressData(addressData);

  return knex.transaction(async (trx) => {
    const profile = await trx("employee_profiles")
      .where({ user_id: userId })
      .first();

    if (!profile) {
      throw createAddressError(
        "PROFILE_NOT_FOUND",
        "Employee profile not found"
      );
    }

    const existingAddress = await trx("employee_addresses")
      .where({
        user_id: userId,
        address_type: normalizedData.address_type,
      })
      .first();

    const requestType = existingAddress ? "UPDATE" : "CREATE";

    // Prevent another pending request for this address type.
    const pendingRequests = await trx(
      "employee_profile_change_requests"
    )
      .where({
        user_id: userId,
        section: "ADDRESS",
        status: "PENDING",
      })
      .select("id", "requested_data");

    const alreadyPending = pendingRequests.some((request) => {
      const requestedData = request.requested_data || {};

      return (
        requestedData.address_type ===
        normalizedData.address_type
      );
    });

    if (alreadyPending) {
      throw createAddressError(
        "ADDRESS_REQUEST_ALREADY_PENDING",
        `A pending ${normalizedData.address_type.toLowerCase()} address request already exists`
      );
    }

    const existingData = existingAddress
      ? {
          address_type: existingAddress.address_type,
          ...Object.fromEntries(
            ADDRESS_FIELDS.map((field) => [
              field,
              existingAddress[field] ?? null,
            ])
          ),
        }
      : {};

    const [request] = await trx(
      "employee_profile_change_requests"
    )
      .insert({
        user_id: userId,
        section: "ADDRESS",
        record_id: existingAddress
          ? existingAddress.id
          : null,
        request_type: requestType,
        existing_data: JSON.stringify(existingData),
        requested_data: JSON.stringify(normalizedData),
        status: "PENDING",
      })
      .returning([
        "id",
        "user_id",
        "section",
        "record_id",
        "request_type",
        "status",
        "created_at",
      ]);

    return {
      success: true,
      message: "Address change request submitted successfully",
      data: {
        request,
      },
    };
  });
}


// =====================================================
// EMPLOYEE: GET MY ADDRESSES
// =====================================================

async function getMyAddresses({ userId }) {
  const profile = await knex("employee_profiles")
    .where({ user_id: userId })
    .first();

  if (!profile) {
    throw createAddressError(
      "PROFILE_NOT_FOUND",
      "Employee profile not found"
    );
  }

  const addresses = await knex("employee_addresses")
    .where({ user_id: userId })
    .select(
      "id",
      "user_id",
      "address_type",
      ...ADDRESS_FIELDS,
      "created_at",
      "updated_at"
    )
    .orderBy("address_type", "asc");

  const pendingRequests = await knex(
    "employee_profile_change_requests"
  )
    .where({
      user_id: userId,
      section: "ADDRESS",
      status: "PENDING",
    })
    .select(
      "id",
      "record_id",
      "request_type",
      "existing_data",
      "requested_data",
      "status",
      "created_at"
    )
    .orderBy("created_at", "desc");

  return {
    success: true,
    message: "Employee addresses fetched successfully",
    data: {
      addresses,
      pending_requests: pendingRequests,
    },
  };
}


// =====================================================
// ADMIN: APPROVE ADDRESS REQUEST
// =====================================================

async function approveAddressRequest({
  requestId,
  adminId,
  approvalRemarks = null,
}) {
  const normalizedRequestId = Number(requestId);

  if (
    !Number.isInteger(normalizedRequestId) ||
    normalizedRequestId <= 0
  ) {
    throw createAddressError(
      "INVALID_REQUEST_ID",
      "Invalid profile request ID"
    );
  }

  if (
    approvalRemarks !== null &&
    (
      typeof approvalRemarks !== "string" ||
      approvalRemarks.trim().length > 1000
    )
  ) {
    throw createAddressError(
      "INVALID_APPROVAL_REMARKS",
      "Approval remarks must be a string with a maximum of 1000 characters"
    );
  }

  return knex.transaction(async (trx) => {
    const request = await trx(
      "employee_profile_change_requests"
    )
      .where({ id: normalizedRequestId })
      .forUpdate()
      .first();

    if (!request) {
      throw createAddressError(
        "PROFILE_REQUEST_NOT_FOUND",
        "Profile change request not found"
      );
    }

    if (
      request.section !== "ADDRESS" ||
      !["CREATE", "UPDATE"].includes(request.request_type)
    ) {
      throw createAddressError(
        "UNSUPPORTED_PROFILE_REQUEST",
        "This request is not a supported address request"
      );
    }

    if (request.status !== "PENDING") {
      throw createAddressError(
        "PROFILE_REQUEST_NOT_PENDING",
        "This profile request has already been reviewed"
      );
    }

    let normalizedData;

    try {
      normalizedData = validateAddressData(
        request.requested_data
      );
    } catch (error) {
      throw createAddressError(
        "INVALID_ADDRESS_REQUEST_DATA",
        "Stored address request data is invalid and cannot be approved"
      );
    }

    const profile = await trx("employee_profiles")
      .where({ user_id: request.user_id })
      .first();

    if (!profile) {
      throw createAddressError(
        "PROFILE_NOT_FOUND",
        "Employee profile not found"
      );
    }

    const addressData = {
      user_id: request.user_id,
      ...normalizedData,
      updated_at: trx.fn.now(),
    };

    if (request.request_type === "CREATE") {
      // Protect against a duplicate address created elsewhere.
      const existingAddress = await trx("employee_addresses")
        .where({
          user_id: request.user_id,
          address_type: normalizedData.address_type,
        })
        .first();

      if (existingAddress) {
        throw createAddressError(
          "ADDRESS_ALREADY_EXISTS",
          "An address of this type already exists. Please review the request."
        );
      }

      addressData.created_at = trx.fn.now();

      await trx("employee_addresses").insert(addressData);
    } else {
      const existingAddress = await trx("employee_addresses")
        .where({
          id: request.record_id,
          user_id: request.user_id,
          address_type: normalizedData.address_type,
        })
        .forUpdate()
        .first();

      if (!existingAddress) {
        throw createAddressError(
          "ADDRESS_NOT_FOUND",
          "Existing address record not found"
        );
      }

      await trx("employee_addresses")
        .where({
          id: existingAddress.id,
          user_id: request.user_id,
        })
        .update(addressData);
    }

    await trx("employee_profile_change_requests")
      .where({ id: normalizedRequestId })
      .update({
        status: "APPROVED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks:
          approvalRemarks?.trim() || null,
        updated_at: trx.fn.now(),
      });

    return {
      success: true,
      message: "Address request approved successfully",
      data: {
        request_id: String(normalizedRequestId),
        user_id: String(request.user_id),
        section: "ADDRESS",
        status: "APPROVED",
        address_type: normalizedData.address_type,
        updated_fields: ADDRESS_FIELDS,
        reviewed_by: String(adminId),
        approval_remarks:
          approvalRemarks?.trim() || null,
      },
    };
  });
}


// =====================================================
// ADMIN: REJECT ADDRESS REQUEST
// =====================================================

async function rejectAddressRequest({
  requestId,
  adminId,
  approvalRemarks,
}) {
  const normalizedRequestId = Number(requestId);

  if (
    !Number.isInteger(normalizedRequestId) ||
    normalizedRequestId <= 0
  ) {
    throw createAddressError(
      "INVALID_REQUEST_ID",
      "Invalid profile request ID"
    );
  }

  if (
    typeof approvalRemarks !== "string" ||
    !approvalRemarks.trim() ||
    approvalRemarks.trim().length > 1000
  ) {
    throw createAddressError(
      "INVALID_APPROVAL_REMARKS",
      "Rejection remarks are required and cannot exceed 1000 characters"
    );
  }

  return knex.transaction(async (trx) => {
    const request = await trx(
      "employee_profile_change_requests"
    )
      .where({ id: normalizedRequestId })
      .forUpdate()
      .first();

    if (!request) {
      throw createAddressError(
        "PROFILE_REQUEST_NOT_FOUND",
        "Profile change request not found"
      );
    }

    if (
      request.section !== "ADDRESS" ||
      !["CREATE", "UPDATE"].includes(request.request_type)
    ) {
      throw createAddressError(
        "UNSUPPORTED_PROFILE_REQUEST",
        "This request is not a supported address request"
      );
    }

    if (request.status !== "PENDING") {
      throw createAddressError(
        "PROFILE_REQUEST_NOT_PENDING",
        "This profile request has already been reviewed"
      );
    }

    await trx("employee_profile_change_requests")
      .where({ id: normalizedRequestId })
      .update({
        status: "REJECTED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks: approvalRemarks.trim(),
        updated_at: trx.fn.now(),
      });

    return {
      success: true,
      message: "Address request rejected successfully",
      data: {
        request_id: String(normalizedRequestId),
        user_id: String(request.user_id),
        section: "ADDRESS",
        status: "REJECTED",
        reviewed_by: String(adminId),
        approval_remarks: approvalRemarks.trim(),
      },
    };
  });
}



// =====================================================
// EMERGENCY CONTACT DETAILS
// =====================================================

const EMERGENCY_CONTACT_FIELDS = [
  "contact_name",
  "relation",
  "mobile_no",
  "alternate_mobile_no",
  "address",
  "is_primary",
];

const EMERGENCY_CONTACT_OPTIONAL_FIELDS = [
  "relation",
  "alternate_mobile_no",
  "address",
];

function createEmergencyContactError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateEmergencyContactData(data, options = {}) {
  const { allowPartial = false } = options;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createEmergencyContactError(
      "INVALID_EMERGENCY_CONTACT_DATA",
      "Emergency contact data must be a valid object"
    );
  }

  const keys = Object.keys(data);

  if (!keys.length) {
    throw createEmergencyContactError(
      "EMPTY_EMERGENCY_CONTACT_DATA",
      "Please provide emergency contact details"
    );
  }

  for (const key of keys) {
    if (!EMERGENCY_CONTACT_FIELDS.includes(key)) {
      throw createEmergencyContactError(
        "INVALID_EMERGENCY_CONTACT_FIELD",
        `Field '${key}' is not allowed`
      );
    }
  }

  const normalized = {};

  for (const key of keys) {
    const value = data[key];

    if (key === "is_primary") {
      if (typeof value !== "boolean") {
        throw createEmergencyContactError(
          "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
          "is_primary must be true or false"
        );
      }

      normalized[key] = value;
      continue;
    }

    if (value === null || value === "") {
      if (
        key === "contact_name" ||
        key === "mobile_no"
      ) {
        throw createEmergencyContactError(
          "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
          `${key} cannot be empty`
        );
      }

      if (!EMERGENCY_CONTACT_OPTIONAL_FIELDS.includes(key)) {
        throw createEmergencyContactError(
          "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
          `${key} cannot be empty`
        );
      }

      normalized[key] = null;
      continue;
    }

    if (typeof value !== "string") {
      throw createEmergencyContactError(
        "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
        `${key} must be a string`
      );
    }

    const trimmed = value.trim();

    if (key === "contact_name" && !trimmed) {
      throw createEmergencyContactError(
        "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
        "Contact name is required"
      );
    }

    if (key === "mobile_no" || key === "alternate_mobile_no") {
      if (
        trimmed &&
        (!/^[+0-9\s()-]+$/.test(trimmed) ||
          trimmed.replace(/\D/g, "").length < 7 ||
          trimmed.replace(/\D/g, "").length > 15)
      ) {
        throw createEmergencyContactError(
          "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
          `${key} must contain a valid phone number`
        );
      }
    }

    const maxLength =
      key === "contact_name" ? 150 :
      key === "relation" ? 100 :
      key === "mobile_no" || key === "alternate_mobile_no" ? 20 :
      null;

    if (maxLength && trimmed.length > maxLength) {
      throw createEmergencyContactError(
        "INVALID_EMERGENCY_CONTACT_FIELD_VALUE",
        `${key} cannot exceed ${maxLength} characters`
      );
    }

    normalized[key] = trimmed;
  }

  if (!allowPartial) {
    if (!normalized.contact_name) {
      throw createEmergencyContactError(
        "MISSING_EMERGENCY_CONTACT_NAME",
        "Contact name is required"
      );
    }

    if (!normalized.mobile_no) {
      throw createEmergencyContactError(
        "MISSING_EMERGENCY_CONTACT_MOBILE",
        "Mobile number is required"
      );
    }
  }

  return normalized;
}

// =====================================================
// EMPLOYEE: SUBMIT EMERGENCY CONTACT REQUEST
// =====================================================

async function submitEmergencyContactRequest({
  userId,
  contactData,
}) {
  return knex.transaction(async (trx) => {
    const user = await trx("users")
      .where({ id: userId })
      .forUpdate()
      .first();

    if (!user) {
      throw createEmergencyContactError(
        "PROFILE_NOT_FOUND",
        "Employee profile was not found"
      );
    }

    if (
      !contactData ||
      typeof contactData !== "object" ||
      Array.isArray(contactData)
    ) {
      throw createEmergencyContactError(
        "INVALID_EMERGENCY_CONTACT_DATA",
        "Please provide valid emergency contact data"
      );
    }

    const requestType = String(
      contactData.request_type || "CREATE"
    ).toUpperCase();

    if (!["CREATE", "UPDATE", "DELETE"].includes(requestType)) {
      throw createEmergencyContactError(
        "INVALID_EMERGENCY_CONTACT_REQUEST_TYPE",
        "Request type must be CREATE, UPDATE or DELETE"
      );
    }

    let recordId = null;
    let existingData = {};
    let requestedData = {};

    if (requestType === "CREATE") {
      if (contactData.id !== undefined) {
        throw createEmergencyContactError(
          "INVALID_EMERGENCY_CONTACT_ID",
          "Do not provide an ID when creating a contact"
        );
      }

      const input = { ...contactData };
      delete input.request_type;

      requestedData = validateEmergencyContactData(input);

      if (requestedData.is_primary === undefined) {
        requestedData.is_primary = false;
      }

      if (requestedData.relation === undefined) {
        requestedData.relation = null;
      }

      if (requestedData.alternate_mobile_no === undefined) {
        requestedData.alternate_mobile_no = null;
      }

      if (requestedData.address === undefined) {
        requestedData.address = null;
      }
    } else {
      recordId = contactData.id;

      if (
        recordId === undefined ||
        recordId === null ||
        !/^\d+$/.test(String(recordId))
      ) {
        throw createEmergencyContactError(
          "INVALID_EMERGENCY_CONTACT_ID",
          "A valid emergency contact ID is required"
        );
      }

      const existingContact = await trx("employee_emergency_contacts")
        .where({
          id: recordId,
          user_id: userId,
          status: "ACTIVE",
        })
        .forUpdate()
        .first();

      if (!existingContact) {
        throw createEmergencyContactError(
          "EMERGENCY_CONTACT_NOT_FOUND",
          "Active emergency contact was not found"
        );
      }

      existingData = {
        contact_name: existingContact.contact_name,
        relation: existingContact.relation,
        mobile_no: existingContact.mobile_no,
        alternate_mobile_no: existingContact.alternate_mobile_no,
        address: existingContact.address,
        is_primary: existingContact.is_primary,
      };

      if (requestType === "UPDATE") {
        const input = { ...contactData };
        delete input.request_type;
        delete input.id;

        const changes = validateEmergencyContactData(input, {
          allowPartial: true,
        });

        requestedData = {
          ...existingData,
          ...changes,
        };

        // Validate the complete updated contact.
        requestedData = validateEmergencyContactData(
          requestedData
        );
      } else {
        const extraFields = Object.keys(contactData).filter(
          (key) => !["request_type", "id"].includes(key)
        );

        if (extraFields.length) {
          throw createEmergencyContactError(
            "INVALID_EMERGENCY_CONTACT_DATA",
            "DELETE requests must contain only request_type and id"
          );
        }

        requestedData = {};
      }
    }

    // Prevent another pending request for the same contact.
    const pendingRequests = await trx("employee_profile_change_requests")
      .where({
        user_id: userId,
        section: "EMERGENCY_CONTACT",
        status: "PENDING",
      })
      .select("id", "record_id", "request_type");

    const duplicatePending = pendingRequests.some((request) => {
      if (requestType === "CREATE") {
        return request.request_type === "CREATE";
      }

      return String(request.record_id) === String(recordId);
    });

    if (duplicatePending) {
      throw createEmergencyContactError(
        "EMERGENCY_CONTACT_REQUEST_ALREADY_PENDING",
        "A pending request already exists for this emergency contact"
      );
    }

    const [request] = await trx("employee_profile_change_requests")
      .insert({
        user_id: userId,
        section: "EMERGENCY_CONTACT",
        record_id: recordId,
        request_type: requestType,
        existing_data: JSON.stringify(existingData),
        requested_data: JSON.stringify(requestedData),
        status: "PENDING",
      })
      .returning([
        "id",
        "user_id",
        "section",
        "record_id",
        "request_type",
        "status",
        "created_at",
      ]);

    return { request };
  });
}

// =====================================================
// EMPLOYEE: GET MY EMERGENCY CONTACTS
// =====================================================

async function getMyEmergencyContacts({ userId }) {
  const user = await knex("users")
    .where({ id: userId })
    .first("id");

  if (!user) {
    throw createEmergencyContactError(
      "PROFILE_NOT_FOUND",
      "Employee profile was not found"
    );
  }

  const contacts = await knex("employee_emergency_contacts")
    .where({
      user_id: userId,
      status: "ACTIVE",
    })
    .select(
      "id",
      "contact_name",
      "relation",
      "mobile_no",
      "alternate_mobile_no",
      "address",
      "is_primary",
      "status",
      "created_at",
      "updated_at"
    )
    .orderBy([
      { column: "is_primary", order: "desc" },
      { column: "created_at", order: "asc" },
    ]);

  const pendingRequests = await knex("employee_profile_change_requests")
    .where({
      user_id: userId,
      section: "EMERGENCY_CONTACT",
      status: "PENDING",
    })
    .select(
      "id",
      "record_id",
      "request_type",
      "existing_data",
      "requested_data",
      "status",
      "created_at"
    )
    .orderBy("created_at", "desc");

  return {
    contacts,
    pending_requests: pendingRequests,
  };
}

// =====================================================
// ADMIN: APPROVE EMERGENCY CONTACT REQUEST
// =====================================================

async function approveEmergencyContactRequest({
  requestId,
  adminId,
  approvalRemarks = null,
}) {
  return knex.transaction(async (trx) => {
    const request = await trx("employee_profile_change_requests")
      .where({
        id: requestId,
        section: "EMERGENCY_CONTACT",
      })
      .forUpdate()
      .first();

    if (!request) {
      throw createEmergencyContactError(
        "PROFILE_CHANGE_REQUEST_NOT_FOUND",
        "Emergency contact request was not found"
      );
    }

    if (request.status !== "PENDING") {
      throw createEmergencyContactError(
        "PROFILE_CHANGE_REQUEST_NOT_PENDING",
        "This request has already been reviewed"
      );
    }

    if (!["CREATE", "UPDATE", "DELETE"].includes(request.request_type)) {
      throw createEmergencyContactError(
        "UNSUPPORTED_EMERGENCY_CONTACT_REQUEST",
        "Unsupported emergency contact request type"
      );
    }

    if (
      approvalRemarks !== null &&
      (typeof approvalRemarks !== "string" ||
        approvalRemarks.trim().length > 1000)
    ) {
      throw createEmergencyContactError(
        "INVALID_APPROVAL_REMARKS",
        "Approval remarks must be a string of up to 1000 characters"
      );
    }

    // Serialize approval changes for this employee.
    const user = await trx("users")
      .where({ id: request.user_id })
      .forUpdate()
      .first("id");

    if (!user) {
      throw createEmergencyContactError(
        "PROFILE_NOT_FOUND",
        "Employee was not found"
      );
    }

    const requestedData =
      typeof request.requested_data === "string"
        ? JSON.parse(request.requested_data)
        : request.requested_data || {};

    let contact;
    let updatedFields = [];

    if (request.request_type === "CREATE") {
      const data = validateEmergencyContactData(requestedData);

      const insertData = {
        user_id: request.user_id,
        contact_name: data.contact_name,
        relation: data.relation ?? null,
        mobile_no: data.mobile_no,
        alternate_mobile_no: data.alternate_mobile_no ?? null,
        address: data.address ?? null,
        is_primary: data.is_primary ?? false,
        status: "ACTIVE",
      };

      if (insertData.is_primary) {
        await trx("employee_emergency_contacts")
          .where({
            user_id: request.user_id,
            status: "ACTIVE",
          })
          .update({
            is_primary: false,
            updated_at: trx.fn.now(),
          });
      }

      [contact] = await trx("employee_emergency_contacts")
        .insert(insertData)
        .returning([
          "id",
          "user_id",
          "contact_name",
          "relation",
          "mobile_no",
          "alternate_mobile_no",
          "address",
          "is_primary",
          "status",
        ]);

      updatedFields = Object.keys(insertData).filter(
        (key) => !["user_id", "status"].includes(key)
      );
    } else {
      const existingContact = await trx("employee_emergency_contacts")
        .where({
          id: request.record_id,
          user_id: request.user_id,
        })
        .forUpdate()
        .first();

      if (!existingContact) {
        throw createEmergencyContactError(
          "EMERGENCY_CONTACT_NOT_FOUND",
          "Emergency contact was not found"
        );
      }

      if (existingContact.status !== "ACTIVE") {
        throw createEmergencyContactError(
          "EMERGENCY_CONTACT_NOT_ACTIVE",
          "This emergency contact is no longer active"
        );
      }

      if (request.request_type === "UPDATE") {
        const data = validateEmergencyContactData(requestedData);

        const updateData = {
          contact_name: data.contact_name,
          relation: data.relation ?? null,
          mobile_no: data.mobile_no,
          alternate_mobile_no: data.alternate_mobile_no ?? null,
          address: data.address ?? null,
          is_primary: data.is_primary ?? false,
          updated_at: trx.fn.now(),
        };

        if (updateData.is_primary) {
          await trx("employee_emergency_contacts")
            .where({
              user_id: request.user_id,
              status: "ACTIVE",
            })
            .whereNot("id", request.record_id)
            .update({
              is_primary: false,
              updated_at: trx.fn.now(),
            });
        }

        await trx("employee_emergency_contacts")
          .where({
            id: request.record_id,
            user_id: request.user_id,
          })
          .update(updateData);

        contact = await trx("employee_emergency_contacts")
          .where({ id: request.record_id })
          .first(
            "id",
            "user_id",
            "contact_name",
            "relation",
            "mobile_no",
            "alternate_mobile_no",
            "address",
            "is_primary",
            "status"
          );

        updatedFields = Object.keys(updateData).filter(
          (key) => key !== "updated_at"
        );
      } else {
        await trx("employee_emergency_contacts")
          .where({
            id: request.record_id,
            user_id: request.user_id,
          })
          .update({
            status: "INACTIVE",
            is_primary: false,
            updated_at: trx.fn.now(),
          });

        contact = {
          id: String(request.record_id),
          user_id: String(request.user_id),
          status: "INACTIVE",
        };

        updatedFields = ["status", "is_primary"];
      }
    }

    const [updatedRequest] = await trx(
      "employee_profile_change_requests"
    )
      .where({ id: requestId })
      .update({
        status: "APPROVED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks: approvalRemarks
          ? approvalRemarks.trim()
          : null,
        updated_at: trx.fn.now(),
      })
      .returning(["id", "user_id", "section", "status"]);

    return {
      request: updatedRequest,
      contact,
      updated_fields: updatedFields,
    };
  });
}

// =====================================================
// ADMIN: REJECT EMERGENCY CONTACT REQUEST
// =====================================================

async function rejectEmergencyContactRequest({
  requestId,
  adminId,
  approvalRemarks,
}) {
  return knex.transaction(async (trx) => {
    const request = await trx("employee_profile_change_requests")
      .where({
        id: requestId,
        section: "EMERGENCY_CONTACT",
      })
      .forUpdate()
      .first();

    if (!request) {
      throw createEmergencyContactError(
        "PROFILE_CHANGE_REQUEST_NOT_FOUND",
        "Emergency contact request was not found"
      );
    }

    if (request.status !== "PENDING") {
      throw createEmergencyContactError(
        "PROFILE_CHANGE_REQUEST_NOT_PENDING",
        "This request has already been reviewed"
      );
    }

    if (
      typeof approvalRemarks !== "string" ||
      !approvalRemarks.trim() ||
      approvalRemarks.trim().length > 1000
    ) {
      throw createEmergencyContactError(
        "INVALID_APPROVAL_REMARKS",
        "Please provide rejection remarks (maximum 1000 characters)"
      );
    }

    const [updatedRequest] = await trx(
      "employee_profile_change_requests"
    )
      .where({ id: requestId })
      .update({
        status: "REJECTED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks: approvalRemarks.trim(),
        updated_at: trx.fn.now(),
      })
      .returning([
        "id",
        "user_id",
        "section",
        "status",
        "reviewed_by",
        "approval_remarks",
      ]);

    return { request: updatedRequest };
  });
}


// =====================================================
// FAMILY MEMBER DETAILS
// =====================================================

const FAMILY_MEMBER_FIELDS = [
  "name",
  "relation",
  "gender",
  "date_of_birth",
  "profession",
  "family_member_type",
  "address",
  "remarks",
];

const FAMILY_MEMBER_TYPES = [
  "FAMILY_MEMBER",
  "DEPENDENT",
];

function createFamilyMemberError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// =====================================================
// VALIDATE FAMILY MEMBER DATA
// =====================================================

function validateFamilyMemberData(data, options = {}) {
  const { allowPartial = false } = options;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createFamilyMemberError(
      "INVALID_FAMILY_MEMBER_DATA",
      "Family member data must be a valid object"
    );
  }

  const keys = Object.keys(data);

  if (!keys.length) {
    throw createFamilyMemberError(
      "EMPTY_FAMILY_MEMBER_DATA",
      "Please provide family member details"
    );
  }

  const normalized = {};

  for (const key of keys) {
    if (!FAMILY_MEMBER_FIELDS.includes(key)) {
      throw createFamilyMemberError(
        "INVALID_FAMILY_MEMBER_FIELD",
        `Field '${key}' is not allowed`
      );
    }

    const value = data[key];

    if (key === "date_of_birth") {
      if (value === null || value === "") {
        normalized[key] = null;
        continue;
      }

      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
      ) {
        throw createFamilyMemberError(
          "INVALID_FAMILY_MEMBER_FIELD_VALUE",
          "date_of_birth must be in YYYY-MM-DD format"
        );
      }

      const parsedDate = new Date(`${value}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== value
      ) {
        throw createFamilyMemberError(
          "INVALID_FAMILY_MEMBER_FIELD_VALUE",
          "Please provide a valid date of birth"
        );
      }

      const today = new Date().toISOString().slice(0, 10);

      if (value > today) {
        throw createFamilyMemberError(
          "INVALID_FAMILY_MEMBER_FIELD_VALUE",
          "Date of birth cannot be in the future"
        );
      }

      normalized[key] = value;
      continue;
    }

    if (value === null || value === "") {
      if (["name", "relation", "family_member_type"].includes(key)) {
        throw createFamilyMemberError(
          "INVALID_FAMILY_MEMBER_FIELD_VALUE",
          `${key} cannot be empty`
        );
      }

      normalized[key] = null;
      continue;
    }

    if (typeof value !== "string") {
      throw createFamilyMemberError(
        "INVALID_FAMILY_MEMBER_FIELD_VALUE",
        `${key} must be a string`
      );
    }

    const trimmed = value.trim();

    if (!trimmed) {
      if (["name", "relation", "family_member_type"].includes(key)) {
        throw createFamilyMemberError(
          "INVALID_FAMILY_MEMBER_FIELD_VALUE",
          `${key} cannot be empty`
        );
      }

      normalized[key] = null;
      continue;
    }

    const maxLengths = {
      name: 150,
      relation: 100,
      gender: 20,
      profession: 150,
      family_member_type: 30,
    };

    if (
      maxLengths[key] &&
      trimmed.length > maxLengths[key]
    ) {
      throw createFamilyMemberError(
        "INVALID_FAMILY_MEMBER_FIELD_VALUE",
        `${key} cannot exceed ${maxLengths[key]} characters`
      );
    }

    if (
      key === "family_member_type" &&
      !FAMILY_MEMBER_TYPES.includes(trimmed.toUpperCase())
    ) {
      throw createFamilyMemberError(
        "INVALID_FAMILY_MEMBER_TYPE",
        "family_member_type must be FAMILY_MEMBER or DEPENDENT"
      );
    }

    normalized[key] =
      key === "family_member_type"
        ? trimmed.toUpperCase()
        : trimmed;
  }

  if (!allowPartial) {
    for (const requiredField of [
      "name",
      "relation",
      "family_member_type",
    ]) {
      if (!normalized[requiredField]) {
        throw createFamilyMemberError(
          "MISSING_FAMILY_MEMBER_FIELD",
          `${requiredField} is required`
        );
      }
    }
  }

  return normalized;
}

// =====================================================
// EMPLOYEE: SUBMIT FAMILY MEMBER REQUEST
// =====================================================

async function submitFamilyMemberRequest({
  userId,
  familyMemberData,
}) {
  return knex.transaction(async (trx) => {
    const user = await trx("users")
      .where({ id: userId })
      .forUpdate()
      .first("id");

    if (!user) {
      throw createFamilyMemberError(
        "PROFILE_NOT_FOUND",
        "Employee was not found"
      );
    }

    if (
      !familyMemberData ||
      typeof familyMemberData !== "object" ||
      Array.isArray(familyMemberData)
    ) {
      throw createFamilyMemberError(
        "INVALID_FAMILY_MEMBER_DATA",
        "Please provide valid family member data"
      );
    }

    const requestType = String(
      familyMemberData.request_type || "CREATE"
    ).toUpperCase();

    if (!["CREATE", "UPDATE", "DELETE"].includes(requestType)) {
      throw createFamilyMemberError(
        "INVALID_FAMILY_MEMBER_REQUEST_TYPE",
        "Request type must be CREATE, UPDATE or DELETE"
      );
    }

    let recordId = null;
    let existingData = {};
    let requestedData = {};

    if (requestType === "CREATE") {
      if (familyMemberData.id !== undefined) {
        throw createFamilyMemberError(
          "INVALID_FAMILY_MEMBER_ID",
          "Do not provide an ID when creating a family member"
        );
      }

      const input = { ...familyMemberData };
      delete input.request_type;

      requestedData = validateFamilyMemberData(input);

      // Optional fields are stored consistently.
      for (const field of FAMILY_MEMBER_FIELDS) {
        if (requestedData[field] === undefined) {
          requestedData[field] = null;
        }
      }
    } else {
      recordId = familyMemberData.id;

      if (
        recordId === undefined ||
        recordId === null ||
        !/^\d+$/.test(String(recordId))
      ) {
        throw createFamilyMemberError(
          "INVALID_FAMILY_MEMBER_ID",
          "A valid family member ID is required"
        );
      }

      const existingMember = await trx("employee_family_members")
        .where({
          id: recordId,
          user_id: userId,
          status: "ACTIVE",
        })
        .forUpdate()
        .first();

      if (!existingMember) {
        throw createFamilyMemberError(
          "FAMILY_MEMBER_NOT_FOUND",
          "Active family member was not found"
        );
      }

      existingData = {
        name: existingMember.name,
        relation: existingMember.relation,
        gender: existingMember.gender,
        date_of_birth: existingMember.date_of_birth
          ? String(existingMember.date_of_birth).slice(0, 10)
          : null,
        profession: existingMember.profession,
        family_member_type: existingMember.family_member_type,
        address: existingMember.address,
        remarks: existingMember.remarks,
      };

      if (requestType === "UPDATE") {
        const input = { ...familyMemberData };
        delete input.request_type;
        delete input.id;

        const changes = validateFamilyMemberData(input, {
          allowPartial: true,
        });

        requestedData = validateFamilyMemberData({
          ...existingData,
          ...changes,
        });
      } else {
        const extraFields = Object.keys(familyMemberData).filter(
          (key) => !["request_type", "id"].includes(key)
        );

        if (extraFields.length) {
          throw createFamilyMemberError(
            "INVALID_FAMILY_MEMBER_DATA",
            "DELETE requests must contain only request_type and id"
          );
        }

        requestedData = {};
      }
    }

    // Prevent multiple pending requests for the same existing record.
    // Multiple CREATE requests are allowed for different family members.
    if (requestType !== "CREATE") {
      const pendingRequest = await trx(
        "employee_profile_change_requests"
      )
        .where({
          user_id: userId,
          section: "FAMILY_MEMBER",
          record_id: recordId,
          status: "PENDING",
        })
        .first("id");

      if (pendingRequest) {
        throw createFamilyMemberError(
          "FAMILY_MEMBER_REQUEST_ALREADY_PENDING",
          "A pending request already exists for this family member"
        );
      }
    }

    const [request] = await trx(
      "employee_profile_change_requests"
    )
      .insert({
        user_id: userId,
        section: "FAMILY_MEMBER",
        record_id: recordId,
        request_type: requestType,
        existing_data: JSON.stringify(existingData),
        requested_data: JSON.stringify(requestedData),
        status: "PENDING",
      })
      .returning([
        "id",
        "user_id",
        "section",
        "record_id",
        "request_type",
        "status",
        "created_at",
      ]);

    return { request };
  });
}

// =====================================================
// EMPLOYEE: GET MY FAMILY MEMBERS
// =====================================================

async function getMyFamilyMembers({ userId }) {
  const user = await knex("users")
    .where({ id: userId })
    .first("id");

  if (!user) {
    throw createFamilyMemberError(
      "PROFILE_NOT_FOUND",
      "Employee was not found"
    );
  }

  const familyMembers = await knex("employee_family_members")
    .where({
      user_id: userId,
      status: "ACTIVE",
    })
    .select(
      "id",
      "name",
      "relation",
      "gender",
      "date_of_birth",
      "profession",
      "family_member_type",
      "address",
      "status",
      "remarks",
      "created_at",
      "updated_at"
    )
    .orderBy("created_at", "asc");

  const pendingRequests = await knex(
    "employee_profile_change_requests"
  )
    .where({
      user_id: userId,
      section: "FAMILY_MEMBER",
      status: "PENDING",
    })
    .select(
      "id",
      "record_id",
      "request_type",
      "existing_data",
      "requested_data",
      "status",
      "created_at"
    )
    .orderBy("created_at", "desc");

  return {
    family_members: familyMembers,
    pending_requests: pendingRequests,
  };
}

// =====================================================
// ADMIN: APPROVE FAMILY MEMBER REQUEST
// =====================================================

async function approveFamilyMemberRequest({
  requestId,
  adminId,
  approvalRemarks = null,
}) {
  return knex.transaction(async (trx) => {
    const request = await trx(
      "employee_profile_change_requests"
    )
      .where({
        id: requestId,
        section: "FAMILY_MEMBER",
      })
      .forUpdate()
      .first();

    if (!request) {
      throw createFamilyMemberError(
        "PROFILE_CHANGE_REQUEST_NOT_FOUND",
        "Family member request was not found"
      );
    }

    if (request.status !== "PENDING") {
      throw createFamilyMemberError(
        "PROFILE_CHANGE_REQUEST_NOT_PENDING",
        "This request has already been reviewed"
      );
    }

    if (!["CREATE", "UPDATE", "DELETE"].includes(request.request_type)) {
      throw createFamilyMemberError(
        "UNSUPPORTED_FAMILY_MEMBER_REQUEST",
        "Unsupported family member request type"
      );
    }

    if (
      approvalRemarks !== null &&
      (typeof approvalRemarks !== "string" ||
        approvalRemarks.trim().length > 1000)
    ) {
      throw createFamilyMemberError(
        "INVALID_APPROVAL_REMARKS",
        "Approval remarks must be a string of up to 1000 characters"
      );
    }

    // Serialize approvals for this employee.
    const user = await trx("users")
      .where({ id: request.user_id })
      .forUpdate()
      .first("id");

    if (!user) {
      throw createFamilyMemberError(
        "PROFILE_NOT_FOUND",
        "Employee was not found"
      );
    }

    const requestedData =
      typeof request.requested_data === "string"
        ? JSON.parse(request.requested_data)
        : request.requested_data || {};

    let familyMember;
    let updatedFields = [];

    if (request.request_type === "CREATE") {
      const data = validateFamilyMemberData(requestedData);

      const insertData = {
        user_id: request.user_id,
        name: data.name,
        relation: data.relation,
        gender: data.gender ?? null,
        date_of_birth: data.date_of_birth ?? null,
        profession: data.profession ?? null,
        family_member_type: data.family_member_type,
        address: data.address ?? null,
        status: "ACTIVE",
        remarks: data.remarks ?? null,
      };

      [familyMember] = await trx("employee_family_members")
        .insert(insertData)
        .returning([
          "id",
          "user_id",
          "name",
          "relation",
          "gender",
          "date_of_birth",
          "profession",
          "family_member_type",
          "address",
          "status",
          "remarks",
        ]);

      updatedFields = Object.keys(insertData).filter(
        (key) => key !== "user_id"
      );
    } else {
      const existingMember = await trx("employee_family_members")
        .where({
          id: request.record_id,
          user_id: request.user_id,
        })
        .forUpdate()
        .first();

      if (!existingMember) {
        throw createFamilyMemberError(
          "FAMILY_MEMBER_NOT_FOUND",
          "Family member was not found"
        );
      }

      if (existingMember.status !== "ACTIVE") {
        throw createFamilyMemberError(
          "FAMILY_MEMBER_NOT_ACTIVE",
          "This family member is no longer active"
        );
      }

      if (request.request_type === "UPDATE") {
        const data = validateFamilyMemberData(requestedData);

        const updateData = {
          name: data.name,
          relation: data.relation,
          gender: data.gender ?? null,
          date_of_birth: data.date_of_birth ?? null,
          profession: data.profession ?? null,
          family_member_type: data.family_member_type,
          address: data.address ?? null,
          remarks: data.remarks ?? null,
          updated_at: trx.fn.now(),
        };

        await trx("employee_family_members")
          .where({
            id: request.record_id,
            user_id: request.user_id,
          })
          .update(updateData);

        familyMember = await trx("employee_family_members")
          .where({
            id: request.record_id,
            user_id: request.user_id,
          })
          .first(
            "id",
            "user_id",
            "name",
            "relation",
            "gender",
            "date_of_birth",
            "profession",
            "family_member_type",
            "address",
            "status",
            "remarks"
          );

        updatedFields = Object.keys(updateData).filter(
          (key) => key !== "updated_at"
        );
      } else {
        await trx("employee_family_members")
          .where({
            id: request.record_id,
            user_id: request.user_id,
          })
          .update({
            status: "INACTIVE",
            updated_at: trx.fn.now(),
          });

        familyMember = {
          id: String(request.record_id),
          user_id: String(request.user_id),
          status: "INACTIVE",
        };

        updatedFields = ["status"];
      }
    }

    const [updatedRequest] = await trx(
      "employee_profile_change_requests"
    )
      .where({ id: requestId })
      .update({
        status: "APPROVED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks: approvalRemarks
          ? approvalRemarks.trim()
          : null,
        updated_at: trx.fn.now(),
      })
      .returning([
        "id",
        "user_id",
        "section",
        "status",
      ]);

    return {
      request: updatedRequest,
      family_member: familyMember,
      updated_fields: updatedFields,
    };
  });
}

// =====================================================
// ADMIN: REJECT FAMILY MEMBER REQUEST
// =====================================================

async function rejectFamilyMemberRequest({
  requestId,
  adminId,
  approvalRemarks,
}) {
  return knex.transaction(async (trx) => {
    const request = await trx(
      "employee_profile_change_requests"
    )
      .where({
        id: requestId,
        section: "FAMILY_MEMBER",
      })
      .forUpdate()
      .first();

    if (!request) {
      throw createFamilyMemberError(
        "PROFILE_CHANGE_REQUEST_NOT_FOUND",
        "Family member request was not found"
      );
    }

    if (request.status !== "PENDING") {
      throw createFamilyMemberError(
        "PROFILE_CHANGE_REQUEST_NOT_PENDING",
        "This request has already been reviewed"
      );
    }

    if (
      typeof approvalRemarks !== "string" ||
      !approvalRemarks.trim() ||
      approvalRemarks.trim().length > 1000
    ) {
      throw createFamilyMemberError(
        "INVALID_APPROVAL_REMARKS",
        "Please provide rejection remarks (maximum 1000 characters)"
      );
    }

    const [updatedRequest] = await trx(
      "employee_profile_change_requests"
    )
      .where({ id: requestId })
      .update({
        status: "REJECTED",
        reviewed_by: adminId,
        reviewed_at: trx.fn.now(),
        approval_remarks: approvalRemarks.trim(),
        updated_at: trx.fn.now(),
      })
      .returning([
        "id",
        "user_id",
        "section",
        "status",
        "reviewed_by",
        "approval_remarks",
      ]);

    return { request: updatedRequest };
  });
}




module.exports = {
  getMyEmployeeProfile,
  uploadMyProfilePicture,
  getMyProfilePicture,
  submitPersonalDetailsRequest,
  getAdminProfileChangeRequests,
  approvePersonalDetailsRequest,
  rejectPersonalDetailsRequest,
  getAdminProfileChangeRequestById,

  rejectAddressRequest,
  approveAddressRequest,
  getMyAddresses,
  submitAddressRequest,

  submitEmergencyContactRequest,
  getMyEmergencyContacts,
  approveEmergencyContactRequest,
  rejectEmergencyContactRequest,

  rejectFamilyMemberRequest,
  approveFamilyMemberRequest,
  getMyFamilyMembers,
  submitFamilyMemberRequest



};
