import Blog from "../models/blog.js";
import { normalizeUrl, validateUrl } from "../utils/validator.js";
import blogScraperService from "../services/blogScraperService.js";
import axios from "axios";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

export const getBlogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || "";
    const sort = parseInt(req.query.sort) || -1; // -1 for newest first, 1 for oldest first

    console.log(page);
    console.log(sort);
    console.log(search);

    const limit = 4;
    const skip = (page - 1) * limit;

    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { title: { $regex: search, $options: "i" } },
          { author: { $regex: search, $options: "i" } },
          { source: { $regex: search, $options: "i" } },
        ],
      };
    }

    const totalBlogs = await Blog.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalBlogs / limit);

    const blogs = await Blog.find(searchQuery)
      .sort({ _id: sort })
      .skip(skip)
      .limit(limit);

    if (page > totalPages && totalBlogs > 0) {
      return res.status(404).json({
        success: false,
        message: `Page ${page} not found. Total pages: ${totalPages}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: search
        ? `Found ${totalBlogs} Blogs matching "${search}"`
        : "Blogs fetched successfully",
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        limit: limit,
        totalBlogs: totalBlogs,
        nextPage: page < totalPages ? true : false,
        prevPage: page > 1 ? true : false,
        sort: sort,
      },
      data: blogs,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

export const eachBlog = async (req, res) => {
  try {
    const { id } = req.params;

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

export const fetchBlogs = async (req, res) => {
  try {
    const { urls, sendToN8n = true } = req.body;
    console.log(urls);

    // Validate input
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error: "Invalid input. Expected an array of URLs",
      });
    }

    if (urls.length === 0) {
      return res.status(400).json({
        success: false,
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
        success: false,
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

    // Calculate summary statistics
    const totalBlogs = results.reduce((sum, r) => sum + r.blogUrls.length, 0);
    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    // Collect all blog URLs from successful results
    const allBlogUrls = results
      .filter((r) => r.status === "success")
      .flatMap((r) => r.blogUrls);

    console.log("Blog fetching results:", allBlogUrls);

    // Prepare response object
    const responseData = {
      success: true,
      summary: {
        totalUrls: validUrls.length,
        successfulUrls: successCount,
        failedUrls: failedCount,
        totalBlogsFound: totalBlogs,
      },
      results: results,
      n8nStatus: null, // Will be updated below
      // Include invalid URLs if any
      ...(processedUrls.length > validUrls.length && {
        invalidUrls: processedUrls
          .filter((u) => !u.isValid)
          .map((u) => u.original),
      }),
    };

    // Send to n8n if enabled
    if (sendToN8n && allBlogUrls.length > 0) {
      try {
        const n8nResponse = await axios.post(N8N_WEBHOOK_URL, {
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
        console.log("n8n Response:", n8nResponse.data);

        // Extract message from n8n response
        const n8nMessage =
          n8nResponse.data?.message ||
          n8nResponse.data?.status ||
          `Successfully sent ${allBlogUrls.length} URLs to n8n`;

        responseData.n8nStatus = {
          success: true,
          message: n8nMessage,
          statusCode: n8nResponse.status,
          data: n8nResponse.data, // Include full n8n response data
        };

        return res.status(200).json(responseData);
      } catch (n8nError) {
        console.error("❌ Failed to send to n8n:", n8nError.message);

        // Extract error details from n8n response
        const errorStatus = n8nError.response?.status || 500;
        const n8nErrorData = n8nError.response?.data;

        // Try to extract message from various possible n8n response formats
        const errorMessage =
          n8nErrorData?.message ||
          n8nErrorData?.error ||
          n8nErrorData?.status ||
          n8nError.message;

        responseData.success = false;
        responseData.n8nStatus = {
          success: false,
          message: errorMessage,
          statusCode: errorStatus,
          error: errorMessage,
          data: n8nErrorData, // Include full n8n error response
        };

        // Return 500 or the actual error status from n8n
        return res.status(errorStatus === 404 ? 404 : 500).json(responseData);
      }
    } else {
      // No n8n sending required or no URLs to send
      if (allBlogUrls.length === 0) {
        responseData.n8nStatus = {
          success: false,
          message: "No blog URLs found to send to n8n",
        };
      } else {
        responseData.n8nStatus = {
          success: true,
          message: "n8n integration disabled (sendToN8n=false)",
        };
      }

      return res.status(200).json(responseData);
    }
  } catch (error) {
    console.error("Error in fetchBlogsFromMultipleUrls controller:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch blogs",
      message: error.message,
    });
  }
};
