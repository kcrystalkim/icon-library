"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  IconData,
  IconManifest,
  IconType,
  IconState,
  ICON_STATES,
  STATE_TOKENS,
  STATE_CSS_VARS,
  buildSvgString,
  buildReactComponent,
  filterIcons,
  getCategories,
  downloadSvg,
} from "@/lib/icons";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { cn } from "@/lib/utils";
import IconUploadModal from "@/components/icon-upload-modal";

// ─── Inline SVG renderer ─────────────────────────────────────────────────────

function IconSvg({
  innerSvg,
  size = 24,
  style,
  className,
}: {
  innerSvg: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      className={className}
      dangerouslySetInnerHTML={{ __html: innerSvg }}
    />
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "ghost";
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
        variant === "default"
          ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {copied ? (
        <>
          <CheckIcon size={13} />
          Copied
        </>
      ) : (
        <>
          <CopyIcon size={13} />
          {label}
        </>
      )}
    </button>
  );
}

// ─── Tiny inline icon components ─────────────────────────────────────────────

function SearchIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 15H4C2.896 15 2 14.104 2 13V4C2 2.896 2.896 2 4 2H13C14.104 2 15 2.896 15 4V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 12L9.5 17.5L20 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── State preview card ───────────────────────────────────────────────────────

function StatePreviewCard({ icon, state }: { icon: IconData; state: IconState }) {
  const labelMap: Record<IconState, string> = {
    enabled: "Enabled",
    pressed: "Pressed",
    disabled: "Disabled",
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-center rounded-lg bg-muted"
        style={{ width: 72, height: 72 }}
      >
        <IconSvg
          innerSvg={icon.innerSvg}
          size={32}
          style={{ color: STATE_CSS_VARS[state] }}
        />
      </div>
      <div className="space-y-0.5">
        <p className="text-[11px] font-medium text-foreground">{labelMap[state]}</p>
        <p
          className="text-[10px] font-mono leading-relaxed break-all"
          style={{ color: "var(--icon-state-pressed)" }}
        >
          {STATE_TOKENS[state]}
        </p>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  icon,
  onClose,
}: {
  icon: IconData;
  onClose: () => void;
}) {
  const svgCode = buildSvgString(icon.innerSvg);
  const reactCode = buildReactComponent(icon);

  return (
    <aside className="w-72 xl:w-80 border-l flex-shrink-0 flex flex-col bg-background overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-muted">
            <IconSvg innerSvg={icon.innerSvg} size={22} />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">{icon.name}</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{icon.id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-6">
        {/* Badges */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
            {icon.category}
          </span>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
              icon.type === "monochrome"
                ? "bg-primary/10 text-primary"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}
          >
            {icon.type}
          </span>
        </div>

        {/* Keywords */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Keywords
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {icon.keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-xs"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>

        {/* State preview — monochrome only */}
        {icon.type === "monochrome" && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              States
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {ICON_STATES.map((state) => (
                <StatePreviewCard key={state} icon={icon} state={state} />
              ))}
            </div>
          </div>
        )}

        {/* Multicolor preview */}
        {icon.type === "multicolor" && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Preview
            </h3>
            <div className="flex gap-3">
              {(["white", "#f4f4f5", "#18181b"] as const).map((bg) => (
                <div
                  key={bg}
                  className="flex items-center justify-center w-16 h-16 rounded-lg border"
                  style={{ backgroundColor: bg }}
                >
                  <IconSvg innerSvg={icon.innerSvg} size={28} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Export
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <CopyButton label="Copy SVG" value={svgCode} />
              <CopyButton label="Copy React" value={reactCode} />
            </div>
            <button
              onClick={() => downloadSvg(icon)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-fit"
            >
              <DownloadIcon size={13} />
              Download SVG
            </button>
          </div>
        </div>

        {/* SVG code preview */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            SVG Code
          </h3>
          <div className="relative rounded-lg bg-muted overflow-hidden">
            <pre className="text-[10px] font-mono leading-relaxed p-3 overflow-x-auto text-muted-foreground whitespace-pre-wrap break-all">
              {svgCode}
            </pre>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Icon card ────────────────────────────────────────────────────────────────

function IconCard({
  icon,
  isSelected,
  onClick,
}: {
  icon: IconData;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={icon.name}
      className={cn(
        "group flex flex-col items-center gap-2.5 p-3 rounded-xl transition-all cursor-pointer text-left",
        "hover:bg-accent",
        isSelected && "bg-accent ring-1 ring-inset ring-primary/40"
      )}
    >
      <div className="w-8 h-8 flex items-center justify-center">
        <IconSvg innerSvg={icon.innerSvg} size={22} />
      </div>
      <span className="text-[10px] text-muted-foreground w-full text-center truncate leading-tight">
        {icon.name}
      </span>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IconLibraryPage() {
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [manifest, setManifest] = useState<IconManifest | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<IconType | "all">("all");
  const [selectedIcon, setSelectedIcon] = useState<IconData | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/icons/manifest.json")
      .then((r) => r.json())
      .then((data: IconManifest) => setManifest(data));
  }, []);

  // Keyboard shortcut: / or Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIcon(null);
        return;
      }
      if (
        (e.key === "/" || (e.metaKey && e.key === "k")) &&
        document.activeElement !== searchRef.current
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const icons = useMemo(() => manifest?.icons ?? [], [manifest]);
  const categories = useMemo(() => getCategories(icons), [icons]);

  const filteredIcons = useMemo(
    () => filterIcons(icons, searchQuery, selectedCategory, selectedType),
    [icons, searchQuery, selectedCategory, selectedType]
  );

  const handleIconClick = (icon: IconData) => {
    setSelectedIcon((prev) => (prev?.id === icon.id ? null : icon));
  };

  const handleManifestUpdate = (updated: IconManifest) => {
    setManifest(updated);
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── Header ── */}
      <header className="h-14 border-b flex items-center px-5 flex-shrink-0 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" className="text-primary-foreground" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" className="text-primary-foreground" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" className="text-primary-foreground" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" className="text-primary-foreground" />
            </svg>
          </div>
          <span className="font-semibold text-sm tracking-tight">Icon Library</span>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {manifest && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {icons.length} icons · v{manifest.version}
            </span>
          )}

          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <PlusIcon size={13} />
            Add Icon
          </button>

          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Toggle theme"
          >
            {isDarkMode ? <SunIcon size={15} /> : <MoonIcon size={15} />}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-52 border-r flex-shrink-0 overflow-y-auto p-4 hidden md:flex flex-col gap-6">
          {/* Category filter */}
          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-2">
              Category
            </h3>
            <ul className="space-y-0.5">
              <li>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors",
                    !selectedCategory
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-accent text-muted-foreground"
                  )}
                >
                  <span>All</span>
                  <span className="text-[10px] opacity-60 tabular-nums">{icons.length}</span>
                </button>
              </li>
              {categories.map((cat) => (
                <li key={cat}>
                  <button
                    onClick={() =>
                      setSelectedCategory(selectedCategory === cat ? null : cat)
                    }
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors",
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent text-muted-foreground"
                    )}
                  >
                    <span>{cat}</span>
                    <span className="text-[10px] opacity-60 tabular-nums">
                      {icons.filter((i) => i.category === cat).length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Type filter */}
          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-2">
              Type
            </h3>
            <ul className="space-y-0.5">
              {(["all", "monochrome", "multicolor"] as const).map((t) => (
                <li key={t}>
                  <button
                    onClick={() => setSelectedType(t)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm capitalize transition-colors",
                      selectedType === t
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent text-muted-foreground"
                    )}
                  >
                    <span>{t === "all" ? "All" : t}</span>
                    <span className="text-[10px] opacity-60 tabular-nums">
                      {t === "all"
                        ? icons.length
                        : icons.filter((i) => i.type === t).length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="p-4 border-b flex-shrink-0">
            <div className="relative max-w-xl">
              <SearchIcon
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or keyword… (press / to focus)"
                className="w-full pl-9 pr-10 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60 transition-shadow"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 transition-colors"
                >
                  <CloseIcon size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Result count + active filters */}
          {(searchQuery || selectedCategory || selectedType !== "all") && (
            <div className="px-4 py-2 border-b flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground">
                {filteredIcons.length} result{filteredIcons.length !== 1 ? "s" : ""}
              </span>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  {selectedCategory}
                  <CloseIcon size={10} />
                </button>
              )}
              {selectedType !== "all" && (
                <button
                  onClick={() => setSelectedType("all")}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  {selectedType}
                  <CloseIcon size={10} />
                </button>
              )}
            </div>
          )}

          {/* Icon grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {!manifest ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground">Loading icons…</p>
                </div>
              </div>
            ) : filteredIcons.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                    <SearchIcon size={20} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No icons found</p>
                  <p className="text-xs text-muted-foreground">
                    Try a different keyword or clear filters
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1">
                  {filteredIcons.map((icon) => (
                    <IconCard
                      key={icon.id}
                      icon={icon}
                      isSelected={selectedIcon?.id === icon.id}
                      onClick={() => handleIconClick(icon)}
                    />
                  ))}
                </div>
                <p className="text-center text-[11px] text-muted-foreground/50 mt-6">
                  {filteredIcons.length} of {icons.length} icons
                </p>
              </>
            )}
          </div>
        </main>

        {/* ── Detail panel ── */}
        {selectedIcon && (
          <DetailPanel
            icon={selectedIcon}
            onClose={() => setSelectedIcon(null)}
          />
        )}
      </div>

      {/* ── Upload modal ── */}
      {showUpload && (
        <IconUploadModal
          onClose={() => setShowUpload(false)}
          onSave={handleManifestUpdate}
          existingCategories={categories}
        />
      )}
    </div>
  );
}
