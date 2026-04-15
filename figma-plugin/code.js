// ============================================================
// Token Inspector - Figma Plugin
// 선택된 프레임/레이어를 스캔하여 Variables & Styles 미사용 요소를
// 탐지하고, 적절한 Variables/Styles를 추천 및 자동 적용합니다.
// ============================================================

figma.showUI(__html__, { width: 400, height: 640, title: "Token Inspector" });

var undoSnapshots = [];

// ============================================================
// UI 메시지 수신 핸들러
// ============================================================
figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === "scan") { await handleScan(); }
    else if (msg.type === "apply") { await handleApply(msg.items); }
    else if (msg.type === "undo") { await handleUndo(); }
    else if (msg.type === "focus-node") { handleFocusNode(msg.nodeId); }
    else if (msg.type === "close") { figma.closePlugin(); }
  } catch (err) {
    console.error("Plugin error:", err);
    figma.ui.postMessage({ type: "scan-result", error: "플러그인 오류: " + (err.message || String(err)) });
  }
};

function handleFocusNode(nodeId) {
  var node = figma.getNodeById(nodeId);
  if (!node) return;
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

// ============================================================
// "semantic/" 접두어 제거 유틸리티
// semantic/text/strong → text/strong
// ============================================================
function stripSemanticPrefix(name) {
  if (!name) return name;
  // "semantic/" 접두어 제거 (대소문자 무관)
  var lower = name.toLowerCase();
  if (lower.indexOf("semantic/") === 0) {
    return name.substring(9); // "semantic/".length === 9
  }
  return name;
}

// ============================================================
// Semantic Variable 판별
// ============================================================
function isSemanticVariable(variable, collection) {
  var collName = (collection && collection.name) ? collection.name.toLowerCase() : "";
  var baseCollKeywords = ["base", "primitive", "core", "raw", "global", "palette"];
  for (var i = 0; i < baseCollKeywords.length; i++) {
    if (collName.indexOf(baseCollKeywords[i]) !== -1) return false;
  }

  var varName = variable.name ? variable.name.toLowerCase() : "";
  if (/^[a-z]+\/\d+$/.test(varName)) return false;
  if (/^[a-z]+\/[a-z]+\/\d+$/.test(varName)) return false;

  var basePrefixes = ["base/", "primitive/", "core/", "raw/", "global/", "palette/"];
  for (var j = 0; j < basePrefixes.length; j++) {
    if (varName.indexOf(basePrefixes[j]) === 0) return false;
  }

  try {
    var modes = variable.valuesByMode;
    for (var modeId in modes) {
      if (!modes.hasOwnProperty(modeId)) continue;
      var val = modes[modeId];
      if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") return true;
    }
  } catch (e) {}

  var semanticKeywords = ["semantic", "sys", "token", "theme", "text", "bg", "background",
    "border", "surface", "fill", "stroke", "icon", "ic/", "link", "button", "status",
    "brand", "accent", "on-", "inverse", "disabled", "placeholder", "hover",
    "pressed", "focused", "selected", "danger", "warning", "success", "info"];
  for (var k = 0; k < semanticKeywords.length; k++) {
    if (varName.indexOf(semanticKeywords[k]) !== -1) return true;
  }

  var semanticCollKeywords = ["semantic", "sys", "token", "theme", "alias"];
  for (var m = 0; m < semanticCollKeywords.length; m++) {
    if (collName.indexOf(semanticCollKeywords[m]) !== -1) return true;
  }

  return false;
}

// ============================================================
// 스캔 핸들러
// ============================================================
async function handleScan() {
  var selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: "scan-result", error: "선택된 레이어가 없습니다.\n프레임 또는 레이어를 선택한 후 다시 시도해주세요." });
    return;
  }

  figma.ui.postMessage({ type: "scan-start" });

  var allVariables = [];
  try {
    allVariables = (figma.variables && typeof figma.variables.getLocalVariablesAsync === "function")
      ? await figma.variables.getLocalVariablesAsync()
      : (figma.variables ? figma.variables.getLocalVariables() : []);
  } catch (e) { allVariables = []; }

  var collectionCache = {};
  var colorVariables = [];
  var floatVariables = [];

  for (var v = 0; v < allVariables.length; v++) {
    var vari = allVariables[v];
    var coll = await getCollection(vari.variableCollectionId, collectionCache);
    if (vari.resolvedType === "COLOR") {
      if (isSemanticVariable(vari, coll)) colorVariables.push(vari);
    } else if (vari.resolvedType === "FLOAT") {
      floatVariables.push(vari);
    }
  }

  var paintStyles = [], textStyles = [];
  try { paintStyles = typeof figma.getLocalPaintStylesAsync === "function" ? await figma.getLocalPaintStylesAsync() : figma.getLocalPaintStyles(); } catch (e) {}
  try { textStyles = typeof figma.getLocalTextStylesAsync === "function" ? await figma.getLocalTextStylesAsync() : figma.getLocalTextStyles(); } catch (e) {}

  var issues = [];
  for (var i = 0; i < selection.length; i++) {
    await traverseNode(selection[i], issues, colorVariables, floatVariables, paintStyles, textStyles, collectionCache);
  }

  figma.ui.postMessage({
    type: "scan-result",
    issues: issues,
    summary: {
      total: issues.length,
      color: issues.filter(function (x) { return x.category === "color"; }).length,
      typography: issues.filter(function (x) { return x.category === "typography"; }).length,
      radius: issues.filter(function (x) { return x.category === "radius"; }).length,
    },
  });
}

