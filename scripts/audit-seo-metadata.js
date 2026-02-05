/**
 * SEO Metadata Audit Script
 * Checks all layout files for proper metadata configuration
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const baseDir = "./src/app/(main)";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

function findLayoutFiles(dir) {
  const results = [];
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      results.push(...findLayoutFiles(filePath));
    } else if (file === "layout.tsx") {
      results.push(filePath);
    }
  }

  return results;
}

function extractMetadata(content) {
  const metadata = {
    hasMetadata: false,
    hasTitle: false,
    hasDescription: false,
    hasCanonical: false,
    hasOpenGraph: false,
    hasTwitterCard: false,
    hasRobots: false,
    titleValue: null,
    descriptionValue: null,
    canonicalValue: null,
  };

  // Check if metadata export exists
  if (/export\s+const\s+metadata/.test(content)) {
    metadata.hasMetadata = true;

    // Extract title
    const titleMatch = content.match(/title:\s*["'`]([^"'`]+)["'`]/);
    if (titleMatch) {
      metadata.hasTitle = true;
      metadata.titleValue = titleMatch[1];
    }

    // Extract description
    const descMatch = content.match(/description:\s*["'`]([^"'`]+)["'`]/);
    if (descMatch) {
      metadata.hasDescription = true;
      metadata.descriptionValue = descMatch[1];
    }

    // Check for canonical
    if (/alternates:\s*{[^}]*canonical/.test(content)) {
      metadata.hasCanonical = true;
      const canonicalMatch = content.match(/canonical:\s*["'`]([^"'`]+)["'`]/);
      if (canonicalMatch) {
        metadata.canonicalValue = canonicalMatch[1];
      }
    }

    // Check for OpenGraph
    if (/openGraph:\s*{/.test(content)) {
      metadata.hasOpenGraph = true;
    }

    // Check for Twitter Card
    if (/twitter:\s*{/.test(content)) {
      metadata.hasTwitterCard = true;
    }

    // Check for robots
    if (/robots:\s*{/.test(content)) {
      metadata.hasRobots = true;
    }
  }

  return metadata;
}

function getRoutePath(filePath) {
  // Convert file path to route
  let route = filePath
    .replace("./src/app/(main)", "")
    .replace("/layout.tsx", "")
    .replace(/\[([^\]]+)\]/g, ":$1"); // Convert [slug] to :slug

  if (!route) route = "/";
  if (route && !route.startsWith("/")) route = "/" + route;

  return route;
}

function auditMetadata(filePath, content) {
  const issues = [];
  const warnings = [];
  const metadata = extractMetadata(content);
  const route = getRoutePath(filePath);

  // Critical issues
  if (!metadata.hasMetadata) {
    issues.push("❌ No metadata export found");
    return { file: filePath, route, issues, warnings, metadata };
  }

  if (!metadata.hasTitle) {
    issues.push("❌ Missing title");
  } else {
    // Check title length (Google displays 50-60 chars)
    if (metadata.titleValue.length > 60) {
      warnings.push(
        `⚠️  Title too long (${metadata.titleValue.length} chars, recommended <60)`,
      );
    }
    if (metadata.titleValue.length < 30) {
      warnings.push(
        `⚠️  Title too short (${metadata.titleValue.length} chars, recommended 30-60)`,
      );
    }
  }

  if (!metadata.hasDescription) {
    issues.push("❌ Missing description");
  } else {
    // Check description length (Google displays ~155-160 chars)
    if (metadata.descriptionValue.length > 160) {
      warnings.push(
        `⚠️  Description too long (${metadata.descriptionValue.length} chars, recommended <160)`,
      );
    }
    if (metadata.descriptionValue.length < 120) {
      warnings.push(
        `⚠️  Description too short (${metadata.descriptionValue.length} chars, recommended 120-160)`,
      );
    }
  }

  if (!metadata.hasCanonical) {
    warnings.push("⚠️  Missing canonical URL");
  }

  if (!metadata.hasOpenGraph) {
    warnings.push(
      "⚠️  Missing OpenGraph metadata (important for social sharing)",
    );
  }

  if (!metadata.hasTwitterCard) {
    warnings.push("⚠️  Missing Twitter Card metadata");
  }

  if (!metadata.hasRobots) {
    warnings.push("⚠️  Missing robots configuration");
  }

  return { file: filePath, route, issues, warnings, metadata };
}

function main() {
  console.log("🔍 Starting SEO Metadata Audit...\n");
  console.log("=".repeat(80));

  const layoutFiles = findLayoutFiles(baseDir);
  console.log(`\nFound ${layoutFiles.length} layout files\n`);

  const results = [];
  let totalIssues = 0;
  let totalWarnings = 0;

  for (const file of layoutFiles) {
    const content = readFileSync(file, "utf-8");
    const result = auditMetadata(file, content);

    if (result.issues.length > 0 || result.warnings.length > 0) {
      results.push(result);
      totalIssues += result.issues.length;
      totalWarnings += result.warnings.length;
    }
  }

  // Print results
  if (results.length === 0) {
    console.log("✅ All pages have complete metadata!\n");
  } else {
    console.log("📋 METADATA AUDIT RESULTS\n");
    console.log("=".repeat(80) + "\n");

    results.forEach((result, index) => {
      console.log(`${index + 1}. Route: ${result.route}`);
      console.log(`   File: ${result.file}`);

      if (result.issues.length > 0) {
        console.log("\n   Critical Issues:");
        result.issues.forEach((issue) => console.log(`   ${issue}`));
      }

      if (result.warnings.length > 0) {
        console.log("\n   Warnings:");
        result.warnings.forEach((warning) => console.log(`   ${warning}`));
      }

      if (result.metadata.titleValue) {
        console.log(`\n   Title: "${result.metadata.titleValue}"`);
      }
      if (result.metadata.descriptionValue) {
        console.log(`   Description: "${result.metadata.descriptionValue}"`);
      }
      if (result.metadata.canonicalValue) {
        console.log(`   Canonical: "${result.metadata.canonicalValue}"`);
      }

      console.log("\n" + "─".repeat(80) + "\n");
    });

    console.log("=".repeat(80));
    console.log("📊 SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total pages audited: ${layoutFiles.length}`);
    console.log(`Pages with issues: ${results.length}`);
    console.log(`Total critical issues: ${totalIssues}`);
    console.log(`Total warnings: ${totalWarnings}`);
    console.log("\n");

    // Group by issue type
    console.log("🔍 Common Issues:");
    const issueTypes = {};
    results.forEach((r) => {
      r.issues.forEach((issue) => {
        issueTypes[issue] = (issueTypes[issue] || 0) + 1;
      });
      r.warnings.forEach((warning) => {
        issueTypes[warning.split("(")[0].trim()] =
          (issueTypes[warning.split("(")[0].trim()] || 0) + 1;
      });
    });

    Object.entries(issueTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([issue, count]) => {
        console.log(`  ${issue}: ${count} pages`);
      });
  }

  console.log("\n✅ Audit complete!");
}

main();
