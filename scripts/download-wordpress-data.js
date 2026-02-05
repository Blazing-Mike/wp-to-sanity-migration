// WordPress JSON Downloader
// Downloads all posts from your WordPress REST API
// Run with: node download-wordpress-data.js

const https = require("https");
const fs = require("fs");

const WORDPRESS_URL = "websiteurl.com"; // <-- Replace with your WordPress site URL (no https://)
const OUTPUT_FILE = "wordpress-posts.json";
const POSTS_PER_PAGE = 100;

function fetchPage(page) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: WORDPRESS_URL,
      path: `/wp-json/wp/v2/posts?per_page=${POSTS_PER_PAGE}&page=${page}`,
      method: "GET",
      headers: {
        "User-Agent": "WordPress-Sanity-Migration",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const posts = JSON.parse(data);
          // Ensure we always return an array
          if (Array.isArray(posts)) {
            resolve(posts);
          } else {
            // If not an array (could be error object), return empty array
            resolve([]);
          }
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}

async function downloadAllPosts() {
  console.log("🚀 Starting WordPress data download...\n");
  console.log(`📍 Source: https://${WORDPRESS_URL}`);
  console.log(`💾 Output: ${OUTPUT_FILE}\n`);

  let allPosts = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      console.log(`📥 Fetching page ${page}...`);
      const posts = await fetchPage(page);

      if (posts.length === 0) {
        console.log("   ℹ️  No more posts found\n");
        hasMore = false;
      } else {
        allPosts = allPosts.concat(posts);
        console.log(
          `   ✅ Downloaded ${posts.length} posts (Total: ${allPosts.length})`
        );
        page++;

        // Small delay to be nice to the server
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`   ❌ Error on page ${page}:`, error.message);
      hasMore = false;
    }
  }

  if (allPosts.length === 0) {
    console.error(
      "\n❌ No posts downloaded. Check your WordPress URL and try again."
    );
    process.exit(1);
  }

  // Save to file
  console.log(`\n💾 Saving ${allPosts.length} posts to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPosts, null, 2));
  console.log("   ✅ File saved successfully!\n");

  // Show summary
  console.log("═".repeat(50));
  console.log("📊 DOWNLOAD SUMMARY");
  console.log("═".repeat(50));
  console.log(`Total Posts: ${allPosts.length}`);
  console.log(
    `File Size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`
  );
  console.log("═".repeat(50));

  console.log("\n✅ DOWNLOAD COMPLETE!\n");
  console.log("Next steps:");
  console.log("1. Review the file: " + OUTPUT_FILE);
  console.log(
    "2. Import to Sanity: sanity dataset import " + OUTPUT_FILE + " production"
  );
  console.log("3. Run the migration to convert HTML to Portable Text\n");
}

// Run the download
downloadAllPosts().catch((error) => {
  console.error("\n❌ Download failed:", error.message);
  process.exit(1);
});
