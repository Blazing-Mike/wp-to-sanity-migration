/**
 * Script to convert plain text URLs to clickable links in Sanity post bodies
 * Identifies URLs like:
 * - https://example.com
 * - http://example.com
 * - www.example.com
 * - example.com
 * - asivuri.com
 */

const { createClient } = require("@sanity/client");
require("dotenv").config({ path: ".env.local" });

// Initialize Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ,
  useCdn: false,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  token: process.env.SANITY_API_WRITE_TOKEN,
});

// Comprehensive URL regex pattern
const URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;

// More specific patterns for common domains
const SPECIFIC_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?asivuri\.com[^\s]*/gi,
  /(?:https?:\/\/)?(?:www\.)?asido[^\s]*\.(?:com|org|ng)[^\s]*/gi,
];

/**
 * Normalize URL to have proper protocol
 */
function normalizeUrl(url) {
  let normalized = url.trim();

  // Remove trailing punctuation that's not part of the URL
  normalized = normalized.replace(/[.,;:!?]+$/, "");

  // Add https:// if no protocol exists
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  return normalized;
}

/**
 * Check if a URL is valid
 */
function isValidUrl(text) {
  try {
    // Must contain a dot and domain extension
    if (!/\.[a-z]{2,}($|\/)/i.test(text)) {
      return false;
    }

    // Must not be just a file extension
    if (/^\.[a-z]+$/i.test(text)) {
      return false;
    }

    // Filter out text with multiple dots that aren't URLs (ellipsis patterns)
    if (/\.{2,}/.test(text)) {
      return false;
    }

    // Filter out fragments that start or end with dots
    if (/^\.|\.{2,}$/.test(text)) {
      return false;
    }

    // Must have at least one letter before the dot
    if (!/[a-z]{2,}\./i.test(text)) {
      return false;
    }

    // Common false positives
    const falsePositives = [
      /^etc\./i,
      /^e\.g\./i,
      /^i\.e\./i,
      /^vs\./i,
      /^\d+\.\d+/,
      /\.\.\./, // ellipsis
      /^\.+/, // starts with dots
      /\.+$/, // ends with dots
    ];

    for (const pattern of falsePositives) {
      if (pattern.test(text)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Find all URLs in a text string
 */
function findUrls(text) {
  const urls = new Set();

  // Check with main regex
  const matches = text.match(URL_REGEX);
  if (matches) {
    matches.forEach((match) => {
      if (isValidUrl(match)) {
        urls.add(match);
      }
    });
  }

  // Check with specific patterns
  SPECIFIC_PATTERNS.forEach((pattern) => {
    const specificMatches = text.match(pattern);
    if (specificMatches) {
      specificMatches.forEach((match) => {
        if (isValidUrl(match)) {
          urls.add(match);
        }
      });
    }
  });

  return Array.from(urls);
}

/**
 * Check if text already has link marks
 */
function hasLinkMark(span) {
  return (
    span.marks &&
    span.marks.some(
      (mark) => typeof mark === "string" && mark.startsWith("link-")
    )
  );
}

/**
 * Split text into parts: plain text and URLs
 */
function splitTextWithUrls(text) {
  const urls = findUrls(text);
  if (urls.length === 0) return [{ type: "text", content: text }];

  const parts = [];
  let remainingText = text;
  let offset = 0;

  // Sort URLs by their position in the text
  const urlPositions = urls
    .map((url) => ({
      url,
      index: text.indexOf(url),
    }))
    .sort((a, b) => a.index - b.index);

  urlPositions.forEach(({ url, index }) => {
    // Add text before URL
    if (index > offset) {
      const beforeText = remainingText.substring(0, index - offset);
      if (beforeText) {
        parts.push({ type: "text", content: beforeText });
      }
    }

    // Add URL
    parts.push({ type: "url", content: url });

    // Update remaining text
    const urlEnd = index - offset + url.length;
    remainingText = remainingText.substring(urlEnd);
    offset = index + url.length;
  });

  // Add remaining text
  if (remainingText) {
    parts.push({ type: "text", content: remainingText });
  }

  return parts;
}

/**
 * Convert a text span with URLs to multiple spans with link marks
 */
function convertSpanWithUrls(span, block) {
  const text = span.text || "";
  const parts = splitTextWithUrls(text);

  if (parts.length === 1 && parts[0].type === "text") {
    // No URLs found, return original span
    return [span];
  }

  // Create new spans
  const newSpans = parts.map((part) => {
    if (part.type === "url") {
      const linkMarkKey = `link-${Math.random().toString(36).substr(2, 9)}`;
      const normalizedUrl = normalizeUrl(part.content);

      // Add link mark definition to block if not exists
      if (!block.markDefs) {
        block.markDefs = [];
      }

      // Check if this exact URL already has a mark
      let existingMark = block.markDefs.find(
        (mark) => mark._type === "link" && mark.href === normalizedUrl
      );

      if (!existingMark) {
        block.markDefs.push({
          _key: linkMarkKey,
          _type: "link",
          href: normalizedUrl,
        });
        existingMark = { _key: linkMarkKey };
      }

      return {
        _type: "span",
        _key: `span-${Math.random().toString(36).substr(2, 9)}`,
        text: part.content,
        marks: [...(span.marks || []), existingMark._key],
      };
    } else {
      return {
        _type: "span",
        _key: `span-${Math.random().toString(36).substr(2, 9)}`,
        text: part.content,
        marks: span.marks || [],
      };
    }
  });

  return newSpans;
}

/**
 * Process a single block to find and convert URLs
 */
function processBlock(block) {
  if (block._type !== "block" || !block.children) {
    return { block, modified: false };
  }

  let modified = false;
  const newChildren = [];

  for (const child of block.children) {
    if (child._type === "span" && child.text && !hasLinkMark(child)) {
      const urls = findUrls(child.text);

      if (urls.length > 0) {
        // This span has URLs, convert them
        const newSpans = convertSpanWithUrls(child, block);
        newChildren.push(...newSpans);
        modified = true;
      } else {
        newChildren.push(child);
      }
    } else {
      newChildren.push(child);
    }
  }

  if (modified) {
    return {
      block: {
        ...block,
        children: newChildren,
      },
      modified: true,
    };
  }

  return { block, modified: false };
}

/**
 * Process post body to convert plain text URLs to links
 */
function processPostBody(body) {
  if (!Array.isArray(body)) return { body, modified: false };

  let modified = false;
  const newBody = body.map((block) => {
    const result = processBlock(block);
    if (result.modified) {
      modified = true;
    }
    return result.block;
  });

  return { body: newBody, modified };
}

/**
 * Main execution
 */
async function formatLinksInPosts() {
  try {
    console.log("🔍 Fetching all posts...\n");

    const posts = await client.fetch(`
      *[_type == "post" && defined(body)] {
        _id,
        title,
        body
      }
    `);

    console.log(`Found ${posts.length} posts to check\n`);

    let processedCount = 0;
    let modifiedCount = 0;
    let errorCount = 0;
    const modifiedPosts = [];

    for (const post of posts) {
      try {
        processedCount++;
        console.log(
          `[${processedCount}/${posts.length}] Processing: ${post.title}`
        );

        const result = processPostBody(post.body);

        if (result.modified) {
          // Update the post in Sanity
          await client.patch(post._id).set({ body: result.body }).commit();

          modifiedCount++;
          modifiedPosts.push(post.title);
          console.log(`  ✅ Updated with clickable links\n`);
        } else {
          console.log(`  ⏭️  No plain text URLs found\n`);
        }
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error: ${error.message}\n`);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total posts checked: ${processedCount}`);
    console.log(`Posts modified: ${modifiedCount}`);
    console.log(`Errors: ${errorCount}`);

    if (modifiedPosts.length > 0) {
      console.log("\n✨ Modified posts:");
      modifiedPosts.forEach((title, index) => {
        console.log(`  ${index + 1}. ${title}`);
      });
    }

    console.log("\n✅ Done!");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the script
formatLinksInPosts();
