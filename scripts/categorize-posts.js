const { createClient } = require("@sanity/client");

// Initialize Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  useCdn: false,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  token: process.env.SANITY_API_WRITE_TOKEN,
});

// Define categories with their keywords for smart matching
const CATEGORIES = [
  {
    title: "Mental Health",
    slug: "mental-health",
    description:
      "Articles focused on mental health disorders, treatments, awareness, and wellbeing.",
    keywords: [
      "mental health",
      "mental illness",
      "depression",
      "anxiety",
      "suicide",
      "psycho",
      "psychiatric",
      "therapy",
      "counseling",
      "emotional wellbeing",
      "bipolar",
      "schizophrenia",
      "phobia",
      "trauma",
      "ptsd",
      "stress",
      "psychological",
      "psychiatry",
      "mental disorder",
      "emotional health",
      "mental wellness",
      "psychosocial",
      "stigma",
      "mental health act",
    ],
  },
  {
    title: "Lifestyle",
    slug: "lifestyle",
    description:
      "Articles about daily living, relationships, work-life balance, and personal development.",
    keywords: [
      "lifestyle",
      "relationship",
      "workplace",
      "work",
      "family",
      "parenting",
      "marriage",
      "friendship",
      "social",
      "kindness",
      "gratitude",
      "resilience",
      "success",
      "self-improvement",
      "confidence",
      "emotional intelligence",
      "happiness",
      "life",
      "living",
      "daily",
      "routine",
      "balance",
      "japa",
    ],
  },
  {
    title: "Health",
    slug: "health",
    description:
      "Articles covering physical health conditions and their connection to mental wellbeing.",
    keywords: [
      "health",
      "disease",
      "illness",
      "sickle cell",
      "diabetes",
      "hiv",
      "epilepsy",
      "dementia",
      "menopause",
      "pregnancy",
      "maternal",
      "infertility",
      "medical",
      "physical",
      "nutrition",
      "eating",
      "food",
      "diet",
      "loneliness in elderly",
      "caregiving",
      "aging",
    ],
  },
  {
    title: "Advocacy",
    slug: "advocacy",
    description:
      "Articles about mental health advocacy, policy, awareness campaigns, and social change.",
    keywords: [
      "advocacy",
      "awareness",
      "campaign",
      "policy",
      "law",
      "act",
      "legislation",
      "reform",
      "rights",
      "discrimination",
      "stigma",
      "decriminalize",
      "world mental health day",
      "world suicide prevention",
      "homeless",
      "asido foundation",
      "asido @",
      "conference",
      "movement",
      "change",
      "nigeria",
      "society",
      "community",
      "government",
      "access to services",
    ],
  },
];

// Create or get existing categories
async function createCategories() {
  console.log("\n📁 Creating/Verifying Categories...\n");
  const categoryRefs = {};

  for (const category of CATEGORIES) {
    try {
      // Check if category already exists
      const existing = await client.fetch(
        `*[_type == "category" && slug.current == $slug][0]`,
        { slug: category.slug }
      );

      if (existing) {
        console.log(`✅ Category "${category.title}" already exists`);
        categoryRefs[category.slug] = {
          _type: "reference",
          _ref: existing._id,
          _key: existing._id,
        };
      } else {
        // Create new category
        const newCategory = await client.create({
          _type: "category",
          title: category.title,
          slug: {
            _type: "slug",
            current: category.slug,
          },
          description: category.description,
        });

        console.log(`✅ Created category "${category.title}"`);
        categoryRefs[category.slug] = {
          _type: "reference",
          _ref: newCategory._id,
          _key: newCategory._id,
        };
      }
    } catch (error) {
      console.error(
        `❌ Error with category "${category.title}":`,
        error.message
      );
    }
  }

  return categoryRefs;
}

