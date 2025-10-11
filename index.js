require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { dbConnect } = require('./config/config.js');
const userRoute = require('./routes/routes.js');
const app = express();  
const port = 5000;

// Connect to the database
dbConnect();

// Enable CORS
app.use(cors({
    // origin: 'https://admin-panel.rajavrukshagroup.in', // Replace with your frontend URL
    origin: 'https://admin-panel.rajavrukshagroup.in', // Replace with your frontend URL
    credentials: true, // Allow cookies or authorization headers
}));

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve static files

// Routes
app.use('/', userRoute);

// Handle preflight requests
app.options('*', cors());

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});



// // const app = express();
// require('dotenv').config();
// const bodyParser = require('body-parser');
// const express = require('express');
// const mongoose = require('mongoose');

// const {dbConnect} = require("./config/config.js");
// const userRoute=require('./routes/routes.js') ;
// const app = express();
// const cors = require('cors');
// const port = 3000; // You can choose any available port

// // app.use(cors()); // Enable CORS for all routes

// dbConnect()

// app.use(cors({
//   // origin: 'https://adminpanel.rajavrukshagroup.in',
//   origin: 'https://admin-panel.rajavrukshagroup.in',

//    // Allow specific origin
//   credentials: true // Include cookies or authorization headers if needed
// }));

// app.use(express.json());
// app.use(express.static('public')); 
// app.use('/',userRoute)


// app.listen(port, () => {
//     console.log(`Server is running at http://localhost:${port}`);
//   })  
