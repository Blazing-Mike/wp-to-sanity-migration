const { createClient } = require("@sanity/client");
const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config({ path: ".env.local" });

// Initialize Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  useCdn: false,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  token: process.env.SANITY_API_WRITE_TOKEN,
});

// Initialize Anthropic (Claude) client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DRY_RUN = false; // Set to false to apply changes

// Generate unique key for Sanity blocks
function generateKey() {
  return Math.random().toString(36).substring(2, 11);
}

// Convert Portable Text to plain text for AI processing
function portableTextToPlainText(body) {
  if (!Array.isArray(body)) return "";

  return body
    .map((block) => {
      if (block._type === "block" && Array.isArray(block.children)) {
        return block.children
          .map((child) => {
            const text = child.text || "";
            // Preserve formatting markers
            if (child.marks?.includes("strong")) {
              return `<strong>${text}</strong>`;
            }
            if (child.marks?.includes("em")) {
              return `<em>${text}</em>`;
            }
            return text;
          })
          .join("");
      }
      return "";
    })
    .join("\n\n");
}

// Convert formatted text back to Portable Text
function formattedTextToPortableText(formattedText) {
  const blocks = [];
  const paragraphs = formattedText.split(/\n\n+/).filter((p) => p.trim());

  paragraphs.forEach((para) => {
    const children = [];
    let currentText = "";
    let currentMarks = [];

    // Parse inline formatting
    const parts = para.split(/(<\/?strong>|<\/?em>)/g);

    parts.forEach((part) => {
      if (part === "<strong>") {
        if (currentText) {
          children.push({
            _key: generateKey(),
            _type: "span",
            text: currentText,
            marks: [...currentMarks],
          });
          currentText = "";
        }
        currentMarks.push("strong");
      } else if (part === "</strong>") {
        if (currentText) {
          children.push({
            _key: generateKey(),
            _type: "span",
            text: currentText,
            marks: [...currentMarks],
          });
          currentText = "";
        }
        currentMarks = currentMarks.filter((m) => m !== "strong");
      } else if (part === "<em>") {
        if (currentText) {
          children.push({
            _key: generateKey(),
            _type: "span",
            text: currentText,
            marks: [...currentMarks],
          });
          currentText = "";
        }
        currentMarks.push("em");
      } else if (part === "</em>") {
        if (currentText) {
          children.push({
            _key: generateKey(),
            _type: "span",
            text: currentText,
            marks: [...currentMarks],
          });
          currentText = "";
        }
        currentMarks = currentMarks.filter((m) => m !== "em");
      } else if (part.trim()) {
        currentText += part;
      }
    });

    // Add any remaining text
    if (currentText) {
      children.push({
        _key: generateKey(),
        _type: "span",
        text: currentText,
        marks: [...currentMarks],
      });
    }

    if (children.length > 0) {
      blocks.push({
        _key: generateKey(),
        _type: "block",
        style: "normal",
        children,
      });
    }
  });

  return blocks;
}

// Extract first paragraph from body for excerpt
function generateExcerpt(body) {
  if (!Array.isArray(body) || body.length === 0) return null;

  // Get first block that has text
  for (const block of body) {
    if (block._type === "block" && Array.isArray(block.children)) {
      const text = block.children
        .map((child) => child.text || "")
        .join("")
        .trim();

      if (text) {
        // Limit to ~160 characters for better SEO
        const excerpt =
          text.length > 160 ? text.substring(0, 160).trim() + "..." : text;

        return {
          rendered: excerpt,
        };
      }
    }
  }

  return null;
}

// Format content using Claude AI
async function formatWithAI(plainText, postTitle) {
  const prompt = `You are a professional content formatter and editor for a mental health organization's blog. Your goal is to improve readability while maintaining natural flow.

Format the following blog post content intelligently according to these rules:

1. **Smart line breaks**: 
   - Add line breaks ONLY after complete sentences
   - DO NOT break after: abbreviations (Dr., Mr., Mrs., vs., etc.), initials (e.g., J. Smith), decimal numbers (3.5), ellipsis (...)
   - DO break after: complete thoughts, independent clauses that end with periods
   - Keep related sentences together in the same paragraph when they discuss the same idea
   - Only start a new paragraph when the topic or idea shifts

2. **Intelligent punctuation**:
   - Add missing punctuation where needed (commas, periods, question marks)
   - Fix run-on sentences by adding appropriate punctuation
   - Ensure proper spacing after punctuation marks
   - Fix any obvious grammatical errors

3. **Bold text formatting**:
   - Keep existing <strong> tags intact
   - Add paragraph breaks before and after bold section headings
   - Bold section headers like "Introduction:", "Conclusion:", "Discussion:" if they appear

4. **Paragraph structure**:
   - Group 2-4 related sentences into cohesive paragraphs
   - Use EXACTLY 2 line breaks (\\n\\n) to separate paragraphs
   - Avoid single-sentence paragraphs unless it's a strong statement or transition

5. **Special sections**:
   - If there's a "Conclusion:" section, make it bold and on its own line
   - Author info at the end (name, title, organization, date) should each be on separate lines
   - Lists should maintain their structure

6. **Preserve content**:
   - Keep the original meaning and all content intact
   - Do NOT add new content or remove any information
   - Maintain the author's voice and tone

CRITICAL RULES:
- Keep all <strong> and </strong> tags exactly as they are
- DO NOT add markdown formatting (no **, no #, no bullet points)
- DO NOT add explanations or meta-commentary
- Only output the formatted text
- Be smart about line breaks - prioritize natural reading flow over rigid rules

Blog Post Title: "${postTitle}"

Content to format:
${plainText}

Formatted content:`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return message.content[0].text;
  } catch (error) {
    console.error("❌ AI formatting failed:", error.message);
    throw error;
  }
}

