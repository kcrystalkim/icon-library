import { NextRequest, NextResponse } from "next/server";
import { IconData, IconManifest } from "@/lib/icons";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── GitHub API helpers ──────────────────────────────────────────────────────

const GH_TOKEN  = process.env.GITHUB_TOKEN;
const GH_OWNER  = process.env.GITHUB_OWNER;
const GH_REPO   = process.env.GITHUB_REPO;
const GH_BRANCH = process.env.GITHUB_BRANCH ?? "master";
const MANIFEST_PATH = "public/icons/manifest.json";

async function ghFetch(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function getManifest(): Promise<{ manifest: IconManifest; sha: string }> {
  const res = await ghFetch(
    `contents/${MANIFEST_PATH}?ref=${GH_BRANCH}`
  );
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const data = await res.json();
  const manifest: IconManifest = JSON.parse(
    Buffer.from(data.content, "base64").toString("utf-8")
  );
  return { manifest, sha: data.sha };
}

async function putManifest(manifest: IconManifest, sha: string) {
  const content = Buffer.from(JSON.stringify(manifest, null, 2)).toString("base64");
  const res = await ghFetch(`contents/${MANIFEST_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `feat: update icon manifest [${manifest.updatedAt}]`,
      content,
      sha,
      branch: GH_BRANCH,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub write failed: ${res.status} ${JSON.stringify(err)}`);
  }
}

// ── POST /api/icons/upload ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    return NextResponse.json(
      { error: "GitHub env vars not configured (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)" },
      { status: 500, headers: CORS }
    );
  }

  try {
    const icon: IconData = await req.json();

    if (!icon.id || !icon.name || !icon.innerSvg) {
      return NextResponse.json(
        { error: "id, name, and innerSvg are required" },
        { status: 400, headers: CORS }
      );
    }

    const safeId = icon.id.replace(/[^a-z0-9_]/g, "");
    if (!safeId) {
      return NextResponse.json({ error: "Invalid icon id" }, { status: 400, headers: CORS });
    }

    const { manifest, sha } = await getManifest();

    const newIcon: IconData = {
      ...icon,
      id: safeId,
      keywords: Array.isArray(icon.keywords) ? icon.keywords : [],
    };

    const existing = manifest.icons.findIndex((i) => i.id === safeId);
    if (existing !== -1) {
      manifest.icons[existing] = newIcon;
    } else {
      manifest.icons.push(newIcon);
    }

    manifest.updatedAt = new Date().toISOString().split("T")[0];
    manifest.icons.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    await putManifest(manifest, sha);

    return NextResponse.json({ ok: true, total: manifest.icons.length }, { status: 200, headers: CORS });
  } catch (err) {
    console.error("Icon upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: CORS }
    );
  }
}
