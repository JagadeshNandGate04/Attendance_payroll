
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
  const encodedKey = process.env.IDENTITY_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error(
      "IDENTITY_ENCRYPTION_KEY is not configured"
    );
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "IDENTITY_ENCRYPTION_KEY must decode to exactly 32 bytes"
    );
  }

  return key;
}

function encryptValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    key,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptValue(encryptedValue) {
  if (!encryptedValue) {
    return null;
  }

  const parts = encryptedValue.split(":");

  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted value format");
  }

  const [, ivEncoded, authTagEncoded, dataEncoded] =
    parts;

  const iv = Buffer.from(ivEncoded, "base64");
  const authTag = Buffer.from(authTagEncoded, "base64");
  const encrypted = Buffer.from(dataEncoded, "base64");

  if (
    iv.length !== IV_LENGTH ||
    authTag.length !== AUTH_TAG_LENGTH
  ) {
    throw new Error("Invalid encrypted value");
  }

  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    iv
  );

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function maskIdentityValue(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value);

  if (normalized.length <= 4) {
    return "*".repeat(normalized.length);
  }

  return (
    "*".repeat(normalized.length - 4) +
    normalized.slice(-4)
  );
}

module.exports = {
  encryptValue,
  decryptValue,
  maskIdentityValue,
};