// ============================================================
// Variable Collection / Variable / Style 가져오기
// ============================================================
async function getCollection(collectionId, cache) {
  if (cache[collectionId] !== undefined) return cache[collectionId];
  var c = null;
  try {
    c = (figma.variables && typeof figma.variables.getVariableCollectionByIdAsync === "function")
      ? await figma.variables.getVariableCollectionByIdAsync(collectionId)
      : figma.variables.getVariableCollectionById(collectionId);
  } catch (e) { c = null; }
  cache[collectionId] = c;
  return c;
}

async function getVariableById(id) {
  try {
    return (figma.variables && typeof figma.variables.getVariableByIdAsync === "function")
      ? await figma.variables.getVariableByIdAsync(id) : figma.variables.getVariableById(id);
  } catch (e) { return null; }
}

async function getStyleById(id) {
  try {
    return typeof figma.getStyleByIdAsync === "function" ? await figma.getStyleByIdAsync(id) : figma.getStyleById(id);
  } catch (e) { return null; }
}

// ============================================================
// Resolve: alias 체인 추적하여 최종 색상값 반환
// ============================================================
async function resolveVariableColor(variable) {
  try {
    var modes = variable.valuesByMode;
    for (var modeId in modes) {
      if (!modes.hasOwnProperty(modeId)) continue;
      var val = modes[modeId];
      if (val && typeof val === "object" && typeof val.r === "number") return val;
      if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") {
        var ref = await getVariableById(val.id);
        if (ref) return await resolveVariableColor(ref);
      }
    }
  } catch (e) {}
  return null;
}

// ============================================================
// 노드 순회 (재귀)
// ============================================================
async function traverseNode(node, issues, colorVars, floatVars, paintStyles, textStyles, cache) {
  if (node.visible === false) return;

  await checkFills(node, issues, colorVars, paintStyles, cache);
  await checkStrokes(node, issues, colorVars, paintStyles, cache);
  if (node.type === "TEXT") checkTypography(node, issues, textStyles);
  checkRadius(node, issues, floatVars);

  if ("children" in node && node.children) {
    for (var i = 0; i < node.children.length; i++) {
      await traverseNode(node.children[i], issues, colorVars, floatVars, paintStyles, textStyles, cache);
    }
  }
}

