const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { createClient } = require("@sanity/client");

// Sanity client configuration - matches your project setup
const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ,
  token: process.env.SANITY_API_WRITE_TOKEN, // You'll need a write token for uploads
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  useCdn: false,
});

// Read the WordPress posts JSON file
const wordpressData = JSON.parse(fs.readFileSync("./test-posts.json", "utf8"));

// Function to download image from URL and upload to Sanity
async function downloadAndUploadImage(imageUrl, filename) {
  if (!imageUrl) return null;

  try {
    console.log(`📸 Downloading image: ${imageUrl}`);

    const imageBuffer = await new Promise((resolve, reject) => {
      const client = imageUrl.startsWith("https") ? https : http;

      client
        .get(imageUrl, (response) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to download image: ${response.statusCode}`)
            );
            return;
          }

          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve(Buffer.concat(chunks)));
          response.on("error", reject);
        })
        .on("error", reject);
    });

    // Upload to Sanity
    const asset = await sanityClient.assets.upload("image", imageBuffer, {
      filename: filename || "featured-image.jpg",
    });

    console.log(`✅ Image uploaded: ${asset._id}`);

    return {
      _type: "image",
      asset: {
        _type: "reference",
        _ref: asset._id,
      },
    };
  } catch (error) {
    console.error(`❌ Failed to upload image ${imageUrl}:`, error.message);
    return null;
  }
}

// Function to convert WordPress post to Sanity document (matching your actual schema)
async function convertToSanityPost(wpPost) {
  // Generate Sanity document ID from WordPress ID
  const sanityId = `wp-post-${wpPost.id}`;

  // Convert HTML content to portable text blocks (simplified)
  const contentBlocks = convertHtmlToPortableText(wpPost.content.rendered);

  // Download and upload featured image if available
  let featuredImage = null;
  if (wpPost.jetpack_featured_media_url) {
    const filename = `post-${wpPost.id}-featured.jpg`;
    featuredImage = await downloadAndUploadImage(
      wpPost.jetpack_featured_media_url,
      filename
    );
  }

  // Create Sanity document structure matching your actual post schema
  const sanityDoc = {
    _id: sanityId,
    _type: "post",
    title: wpPost.title.rendered, // String, not object
    slug: {
      _type: "slug",
      current: wpPost.slug,
    },
    date: new Date(wpPost.date_gmt).toISOString(),
    content: {
      rendered: contentBlocks,
    },
    excerpt: {
      rendered: wpPost.excerpt.rendered
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/&hellip;/g, "...") // Replace HTML entities
        .replace(/&nbsp;/g, " ")
        .trim(),
    },
    author: [
      {
        _type: "reference",
        _ref: "author-asido-admin",
      },
    ], // Array of references as per your schema
    featured_media: wpPost.featured_media,
    jetpack_featured_media_url: wpPost.jetpack_featured_media_url || null,
    featuredImage: featuredImage, // Add the uploaded Sanity image
    categories: [], // Will be populated with category references
    tags: wpPost.tags || [],
  };

  return sanityDoc;
}

// Helper function to convert HTML to Portable Text blocks
function convertHtmlToPortableText(htmlContent) {
  // This is a simplified converter - you might want to use a proper HTML to Portable Text library
  // For now, we'll create basic text blocks

  // Split by paragraphs and headers
  const paragraphs = htmlContent
    .replace(/<h([1-6])[^>]*>/g, "\n---HEADER$1---")
    .replace(/<\/h[1-6]>/g, "---/HEADER---\n")
    .replace(/<p[^>]*>/g, "\n---PARA---")
    .replace(/<\/p>/g, "---/PARA---\n")
    .split(/\n/)
    .filter((p) => p.trim());

  const blocks = [];
  let blockKey = 0;

  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (
      !trimmed ||
      trimmed === "---PARA---" ||
      trimmed === "---/PARA---" ||
      trimmed === "---/HEADER---"
    )
      return;

    // Check if it's a header
    const headerMatch = trimmed.match(/---HEADER(\d)---(.+)/);
    if (headerMatch) {
      const level = parseInt(headerMatch[1]);
      const text = headerMatch[2]
        .replace(/<[^>]*>/g, "")
        .replace(/---\/HEADER---/g, "") // Remove closing HEADER markers
        .replace(/---\/PARA---/g, "") // Remove any PARA markers mixed in
        .trim();
      if (text) {
        blocks.push({
          _type: "block",
          _key: `block-${blockKey++}`,
          style: `h${level}`,
          markDefs: [],
          children: [
            {
              _type: "span",
              text: text,
              marks: [],
            },
          ],
        });
      }
      return;
    }

    // Regular paragraph
    if (trimmed.startsWith("---PARA---")) {
      const text = trimmed
        .replace("---PARA---", "")
        .replace(/<[^>]*>/g, "")
        .replace(/---\/PARA---/g, "") // Remove closing PARA markers
        .replace(/---\/HEADER---/g, "") // Remove closing HEADER markers
        .trim();
      if (text) {
        blocks.push({
          _type: "block",
          _key: `block-${blockKey++}`,
          style: "normal",
          markDefs: [],
          children: [
            {
              _type: "span",
              text: text,
              marks: [],
            },
          ],
        });
      }
    } else {
      // Any other content
      const text = trimmed
        .replace(/<[^>]*>/g, "")
        .replace(/---\/PARA---/g, "") // Remove closing PARA markers
        .replace(/---\/HEADER---/g, "") // Remove closing HEADER markers
        .replace(/---PARA---/g, "") // Remove opening PARA markers
        .trim();
      if (text) {
        blocks.push({
          _type: "block",
          _key: `block-${blockKey++}`,
          style: "normal",
          markDefs: [],
          children: [
            {
              _type: "span",
              text: text,
              marks: [],
            },
          ],
        });
      }
    }
  });

  return blocks.length > 0
    ? blocks
    : [
        {
          _type: "block",
          _key: "default-block",
          style: "normal",
          markDefs: [],
          children: [
            {
              _type: "span",
              text: htmlContent.replace(/<[^>]*>/g, "").trim() || "No content",
              marks: [],
            },
          ],
        },
      ];
}

// Create author document matching your existing schema
function createAuthorDocument() {
  return {
    _id: "author-asido-admin",
    _type: "author",
    name: "Asido Admin",
    slug: {
      _type: "slug",
      current: "asido-admin",
    },
    role: "Content Administrator",
    bio: [
      {
        _type: "block",
        style: "normal",
        markDefs: [],
        children: [
          {
            _type: "span",
            text: "Content administrator for Asido Foundation, dedicated to mental health awareness and advocacy.",
            marks: [],
          },
        ],
      },
    ],
  };
}

// Create category documents and mapping
function createCategoryDocuments() {
  // Create a map of common categories based on WordPress category IDs
  const categoryMap = {
    1: {
      id: "category-1",
      title: "Mental Health",
      slug: "mental-health",
      description: "Articles about mental health awareness and advocacy",
    },
    35: {
      id: "category-35",
      title: "Lifestyle",
      slug: "lifestyle",
      description: "Lifestyle articles related to mental wellbeing",
    },
    47: {
      id: "category-47",
      title: "Advocacy",
      slug: "advocacy",
      description: "Mental health advocacy and awareness campaigns",
    },
    29: {
      id: "category-29",
      title: "Health & Wellness",
      slug: "health-wellness",
      description: "Health and wellness articles",
    },
  };

  const categories = Object.values(categoryMap).map((cat) => ({
    _id: cat.id,
    _type: "category",
    title: cat.title,
    slug: {
      _type: "slug",
      current: cat.slug,
    },
    description: cat.description,
  }));

  return { categories, categoryMap };
}

// Function to get category references for a post
function getCategoryReferences(wpCategories, categoryMap) {
  if (!wpCategories || wpCategories.length === 0) return [];

  return wpCategories
    .map((catId) => {
      const category = categoryMap[catId];
      if (category) {
        return {
          _type: "reference",
          _ref: category.id,
        };
      }
      // If category doesn't exist in our map, create a generic one
      return {
        _type: "reference",
        _ref: `category-${catId}`,
      };
    })
    .filter(Boolean);
}

// Main conversion function
async function convertWordPressData() {
  try {
    console.log("🚀 Starting WordPress to Sanity conversion...\n");

    const sanityDocuments = [];

    // Add author document
    sanityDocuments.push(createAuthorDocument());

    // Add category documents and get category mapping
    const { categories, categoryMap } = createCategoryDocuments();
    sanityDocuments.push(...categories);

    // Convert WordPress posts (with async image processing)
    for (const wpPost of wordpressData) {
      console.log(`📝 Converting post: ${wpPost.title.rendered}`);

      const sanityDoc = await convertToSanityPost(wpPost);

      // Add category references
      sanityDoc.categories = getCategoryReferences(
        wpPost.categories,
        categoryMap
      );

      sanityDocuments.push(sanityDoc);

      console.log(`✅ Converted: ${wpPost.title.rendered}\n`);
    }

    // Write NDJSON file (one JSON document per line)
    const ndjsonContent = sanityDocuments
      .map((doc) => JSON.stringify(doc))
      .join("\n");

    fs.writeFileSync("./sanity-posts.ndjson", ndjsonContent, "utf8");

    console.log("\n🎉 Conversion completed successfully!");
    console.log(
      `✅ Converted ${wordpressData.length} WordPress posts to Sanity format`
    );
    console.log(
      `📄 Created ${sanityDocuments.length} total documents (including author and categories)`
    );
    console.log("💾 Saved as: sanity-posts.ndjson");
    console.log("\n📋 Next steps:");
    console.log("1. Review the generated sanity-posts.ndjson file");
    console.log(
      "2. Run: npx sanity dataset import sanity-posts.ndjson production"
    );
    console.log("3. All images have been uploaded directly to Sanity! 🖼️");
  } catch (error) {
    console.error("❌ Conversion failed:", error);
    process.exit(1);
  }
}

// Run the conversion
convertWordPressData();
