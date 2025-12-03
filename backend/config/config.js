// backend/config/config.js

import mongoose from "mongoose";

const connectDb = async function () {
  try {
    const connection = await mongoose.connect(
      "mongodb://localhost:27017/blogs"
    );
    console.log("MongoDB connected!");
  } catch (error) {
    console.error("MongoDB connection error ", error);
  }
};

export default connectDb;