// ============================================================
// 노드 컨텍스트 추출
// 노드 타입, 이름, 크기 등을 기반으로 어떤 semantic 카테고리가
// 적합한지 판단하기 위한 힌트 정보를 반환
// ============================================================
function getNodeContext(node, property) {
  var ctx = {
    isText: node.type === "TEXT",
    isIcon: false,
    isStroke: property === "stroke",
    isFill: property === "fill",
    nodeWidth: 0,
    nodeName: (node.name || "").toLowerCase(),
  };

  // 아이콘 판별: 이름 또는 작은 크기 기반
  var name = ctx.nodeName;
  ctx.isIcon = (
    name.indexOf("icon") !== -1 ||
    name.indexOf("ic_") !== -1 ||
    name.indexOf("ic-") !== -1 ||
    name.indexOf("ic/") !== -1 ||
    name === "ic" ||
    // 작은 벡터/프레임은 아이콘일 가능성 높음
    (node.type === "INSTANCE" && "width" in node && node.width <= 32 && node.height <= 32) ||
    (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION")
  );

  // 너비 추출
  try {
    if ("width" in node) ctx.nodeWidth = node.width;
  } catch (e) {}

  return ctx;
}

// ============================================================
// 컨텍스트 기반 토큰 우선순위 점수 계산
// 점수가 높을수록 해당 컨텍스트에 적합한 토큰
// ============================================================
function scoreTokenForContext(tokenName, ctx) {
  var name = tokenName.toLowerCase();
  var score = 0;

  // ── TEXT 노드 → "text/" 토큰 우선 ──────────────────────
  if (ctx.isText) {
    if (name.indexOf("text/") !== -1 || name.indexOf("/text") !== -1) score += 100;
    // text 노드에 bg/surface 토큰은 부적합
    if (name.indexOf("bg/") !== -1 || name.indexOf("surface/") !== -1) score -= 50;
    if (name.indexOf("border/") !== -1 || name.indexOf("line/") !== -1) score -= 50;
  }

  // ── 아이콘 → "ic/" 토큰 우선 ──────────────────────────
  if (ctx.isIcon) {
    if (name.indexOf("ic/") !== -1 || name.indexOf("icon/") !== -1) score += 100;
    if (name.indexOf("text/") !== -1) score -= 20; // 아이콘에 text 토큰은 차선
    if (name.indexOf("bg/") !== -1 || name.indexOf("surface/") !== -1) score -= 50;
  }

  // ── Stroke → "border/" "line/" "divider/" 토큰 우선 ────
  if (ctx.isStroke) {
    if (name.indexOf("border/") !== -1 || name.indexOf("line/") !== -1 || name.indexOf("divider/") !== -1) score += 100;
    if (name.indexOf("text/") !== -1) score -= 30;
    if (name.indexOf("bg/") !== -1 || name.indexOf("surface/") !== -1) score -= 50;
  }

  // ── Fill + width >= 360 → "surface/" 토큰 우선 ─────────
  if (ctx.isFill && !ctx.isText && !ctx.isIcon) {
    if (ctx.nodeWidth >= 360) {
      // 넓은 영역 → surface 우선, bg 차선
      if (name.indexOf("surface/") !== -1) score += 100;
      if (name.indexOf("bg/") !== -1) score += 30; // bg도 허용하되 surface보다 낮게
      if (name.indexOf("text/") !== -1) score -= 50;
    } else {
      // 일반 fill → bg 우선, surface 차선
      if (name.indexOf("bg/") !== -1) score += 100;
      if (name.indexOf("surface/") !== -1) score += 50;
      if (name.indexOf("text/") !== -1) score -= 50;
    }
    if (name.indexOf("border/") !== -1 || name.indexOf("line/") !== -1) score -= 30;
  }

  return score;
}

// ============================================================
// Fill 검사 (컨텍스트 전달)
// ============================================================
async function checkFills(node, issues, colorVars, paintStyles, cache) {
  if (!("fills" in node)) return;
  var fills;
  try { fills = node.fills; } catch (e) { return; }
  if (fills === figma.mixed || !Array.isArray(fills) || fills.length === 0) return;
  try { var fs = node.fillStyleId; if (fs && fs !== "" && fs !== figma.mixed) return; } catch (e) {}

  var ctx = getNodeContext(node, "fill");

  for (var i = 0; i < fills.length; i++) {
    var f = fills[i];
    if (f.type !== "SOLID" || f.visible === false) continue;
    var bound = false;
    try { bound = f.boundVariables && f.boundVariables.color && f.boundVariables.color.id; } catch (e) {}
    if (bound) continue;

    var hex = rgbToHex(f.color);
    var rec = await findColorRecommendation(f.color, colorVars, paintStyles, ctx);
    issues.push({ id: node.id + "-fill-" + i, nodeId: node.id, nodeName: node.name, category: "color", property: "fill", fillIndex: i, currentValue: hex, recommendation: rec, selected: rec !== null, applied: false });
  }
}

// ============================================================
// Stroke 검사 (컨텍스트 전달)
// ============================================================
async function checkStrokes(node, issues, colorVars, paintStyles, cache) {
  if (!("strokes" in node)) return;
  var strokes;
  try { strokes = node.strokes; } catch (e) { return; }
  if (strokes === figma.mixed || !Array.isArray(strokes) || strokes.length === 0) return;
  try { var ss = node.strokeStyleId; if (ss && ss !== "" && ss !== figma.mixed) return; } catch (e) {}

  var ctx = getNodeContext(node, "stroke");

  for (var i = 0; i < strokes.length; i++) {
    var s = strokes[i];
    if (s.type !== "SOLID" || s.visible === false) continue;
    var bound = false;
    try { bound = s.boundVariables && s.boundVariables.color && s.boundVariables.color.id; } catch (e) {}
    if (bound) continue;

    var hex = rgbToHex(s.color);
    var rec = await findColorRecommendation(s.color, colorVars, paintStyles, ctx);
    issues.push({ id: node.id + "-stroke-" + i, nodeId: node.id, nodeName: node.name, category: "color", property: "stroke", fillIndex: i, currentValue: hex, recommendation: rec, selected: rec !== null, applied: false });
  }
}

// ============================================================
// Typography 검사
// ============================================================
function checkTypography(node, issues, textStyles) {
  try { var ts = node.textStyleId; if (ts && ts !== "" && ts !== figma.mixed) return; } catch (e) {}

  var fontSize = null, fontFamily = null, fontStyle = null;
  try { fontSize = node.fontSize !== figma.mixed ? node.fontSize : null; } catch (e) {}
  try { if (node.fontName !== figma.mixed) { fontFamily = node.fontName.family; fontStyle = node.fontName.style; } } catch (e) {}

  var cv = (fontFamily || "(mixed)") + " " + (fontStyle || "") + " / " + (fontSize !== null ? fontSize + "px" : "(mixed)");
  var rec = findTextRecommendation(fontSize, fontFamily, fontStyle, textStyles);
  issues.push({ id: node.id + "-text", nodeId: node.id, nodeName: node.name, category: "typography", property: "text", fillIndex: 0, currentValue: cv, recommendation: rec, selected: rec !== null, applied: false });
}

// ============================================================
// Radius 검사
// ============================================================
function checkRadius(node, issues, floatVars) {
  if (!("cornerRadius" in node)) return;
  var r; try { r = node.cornerRadius; } catch (e) { return; }
  if (r === figma.mixed || r === 0) return;
  var bound = false;
  try { bound = node.boundVariables && node.boundVariables.cornerRadius && node.boundVariables.cornerRadius.id; } catch (e) {}
  if (bound) return;

  var rec = null;

  if (r >= 25) {
    for (var fi = 0; fi < floatVars.length; fi++) {
      try {
        var fName = floatVars[fi].name ? floatVars[fi].name.toLowerCase() : "";
        var mv0 = floatVars[fi].valuesByMode;
        for (var mid0 in mv0) {
          if (!mv0.hasOwnProperty(mid0)) continue;
          var v0 = mv0[mid0];
          if (typeof v0 === "number" && (v0 === 999 || v0 >= 900)) {
            rec = { id: floatVars[fi].id, name: floatVars[fi].name, displayName: stripSemanticPrefix(floatVars[fi].name), type: "variable", value: v0 + "px" };
            break;
          }
        }
        if (!rec && fName.indexOf("full") !== -1) {
          for (var mid0b in mv0) {
            if (mv0.hasOwnProperty(mid0b) && typeof mv0[mid0b] === "number") {
              rec = { id: floatVars[fi].id, name: floatVars[fi].name, displayName: stripSemanticPrefix(floatVars[fi].name), type: "variable", value: mv0[mid0b] + "px" };
              break;
            }
          }
        }
        if (rec) break;
      } catch (e) { continue; }
    }
  }

  if (!rec) {
    for (var i = 0; i < floatVars.length; i++) {
      try {
        var mv = floatVars[i].valuesByMode;
        for (var mid in mv) {
          if (mv.hasOwnProperty(mid) && typeof mv[mid] === "number" && mv[mid] === r) {
            rec = { id: floatVars[i].id, name: floatVars[i].name, displayName: stripSemanticPrefix(floatVars[i].name), type: "variable", value: mv[mid] + "px" };
            break;
          }
        }
        if (rec) break;
      } catch (e) { continue; }
    }
  }

  issues.push({ id: node.id + "-radius", nodeId: node.id, nodeName: node.name, category: "radius", property: "radius", fillIndex: 0, currentValue: r + "px", recommendation: rec, selected: rec !== null, applied: false });
}

// ============================================================
// 색상 추천 (컨텍스트 인식)
// 1. HEX 매칭되는 모든 semantic variable 수집
// 2. 컨텍스트 기반 점수로 정렬
// 3. 가장 적합한 것을 추천
// ============================================================
async function findColorRecommendation(color, colorVars, paintStyles, ctx) {
  var hex = rgbToHex(color);

  // 매칭되는 모든 variable 수집 + 점수 계산
  var candidates = [];
  for (var i = 0; i < colorVars.length; i++) {
    try {
      var resolvedColor = await resolveVariableColor(colorVars[i]);
      if (resolvedColor && rgbToHex(resolvedColor) === hex) {
        var tokenName = colorVars[i].name || "";
        var score = scoreTokenForContext(tokenName, ctx);
        candidates.push({
          id: colorVars[i].id,
          name: tokenName,
          displayName: stripSemanticPrefix(tokenName),
          type: "variable",
          value: hex,
          score: score,
        });
      }
    } catch (e) { continue; }
  }

  // 점수 내림차순 정렬 → 가장 적합한 것 반환
  if (candidates.length > 0) {
    candidates.sort(function (a, b) { return b.score - a.score; });
    return candidates[0];
  }

  // Paint Style fallback
  for (var j = 0; j < paintStyles.length; j++) {
    var s = paintStyles[j];
    if (!s.paints || s.paints.length === 0 || s.paints[0].type !== "SOLID") continue;
    if (rgbToHex(s.paints[0].color) === hex) {
      return { id: s.id, name: s.name, displayName: stripSemanticPrefix(s.name), type: "style", value: hex };
    }
  }
  return null;
}

// ============================================================
// Typography 추천
// ============================================================
function findTextRecommendation(fontSize, fontFamily, fontStyle, textStyles) {
  if (fontSize === null && fontFamily === null) return null;
  if (fontSize !== null && fontFamily !== null && fontStyle !== null) {
    for (var i = 0; i < textStyles.length; i++) {
      var s = textStyles[i];
      if (s.fontSize === fontSize && s.fontName.family === fontFamily && s.fontName.style === fontStyle)
        return { id: s.id, name: s.name, displayName: stripSemanticPrefix(s.name), type: "style", value: s.fontName.family + " " + s.fontName.style + " / " + s.fontSize + "px" };
    }
  }
  if (fontSize !== null && fontFamily !== null) {
    for (var j = 0; j < textStyles.length; j++) {
      var s2 = textStyles[j];
      if (s2.fontSize === fontSize && s2.fontName.family === fontFamily)
        return { id: s2.id, name: s2.name, displayName: stripSemanticPrefix(s2.name), type: "style", value: s2.fontName.family + " " + s2.fontName.style + " / " + s2.fontSize + "px" };
    }
  }
  if (fontSize !== null) {
    for (var k = 0; k < textStyles.length; k++) {
      var s3 = textStyles[k];
      if (s3.fontSize === fontSize)
        return { id: s3.id, name: s3.name, displayName: stripSemanticPrefix(s3.name), type: "style", value: s3.fontName.family + " " + s3.fontName.style + " / " + s3.fontSize + "px" };
    }
  }
  return null;
}

// ============================================================
// RGB → HEX
// ============================================================
function rgbToHex(color) {
  var r = Math.round((color.r || 0) * 255);
  var g = Math.round((color.g || 0) * 255);
  var b = Math.round((color.b || 0) * 255);
  var h = function (n) { var s = n.toString(16).toUpperCase(); return s.length < 2 ? "0" + s : s; };
  return "#" + h(r) + h(g) + h(b);
}

// ============================================================
// 적용 핸들러
// ============================================================
async function handleApply(items) {
  var ok = 0, fail = 0, errors = [], snapshot = [], appliedIds = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.selected || !item.recommendation) continue;
    try {
      var node = figma.getNodeById(item.nodeId);
      if (!node) { errors.push(item.nodeName + ": 노드 없음"); fail++; continue; }
      var snap = captureSnapshot(node, item);
      if (snap) snapshot.push(snap);

      if (item.category === "color") { await applyColorFix(node, item); ok++; }
      else if (item.category === "typography") { await applyTypographyFix(node, item); ok++; }
      else if (item.category === "radius") { await applyRadiusFix(node, item); ok++; }
      appliedIds.push(item.id);
    } catch (e) {
      errors.push(item.nodeName + ": " + (e.message || String(e)));
      fail++;
    }
  }

  if (snapshot.length > 0) {
    undoSnapshots.push(snapshot);
    if (undoSnapshots.length > 10) undoSnapshots.shift();
  }
  figma.ui.postMessage({ type: "apply-result", successCount: ok, errorCount: fail, errors: errors, canUndo: undoSnapshots.length > 0, appliedIds: appliedIds });
}

