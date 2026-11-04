
const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

function getFirebaseAdmin() {
  const existingApp = getApps().find(
    (app) => app.name === "[DEFAULT]"
  );

  if (existingApp) {
    return existingApp;
  }

  const serviceAccountBase64 =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;

  if (!serviceAccountBase64) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is not configured"
    );
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(
      Buffer.from(serviceAccountBase64, "base64").toString("utf8")
    );
  } catch (error) {
    throw new Error(
      "Invalid Firebase service account configuration"
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

module.exports = {
  getFirebaseAdmin,
};
