import axios from "axios";
import * as cheerio from "cheerio";
import { parseStringPromise } from "xml2js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Register the stealth plugin
puppeteer.use(StealthPlugin());
const PUBLIC_BLOG_URL = "https://medium.com/tag/programming";

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

      // [NEW RULE] Check for "Slug" patterns (single segment with many hyphens)
      // Sites like People.com use /article-title-here-123
      if (segments.length === 1) {
        const segment = segments[0];
        const hyphenCount = (segment.match(/-/g) || []).length;

        // If the path is just one segment but has 3+ hyphens, it's likely an article
        // e.g., /human-interest-news (2 hyphens) -> False (Homepage/Category)
        // e.g., /taylor-swift-travis-kelce-date-night (4 hyphens) -> True (Article)
        if (hyphenCount >= 3) {
          console.log(
            `   ✅ Segment has high hyphen count (${hyphenCount}) - treating as direct post`,
          );
          return true;
        }

        // Check for numeric ID at the end of the slug
        // e.g. /some-news-story-8475638
        if (/\d{6,}$/.test(segment)) {
          console.log(
            `   ✅ Segment ends in long numeric ID - treating as direct post`,
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

      // // Try Sitemap
      // console.log(`🗺️ Trying sitemap...`);
      // blogUrls = await this.trySitemap(siteUrl);
      // if (blogUrls.length > 0) {
      //   console.log(`✅ Sitemap successful: Found ${blogUrls.length} URLs`);
      //   this.lastSuccessfulMethod = "sitemap";
      //   return this.getTop10Unique(blogUrls);
      // }
      // console.log(`❌ Sitemap failed: No URLs found`);

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

  // async trySitemap(siteUrl) {
  //   const sitemapPaths = [
  //     "/sitemap.xml",
  //     "/sitemap_index.xml",
  //     "/blog-sitemap.xml",
  //     "/post-sitemap.xml",
  //   ];

  //   for (const path of sitemapPaths) {
  //     try {
  //       const sitemapUrl = new URL(path, siteUrl).href;
  //       const response = await axios.get(sitemapUrl, {
  //         timeout: 8000,
  //         headers: {
  //           "User-Agent":
  //             "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  //         },
  //       });

  //       const result = await parseStringPromise(response.data);

  //       if (result.urlset && result.urlset.url) {
  //         const urls = this.parseSitemapUrls(result.urlset.url, siteUrl);
  //         if (urls.length > 0) return urls;
  //       }

  //       // Handle sitemap index (contains links to other sitemaps)
  //       if (result.sitemapindex && result.sitemapindex.sitemap) {
  //         const urls = await this.parseSitemapIndex(
  //           result.sitemapindex.sitemap,
  //         );
  //         if (urls.length > 0) return urls;
  //       }
  //     } catch (error) {
  //       continue;
  //     }
  //   }

  //   return [];
  // }

  // async parseSitemapIndex(sitemaps) {
  //   // Try to fetch the first blog-related sitemap
  //   for (const sitemap of sitemaps.slice(0, 3)) {
  //     try {
  //       const url = sitemap.loc[0];
  //       if (url.includes("blog") || url.includes("post")) {
  //         const response = await axios.get(url, { timeout: 8000 });
  //         const result = await parseStringPromise(response.data);
  //         if (result.urlset && result.urlset.url) {
  //           return this.parseSitemapUrls(result.urlset.url, url);
  //         }
  //       }
  //     } catch (error) {
  //       continue;
  //     }
  //   }
  //   return [];
  // }

  // MAIN ENTRY POINT FOR SCRAPING
  async scrapeWebsite(siteUrl) {
    const MIN_LINKS_THRESHOLD = 3;

    // STEP 1: URL Check - Use a public tag if the root Medium URL is provided
    let scrapeUrl = siteUrl;
    if (siteUrl === "https://medium.com/" || siteUrl === "https://medium.com") {
      console.log(
        `💡 Detected protected Medium root. Changing target to public tag page: ${PUBLIC_BLOG_URL}`,
      );
      scrapeUrl = PUBLIC_BLOG_URL;
    }

    // STRATEGY 2: Try RSS/Sitemap (always run the fast stuff first on the *original* URL)
    // You already do this, so we skip the explicit code here.

    // STRATEGY 3: Cheerio (Fast but fails for CSR/403)
    console.log(`🕷️ Attempting fast scrape (Cheerio) for ${scrapeUrl}...`);
    // NOTE: We still call scrapeWithCheerio on the public URL
    let cheerioUrls = await this.scrapeWithCheerio(scrapeUrl);

    if (cheerioUrls.length >= MIN_LINKS_THRESHOLD) {
      console.log(
        `✅ Cheerio successful: Found ${cheerioUrls.length} URLs (passed threshold)`,
      );
      return cheerioUrls;
    }

    // STRATEGY 4: Fallback to Puppeteer (on the public URL)
    console.log(
      `⚠️ Suspicious Cheerio result: Found only ${cheerioUrls.length} links. Switching to Puppeteer...`,
    );

    // Pass the potentially swapped URL to Puppeteer
    const puppeteerUrls = await this.scrapeWithPuppeteer(scrapeUrl);

    // DECISION LOGIC:
    if (puppeteerUrls.length > cheerioUrls.length) {
      console.log(
        `✅ Puppeteer result better: Found ${puppeteerUrls.length} URLs (vs Cheerio's ${cheerioUrls.length})`,
      );
      return puppeteerUrls;
    } else if (cheerioUrls.length > 0) {
      console.log(
        `⚠️ Puppeteer didn't find more links. Reverting to Cheerio result (${cheerioUrls.length} links).`,
      );
      return cheerioUrls;
    } else {
      console.log(`❌ Both methods failed to find URLs.`);
      return [];
    }
  }

  // YOUR ORIGINAL LOGIC (Refactored into its own method)
  async scrapeWithCheerio(siteUrl) {
    try {
      const response = await axios.get(siteUrl, {
        /* ... headers ... */
      });
      const $ = cheerio.load(response.data);
      const blogUrls = [];
      const baseUrl = new URL(siteUrl).origin;
      const seenUrls = new Set();

      const normalizedCurrent = siteUrl.replace(/\/$/, "").toLowerCase();
      seenUrls.add(normalizedCurrent);
      seenUrls.add(normalizedCurrent + "/");

      // --- MODIFIED SELECTOR HERE ---
      // Select all <a> tags that are NOT descendants of <header>, <footer>, or <nav>
      const linkSelector = "a:not(header a):not(footer a):not(nav a)";

      // This is a more generalized way to prevent static links from being scraped
      $(linkSelector).each((i, elem) => {
        const href = $(elem).attr("href");
        if (!href) return;

        try {
          // ... (rest of your existing link processing/filtering logic) ...
          const fullUrl = href.startsWith("http")
            ? href
            : new URL(href, baseUrl).href;
          const normalizedUrl = fullUrl.replace(/\/$/, "").toLowerCase();

          if (
            !seenUrls.has(normalizedUrl) &&
            this.isBlogUrl(fullUrl, siteUrl)
          ) {
            seenUrls.add(normalizedUrl);
            blogUrls.push(fullUrl);
          }
        } catch (e) {
          // invalid url
        }
      });
      // ...
      return blogUrls;
    } catch (error) {
      console.warn(`Cheerio scrape warning: ${error.message}`);
      return [];
    }
  }

  async scrapeWithPuppeteer(siteUrl) {
    let browser = null;
    try {
      console.log(`🕷️ Launching Puppeteer (Deep Stealth) for ${siteUrl}...`);

      browser = await puppeteer.launch({
        headless: false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--window-size=1920,1080",
        ],
      });

      const page = await browser.newPage();

      // 1. Set Viewport to Desktop (Crucial for Medium)
      await page.setViewport({ width: 1920, height: 1080 });

      // 2. Navigate
      console.log("   ...navigating to page");
      await page.goto(siteUrl, { waitUntil: "networkidle2", timeout: 60000 });

      // 3. WAIT STRATEGY: Wait for specific Medium elements
      // Medium article titles usually use h2 or h3 classes, or 'article' tags
      try {
        console.log("   ...waiting for content to load");
        await page.waitForSelector("article, h2", { timeout: 10000 });
      } catch (e) {
        console.log(
          "   ⚠️ Timeout waiting for selectors. Page might be blocked or empty.",
        );
      }

      // 4. Scroll to trigger lazy loading
      console.log("   ...scrolling");
      await this.autoScroll(page);

      // 5. Extract ALL links with SCOPE FILTER
      const hrefs = await page.evaluate(() => {
        // --- MODIFIED SELECTOR HERE ---
        // Same logic: Select all <a> tags that are NOT in common static regions
        const selector = "a:not(header a):not(footer a):not(nav a)";

        return Array.from(document.querySelectorAll(selector))
          .map((a) => a.href)
          .filter((href) => href);
      });

      console.log(`   📊 RAW: Puppeteer found ${hrefs.length} total links.`);

      // DEBUG: Print the first 5 links found to see what we are looking at
      if (hrefs.length > 0) {
        console.log(`   🔎 Sample links found:`, hrefs.slice(0, 3));
      }

      // Filter URLs
      const blogUrls = [];
      const seenUrls = new Set();
      const normalizedCurrent = siteUrl.replace(/\/$/, "").toLowerCase();

      seenUrls.add(normalizedCurrent);
      seenUrls.add(normalizedCurrent + "/");

      for (const fullUrl of hrefs) {
        try {
          // 1. Strip the query parameters (everything after the '?')
          const cleanUrl = fullUrl.split("?")[0];

          // 2. Apply the Medium specific heuristic
          if (
            siteUrl.includes("medium.com") &&
            this.isMediumArticle(cleanUrl)
          ) {
            if (!seenUrls.has(cleanUrl)) {
              seenUrls.add(cleanUrl);
              blogUrls.push(cleanUrl); // Push the clean URL
            }
            continue;
          }

          // 3. Standard Logic for other sites
          const normalizedUrl = cleanUrl.replace(/\/$/, "").toLowerCase();
          if (
            !seenUrls.has(normalizedUrl) &&
            this.isBlogUrl(cleanUrl, siteUrl)
          ) {
            seenUrls.add(normalizedUrl);
            blogUrls.push(cleanUrl); // Push the clean URL
          }
        } catch (e) {}
      }

      return blogUrls;
    } catch (error) {
      console.error("Puppeteer fatal error:", error.message);
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  // SPECIAL HELPER FOR MEDIUM URLS
  isMediumArticle(url) {
    // Medium articles usually have a hash ID at the end (e.g., -a1b2c3d4e5)
    // OR they are under a collection
    if (!url.includes("medium.com")) return false;

    // Reject common non-article paths
    if (
      url.includes("/tag/") ||
      url.includes("/m/") ||
      url.includes("/about") ||
      url.includes("/plans")
    )
      return false;

    // Accept links with 8+ hex characters at the end (standard Medium ID)
    if (/-[a-f0-9]{8,12}$/.test(url)) return true;

    return false;
  }

  // UPDATED AUTO-SCROLL (Slower and more persistent)
  async autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 200; // Scroll chunk
        let retries = 0;

        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          // If we hit the bottom, wait a bit to see if more loads (Infinite Scroll)
          if (totalHeight >= scrollHeight) {
            retries++;
            // If we've hit bottom 3 times with no new content, stop.
            if (retries > 3 || totalHeight > 5000) {
              clearInterval(timer);
              resolve();
            }
          } else {
            retries = 0; // Reset retries if we are still moving
          }
        }, 200); // Slower interval (200ms) to simulate reading
      });
    });
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
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const baseDomain = new URL(siteUrl).hostname.replace("www.", "");
      const urlDomain = urlObj.hostname.replace("www.", "");

      // 1. Must be same domain
      if (baseDomain !== urlDomain) {
        return false;
      }

      // 2. Exclude common non-blog pages (expanded list)
      const excludePatterns = [
        /\/(tag|category|author|page|topics|search|login|register|shop|store)\//i,
        /\.(jpg|jpeg|png|gif|pdf|zip|css|js|json|xml)$/i,
        /\/(wp-content|wp-admin|feed|rss|contact|about|privacy|terms|accessibility|advertise)\/?$/i,
        /^\/?$/, // Root homepage
      ];

      if (excludePatterns.some((pattern) => pattern.test(path))) {
        return false;
      }

      // 3. Strict Blog Patterns (Keep your existing keywords)
      const strictBlogPatterns = [
        /\/blog\//i,
        /\/article\//i,
        /\/post\//i,
        /\/news\//i,
        /\/story\//i,
        /\/stories\//i,
        /\/\d{4}\/\d{2}\//, // Date pattern
      ];

      if (strictBlogPatterns.some((pattern) => pattern.test(path))) {
        return true;
      }

      // 4. NEW: Heuristic for "Slug" URLs (e.g., /this-is-a-long-article-title)
      // Checks for paths with at least 3 hyphens (highly likely to be an article title)
      // and ensures it's not just a category string.
      const segments = path.split("/").filter((s) => s.length > 0);
      const lastSegment = segments[segments.length - 1];

      if (lastSegment) {
        // Count hyphens in the last segment (slug)
        const hyphenCount = (lastSegment.match(/-/g) || []).length;

        // If it has 3+ hyphens, it's almost certainly an article title
        if (hyphenCount >= 3) {
          return true;
        }

        // Check for long numeric ID at end (People.com often uses this: ...-8755670)
        if (/\d{6,}$/.test(lastSegment)) {
          return true;
        }
      }

      return false;
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