function captureSnapshot(node, item) {
  try {
    if (item.category === "color" && item.property === "fill") {
      return { nodeId: node.id, category: "color", property: "fill", fillIndex: item.fillIndex,
        fills: node.fills.map(function (f) { return JSON.parse(JSON.stringify(f)); }),
        fillStyleId: (function () { try { return node.fillStyleId; } catch (e) { return ""; } })() };
    } else if (item.category === "color" && item.property === "stroke") {
      return { nodeId: node.id, category: "color", property: "stroke", fillIndex: item.fillIndex,
        strokes: node.strokes.map(function (s) { return JSON.parse(JSON.stringify(s)); }),
        strokeStyleId: (function () { try { return node.strokeStyleId; } catch (e) { return ""; } })() };
    } else if (item.category === "typography") {
      return { nodeId: node.id, category: "typography",
        textStyleId: (function () { try { return node.textStyleId; } catch (e) { return ""; } })(),
        fontSize: (function () { try { return node.fontSize; } catch (e) { return null; } })(),
        fontName: (function () { try { return node.fontName !== figma.mixed ? { family: node.fontName.family, style: node.fontName.style } : null; } catch (e) { return null; } })() };
    } else if (item.category === "radius") {
      return { nodeId: node.id, category: "radius", cornerRadius: node.cornerRadius };
    }
  } catch (e) {}
  return null;
}

