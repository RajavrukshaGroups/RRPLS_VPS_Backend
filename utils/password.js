const crypto = require("crypto");

exports.generatePassword = (length = 10) => {
  return crypto
    .randomBytes(length)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "") // remove special chars
    .slice(0, length);
};
