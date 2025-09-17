const mongoose = require("mongoose");
const { Schema } = mongoose;

const careerSchema = new Schema(
  {
    title: { type: String, required: true },
    shortTitle:{type:String,required:true},
    description: { type: String, required: true },
    qualifications: { type: String, required: true },
    skills: { type: [String], required: true },
    experience: { type: String, required: true },
    salary: { type: String, required: true },
    age: { type: String, required: true },
    timings: { type: String, required: true },
    category: { type: String, required: true },
    jobType: { type: String, required: true },
    location: { type: String, required: true },
    link:{type:String,required:true},
    image: {
      url: { type: String, required: false },
      filename: { type: String, required: false },
    }, // Image URL or path
  },
  {
    timestamps: true,
  }
);

const Career = mongoose.model("Career", careerSchema);

module.exports = Career;
