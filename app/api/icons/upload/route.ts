import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { IconData, IconManifest } from "@/lib/icons";

const MANIFEST_PATH = join(process.cwd(), "public", "icons", "manifest.json");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const icon: IconData = await req.json();

    // Basic validation
    if (!icon.id || !icon.name || !icon.innerSvg) {
      return NextResponse.json(
        { error: "id, name, and innerSvg are required" },
        { status: 400 }
      );
    }

    // Sanitize id
    const safeId = icon.id.replace(/[^a-z0-9_]/g, "");
    if (!safeId) {
      return NextResponse.json({ error: "Invalid icon id" }, { status: 400 });
    }

    // Read current manifest
    const manifest: IconManifest = JSON.parse(
      readFileSync(MANIFEST_PATH, "utf-8")
    );

    // Check for duplicate id
    const existing = manifest.icons.findIndex((i) => i.id === safeId);
    const newIcon: IconData = {
      ...icon,
      id: safeId,
      keywords: Array.isArray(icon.keywords) ? icon.keywords : [],
    };

    if (existing !== -1) {
      // Replace existing
      manifest.icons[existing] = newIcon;
    } else {
      manifest.icons.push(newIcon);
    }

    // Update timestamp
    manifest.updatedAt = new Date().toISOString().split("T")[0];

    // Sort icons by category then name
    manifest.icons.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    // Write back
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    return NextResponse.json(manifest, { status: 200, headers: CORS });
  } catch (err) {
    console.error("Icon upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS }
    );
  }
}