async function handleUndo() {
  if (undoSnapshots.length === 0) {
    figma.ui.postMessage({ type: "undo-result", success: false, message: "되돌릴 항목이 없습니다." });
    return;
  }
  var snapshot = undoSnapshots.pop();
  var ok = 0, fail = 0;

  for (var i = 0; i < snapshot.length; i++) {
    var snap = snapshot[i];
    try {
      var node = figma.getNodeById(snap.nodeId);
      if (!node) { fail++; continue; }
      if (snap.category === "color" && snap.property === "fill") {
        if (snap.fillStyleId && snap.fillStyleId !== "" && snap.fillStyleId !== figma.mixed) { node.fillStyleId = snap.fillStyleId; }
        else { var rf = []; for (var fi = 0; fi < snap.fills.length; fi++) { var o = snap.fills[fi]; rf.push({ type: o.type, visible: o.visible !== undefined ? o.visible : true, opacity: o.opacity !== undefined ? o.opacity : 1, color: o.color }); } node.fills = rf; }
        ok++;
      } else if (snap.category === "color" && snap.property === "stroke") {
        if (snap.strokeStyleId && snap.strokeStyleId !== "" && snap.strokeStyleId !== figma.mixed) { try { node.strokeStyleId = snap.strokeStyleId; } catch (e) {} }
        else { var rs = []; for (var si = 0; si < snap.strokes.length; si++) { var os = snap.strokes[si]; rs.push({ type: os.type, visible: os.visible !== undefined ? os.visible : true, opacity: os.opacity !== undefined ? os.opacity : 1, color: os.color }); } node.strokes = rs; }
        ok++;
      } else if (snap.category === "typography") {
        if (snap.fontName) { try { await figma.loadFontAsync(snap.fontName); } catch (e) {} }
        if (snap.textStyleId && snap.textStyleId !== "" && snap.textStyleId !== figma.mixed) { node.textStyleId = snap.textStyleId; }
        else { if (snap.fontName) { try { node.fontName = snap.fontName; } catch (e) {} } if (snap.fontSize !== null && snap.fontSize !== figma.mixed) { try { node.fontSize = snap.fontSize; } catch (e) {} } }
        ok++;
      } else if (snap.category === "radius") { node.cornerRadius = snap.cornerRadius; ok++; }
    } catch (e) { fail++; }
  }
  figma.ui.postMessage({ type: "undo-result", success: true, restoredCount: ok, errorCount: fail, canUndo: undoSnapshots.length > 0 });
}

