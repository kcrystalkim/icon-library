figma.showUI(__html__, {
  width: 420,
  height: 620,
  title: "Icon Library Uploader",
});

async function exportSelected() {
  const nodes = figma.currentPage.selection;

  if (nodes.length === 0) {
    figma.ui.postMessage({ type: "selection", icons: [] });
    return;
  }

  const icons = [];

  for (const node of nodes) {
    try {
      const bytes = await node.exportAsync({ format: "SVG" });
      // Convert Uint8Array to string
      let svg = "";
      const arr = new Uint8Array(bytes);
      for (let i = 0; i < arr.length; i++) {
        svg += String.fromCharCode(arr[i]);
      }

      // Clean name: remove "icon_", "ic_", "ic/" prefixes
      const rawName = node.name
        .replace(/^(icon[_\-\/\s]|ic[_\-\/\s])/i, "")
        .trim();

      icons.push({ name: rawName, svg, nodeId: node.id });
    } catch (e) {
      figma.ui.postMessage({
        type: "error",
        message: "'" + node.name + "' 내보내기 실패: " + e.message,
      });
    }
  }

  figma.ui.postMessage({ type: "selection", icons });
}

figma.ui.onmessage = function (msg) {
  if (msg.type === "ready") {
    exportSelected();
  }
  if (msg.type === "refresh") {
    exportSelected();
  }
  if (msg.type === "close") {
    figma.closePlugin();
  }
  if (msg.type === "notify") {
    figma.notify(msg.text, { timeout: msg.timeout || 2500 });
  }
};

figma.on("selectionchange", exportSelected);
