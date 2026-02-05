const { createClient } = require("@sanity/client");

// Initialize Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  useCdn: false,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  token: process.env.SANITY_API_WRITE_TOKEN,
});

const DRY_RUN = false; // 🔁 Set to false to apply changes

// HTML Entity Decoder
function decodeHtmlEntities(text) {
  if (typeof text !== "string") return text;

  // Decode common HTML entities
  return text
    .replace(/&#8217;/g, "'") // Right single quotation mark (apostrophe)
    .replace(/&#8216;/g, "'") // Left single quotation mark (apostrophe)
    .replace(/&#8221;/g, '"') // Right double quotation mark
    .replace(/&#8220;/g, '"') // Left double quotation mark
    .replace(/&#8211;/g, "–") // En dash
    .replace(/&#8212;/g, "—") // Em dash
    .replace(/&#8230;/g, "…") // Horizontal ellipsis
    .replace(/&#8200;/g, "") // Zero-width space (remove)
    .replace(/&#8203;/g, "") // Zero-width space (remove)
    .replace(/&nbsp;/g, " ") // Non-breaking space
    .replace(/&amp;/g, "&") // Ampersand
    .replace(/</g, "<") // Less than
    .replace(/>/g, ">"); // Greater than
}

async function decodeTitlesAndExcerpts() {
  // Fetch posts with title/excerpt for testing (limit to 1 first)

  const query = `*[_type == "post" && defined(title) || defined(excerpt) || defined(body)] { _id, title, excerpt, body }`;

  const posts = await client.fetch(query);

  console.log(`🔍 Found ${posts.length} posts to process.`);

  let changedCount = 0;
  const patches = [];

  for (const post of posts) {
    console.log(`\n📝 Processing post: ${post._id}`);

    const originalTitle = post.title || "";
    const originalExcerpt = post.excerpt.rendered || "";
    const originalBody = post.body || "";

    const newTitle = decodeHtmlEntities(originalTitle);
    const newExcerpt = decodeHtmlEntities(originalExcerpt);
    const newBody = decodeHtmlEntities(originalBody);

    const titleChanged = originalTitle !== newTitle;
    const excerptChanged = originalExcerpt !== newExcerpt;
    const bodyChanged = originalBody !== newBody;

    if (titleChanged || excerptChanged || bodyChanged) {
      changedCount++;

      console.log(`  - Title changed: ${titleChanged}`);
      if (titleChanged) console.log(`    "${originalTitle}" → "${newTitle}"`);

      console.log(`  - Excerpt changed: ${excerptChanged}`);
      if (excerptChanged)
        console.log(`    "${originalExcerpt}" → "${newExcerpt}"`);

      console.log(`  - Body changed: ${bodyChanged}`);
      if (bodyChanged) console.log(`    "${originalBody}" → "${newBody}"`);

      if (!DRY_RUN) {
        const patch = client.patch(post._id);
        if (titleChanged) patch.set({ title: newTitle });
        if (excerptChanged) patch.set({ excerpt: newExcerpt });
        if (bodyChanged) patch.set({ body: newBody });
        patches.push(patch.commit());
      }
    } else {
      console.log(`  - No changes needed.`);
    }
  }

  if (!DRY_RUN && patches.length > 0) {
    console.log(`\n🔄 Applying ${patches.length} patches...`);
    await Promise.all(patches);
    console.log("✅ All patches applied!");
  }

  console.log(`\n🎉 Processed ${changedCount} post(s) with changes.`);
  if (DRY_RUN) {
    console.log("ℹ️  Set DRY_RUN = false to apply changes.");
  }
}

// Run it
decodeTitlesAndExcerpts().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
