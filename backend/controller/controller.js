import Blog from "../models/blog.js";
import { normalizeUrl, validateUrl } from "../utils/validator.js";
import blogScraperService from "../services/blogScraperService.js";
import axios, { all } from "axios";

export const getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({});
    // console.log(blogs);
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

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

export const fetchBlogs = async (req, res) => {
  try {
    const { urls, sendToN8n = true } = req.body;
    console.log(urls);

    // Validate input
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({
        error: "Invalid input. Expected an array of URLs",
      });
    }

    if (urls.length === 0) {
      return res.status(400).json({
        error: "At least one URL is required",
      });
    }

    // Normalize and validate URLs
    const processedUrls = urls.map((url) => {
      const normalized = normalizeUrl(url);
      return {
        original: url,
        normalized,
        isValid: validateUrl(normalized),
      };
    });

    // Filter out invalid URLs
    const validUrls = processedUrls.filter((u) => u.isValid);

    if (validUrls.length === 0) {
      return res.status(400).json({
        error: "No valid URLs provided",
        invalidUrls: processedUrls
          .filter((u) => !u.isValid)
          .map((u) => u.original),
      });
    }

    // Fetch blogs from all URLs concurrently
    console.log(`Processing ${validUrls.length} URLs...`);
    const results = await blogScraperService.fetchBlogsFromMultipleSites(
      validUrls.map((u) => u.normalized),
    );
    console.log("Blog fetching results:", results.blogUrls);

    // Calculate summary statistics
    const totalBlogs = results.reduce((sum, r) => sum + r.blogUrls.length, 0);
    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    // Collect all blog URLs from successful results
    const allBlogUrls = results
      .filter((r) => r.status === "success")
      .flatMap((r) => r.blogUrls);

    // Send to n8n if enabled
    if (sendToN8n && allBlogUrls.length > 0) {
      try {
        await axios.post(N8N_WEBHOOK_URL, {
          blogUrls: allBlogUrls,
          metadata: {
            totalUrls: allBlogUrls.length,
            sourceWebsites: results
              .filter((r) => r.status === "success")
              .map((r) => r.url),
            timestamp: new Date().toISOString(),
          },
        });
        console.log(`✅ Sent ${allBlogUrls.length} URLs to n8n`);
      } catch (n8nError) {
        console.error("❌ Failed to send to n8n:", n8nError.message);
        // Continue even if n8n fails
      }
    }

    res.json({
      success: true,
      summary: {
        totalUrls: validUrls.length,
        successfulUrls: successCount,
        failedUrls: failedCount,
        totalBlogsFound: totalBlogs,
      },
      results: results,
      // Include invalid URLs if any
      ...(processedUrls.length > validUrls.length && {
        invalidUrls: processedUrls
          .filter((u) => !u.isValid)
          .map((u) => u.original),
      }),
    });
  } catch (error) {
    console.error("Error in fetchBlogsFromMultipleUrls controller:", error);
    res.status(500).json({
      error: "Failed to fetch blogs",
      message: error.message,
    });
  }
};
