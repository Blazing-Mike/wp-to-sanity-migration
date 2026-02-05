const { createClient } = require("@sanity/client");

// Initialize Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  useCdn: false,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  token: process.env.SANITY_API_WRITE_TOKEN,
});

// Function to find image by post ID pattern
async function findImageByPostId(postId) {
  if (!postId) return null;

  try {
    // Search for image with pattern: post-{postId}-featured.*
    const images = await client.fetch(
      `*[_type == "sanity.imageAsset" && originalFilename match "post-${postId}-featured*"][0] {
        _id,
        originalFilename
      }`,
    );

    if (images) {
      console.log(`    ✅ Found image: ${images.originalFilename}`);
      return {
        _type: "image",
        asset: {
          _type: "reference",
          _ref: images._id,
        },
      };
    }

    console.log(
      `    ⚠️  No image found matching pattern: post-${postId}-featured.*`,
    );
    return null;
  } catch (error) {
    console.error(
      `    ❌ Error finding image for post ID ${postId}:`,
      error.message,
    );
    return null;
  }
}

// Main function to attach images to posts
async function attachImagesToPosts() {
  try {
    console.log("\n🚀 Starting image attachment process...\n");

    // Get all posts from Sanity
    const posts = await client.fetch(
      `*[_type == "post"] {
        _id,
        _rev,
        id,
        title,
        featuredImage
      } | order(id asc)`,
    );

    console.log(`Found ${posts.length} posts in Sanity\n`);
    console.log("=".repeat(70));

    let successCount = 0;
    let skippedCount = 0;
    let alreadyHasImageCount = 0;
    let noImageFoundCount = 0;
    let errorCount = 0;

    for (const post of posts) {
      console.log(`\nProcessing Post ID: ${post.id || "N/A"}`);
      console.log(`  Title: ${post.title || "Untitled"}`);
      console.log(`  Sanity ID: ${post._id}`);

      // Skip if post doesn't have a WordPress ID
      if (!post.id) {
        console.log(`  ⚠️  No WordPress post ID found, skipping...`);
        skippedCount++;
        continue;
      }

      // Skip if post already has a featured image
      if (post.featuredImage?.asset?._ref) {
        console.log(`  ℹ️  Already has featured image, skipping...`);
        alreadyHasImageCount++;
        continue;
      }

      try {
        // Find matching image
        const featuredImage = await findImageByPostId(post.id);

        if (featuredImage) {
          // Update post with featured image
          await client.patch(post._id).set({ featuredImage }).commit();

          console.log(`  ✅ Successfully attached image to post`);
          successCount++;
        } else {
          console.log(`  ➖ No matching image, leaving post unchanged`);
          noImageFoundCount++;
        }
      } catch (error) {
        console.error(`  ❌ Error processing post: ${error.message}`);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("📊 ATTACHMENT SUMMARY");
    console.log("=".repeat(70));
    console.log(`Total posts processed:           ${posts.length}`);
    console.log(`✅ Successfully attached images:  ${successCount}`);
    console.log(`ℹ️  Already had images:           ${alreadyHasImageCount}`);
    console.log(`➖ No matching image found:       ${noImageFoundCount}`);
    console.log(`⚠️  Skipped (no post ID):         ${skippedCount}`);
    console.log(`❌ Errors:                        ${errorCount}`);
    console.log("=".repeat(70));

    if (errorCount === 0 && successCount > 0) {
      console.log("\n🎉 Image attachment completed successfully!");
    } else if (successCount === 0 && noImageFoundCount > 0) {
      console.log("\n⚠️  No images were attached. Check that:");
      console.log("   - Images are uploaded to Sanity");
      console.log(
        "   - Image filenames follow the pattern: post-{id}-featured.{ext}",
      );
    } else if (errorCount > 0) {
      console.log(
        `\n⚠️  Completed with ${errorCount} error(s). Please review the logs above.`,
      );
    } else {
      console.log("\n✅ Process completed!");
    }
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

// Check for required environment variables
if (!process.env.SANITY_API_WRITE_TOKEN) {
  console.error("❌ SANITY_API_WRITE_TOKEN environment variable is required");
  console.log("\nUsage:");
  console.log(
    "SANITY_API_WRITE_TOKEN=your_token node scripts/attach-images-to-posts.js\n",
  );
  process.exit(1);
}

// Display info
console.log("\n📝 Image Attachment Script");
console.log("=".repeat(70));
console.log("This script will:");
console.log("  • Find all posts in Sanity");
console.log("  • Match each post (by WordPress ID) with images");
console.log("  • Pattern: post-{id}-featured.{ext}");
console.log("  • Attach matching images to posts");
console.log("  • Skip posts that already have images");
console.log("  • Skip posts without matching images");
console.log("=".repeat(70));

// Run the script
attachImagesToPosts();