// ── 적용 함수들 ────────────────────────────────────────────
async function applyColorFix(node, item) {
  var rec = item.recommendation, prop = item.property, idx = item.fillIndex;
  if (rec.type === "variable") {
    var v = await getVariableById(rec.id);
    if (!v) throw new Error("Variable 없음");
    if (prop === "fill") {
      var fl = node.fills; if (fl === figma.mixed) throw new Error("fills mixed");
      var np = figma.variables.setBoundVariableForPaint(fl[idx], "color", v);
      var nf = []; for (var i = 0; i < fl.length; i++) nf.push(i === idx ? np : fl[i]); node.fills = nf;
    } else {
      var st = node.strokes; if (st === figma.mixed) throw new Error("strokes mixed");
      var nsp = figma.variables.setBoundVariableForPaint(st[idx], "color", v);
      var ns = []; for (var j = 0; j < st.length; j++) ns.push(j === idx ? nsp : st[j]); node.strokes = ns;
    }
  } else if (rec.type === "style") {
    if (prop === "fill") node.fillStyleId = rec.id;
    else { try { node.strokeStyleId = rec.id; } catch (e) { var so = await getStyleById(rec.id); if (so && so.paints) node.strokes = [so.paints[0]]; } }
  }
}

async function applyTypographyFix(node, item) {
  var rec = item.recommendation;
  if (rec.type !== "style") return;
  try { var ts = await getStyleById(rec.id); if (ts && ts.fontName) await figma.loadFontAsync(ts.fontName); } catch (e) {}
  try { if (node.fontName !== figma.mixed) await figma.loadFontAsync(node.fontName); } catch (e) {}
  node.textStyleId = rec.id;
}

async function applyRadiusFix(node, item) {
  var rec = item.recommendation;
  if (rec.type !== "variable") return;
  var v = await getVariableById(rec.id);
  if (!v) throw new Error("Variable 없음");
  try { if (typeof node.setBoundVariable === "function") { node.setBoundVariable("cornerRadius", v); return; } } catch (e) {}
  var mv = v.valuesByMode;
  for (var mid in mv) { if (mv.hasOwnProperty(mid) && typeof mv[mid] === "number") { node.cornerRadius = mv[mid]; return; } }
}
