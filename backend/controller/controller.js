import Blog from "../models/blog.js";

export const getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({});
    console.log(blogs);
    return res
      .status(200)
      .json({ message: "Blogs fetched successfully", data: blogs });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

export const eachBlog = async (req, res) => {
  try {
    const { id } = req.params;
    // console.log(id);

    if (!id) return res.status(400).json({ message: "Blog ID is required" });
    const blog = await Blog.findById(id);

    if (!blog)
      return res.status(404).json({ message: "Blog not found with given ID" });
    return res
      .status(200)
      .json({ message: "Blog fetched successfully", data: blog });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
