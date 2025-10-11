const crypto = require("crypto");

const ENC_KEY = process.env.ENCRYPTION_KEY || null;
const KEY_BUF = ENC_KEY ? Buffer.from(ENC_KEY, "base64") : null;

if (!KEY_BUF) {
  console.warn(
    "ENCRYPTION_KEY not set. Sensitive fields will NOT be encrypted. " +
      "Set ENCRYPTION_KEY to a base64-encoded 32-byte key."
  );
}

function encryptField(plain) {
  if (!KEY_BUF) return plain; // fallback (not recommended)
  if (plain === null || plain === undefined || plain === "") return plain;

  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY_BUF, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plain), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString(
    "base64"
  )}:${ciphertext.toString("base64")}`;
}

function decryptField(stored) {
  if (!KEY_BUF) return stored;
  if (!stored || typeof stored !== "string") return stored;
  const parts = stored.split(":");
  if (parts.length !== 3) return stored;

  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY_BUF, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

module.exports = {
  encryptField,
  decryptField,
};
