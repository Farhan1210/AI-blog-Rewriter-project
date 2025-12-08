import axios from "axios";
import * as cheerio from "cheerio";
import { parseStringPromise } from "xml2js";

class CompleteBlogScraperService {
  async fetchBlogsFromMultipleSites(siteUrls) {
    // Process all URLs concurrently with Promise.allSettled
    const promises = siteUrls.map((url) => this.fetchTopBlogsWithMetadata(url));
    const settled = await Promise.allSettled(promises);

    return settled.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          url: siteUrls[index],
          status: "failed",
          error: result.reason.message,
          blogs: [],
          blogsFound: 0,
        };
      }
    });
  }

  async fetchTopBlogsWithMetadata(siteUrl) {
    const startTime = Date.now();

    try {
      const blogs = await this.fetchTopBlogs(siteUrl);
      const duration = Date.now() - startTime;

      return {
        url: siteUrl,
        status: "success",
        blogsFound: blogs.length,
        duration: `${duration}ms`,
        blogs: blogs,
        method: this.lastSuccessfulMethod || "scraping",
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Error fetching blogs from ${siteUrl}:`, error.message);

      return {
        url: siteUrl,
        status: "failed",
        error: error.message,
        duration: `${duration}ms`,
        blogs: [],
        blogsFound: 0,
      };
    }
  }

  async fetchTopBlogs(siteUrl) {
    this.lastSuccessfulMethod = null;

    try {
      // Try multiple strategies
      let blogs = await this.tryRssFeed(siteUrl);
      if (blogs.length > 0) {
        this.lastSuccessfulMethod = "rss";
        return this.getTop10Unique(blogs);
      }

      blogs = await this.trySitemap(siteUrl);
      if (blogs.length > 0) {
        this.lastSuccessfulMethod = "sitemap";
        return this.getTop10Unique(blogs);
      }

      blogs = await this.scrapeWebsite(siteUrl);
      if (blogs.length > 0) {
        this.lastSuccessfulMethod = "scraping";
        return this.getTop10Unique(blogs);
      }

      return [];
    } catch (error) {
      console.error("Error fetching blogs:", error);
      throw new Error(`Failed to fetch blogs: ${error.message}`);
    }
  }

  async tryRssFeed(siteUrl) {
    const rssPaths = [
      "/feed",
      "/rss",
      "/feed.xml",
      "/rss.xml",
      "/blog/feed",
      "/atom.xml",
    ];

    for (const path of rssPaths) {
      try {
        const rssUrl = new URL(path, siteUrl).href;
        const response = await axios.get(rssUrl, {
          timeout: 8000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        const result = await parseStringPromise(response.data);

        // Handle RSS 2.0
        if (result.rss && result.rss.channel) {
          const blogs = this.parseRssItems(result.rss.channel[0].item || []);
          if (blogs.length > 0) return blogs;
        }

        // Handle Atom feeds
        if (result.feed && result.feed.entry) {
          const blogs = this.parseAtomEntries(result.feed.entry);
          if (blogs.length > 0) return blogs;
        }
      } catch (error) {
        continue; // Try next RSS path
      }
    }

    return [];
  }

  async trySitemap(siteUrl) {
    const sitemapPaths = [
      "/sitemap.xml",
      "/sitemap_index.xml",
      "/blog-sitemap.xml",
      "/post-sitemap.xml",
    ];

    for (const path of sitemapPaths) {
      try {
        const sitemapUrl = new URL(path, siteUrl).href;
        const response = await axios.get(sitemapUrl, {
          timeout: 8000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        const result = await parseStringPromise(response.data);

        if (result.urlset && result.urlset.url) {
          const blogs = this.parseSitemapUrls(result.urlset.url, siteUrl);
          if (blogs.length > 0) return blogs;
        }

        // Handle sitemap index (contains links to other sitemaps)
        if (result.sitemapindex && result.sitemapindex.sitemap) {
          const blogs = await this.parseSitemapIndex(
            result.sitemapindex.sitemap,
          );
          if (blogs.length > 0) return blogs;
        }
      } catch (error) {
        continue;
      }
    }

    return [];
  }

  async parseSitemapIndex(sitemaps) {
    // Try to fetch the first blog-related sitemap
    for (const sitemap of sitemaps.slice(0, 3)) {
      try {
        const url = sitemap.loc[0];
        if (url.includes("blog") || url.includes("post")) {
          const response = await axios.get(url, { timeout: 8000 });
          const result = await parseStringPromise(response.data);
          if (result.urlset && result.urlset.url) {
            return this.parseSitemapUrls(result.urlset.url, url);
          }
        }
      } catch (error) {
        continue;
      }
    }
    return [];
  }

  async scrapeWebsite(siteUrl) {
    try {
      const response = await axios.get(siteUrl, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const $ = cheerio.load(response.data);
      const blogs = [];
      const baseUrl = new URL(siteUrl).origin;
      const seenUrls = new Set();

      // Look for blog links in common sections
      const selectors = [
        "article a",
        ".blog a",
        ".post a",
        '[class*="blog"] a',
        '[class*="post"] a',
        'a[href*="/blog/"]',
        'a[href*="/post/"]',
        'a[href*="/article/"]',
      ];

      selectors.forEach((selector) => {
        $(selector).each((i, elem) => {
          const href = $(elem).attr("href");
          if (!href) return;

          try {
            const fullUrl = href.startsWith("http")
              ? href
              : new URL(href, baseUrl).href;

            // Avoid duplicates and non-blog URLs
            if (!seenUrls.has(fullUrl) && this.isBlogUrl(fullUrl, siteUrl)) {
              seenUrls.add(fullUrl);
              const title =
                $(elem).text().trim() || this.extractTitleFromUrl(fullUrl);
              blogs.push({
                title: title.substring(0, 150),
                url: fullUrl,
              });
            }
          } catch (e) {
            // Invalid URL, skip
          }
        });
      });

      return blogs;
    } catch (error) {
      console.error("Scraping error:", error.message);
      return [];
    }
  }

  parseRssItems(items) {
    return items
      .map((item) => {
        const description = item.description
          ? typeof item.description[0] === "string"
            ? item.description[0]
            : item.description[0]._
          : "";

        return {
          title: item.title
            ? typeof item.title[0] === "string"
              ? item.title[0]
              : item.title[0]._
            : "Untitled",
          url: item.link ? item.link[0] : "",
          description: this.stripHtml(description).substring(0, 200),
          pubDate: item.pubDate ? item.pubDate[0] : null,
        };
      })
      .filter((blog) => blog.url);
  }

  parseAtomEntries(entries) {
    return entries
      .map((entry) => ({
        title: entry.title
          ? typeof entry.title[0] === "string"
            ? entry.title[0]
            : entry.title[0]._
          : "Untitled",
        url: entry.link
          ? Array.isArray(entry.link)
            ? entry.link[0].$.href
            : entry.link.$.href
          : "",
        description: entry.summary
          ? this.stripHtml(entry.summary[0]).substring(0, 200)
          : "",
        pubDate: entry.updated ? entry.updated[0] : null,
      }))
      .filter((blog) => blog.url);
  }

  parseSitemapUrls(urls, siteUrl) {
    return urls
      .map((url) => ({
        title: this.extractTitleFromUrl(url.loc[0]),
        url: url.loc[0],
        lastmod: url.lastmod ? url.lastmod[0] : null,
      }))
      .filter((blog) => this.isBlogUrl(blog.url, siteUrl));
  }

  isBlogUrl(url, siteUrl) {
    try {
      const blogPatterns = [
        /\/blog\//i,
        /\/article\//i,
        /\/post\//i,
        /\/news\//i,
        /\/\d{4}\/\d{2}\//, // Date pattern like /2024/01/
        /\/\d{4}\/\d{2}\/\d{2}\//, // Full date pattern
      ];

      const baseDomain = new URL(siteUrl).hostname.replace("www.", "");
      const urlDomain = new URL(url).hostname.replace("www.", "");

      // Must be same domain
      if (baseDomain !== urlDomain) {
        return false;
      }

      // Exclude common non-blog pages
      const excludePatterns = [
        /\/(tag|category|author|page)\//i,
        /\.(jpg|jpeg|png|gif|pdf|zip)$/i,
        /\/(wp-content|wp-admin|feed)\//i,
      ];

      if (excludePatterns.some((pattern) => pattern.test(url))) {
        return false;
      }

      return blogPatterns.some((pattern) => pattern.test(url));
    } catch {
      return false;
    }
  }

  extractTitleFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const parts = pathname.split("/").filter((p) => p);
      const lastPart = parts[parts.length - 1];
      return (
        lastPart
          .replace(/-/g, " ")
          .replace(/_/g, " ")
          .replace(/\.\w+$/, "")
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ") || "Blog Post"
      );
    } catch {
      return "Blog Post";
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, "").trim();
  }

  getTop10Unique(blogs) {
    const unique = [];
    const seen = new Set();

    for (const blog of blogs) {
      if (!seen.has(blog.url) && blog.url) {
        seen.add(blog.url);
        unique.push(blog);
        if (unique.length >= 10) break;
      }
    }

    return unique;
  }
}

export default new CompleteBlogScraperService();