// Main function
async function formatPostsWithAI() {
  // For testing on fewer posts first (recommended):
  const query = `*[_type == "post"] | order(_createdAt desc) [101...200] { 
    _id, 
    title, 
    body,
    excerpt
  }`;

  console.log("🔍 Fetching posts...");
  const posts = await client.fetch(query);
  console.log(`📄 Found ${posts.length} posts to process\n`);

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  let excerptCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const progress = `[${i + 1}/${posts.length}]`;

    console.log(`${progress} Processing: ${post.title}`);
    console.log(`   Post ID: ${post._id}`);

    try {
      // Convert Portable Text to plain text
      const plainText = portableTextToPlainText(post.body);

      if (!plainText.trim()) {
        console.log(`   ⚠️  Skipping - no content\n`);
        skippedCount++;
        continue;
      }

      console.log(`   🤖 Sending to AI for formatting...`);

      // Format with AI
      const formattedText = await formatWithAI(plainText, post.title);

      console.log(`   ✅ AI formatting complete`);

      // Convert back to Portable Text
      const newBody = formattedTextToPortableText(formattedText);

      // Check if content changed
      const hasChanged = JSON.stringify(post.body) !== JSON.stringify(newBody);

      // Check if excerpt needs fixing or is missing
      let excerptToSet = null;
      let excerptAction = null;

      if (!post.excerpt) {
        // No excerpt at all - generate one
        excerptToSet = generateExcerpt(newBody);
        excerptAction = "add";
      } else if (typeof post.excerpt === "string") {
        // Excerpt is stored as string (wrong type) - fix it
        excerptToSet = {
          rendered:
            post.excerpt.length > 160
              ? post.excerpt.substring(0, 160).trim() + "..."
              : post.excerpt,
        };
        excerptAction = "fix";
      } else if (
        !post.excerpt.rendered ||
        post.excerpt.rendered.trim() === ""
      ) {
        // Excerpt object exists but rendered is empty - generate one
        excerptToSet = generateExcerpt(newBody);
        excerptAction = "add";
      }

      if (!hasChanged && !excerptToSet) {
        console.log(`   ℹ️  No changes needed\n`);
        skippedCount++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`   📝 [DRY RUN] Would update post`);
        if (hasChanged) {
          console.log(
            `   • Body: Original blocks: ${post.body.length} → New blocks: ${newBody.length}`,
          );
        }
        if (excerptToSet) {
          const action =
            excerptAction === "fix" ? "Fix excerpt type" : "Add excerpt";
          console.log(`   • ${action}: ${excerptToSet.rendered.length} chars`);
          console.log(`     "${excerptToSet.rendered}"`);
        }
        console.log(`   ---`);
        if (hasChanged) {
          console.log(`   Preview of formatted content:`);
          console.log(formattedText.substring(0, 400) + "...\n");
        }
      } else {
        console.log(`   💾 Saving to Sanity...`);

        const patch = client.patch(post._id);

        if (hasChanged) {
          patch.set({ body: newBody });
          console.log(`   ✅ Updated body`);
        }

        if (excerptToSet) {
          patch.set({ excerpt: excerptToSet });
          const action =
            excerptAction === "fix" ? "Fixed excerpt type" : "Added excerpt";
          console.log(`   ✅ ${action}: "${excerptToSet.rendered}"`);
          excerptCount++;
        }

        await patch.commit();
        successCount++;
        console.log(`   ✅ Successfully saved\n`);
      }

      // Rate limiting - wait 2 seconds between requests
      if (i < posts.length - 1) {
        console.log(`   ⏳ Waiting 2 seconds before next post...\n`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}\n`);
      failCount++;
      continue;
    }
  }

  // Summary
  console.log("=".repeat(60));
  if (DRY_RUN) {
    console.log("✅ Dry run complete!");
    console.log(`   📊 Total posts checked: ${posts.length}`);
    console.log(
      `   ✏️  Would update: ${posts.length - skippedCount - failCount}`,
    );
    console.log(`   ⏭️  No changes needed: ${skippedCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log("\nℹ️  Set DRY_RUN = false to apply changes");
  } else {
    console.log("🎉 Formatting complete!");
    console.log(`   ✅ Successfully updated: ${successCount} posts`);
    console.log(`   📝 Excerpts added: ${excerptCount}`);
    console.log(`   ⏭️  Skipped (no changes): ${skippedCount}`);
    console.log(`   ❌ Failed: ${failCount} posts`);
  }
}

// Run it
formatPostsWithAI().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
