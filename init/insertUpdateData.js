require("dotenv").config();
const mongoose = require("mongoose");
const Employee = require("../models/employeeDetails");

// const MONGO_URL = "mongodb://localhost:27017/RRPL_Admin";
const MONGO_URL =
  "mongodb+srv://enquiry:mHpnVFW1fNgdla8h@cluster0.osdmv.mongodb.net/";

const main = async () => {
  try {
    await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connected to database");

    const result = await Employee.updateMany(
      { source: { $exists: false } },
      { $set: { source: "website" } }
    );

    console.log("✅ Employee source migration completed");
    console.log("Matched documents:", result.matchedCount);
    console.log("Modified documents:", result.modifiedCount);

    await mongoose.connection.close();
    console.log("🔒 Connection closed");
  } catch (error) {
    console.error("❌ Migration error:", error);
    try {
      await mongoose.connection.close();
    } catch (_) {}
    process.exit(1);
  }
};

main();
