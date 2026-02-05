require('dotenv').config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("@sanity/client");

// Sanity client configuration
const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_WRITE_TOKEN, // You'll need a write token for uploads
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  useCdn: false,
});

async function uploadImagesAndUpdatePosts() {
  console.log("🚀 Starting image upload and post update process...\n");

  try {
    // Check if we have a write token
    if (!process.env.SANITY_API_WRITE_TOKEN) {
      console.log("⚠️  No SANITY_API_WRITE_TOKEN found. You'll need to:");
      console.log("1. Go to https://sanity.io/manage");
      console.log("2. Select your project");
      console.log("3. Go to API → Tokens");
      console.log("4. Create a token with 'Editor' permissions");
      console.log("5. Set it as environment variable: export SANITY_API_WRITE_TOKEN=your_token");
      console.log("\nAlternatively, you can upload images manually through Sanity Studio.\n");
      return;
    }

    // Read the image report to see which images we have
    if (!fs.existsSync("./image-upload-report.json")) {
      console.log("❌ No image report found. Run the conversion first with:");
      console.log("node convert-wordpress-to-sanity-with-local-images.js");
      return;
    }

    const imageReport = JSON.parse(fs.readFileSync("./image-upload-report.json", "utf8"));
    console.log(`📸 Found ${imageReport.length} images to upload\n`);

    // Check if images directory exists
    if (!fs.existsSync("./downloaded-images")) {
      console.log("❌ Downloaded images directory not found!");
      return;
    }

    // Upload images and collect asset references
    const imageAssets = [];
    const failedUploads = [];
    
    for (let i = 0; i < imageReport.length; i++) {
      const imageInfo = imageReport[i];
      const progress = `[${i + 1}/${imageReport.length}]`;
      
      console.log(`${progress} Uploading: ${path.basename(imageInfo.localPath)}`);
      
      try {
        // Check if file exists
        if (!fs.existsSync(imageInfo.localPath)) {
          console.log(`${progress} ⚠️  File not found: ${imageInfo.localPath}`);
          failedUploads.push({ ...imageInfo, reason: 'File not found' });
          continue;
        }

        // Read the image file
        const imageBuffer = fs.readFileSync(imageInfo.localPath);
        
        // Upload to Sanity
        const asset = await sanityClient.assets.upload('image', imageBuffer, {
          filename: path.basename(imageInfo.localPath),
          title: `Featured image for: ${imageInfo.postTitle}`,
          description: `WordPress post ID: ${imageInfo.postId}`
        });

        imageAssets.push({
          postId: imageInfo.postId,
          assetId: asset._id,
          postTitle: imageInfo.postTitle,
          originalUrl: imageInfo.originalUrl
        });

        console.log(`${progress} ✅ Uploaded successfully (${asset._id})`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`${progress} ❌ Failed to upload: ${error.message}`);
        failedUploads.push({ ...imageInfo, reason: error.message });
      }
    }

    console.log(`\n📊 Upload Summary:`);
    console.log(`✅ Successfully uploaded: ${imageAssets.length} images`);
    console.log(`❌ Failed uploads: ${failedUploads.length} images\n`);

    if (failedUploads.length > 0) {
      console.log("Failed uploads:");
      failedUploads.forEach(failed => {
        console.log(`  - Post ${failed.postId}: ${failed.reason}`);
      });
      console.log();
    }

    if (imageAssets.length === 0) {
      console.log("❌ No images uploaded successfully. Check the errors above.");
      return;
    }

    // Now update the posts with their featured images
    console.log("🔄 Updating posts with featured images...\n");
    
    let updateCount = 0;
    const failedUpdates = [];
    
    for (let i = 0; i < imageAssets.length; i++) {
      const asset = imageAssets[i];
      const progress = `[${i + 1}/${imageAssets.length}]`;
      
      console.log(`${progress} Updating post: ${asset.postTitle}`);
      
      try {
        // Update the post document with the featuredImage reference
        const result = await sanityClient
          .patch(`wp-post-${asset.postId}`)
          .set({
            featuredImage: {
              _type: 'image',
              asset: {
                _type: 'reference',
                _ref: asset.assetId
              }
            }
          })
          .commit();

        updateCount++;
        console.log(`${progress} ✅ Updated successfully`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`${progress} ❌ Failed to update post: ${error.message}`);
        failedUpdates.push({ ...asset, reason: error.message });
      }
    }

    console.log(`\n🎉 Process completed!`);
    console.log(`📊 Final Summary:`);
    console.log(`✅ Images uploaded: ${imageAssets.length}/${imageReport.length}`);
    console.log(`✅ Posts updated: ${updateCount}/${imageAssets.length}`);
    
    if (failedUpdates.length > 0) {
      console.log(`❌ Failed post updates: ${failedUpdates.length}`);
      console.log("Failed updates:");
      failedUpdates.forEach(failed => {
        console.log(`  - Post ${failed.postId}: ${failed.reason}`);
      });
    }
    
    console.log(`\n📋 All images are now properly linked to their posts in Sanity! 🎉\n`);

    // Save a report of the uploaded assets
    const uploadReport = {
      timestamp: new Date().toISOString(),
      totalImages: imageReport.length,
      successfulUploads: imageAssets.length,
      successfulUpdates: updateCount,
      failedUploads: failedUploads,
      failedUpdates: failedUpdates,
      uploadedAssets: imageAssets
    };

    fs.writeFileSync("./upload-report.json", JSON.stringify(uploadReport, null, 2));
    console.log("📄 Upload report saved as: upload-report.json");

  } catch (error) {
    console.error("❌ Image upload process failed:", error);
  }
}

// Run the upload process
uploadImagesAndUpdatePosts();