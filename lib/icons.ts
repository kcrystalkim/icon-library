export type IconType = "monochrome" | "multicolor";
export type IconState = "enabled" | "pressed" | "disabled";

export interface IconData {
  id: string;
  name: string;
  category: string;
  type: IconType;
  keywords: string[];
  innerSvg: string;
}

export interface IconManifest {
  version: string;
  updatedAt: string;
  icons: IconData[];
}

export const ICON_STATES: IconState[] = ["enabled", "pressed", "disabled"];

export const STATE_TOKENS: Record<IconState, string> = {
  enabled: "semantic/color/icon/enabled",
  pressed: "semantic/color/icon/pressed",
  disabled: "semantic/color/icon/disabled",
};

export const STATE_CSS_VARS: Record<IconState, string> = {
  enabled: "var(--icon-state-enabled)",
  pressed: "var(--icon-state-pressed)",
  disabled: "var(--icon-state-disabled)",
};

export function buildSvgString(innerSvg: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n  ${innerSvg}\n</svg>`;
}

export function svgToJsx(innerSvg: string): string {
  const jsxInner = innerSvg
    .replace(/stroke-width=/g, "strokeWidth=")
    .replace(/stroke-linecap=/g, "strokeLinecap=")
    .replace(/stroke-linejoin=/g, "strokeLinejoin=")
    .replace(/fill-rule=/g, "fillRule=")
    .replace(/clip-rule=/g, "clipRule=")
    .replace(/class=/g, "className=");
  return jsxInner;
}

export function toPascalCase(str: string): string {
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function buildReactComponent(icon: IconData): string {
  const componentName = toPascalCase(icon.id);
  const jsxInner = svgToJsx(icon.innerSvg);
  return `interface ${componentName}Props {
  size?: number;
  className?: string;
}

export function ${componentName}({ size = 24, className }: ${componentName}Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      ${jsxInner}
    </svg>
  );
}`;
}

export function filterIcons(
  icons: IconData[],
  query: string,
  category: string | null,
  type: IconType | "all"
): IconData[] {
  const q = query.toLowerCase().trim();
  return icons.filter((icon) => {
    const matchesQuery =
      !q ||
      icon.name.toLowerCase().includes(q) ||
      icon.id.toLowerCase().includes(q) ||
      icon.keywords.some((k) => k.toLowerCase().includes(q));
    const matchesCategory = !category || icon.category === category;
    const matchesType = type === "all" || icon.type === type;
    return matchesQuery && matchesCategory && matchesType;
  });
}

export function getCategories(icons: IconData[]): string[] {
  return [...new Set(icons.map((i) => i.category))].sort();
}

export function downloadSvg(icon: IconData): void {
  const svgContent = buildSvgString(icon.innerSvg);
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${icon.id}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
