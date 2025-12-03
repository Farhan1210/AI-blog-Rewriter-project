import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    slug: { type: String, required: true },
    excerpt: { type: String },
    source: { type: String },
    author: { type: String },
    publishedAt: { type: String },
    url: { type: String, required: true },
    urlToImage: { type: String },
  },
  {
    collection: "allBlogs", // <-- explicitly set your collection name
  }
);

const Blog = mongoose.model("Blog", blogSchema);

export default Blog;
