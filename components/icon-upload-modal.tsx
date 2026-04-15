"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { IconData, IconManifest, IconType } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface IconUploadModalProps {
  onClose: () => void;
  onSave: (manifest: IconManifest) => void;
  existingCategories: string[];
}

type Tab = "manual" | "figma";

export default function IconUploadModal({
  onClose,
  onSave,
  existingCategories,
}: IconUploadModalProps) {
  const [tab, setTab] = useState<Tab>("manual");
  const [svgContent, setSvgContent] = useState("");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [iconType, setIconType] = useState<IconType>("monochrome");
  const [previewSvg, setPreviewSvg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-generate ID from name
  useEffect(() => {
    if (name) {
      const generated = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      setId(generated + (iconType === "monochrome" ? "_line" : "_fill"));
    }
  }, [name, iconType]);

  // Extract innerSvg from full SVG string
  const extractInnerSvg = (raw: string): string => {
    const match = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    return match ? match[1].trim() : raw.trim();
  };

  const handleSvgInput = (raw: string) => {
    setSvgContent(raw);
    setError("");
    if (raw.trim()) {
      const inner = raw.includes("<svg") ? extractInnerSvg(raw) : raw;
      setPreviewSvg(inner);
    } else {
      setPreviewSvg("");
    }
  };

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".svg")) {
      setError("Please upload an SVG file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      handleSvgInput(text);
      // Auto-fill name from filename
      if (!name) {
        const fname = file.name.replace(".svg", "").replace(/[-_]/g, " ");
        setName(fname.charAt(0).toUpperCase() + fname.slice(1));
      }
    };
    reader.readAsText(file);
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Icon name is required"); return; }
    if (!id.trim()) { setError("Icon ID is required"); return; }
    if (!previewSvg) { setError("SVG content is required"); return; }
    const resolvedCategory = newCategory.trim() || category || "Other";

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/icons/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id.trim(),
          name: name.trim(),
          category: resolvedCategory,
          type: iconType,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          innerSvg: previewSvg,
        } satisfies IconData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save icon");
      }

      const updated: IconManifest = await res.json();
      onSave(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background rounded-xl border shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">Register New Icon</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5">
          {(["manual", "figma"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors capitalize",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "manual" ? "Manual Upload" : "Via Figma Plugin"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "manual" && (
            <div className="p-5 space-y-4">
              {/* SVG upload area */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  SVG File or Code
                </label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-5 cursor-pointer transition-colors text-center",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".svg"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {previewSvg ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-muted">
                        <svg
                          width="36"
                          height="36"
                          viewBox="0 0 24 24"
                          fill="none"
                          dangerouslySetInnerHTML={{ __html: previewSvg }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Click to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-muted-foreground">
                        Drop SVG here or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground/60">
                        or paste SVG code below
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* SVG code textarea */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Paste SVG Code
                </label>
                <textarea
                  value={svgContent}
                  onChange={(e) => handleSvgInput(e.target.value)}
                  placeholder='<svg viewBox="0 0 24 24" fill="none">...</svg>'
                  rows={3}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40"
                />
              </div>

              {/* Name + ID */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Arrow Right"
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    ID <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="arrow_right_line"
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Category + Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 appearance-none"
                  >
                    <option value="">Select…</option>
                    {existingCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    New Category
                  </label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. Media"
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Type
                </label>
                <div className="flex gap-2">
                  {(["monochrome", "multicolor"] as IconType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setIconType(t)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-medium capitalize border transition-colors",
                        iconType === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Keywords{" "}
                  <span className="font-normal opacity-60">(comma separated)</span>
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="arrow, right, navigate, next"
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}
            </div>
          )}

          {tab === "figma" && (
            <div className="p-5 space-y-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                피그마 플러그인을 통해 아이콘을 자동으로 등록할 수 있어요. 플러그인이 SVG를 내보내고 manifest.json을 업데이트해요.
              </p>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  연동 흐름
                </h3>
                <ol className="space-y-3">
                  {[
                    { step: "1", title: "피그마에서 아이콘 프레임 선택", desc: "24×24 프레임으로 정리된 아이콘을 선택하세요." },
                    { step: "2", title: "플러그인 실행 → Export to Git", desc: "SVG와 함께 아이콘 이름, 카테고리, 키워드 메타데이터를 입력해요." },
                    { step: "3", title: "GitHub 자동 Push", desc: "플러그인이 SVG 파일과 manifest.json을 레포지토리에 푸시해요." },
                    { step: "4", title: "라이브러리 자동 반영", desc: "웹앱이 manifest.json을 fetch해서 새 아이콘이 바로 보여요." },
                  ].map(({ step, title, desc }) => (
                    <li key={step} className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {step}
                      </span>
                      <div>
                        <p className="text-xs font-medium">{title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  환경 변수 설정
                </h3>
                <p className="text-xs text-muted-foreground">
                  원격 manifest를 사용하려면 <code className="bg-muted px-1 py-0.5 rounded text-[10px]">.env.local</code>에 추가하세요:
                </p>
                <pre className="text-[11px] font-mono bg-muted rounded-lg p-3 text-muted-foreground overflow-x-auto whitespace-pre">
{`NEXT_PUBLIC_ICONS_MANIFEST_URL=
https://raw.githubusercontent.com/
  your-org/your-repo/main/
  public/icons/manifest.json`}
                </pre>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  manifest.json 포맷
                </h3>
                <p className="text-xs text-muted-foreground">
                  피그마 플러그인이 아이콘을 push할 때 이 형식을 사용해요:
                </p>
                <pre className="text-[11px] font-mono bg-muted rounded-lg p-3 text-muted-foreground overflow-x-auto">
{`{
  "id": "icon_name_line",
  "name": "Icon Name",
  "category": "Arrow",
  "type": "monochrome",
  "keywords": ["kw1", "kw2"],
  "innerSvg": "<path d=... />"
}`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === "manual" && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t bg-muted/20">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Icon"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
