require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const ejs = require("ejs");
const path = require("path");
const cors = require("cors");
const { dbConnect } = require("./config/config.js");
const userRoute = require("./routes/routes.js");
const app = express();
const port = 3000;

//for salary ejs reciept- // View engine (EJS) and views dir

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static assets (public)
app.use(express.static(path.join(__dirname, "public")));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Connect to the database
dbConnect();

// Enable CORS
app.use(
  cors({
    // origin: 'https://admin-panel.rajavrukshagroup.in', // Replace with your frontend URL
    origin: 'https://admin-panel.rajavrukshagroup.in', // Replace with your frontend URL
    // origin: "http://localhost:5173", // Replace with your frontend URL

    credentials: true, // Allow cookies or authorization headers
  })
);

// Middleware
// app.use(express.json());
// app.use(express.static("public")); // Serve static files

// Routes
app.use("/", userRoute);

// Handle preflight requests
app.options("*", cors());

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
