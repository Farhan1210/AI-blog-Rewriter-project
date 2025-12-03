import express from "express";
import { eachBlog, getBlogs } from "../controller/controller.js";
import { get } from "mongoose";

const router = express.Router();

router.get("/blogs", getBlogs);

router.get("/blog/:id", eachBlog);

export default router;
