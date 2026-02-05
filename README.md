# WP to Sanity Migration Pipeline (Case Study)

Overview
This repository documents a real-world content migration project that moved 100+ blog posts from WordPress to Sanity CMS. It is intended as a public case study showcasing the scripts, workflow, and the rapid iteration process used to handle edge cases in HTML conversion, asset management, and link formatting.

What this repo includes

- HTML to Portable Text conversion with edge-case handling for nested lists, inline links, special characters, and HTML entities.
- Image download and asset upload flow for WordPress media, with asset references linked back to posts.
- URL detection and link formatting with regex-based detection and false-positive filtering.

AI-assisted script development

Many scripts in this project went through 3-4 iterations. Using AI as a development partner dramatically shortened the debugging loop: I could describe a failing case (like malformed Portable Text, nested list parsing, or entities like &amp; and &nbsp;) and get a corrected implementation in minutes instead of hours.

### AI-powered content formatting

Beyond script development, AI was also used **at runtime** for content formatting. The `formatWithAI` function in [scripts/format-posts-bulk.js](scripts/format-posts-bulk.js) calls Claude via the Anthropic API to intelligently reformat migrated posts:

- **Smart line breaks** – adds paragraph breaks only after complete sentences, avoiding false breaks after abbreviations (Dr., etc.) or decimals.
- **Punctuation fixes** – corrects run-on sentences, missing commas, and spacing issues.
- **Heading detection** – bolds section headings like "Conclusion:" and separates them from body text.
- **Paragraph grouping** – clusters related sentences for better readability while preserving the author's voice.

This hybrid approach—AI-assisted script authoring _plus_ AI-powered runtime formatting—enabled a level of content polish that would have been impractical to achieve with purely rule-based scripts.

Scripts
Core migration scripts live in [scripts/](scripts/) and include:

- [scripts/convert-wordpress-to-sanity.js](scripts/convert-wordpress-to-sanity.js)
- [scripts/fix-sanity-content-formatting.js](scripts/fix-sanity-content-formatting.js)
- [scripts/format-links-in-posts.js](scripts/format-links-in-posts.js)
- [scripts/download-wordpress-data.js](scripts/download-wordpress-data.js)
- [scripts/upload-images-to-sanity.js](scripts/upload-images-to-sanity.js)
- [scripts/attach-images-to-posts.js](scripts/attach-images-to-posts.js)
- [scripts/audit-seo-metadata.js](scripts/audit-seo-metadata.js)
- [scripts/format-posts-bulk.js](scripts/format-posts-bulk.js)
- [scripts/categorize-posts.js](scripts/categorize-posts.js)
- [scripts/decode-entities.js](scripts/decode-entities.js)

Workflow summary

1. Export WordPress content and download media.
2. Convert HTML to Sanity Portable Text with custom normalization.
3. Upload media to Sanity assets and link them to posts.
4. Run post-processing scripts for formatting, SEO fixes, and link normalization.

## Usage

### Prerequisites

- Node.js (v16+)
- A Sanity project with your schema configured
- WordPress export data (JSON from WP REST API or a plugin export)

### Environment Variables

Create a `.env` file with:

```
SANITY_PROJECT_ID=your_project_id
SANITY_DATASET=production
SANITY_API_TOKEN=your_write_token
```

### Suggested Script Order

| Step | Script                             | Description                                                         |
| ---- | ---------------------------------- | ------------------------------------------------------------------- |
| 1    | `download-wordpress-data.js`       | Fetches posts and media URLs from WordPress REST API                |
| 2    | `convert-wordpress-to-sanity.js`   | Converts HTML content to Portable Text and creates Sanity documents |
| 3    | `upload-images-to-sanity.js`       | Downloads images locally and uploads them to Sanity assets          |
| 4    | `attach-images-to-posts.js`        | Links uploaded image assets to their corresponding posts            |
| 5    | `fix-sanity-content-formatting.js` | Cleans up Portable Text edge cases (nested lists, special chars)    |
| 6    | `decode-entities.js`               | Decodes remaining HTML entities (`&amp;`, `&nbsp;`, etc.)           |
| 7    | `format-links-in-posts.js`         | Detects plain-text URLs and converts them to clickable links        |
| 8    | `format-posts-bulk.js`             | Batch formatting pass for consistency                               |
| 9    | `audit-seo-metadata.js`            | Reports missing or malformed SEO fields                             |
| 10   | `fix-seo-metadata.js`              | Patches SEO metadata based on audit results                         |
| 11   | `categorize-posts.js`              | Assigns categories/tags to posts                                    |

### Example: Running a Script

```bash
node scripts/download-wordpress-data.js
```

Most scripts read from and write to JSON files in a `data/` directory (not included in repo). Adjust paths in scripts as needed.

---

## Notes

- This repo is published for educational and case-study purposes and omits private credentials and content.
- Script order, inputs, and data formats may need minor adjustments based on your WordPress export and Sanity schema.