// Determine categories for a post based on title and content
function determineCategories(post) {
  const matchedCategories = new Set();
  const textToAnalyze = `${post.title || ""} ${
    post.excerpt?.rendered || ""
  }`.toLowerCase();

  // Check each category's keywords
  for (const category of CATEGORIES) {
    for (const keyword of category.keywords) {
      if (textToAnalyze.includes(keyword.toLowerCase())) {
        matchedCategories.add(category.slug);
        break; // Found a match, move to next category
      }
    }
  }

  // Default to Mental Health if no match found (since most posts are about mental health)
  if (matchedCategories.size === 0) {
    matchedCategories.add("mental-health");
  }

  return Array.from(matchedCategories);
}

// Assign categories to posts
async function assignCategoriesToPosts(categoryRefs) {
  console.log("\n📝 Assigning Categories to Posts...\n");

  // Get all posts
  const posts = await client.fetch(
    `*[_type == "post"] {
      _id,
      title,
      excerpt,
      categories
    } | order(_createdAt desc)`
  );

  console.log(`Found ${posts.length} posts to categorize\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const categoryStats = {
    "mental-health": 0,
    lifestyle: 0,
    health: 0,
    advocacy: 0,
  };

  for (const post of posts) {
    try {
      // Skip if post already has categories
      if (post.categories && post.categories.length > 0) {
        console.log(`⏭️  Skipped: "${post.title}" (already has categories)`);
        skippedCount++;
        continue;
      }

      // Determine appropriate categories
      const categorySlugs = determineCategories(post);
      const categoryReferences = categorySlugs.map(
        (slug) => categoryRefs[slug]
      );

      // Update category stats
      categorySlugs.forEach((slug) => categoryStats[slug]++);

      // Update post with categories
      await client
        .patch(post._id)
        .set({ categories: categoryReferences })
        .commit();

      const categoryNames = categorySlugs
        .map((slug) => CATEGORIES.find((c) => c.slug === slug).title)
        .join(", ");

      console.log(`✅ "${post.title}"`);
      console.log(`   Categories: ${categoryNames}\n`);

      updatedCount++;
    } catch (error) {
      console.error(`❌ Error updating "${post.title}":`, error.message);
      errorCount++;
    }
  }

  return { updatedCount, skippedCount, errorCount, categoryStats };
}

// Main function
async function categorizeAllPosts() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🏷️  INTELLIGENT POST CATEGORIZATION");
    console.log("=".repeat(70));

    // Step 1: Create/verify categories
    const categoryRefs = await createCategories();

    // Step 2: Assign categories to posts
    const stats = await assignCategoriesToPosts(categoryRefs);

    // Step 3: Display summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 CATEGORIZATION SUMMARY");
    console.log("=".repeat(70));
    console.log(`✅ Posts updated:           ${stats.updatedCount}`);
    console.log(`⏭️  Posts skipped:           ${stats.skippedCount}`);
    console.log(`❌ Errors:                  ${stats.errorCount}`);
    console.log("\n" + "─".repeat(70));
    console.log("📈 CATEGORY DISTRIBUTION:");
    console.log("─".repeat(70));

    for (const [slug, count] of Object.entries(stats.categoryStats)) {
      const category = CATEGORIES.find((c) => c.slug === slug);
      const percentage =
        stats.updatedCount > 0
          ? ((count / stats.updatedCount) * 100).toFixed(1)
          : 0;
      console.log(
        `${category.title.padEnd(20)} ${count
          .toString()
          .padStart(4)} posts (${percentage}%)`
      );
    }

    console.log("=".repeat(70));

    if (stats.errorCount === 0) {
      console.log("\n🎉 All posts categorized successfully!");
    } else {
      console.log(`\n⚠️  Completed with ${stats.errorCount} error(s).`);
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
    "SANITY_API_WRITE_TOKEN=your_token node scripts/categorize-posts.js\n"
  );
  process.exit(1);
}

console.log("\n🤖 Intelligent Post Categorization");
console.log("This script will:");
console.log(
  "  • Create 4 categories: Mental Health, Lifestyle, Health, Advocacy"
);
console.log("  • Analyze post titles and content");
console.log("  • Intelligently assign relevant categories");
console.log("  • Skip posts that already have categories");
console.log("  • Support multiple categories per post\n");

// Run the script
categorizeAllPosts();
