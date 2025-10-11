// seedAdminEncrypted.js
require("dotenv").config();
const mongoose = require("mongoose");
const adminLogin = require("../models/adminModel.js"); // adjust path if needed
const loginDetails = require("./data.js"); // your array of {email,password}
const { encryptField } = require("../utils/encryption.js"); // adjust path to your encrypt/decrypt file

// const MONGO_URL = "mongodb://localhost:27017/RRPL_Admin";
const MONGO_URL =
  "mongodb+srv://enquiry:mHpnVFW1fNgdla8h@cluster0.osdmv.mongodb.net/";

const main = async () => {
  if (!process.env.ENCRYPTION_KEY) {
    console.warn(
      "ENCRYPTION_KEY not set — script will still run but values WILL be stored plaintext."
    );
  }

  try {
    await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("connected to database");

    // Map and encrypt fields
    const toInsert = loginDetails.map((item) => {
      const emailPlain = item.email ?? "";
      const passwordPlain = item.password ?? "";

      return {
        email: encryptField(emailPlain),
        password: encryptField(passwordPlain),
      };
    });

    // Insert. Use ordered:false so duplicates won't stop the whole batch.
    const result = await adminLogin.insertMany(toInsert, { ordered: false });
    // const result = await adminLogin.deleteMany({});
    console.log("inserted documents:", result.length);

    await mongoose.connection.close();
    console.log("connection closed");
  } catch (error) {
    console.error("error", error);
    try {
      await mongoose.connection.close();
    } catch (_) {}
    process.exit(1);
  }
};

main();
