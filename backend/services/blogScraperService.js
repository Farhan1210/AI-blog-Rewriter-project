import axios from "axios";
import * as cheerio from "cheerio";
import { parseStringPromise } from "xml2js";

class BlogScraperService {
  // Check if URL is already a direct blog post (not a homepage/listing page)
  isDirectBlogPost(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const search = urlObj.search;

      console.log(`🔍 Checking if direct post: ${url}`);
      console.log(`   Pathname: ${pathname}`);
      console.log(`   Query: ${search || "none"}`);

      // RULE 1: Has query parameters? Likely a specific article
      if (search && search.length > 1) {
        console.log(`   ✅ Has query parameters - treating as direct post`);
        return true;
      }

      // RULE 2: Check for long alphanumeric IDs in path
      // Example: /articles/cvgk9rqx5kjo or /p/abc123def456
      const segments = pathname.split("/").filter((s) => s && s.length > 0);
      console.log(`   Segments (${segments.length}):`, segments);

      for (const segment of segments) {
        // Check if segment is a long random-looking ID (8+ chars, mix of letters/numbers, no hyphens)
        const isLongId =
          segment.length >= 8 &&
          /^[a-z0-9]+$/i.test(segment) &&
          /[a-z]/i.test(segment) &&
          /[0-9]/.test(segment) &&
          !segment.includes("-");

        if (isLongId) {
          console.log(
            `   ✅ Found ID-like segment: "${segment}" - treating as direct post`,
          );
          return true;
        }
      }

      // RULE 3: Check if it's definitely a HOMEPAGE/LISTING
      const homepagePatterns = [
        /^\/$/, // Just / (root)
        /^\/blog\/?$/i, // /blog or /blog/ (no more path)
        /^\/news\/?$/i, // /news or /news/
        /^\/articles?\/?$/i, // /article or /articles
        /^\/posts?\/?$/i, // /post or /posts
        /^\/blogs\/?$/i, // /blogs
        /^\/category\//i, // /category/tech
        /^\/tag\//i, // /tag/ai
        /^\/author\//i, // /author/john
        /^\/page\/\d+/i, // /page/2
      ];

      for (const pattern of homepagePatterns) {
        if (pattern.test(pathname)) {
          console.log(`   ❌ Matched homepage pattern: ${pattern}`);
          return false;
        }
      }

      // RULE 4: Too few segments = likely homepage
      if (segments.length <= 1) {
        console.log(
          `   ❌ Too few segments (${segments.length}), likely homepage`,
        );
        return false;
      }

      // RULE 5: Check for direct post patterns

      // Date-based: /blog/YYYY/MM/DD/post-title
      if (/\/blog\/\d{4}\/\d{2}\/\d{2}\/.+/i.test(pathname)) {
        console.log(`   ✅ Matches date-based blog post pattern`);
        return true;
      }

      // Date-based: /YYYY/MM/DD/post-title
      if (/\/\d{4}\/\d{2}\/\d{2}\/.+/.test(pathname)) {
        console.log(`   ✅ Matches date-based post pattern`);
        return true;
      }

      // Date-based short: /YYYY/MM/post-title
      if (/\/\d{4}\/\d{2}\/.+\/.+/.test(pathname)) {
        console.log(`   ✅ Matches short date post pattern`);
        return true;
      }

      // File extensions
      if (/\.(html?|php)$/i.test(pathname)) {
        console.log(`   ✅ Matches file extension pattern`);
        return true;
      }

      // Medium-style /p/post-id
      if (/\/p\/[\w-]+$/i.test(pathname)) {
        console.log(`   ✅ Matches Medium-style pattern`);
        return true;
      }

      // Has blog/article/post/news in path AND has a slug after it
      const blogKeywordPatterns = [
        /\/blog\/[^\/]+$/i,
        /\/article\/[^\/]+$/i,
        /\/articles\/[^\/]+$/i, // BBC uses /articles/
        /\/post\/[^\/]+$/i,
        /\/news\/[^\/]+$/i,
        /\/story\/[^\/]+$/i,
      ];

      for (const pattern of blogKeywordPatterns) {
        if (pattern.test(pathname)) {
          console.log(`   ✅ Matches blog keyword with slug: ${pattern}`);
          return true;
        }
      }

      // Multi-segment blog posts (Microsoft style: /blog/2025/11/18/title)
      if (segments.length >= 3) {
        const hasBlogKeyword =
          /^(blog|article|articles|post|news|story)$/i.test(segments[0]);
        const lastSegment = segments[segments.length - 1];
        const lastSegmentIsSlug =
          lastSegment.length > 3 &&
          (lastSegment.includes("-") || lastSegment.includes("_"));

        if (hasBlogKeyword && lastSegmentIsSlug) {
          console.log(`   ✅ Multi-segment blog post with slug`);
          return true;
        }
      }

      // Default: treat as homepage to be safe
      console.log(`   ❌ No direct post pattern matched, treating as homepage`);
      return false;
    } catch (error) {
      console.log(`   ❌ Error parsing URL: ${error.message}`);
      return false;
    }
  }

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
          blogUrls: [], // Just URLs, no metadata
          blogsFound: 0,
        };
      }
    });
  }

  async fetchTopBlogsWithMetadata(siteUrl) {
    const startTime = Date.now();

    try {
      // Check if this is already a direct blog post URL
      if (this.isDirectBlogPost(siteUrl)) {
        const duration = Date.now() - startTime;
        console.log(`✅ Direct blog post detected: ${siteUrl}`);

        return {
          url: siteUrl,
          status: "success",
          blogsFound: 1,
          duration: `${duration}ms`,
          blogUrls: [siteUrl], // Return the URL as-is
          method: "direct",
          isDirect: true,
        };
      }

      // Otherwise, scrape for top 10 blogs
      const blogUrls = await this.fetchTopBlogs(siteUrl);
      const duration = Date.now() - startTime;

      // CIRCULAR CHECK: If scraper found the same URL we're scraping, it's a direct post
      if (blogUrls.length === 1 && blogUrls[0] === siteUrl) {
        console.log(
          `✅ Circular detection: Scraper found same URL, treating as direct post`,
        );
        return {
          url: siteUrl,
          status: "success",
          blogsFound: 1,
          duration: `${duration}ms`,
          blogUrls: [siteUrl],
          method: "direct-circular",
          isDirect: true,
        };
      }

      // DUPLICATE CHECK: If all scraped URLs are duplicates of the source, it's likely a direct post
      const uniqueUrls = [...new Set(blogUrls)];
      if (uniqueUrls.length === 1 && uniqueUrls[0] === siteUrl) {
        console.log(
          `✅ All scraped URLs are duplicates of source, treating as direct post`,
        );
        return {
          url: siteUrl,
          status: "success",
          blogsFound: 1,
          duration: `${duration}ms`,
          blogUrls: [siteUrl],
          method: "direct-duplicate",
          isDirect: true,
        };
      }

      // If no blogs found, provide helpful error message
      if (blogUrls.length === 0) {
        return {
          url: siteUrl,
          status: "failed",
          error:
            "No blog posts found. This site may not have a blog section, RSS feed, or sitemap.",
          duration: `${duration}ms`,
          blogUrls: [],
          blogsFound: 0,
          method: "none",
        };
      }

      return {
        url: siteUrl,
        status: "success",
        blogsFound: blogUrls.length,
        duration: `${duration}ms`,
        blogUrls: blogUrls, // Array of URL strings only
        method: this.lastSuccessfulMethod || "scraping",
        isDirect: false,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Error fetching blogs from ${siteUrl}:`, error.message);

      return {
        url: siteUrl,
        status: "failed",
        error: error.message,
        duration: `${duration}ms`,
        blogUrls: [],
        blogsFound: 0,
      };
    }
  }

  async fetchTopBlogs(siteUrl) {
    this.lastSuccessfulMethod = null;

    try {
      console.log(`\n🔄 Starting blog fetch for: ${siteUrl}`);

      // Try RSS first
      console.log(`📡 Trying RSS feeds...`);
      let blogUrls = await this.tryRssFeed(siteUrl);
      if (blogUrls.length > 0) {
        console.log(`✅ RSS successful: Found ${blogUrls.length} URLs`);
        this.lastSuccessfulMethod = "rss";
        return this.getTop10Unique(blogUrls);
      }
      console.log(`❌ RSS failed: No URLs found`);

      // Try Sitemap
      console.log(`🗺️ Trying sitemap...`);
      blogUrls = await this.trySitemap(siteUrl);
      if (blogUrls.length > 0) {
        console.log(`✅ Sitemap successful: Found ${blogUrls.length} URLs`);
        this.lastSuccessfulMethod = "sitemap";
        return this.getTop10Unique(blogUrls);
      }
      console.log(`❌ Sitemap failed: No URLs found`);

      // Try Web Scraping
      console.log(`🕷️ Trying web scraping...`);
      blogUrls = await this.scrapeWebsite(siteUrl);
      if (blogUrls.length > 0) {
        console.log(`✅ Scraping successful: Found ${blogUrls.length} URLs`);
        this.lastSuccessfulMethod = "scraping";
        return this.getTop10Unique(blogUrls);
      }
      console.log(`❌ Scraping failed: No URLs found`);

      console.log(`⚠️ All methods failed for ${siteUrl}`);
      return [];
    } catch (error) {
      console.error("❌ Error in fetchTopBlogs:", error);
      throw new Error(`Failed to fetch blogs: ${error.message}`);
    }
  }

  async tryRssFeed(siteUrl) {
    // More comprehensive RSS feed paths
    const rssPaths = [
      "/feed",
      "/rss",
      "/feed.xml",
      "/rss.xml",
      "/blog/feed",
      "/atom.xml",
      "/feed/",
      "/rss/",
      "/index.xml",
      "?feed=rss2",
      "?feed=atom",
    ];

    for (const path of rssPaths) {
      try {
        const rssUrl = new URL(path, siteUrl).href;
        console.log(`   Trying: ${rssUrl}`);

        const response = await axios.get(rssUrl, {
          timeout: 8000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        console.log(`   ✅ Got response from ${path}`);
        const result = await parseStringPromise(response.data);

        // Handle RSS 2.0
        if (result.rss && result.rss.channel) {
          const urls = this.parseRssItems(result.rss.channel[0].item || []);
          console.log(`   📰 RSS 2.0: Found ${urls.length} items`);
          if (urls.length > 0) return urls;
        }

        // Handle Atom feeds
        if (result.feed && result.feed.entry) {
          const urls = this.parseAtomEntries(result.feed.entry);
          console.log(`   📰 Atom: Found ${urls.length} items`);
          if (urls.length > 0) return urls;
        }
      } catch (error) {
        console.log(`   ❌ ${path} failed: ${error.message}`);
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
          const urls = this.parseSitemapUrls(result.urlset.url, siteUrl);
          if (urls.length > 0) return urls;
        }

        // Handle sitemap index (contains links to other sitemaps)
        if (result.sitemapindex && result.sitemapindex.sitemap) {
          const urls = await this.parseSitemapIndex(
            result.sitemapindex.sitemap,
          );
          if (urls.length > 0) return urls;
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
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      const $ = cheerio.load(response.data);
      const blogUrls = [];
      const baseUrl = new URL(siteUrl).origin;
      const seenUrls = new Set();

      // Debug: Log total links found
      const totalLinks = $("a").length;
      console.log(
        `[DEBUG] ${siteUrl}: Found ${totalLinks} total links on page`,
      );

      // Enhanced selectors for different blog structures
      const selectors = [
        "article a",
        ".blog a",
        ".post a",
        '[class*="blog"] a',
        '[class*="post"] a',
        '[class*="story"] a',
        '[class*="article"] a',
        'a[href*="/blog/"]',
        'a[href*="/post/"]',
        'a[href*="/article/"]',
        'a[href*="/news/"]',
        'a[href*="/story/"]',
        'a[href*="/stories/"]',
        "main a", // Main content area
        '[role="main"] a', // Semantic main
        ".content a", // Common content class
        "#content a", // Common content ID
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
              blogUrls.push(fullUrl);
            }
          } catch (e) {
            // Invalid URL, skip
          }
        });
      });

      // If still no results, try a more aggressive approach
      if (blogUrls.length === 0) {
        $("a").each((i, elem) => {
          const href = $(elem).attr("href");
          if (!href) return;

          try {
            const fullUrl = href.startsWith("http")
              ? href
              : new URL(href, baseUrl).href;

            if (!seenUrls.has(fullUrl) && this.isBlogUrl(fullUrl, siteUrl)) {
              seenUrls.add(fullUrl);
              blogUrls.push(fullUrl);
            }
          } catch (e) {
            // Invalid URL, skip
          }
        });
      }

      return blogUrls;
    } catch (error) {
      console.error("Scraping error:", error.message);
      return [];
    }
  }

  // Parse RSS items - extract only URLs
  parseRssItems(items) {
    return items
      .map((item) => (item.link ? item.link[0] : null))
      .filter((url) => url); // Remove nulls
  }

  // Parse Atom entries - extract only URLs
  parseAtomEntries(entries) {
    return entries
      .map((entry) => {
        if (!entry.link) return null;
        return Array.isArray(entry.link)
          ? entry.link[0].$.href
          : entry.link.$.href;
      })
      .filter((url) => url); // Remove nulls
  }

  // Parse sitemap URLs - extract only URLs
  parseSitemapUrls(urls, siteUrl) {
    return urls
      .map((url) => url.loc[0])
      .filter((url) => this.isBlogUrl(url, siteUrl));
  }

  isBlogUrl(url, siteUrl) {
    try {
      const blogPatterns = [
        /\/blog\//i,
        /\/article\//i,
        /\/post\//i,
        /\/news\//i,
        /\/story\//i, // Added for news stories
        /\/stories\//i, // Added for stories
        /\/\d{4}\/\d{2}\//, // Date pattern like /2024/01/
        /\/\d{4}\/\d{2}\/\d{2}\//, // Full date pattern
        /\/mediaaction\/blog\//i, // BBC Media Action specific
        /\/blogs\//i, // Plural blogs
      ];

      const baseDomain = new URL(siteUrl).hostname.replace("www.", "");
      const urlDomain = new URL(url).hostname.replace("www.", "");

      // Must be same domain
      if (baseDomain !== urlDomain) {
        return false;
      }

      // Exclude common non-blog pages
      const excludePatterns = [
        /\/(tag|category|author|page)\/[^\/]*$/i, // Archive pages (but allow if followed by more path)
        /\.(jpg|jpeg|png|gif|pdf|zip|css|js)$/i, // Media files
        /\/(wp-content|wp-admin|feed|search)\//i, // WordPress/system paths
        /\/(contact|about|privacy|terms)$/i, // Static pages
      ];

      if (excludePatterns.some((pattern) => pattern.test(url))) {
        return false;
      }

      return blogPatterns.some((pattern) => pattern.test(url));
    } catch {
      return false;
    }
  }

  // Get top 10 unique URLs (just strings)
  getTop10Unique(urls) {
    const unique = [];
    const seen = new Set();

    for (const url of urls) {
      if (!seen.has(url) && url) {
        seen.add(url);
        unique.push(url);
        if (unique.length >= 10) break;
      }
    }

    return unique;
  }
}

export default new BlogScraperService();
