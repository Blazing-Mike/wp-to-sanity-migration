const fs = require("fs");
const { createClient } = require("@sanity/client");

// Initialize Sanity client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  useCdn: false,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-05-18",
  token: process.env.SANITY_API_WRITE_TOKEN,
});

// Load WordPress data for reference
const wordpressData = JSON.parse(
  fs.readFileSync("./wordpress-posts.json", "utf8"),
);

// Helper function to create empty block
const createEmptyBlock = () => ({
  _type: "block",
  _key: "empty-block",
  style: "normal",
  markDefs: [],
  children: [
    {
      _type: "span",
      _key: "empty-span",
      text: "",
      marks: [],
    },
  ],
});

// Enhanced HTML to Portable Text converter
function convertHtmlToPortableText(htmlContent) {
  if (!htmlContent || htmlContent.trim() === "") {
    return [createEmptyBlock()];
  }

  // Clean up the HTML first
  let cleanHtml = htmlContent
    // Replace WordPress-specific entities (BEFORE &amp;)
    .replace(/&#8211;/g, "\u2013") // en dash
    .replace(/&#8212;/g, "\u2014") // em dash
    .replace(/&#8220;/g, "\u201C") // left double quote
    .replace(/&#8221;/g, "\u201D") // right double quote
    .replace(/&#8216;/g, "\u2018") // left single quote
    .replace(/&#8217;/g, "\u2019") // right single quote
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&") // FIX: Moved to LAST to avoid breaking other entities
    // Normalize line breaks
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Convert double <br> to paragraph breaks
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "</p><p>");

  const blocks = [];
  let blockKey = 0;

  // FIX: More comprehensive block detection including lists
  const htmlBlocks = cleanHtml
    .split(
      /(?=<h[1-6][^>]*>)|(?=<p[^>]*>)|(?=<ul[^>]*>)|(?=<ol[^>]*>)|(?=<blockquote[^>]*>)|(?=<pre[^>]*>)/,
    )
    .filter((block) => block.trim());

  for (const htmlBlock of htmlBlocks) {
    const trimmedBlock = htmlBlock.trim();
    if (!trimmedBlock) continue;

    blockKey++;

    // Handle headers
    const headerMatch = trimmedBlock.match(/^<h([1-6])[^>]*>(.*?)<\/h[1-6]>/is);
    if (headerMatch) {
      const level = parseInt(headerMatch[1]);
      const headerText = headerMatch[2].replace(/<[^>]*>/g, "").trim();

      blocks.push({
        _type: "block",
        _key: `header-${blockKey}`,
        style: `h${level}`,
        markDefs: [],
        children: [
          {
            _type: "span",
            _key: `header-span-${blockKey}`,
            text: headerText,
            marks: [],
          },
        ],
      });
      continue;
    }

    // FIX: Handle unordered lists
    const ulMatch = trimmedBlock.match(/^<ul[^>]*>(.*?)<\/ul>/is);
    if (ulMatch) {
      const listItems = ulMatch[1].match(/<li[^>]*>(.*?)<\/li>/gis);
      if (listItems) {
        listItems.forEach((item, index) => {
          const content = item.replace(/<\/?li[^>]*>/gi, "");
          const children = parseInlineElements(content, blockKey + index);

          blocks.push({
            _type: "block",
            _key: `list-${blockKey}-${index}`,
            style: "normal",
            listItem: "bullet",
            level: 1,
            markDefs: [],
            children: children,
          });
        });
      }
      continue;
    }

    // FIX: Handle ordered lists
    const olMatch = trimmedBlock.match(/^<ol[^>]*>(.*?)<\/ol>/is);
    if (olMatch) {
      const listItems = olMatch[1].match(/<li[^>]*>(.*?)<\/li>/gis);
      if (listItems) {
        listItems.forEach((item, index) => {
          const content = item.replace(/<\/?li[^>]*>/gi, "");
          const children = parseInlineElements(content, blockKey + index);

          blocks.push({
            _type: "block",
            _key: `list-${blockKey}-${index}`,
            style: "normal",
            listItem: "number",
            level: 1,
            markDefs: [],
            children: children,
          });
        });
      }
      continue;
    }

    // Handle paragraphs and other block elements
    const paragraphMatch =
      trimmedBlock.match(/^<p[^>]*>(.*?)<\/p>/is) ||
      trimmedBlock.match(/^<div[^>]*>(.*?)<\/div>/is) ||
      trimmedBlock.match(/^<blockquote[^>]*>(.*?)<\/blockquote>/is);

    if (paragraphMatch) {
      const content = paragraphMatch[1];
      const children = parseInlineElements(content, blockKey);

      if (children.length > 0 && children.some((child) => child.text?.trim())) {
        blocks.push({
          _type: "block",
          _key: `block-${blockKey}`,
          style: "normal",
          markDefs: [],
          children: children,
        });
      }
    } else {
      // FIX: Handle text that's not wrapped in tags
      const textContent = trimmedBlock.replace(/<[^>]*>/g, "").trim();
      if (textContent) {
        blocks.push({
          _type: "block",
          _key: `block-${blockKey}`,
          style: "normal",
          markDefs: [],
          children: [
            {
              _type: "span",
              _key: `span-${blockKey}-0`,
              text: textContent,
              marks: [],
            },
          ],
        });
      }
    }
  }

  return blocks.length > 0 ? blocks : [createEmptyBlock()];
}

// Parse inline elements and marks
function parseInlineElements(htmlContent, blockKey) {
  const children = [];
  let spanKey = 0;

  // FIX: More comprehensive inline element detection including links and code
  const parts = htmlContent.split(
    /(<\/?(?:strong|b|em|i|u|code|a)[^>]*>|<br\s*\/?>)/gi,
  );

  let currentText = "";
  let currentMarks = [];
  const markStack = []; // Track nested marks

  for (const part of parts) {
    if (!part) continue;

    // Handle opening strong/bold tags
    if (part.match(/^<(strong|b)(\s[^>]*)?>$/i)) {
      if (currentText) {
        spanKey++;
        children.push({
          _type: "span",
          _key: `span-${blockKey}-${spanKey}`,
          text: currentText,
          marks: [...currentMarks],
        });
        currentText = "";
      }
      if (!currentMarks.includes("strong")) {
        currentMarks.push("strong");
        markStack.push("strong");
      }
    }
    // Handle closing strong/bold tags
    else if (part.match(/^<\/(strong|b)>$/i)) {
      if (currentText) {
        spanKey++;
        children.push({
          _type: "span",
          _key: `span-${blockKey}-${spanKey}`,
          text: currentText,
          marks: [...currentMarks],
        });
        currentText = "";
      }
      currentMarks = currentMarks.filter((mark) => mark !== "strong");
      const idx = markStack.lastIndexOf("strong");
      if (idx > -1) markStack.splice(idx, 1);
    }
    // Handle opening em/italic tags
    else if (part.match(/^<(em|i)(\s[^>]*)?>$/i)) {
      if (currentText) {
        spanKey++;
        children.push({
          _type: "span",
          _key: `span-${blockKey}-${spanKey}`,
          text: currentText,
          marks: [...currentMarks],
        });
        currentText = "";
      }
      if (!currentMarks.includes("em")) {
        currentMarks.push("em");
        markStack.push("em");
      }
    }
    // Handle closing em/italic tags
    else if (part.match(/^<\/(em|i)>$/i)) {
      if (currentText) {
        spanKey++;
        children.push({
          _type: "span",
          _key: `span-${blockKey}-${spanKey}`,
          text: currentText,
          marks: [...currentMarks],
        });
        currentText = "";
      }
      currentMarks = currentMarks.filter((mark) => mark !== "em");
      const idx = markStack.lastIndexOf("em");
      if (idx > -1) markStack.splice(idx, 1);
    }
    // FIX: Handle code tags
    else if (part.match(/^<code(\s[^>]*)?>$/i)) {
      if (currentText) {
        spanKey++;
        children.push({
          _type: "span",
          _key: `span-${blockKey}-${spanKey}`,
          text: currentText,
          marks: [...currentMarks],
        });
        currentText = "";
      }
      if (!currentMarks.includes("code")) {
        currentMarks.push("code");
        markStack.push("code");
      }
    } else if (part.match(/^<\/code>$/i)) {
      if (currentText) {
        spanKey++;
        children.push({
          _type: "span",
          _key: `span-${blockKey}-${spanKey}`,
          text: currentText,
          marks: [...currentMarks],
        });
        currentText = "";
      }
      currentMarks = currentMarks.filter((mark) => mark !== "code");
      const idx = markStack.lastIndexOf("code");
      if (idx > -1) markStack.splice(idx, 1);
    }
    // Handle line breaks
    else if (part.match(/^<br\s*\/?>$/i)) {
      currentText += "\n";
    }
    // FIX: Skip link tags (links need markDefs which is complex)
    else if (part.match(/^<\/?a[^>]*>$/i)) {
      // For now, just remove link tags but keep the text
      // Full link support would require extracting href and creating markDefs
      continue;
    }
    // Handle regular text
    else if (!part.match(/^<[^>]*>$/)) {
      currentText += part;
    }
  }

  // Add any remaining text
  if (currentText.trim()) {
    spanKey++;
    children.push({
      _type: "span",
      _key: `span-${blockKey}-${spanKey}`,
      text: currentText.trim(),
      marks: [...currentMarks],
    });
  }

  return children.length > 0
    ? children
    : [
        {
          _type: "span",
          _key: `empty-span-${blockKey}`,
          text: "",
          marks: [],
        },
      ];
}

// Main function to update Sanity posts
async function fixSanityContentFormatting() {
  try {
    console.log("Fetching all blog posts from Sanity...");

    // Get all blog posts
    const posts = await client.fetch(
      `*[_type == "post"] {
        _id,
        _rev,
        title,
        slug,
        body,
        publishedAt
      }`,
    );

    console.log(`Found ${posts.length} posts to process`);

    for (const post of posts) {
      console.log(`\nProcessing post: ${post.title}`);

      // Find matching WordPress post by title or slug
      const matchingWpPost = wordpressData.find(
        (wpPost) =>
          wpPost.title.rendered === post.title ||
          wpPost.slug === post.slug?.current,
      );

      if (!matchingWpPost) {
        console.log(`  No matching WordPress post found, skipping...`);
        continue;
      }

      console.log(
        `  Found matching WordPress post: ${matchingWpPost.title.rendered}`,
      );

      // Convert WordPress content to properly formatted Portable Text
      const newBody = convertHtmlToPortableText(
        matchingWpPost.content.rendered,
      );

      console.log(`  Converted HTML content to ${newBody.length} blocks`);

      // Update the post in Sanity
      const result = await client
        .patch(post._id)
        .set({
          body: newBody,
        })
        .commit();

      console.log(`  ✅ Updated post successfully`);
    }

    console.log("\n🎉 All posts have been updated with proper formatting!");
  } catch (error) {
    console.error("Error updating posts:", error);
    process.exit(1);
  }
}

// Check for required environment variables
if (!process.env.SANITY_API_WRITE_TOKEN) {
  console.error("SANITY_API_WRITE_TOKEN environment variable is required");
  process.exit(1);
}

// Run the script
fixSanityContentFormatting();
