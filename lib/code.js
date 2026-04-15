// ============================================================
// Variable & Style Scanner - code.js  (v1.2)
// ============================================================

figma.showUI(__html__, { width: 420, height: 660, themeColors: true });

// ============================================================
// 유틸리티: RGB(0-1) → HEX 문자열
// ============================================================
function rgbToHex(r, g, b) {
  const toHex = (v) => {
    const hex = Math.round(v * 255).toString(16).toUpperCase();
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

// ============================================================
// 유틸리티: figma.mixed(Symbol) 여부 확인
// ============================================================
function isMixed(value) {
  return typeof value === 'symbol';
}

// ============================================================
// 유틸리티: 노드 visible 체크 (부모 체인 포함)
// ============================================================
function isNodeVisible(node) {
  let current = node;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

// ============================================================
// 유틸리티: Paint에서 color boundVariable 확인
// ============================================================
function getPaintBoundVariable(paint) {
  if (!paint || !paint.boundVariables) return null;
  return paint.boundVariables['color'] || null;
}

// ============================================================
// Semantic Variable 판별
//
// "Semantic"이란: Base/Primitive 컬러가 아닌, UI 목적에 맞게
// 의미를 부여한 토큰 (예: text.primary, bg.surface, border.default 등)
//
// 판별 기준:
//   - Collection 이름이나 Variable 이름에 아래 키워드를 포함하면 Base로 간주 → 제외
//   - Base 키워드: 'base', 'primitive', 'global', 'palette', 'raw', 'foundation', 'core', 'color-scale'
//   - 그 외는 Semantic으로 간주 → 추천 대상
// ============================================================
const BASE_KEYWORDS = ['base', 'primitive', 'global', 'palette', 'raw', 'foundation', 'core', 'color-scale', 'color scale'];

function isSemanticVariable(variable, collectionName) {
  const nameLower       = variable.name.toLowerCase();
  const collectionLower = (collectionName || '').toLowerCase();

  // Collection 이름이 Base 키워드를 포함하면 제외
  for (const kw of BASE_KEYWORDS) {
    if (collectionLower.includes(kw)) return false;
  }
  // Variable 이름의 첫 번째 세그먼트(슬래시 기준)가 Base 키워드면 제외
  // 예: "Color/Red/500" → 첫 세그먼트 "Color" → 의심스러우나 이름만으론 판단 불가 → 통과
  // 예: "Primitive/Red/500" → 첫 세그먼트 "Primitive" → 제외
  const firstSegment = nameLower.split('/')[0].trim();
  for (const kw of BASE_KEYWORDS) {
    if (firstSegment === kw || firstSegment.startsWith(kw)) return false;
  }

  return true; // Semantic으로 간주
}

// ============================================================
// 파일 내 Variables 수집
// COLOR + FLOAT, Semantic만 필터링
// ============================================================
async function collectAllVariables() {
  const allVariables = [];
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of collections) {
      for (const varId of collection.variableIds) {
        try {
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (!variable) continue;
          if (variable.resolvedType !== 'COLOR' && variable.resolvedType !== 'FLOAT') continue;

          // COLOR 타입은 Semantic 필터 적용, FLOAT(Radius 등)는 그대로 포함
          if (variable.resolvedType === 'COLOR') {
            if (!isSemanticVariable(variable, collection.name)) continue;
          }

          allVariables.push({
            id: variable.id,
            name: variable.name,
            resolvedType: variable.resolvedType,
            valuesByMode: variable.valuesByMode,
            collectionName: collection.name,
            collectionId: collection.id,
            modeId: collection.defaultModeId,
          });
        } catch (e) {
          // 개별 변수 오류 무시
        }
      }
    }
  } catch (e) {
    console.error('Variables 수집 오류:', e);
  }
  return allVariables;
}

// ============================================================
// 파일 내 Local Styles 수집
// ============================================================
async function collectAllStyles() {
  let colorStyles = [];
  let textStyles  = [];
  try { colorStyles = await figma.getLocalPaintStylesAsync(); } catch (e) {}
  try { textStyles  = await figma.getLocalTextStylesAsync();  } catch (e) {}
  return { colorStyles, textStyles };
}

// ============================================================
// COLOR Variable의 HEX 반환 (Alias 체인 해소 포함)
// ============================================================
async function getVariableColorHex(variable) {
  if (variable.resolvedType !== 'COLOR') return null;
  try {
    const value = variable.valuesByMode[variable.modeId];
    if (!value) return null;

    if (typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
      const aliasVar = await figma.variables.getVariableByIdAsync(value.id);
      if (!aliasVar) return null;
      const firstModeId = Object.keys(aliasVar.valuesByMode)[0];
      const aliasValue  = aliasVar.valuesByMode[firstModeId];
      if (!aliasValue || typeof aliasValue !== 'object' || !('r' in aliasValue)) return null;
      return rgbToHex(aliasValue.r, aliasValue.g, aliasValue.b);
    }

    if (typeof value === 'object' && 'r' in value) {
      return rgbToHex(value.r, value.g, value.b);
    }
  } catch (e) {}
  return null;
}

// ============================================================
// FLOAT Variable의 숫자값 반환
// ============================================================
function getVariableFloatValue(variable) {
  if (variable.resolvedType !== 'FLOAT') return null;
  const value = variable.valuesByMode[variable.modeId];
  return typeof value === 'number' ? value : null;
}

// ============================================================
// Color Style의 첫 번째 Solid Paint HEX 반환
// ============================================================
function getColorStyleHex(style) {
  try {
    if (!style.paints || style.paints.length === 0) return null;
    const solidPaint = style.paints.find((p) => p.type === 'SOLID');
    if (!solidPaint) return null;
    return rgbToHex(solidPaint.color.r, solidPaint.color.g, solidPaint.color.b);
  } catch (e) { return null; }
}

// ============================================================
// 추천: HEX 매칭 Semantic Color Variable 탐색
// ============================================================
async function findBestColorVariable(hex, colorVariables) {
  for (const v of colorVariables) {
    const vHex = await getVariableColorHex(v);
    if (vHex && vHex.toUpperCase() === hex.toUpperCase()) return v;
  }
  return null;
}

// ============================================================
// 추천: HEX 매칭 Color Style 탐색
// ============================================================
function findBestColorStyle(hex, colorStyles) {
  return colorStyles.find((s) => {
    const sHex = getColorStyleHex(s);
    return sHex && sHex.toUpperCase() === hex.toUpperCase();
  }) || null;
}

// ============================================================
// 추천: fontSize + fontFamily 매칭 Text Style 탐색
// ============================================================
function findBestTextStyle(fontSize, fontFamily, textStyles) {
  const exact = textStyles.find(
    (s) => s.fontSize === fontSize && s.fontName && s.fontName.family === fontFamily
  );
  if (exact) return exact;
  return textStyles.find((s) => s.fontSize === fontSize) || null;
}

// ============================================================
// 추천: 숫자값 매칭 FLOAT Variable 탐색 (Radius)
// ============================================================
function findBestRadiusVariable(radius, floatVariables) {
  return floatVariables.find((v) => getVariableFloatValue(v) === radius) || null;
}

// ============================================================
// 노드 하나 스캔 → issues 배열에 추가
// ============================================================
async function scanNode(node, colorVariables, floatVariables, colorStyles, textStyles, issues) {
  if (!isNodeVisible(node)) return;

  // ── fills ──────────────────────────────────────────────────
  if ('fills' in node) {
    const fills = node.fills;
    if (Array.isArray(fills)) {
      const fillStyleId  = node.fillStyleId;
      const hasFillStyle = !isMixed(fillStyleId) && typeof fillStyleId === 'string' && fillStyleId !== '';

      if (!hasFillStyle) {
        for (let i = 0; i < fills.length; i++) {
          const fill = fills[i];
          if (!fill || fill.type !== 'SOLID' || fill.visible === false) continue;
          if (getPaintBoundVariable(fill)) continue;

          const hex     = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          const recVar   = await findBestColorVariable(hex, colorVariables);
          const recStyle = recVar ? null : findBestColorStyle(hex, colorStyles);
          const subType  = node.type === 'TEXT' ? 'textColor' : 'fill';

          issues.push({
            type: 'color', subType,
            nodeId: node.id, nodeName: node.name,
            currentValue: hex, fillIndex: i,
            recommendedVariable: recVar  ? { id: recVar.id,   name: recVar.name,   collection: recVar.collectionName  } : null,
            recommendedStyle:    recStyle ? { id: recStyle.id, name: recStyle.name } : null,
          });
        }
      }
    }
  }

  // ── strokes ────────────────────────────────────────────────
  if ('strokes' in node) {
    const strokes = node.strokes;
    if (Array.isArray(strokes)) {
      const strokeStyleId  = node.strokeStyleId;
      const hasStrokeStyle = !isMixed(strokeStyleId) && typeof strokeStyleId === 'string' && strokeStyleId !== '';

      if (!hasStrokeStyle) {
        for (let i = 0; i < strokes.length; i++) {
          const stroke = strokes[i];
          if (!stroke || stroke.type !== 'SOLID' || stroke.visible === false) continue;
          if (getPaintBoundVariable(stroke)) continue;

          const hex     = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          const recVar   = await findBestColorVariable(hex, colorVariables);
          const recStyle = recVar ? null : findBestColorStyle(hex, colorStyles);

          issues.push({
            type: 'color', subType: 'stroke',
            nodeId: node.id, nodeName: node.name,
            currentValue: hex, strokeIndex: i,
            recommendedVariable: recVar  ? { id: recVar.id,   name: recVar.name,   collection: recVar.collectionName  } : null,
            recommendedStyle:    recStyle ? { id: recStyle.id, name: recStyle.name } : null,
          });
        }
      }
    }
  }

  // ── Typography ─────────────────────────────────────────────
  if (node.type === 'TEXT') {
    const textStyleId  = node.textStyleId;
    const hasTextStyle = !isMixed(textStyleId) && typeof textStyleId === 'string' && textStyleId !== '';

    if (!hasTextStyle) {
      const fontSize = isMixed(node.fontSize) ? null : node.fontSize;
      const fontName = isMixed(node.fontName)  ? null : node.fontName;

      if (fontSize !== null && fontName !== null) {
        const fontFamily   = fontName ? fontName.family : '';
        const fontStyle    = fontName ? fontName.style  : '';
        const currentValue = `${fontSize}px / ${fontFamily} ${fontStyle}`.trim();
        const recStyle     = findBestTextStyle(fontSize, fontFamily, textStyles);

        issues.push({
          type: 'typography',
          nodeId: node.id, nodeName: node.name,
          currentValue, fontSize, fontFamily, fontStyle,
          recommendedStyle: recStyle ? { id: recStyle.id, name: recStyle.name } : null,
          recommendedVariable: null,
        });
      }
    }
  }

  // ── cornerRadius ───────────────────────────────────────────
  if ('cornerRadius' in node) {
    const radius = node.cornerRadius;
    if (!isMixed(radius) && typeof radius === 'number' && radius > 0) {
      const bv = node.boundVariables;
      const hasBoundRadius = bv && (bv['cornerRadius'] || bv['topLeftRadius']);
      if (!hasBoundRadius) {
        const recVar = findBestRadiusVariable(radius, floatVariables);
        issues.push({
          type: 'radius',
          nodeId: node.id, nodeName: node.name,
          currentValue: radius + 'px', radiusValue: radius,
          recommendedVariable: recVar ? { id: recVar.id, name: recVar.name, collection: recVar.collectionName } : null,
          recommendedStyle: null,
        });
      }
    }
  }

  // ── 자식 재귀 ──────────────────────────────────────────────
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      await scanNode(child, colorVariables, floatVariables, colorStyles, textStyles, issues);
    }
  }
}

// ============================================================
// 스캔 실행
// ============================================================
async function runScan() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', message: '프레임 또는 레이어를 선택해 주세요.' });
    return;
  }

  figma.ui.postMessage({ type: 'scan-start' });

  try {
    const allVariables   = await collectAllVariables();
    const colorVariables = allVariables.filter((v) => v.resolvedType === 'COLOR');
    const floatVariables = allVariables.filter((v) => v.resolvedType === 'FLOAT');
    const { colorStyles, textStyles } = await collectAllStyles();

    const issues = [];
    for (const node of selection) {
      await scanNode(node, colorVariables, floatVariables, colorStyles, textStyles, issues);
    }

    // 중복 제거
    const seen = new Set();
    const uniqueIssues = issues.filter((issue) => {
      const key = [
        issue.nodeId, issue.type, issue.subType || '',
        issue.fillIndex   !== undefined ? issue.fillIndex   : '',
        issue.strokeIndex !== undefined ? issue.strokeIndex : '',
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    figma.ui.postMessage({
      type: 'scan-result',
      issues: uniqueIssues,
      stats: {
        total:      uniqueIssues.length,
        color:      uniqueIssues.filter((i) => i.type === 'color').length,
        typography: uniqueIssues.filter((i) => i.type === 'typography').length,
        radius:     uniqueIssues.filter((i) => i.type === 'radius').length,
        variables:  allVariables.length,
        colorStyles: colorStyles.length,
        textStyles:  textStyles.length,
      },
    });
  } catch (err) {
    console.error('Scan error:', err);
    figma.ui.postMessage({ type: 'error', message: '스캔 중 오류: ' + (err.message || String(err)) });
  }
}

// ============================================================
// 적용 전 스냅샷 수집
// 각 이슈 적용 전 현재 상태를 기록해 되돌리기에 사용
// ============================================================
async function captureSnapshot(issue) {
  try {
    const node = await figma.getNodeByIdAsync(issue.nodeId);
    if (!node) return null;

    if (issue.type === 'color') {
      if ((issue.subType === 'fill' || issue.subType === 'textColor') && Array.isArray(node.fills)) {
        const fill = node.fills[issue.fillIndex];
        if (!fill) return null;
        return {
          nodeId:    issue.nodeId,
          type:      issue.type,
          subType:   issue.subType,
          fillIndex: issue.fillIndex,
          // fills 배열 전체를 JSON 직렬화 (boundVariables 제외, 기본값 복원용)
          fillsSnapshot: JSON.parse(JSON.stringify(node.fills.map(f => ({
            type:    f.type,
            color:   f.color,
            opacity: f.opacity,
            visible: f.visible,
          })))),
          prevFillStyleId: isMixed(node.fillStyleId) ? '' : (node.fillStyleId || ''),
        };
      }
      if (issue.subType === 'stroke' && Array.isArray(node.strokes)) {
        const stroke = node.strokes[issue.strokeIndex];
        if (!stroke) return null;
        return {
          nodeId:      issue.nodeId,
          type:        issue.type,
          subType:     issue.subType,
          strokeIndex: issue.strokeIndex,
          strokesSnapshot: JSON.parse(JSON.stringify(node.strokes.map(s => ({
            type:    s.type,
            color:   s.color,
            opacity: s.opacity,
            visible: s.visible,
          })))),
          prevStrokeStyleId: isMixed(node.strokeStyleId) ? '' : (node.strokeStyleId || ''),
        };
      }
    }

    if (issue.type === 'typography') {
      return {
        nodeId:          issue.nodeId,
        type:            issue.type,
        prevTextStyleId: isMixed(node.textStyleId) ? '' : (node.textStyleId || ''),
      };
    }

    if (issue.type === 'radius') {
      return {
        nodeId:      issue.nodeId,
        type:        issue.type,
        radiusValue: isMixed(node.cornerRadius) ? 0 : (node.cornerRadius || 0),
      };
    }
  } catch (e) {
    console.error('Snapshot error:', e);
  }
  return null;
}

// ============================================================
// 적용 실행 (스냅샷 포함)
// ============================================================
async function applyIssues(selectedIssues) {
  let successCount = 0;
  let failCount    = 0;
  const snapshots  = []; // 성공한 항목의 되돌리기 스냅샷

  for (const issue of selectedIssues) {
    try {
      const node = await figma.getNodeByIdAsync(issue.nodeId);
      if (!node) { failCount++; continue; }

      // 적용 전 스냅샷 수집
      const snap = await captureSnapshot(issue);

      // ── Color ──────────────────────────────────────────────
      if (issue.type === 'color') {
        if (issue.recommendedVariable) {
          const variable = await figma.variables.getVariableByIdAsync(issue.recommendedVariable.id);
          if (!variable) { failCount++; continue; }

          if (issue.subType === 'fill' || issue.subType === 'textColor') {
            const fills = node.fills;
            if (!Array.isArray(fills) || fills[issue.fillIndex] === undefined) { failCount++; continue; }
            node.fills = fills.map((f, idx) =>
              idx === issue.fillIndex
                ? figma.variables.setBoundVariableForPaint(f, 'color', variable)
                : f
            );
            if (snap) snapshots.push(snap);
            successCount++;
          } else if (issue.subType === 'stroke') {
            const strokes = node.strokes;
            if (!Array.isArray(strokes) || strokes[issue.strokeIndex] === undefined) { failCount++; continue; }
            node.strokes = strokes.map((s, idx) =>
              idx === issue.strokeIndex
                ? figma.variables.setBoundVariableForPaint(s, 'color', variable)
                : s
            );
            if (snap) snapshots.push(snap);
            successCount++;
          }
        } else if (issue.recommendedStyle) {
          if (issue.subType === 'fill' || issue.subType === 'textColor') {
            node.fillStyleId = issue.recommendedStyle.id;
            if (snap) snapshots.push(snap);
            successCount++;
          } else if (issue.subType === 'stroke') {
            node.strokeStyleId = issue.recommendedStyle.id;
            if (snap) snapshots.push(snap);
            successCount++;
          }
        } else {
          failCount++;
        }
      }

      // ── Typography ─────────────────────────────────────────
      else if (issue.type === 'typography') {
        if (issue.recommendedStyle) {
          node.textStyleId = issue.recommendedStyle.id;
          if (snap) snapshots.push(snap);
          successCount++;
        } else {
          failCount++;
        }
      }

      // ── Radius ─────────────────────────────────────────────
      else if (issue.type === 'radius') {
        if (issue.recommendedVariable) {
          const variable = await figma.variables.getVariableByIdAsync(issue.recommendedVariable.id);
          if (!variable) { failCount++; continue; }
          figma.variables.setBoundVariableForNode(node, 'cornerRadius', variable);
          if (snap) snapshots.push(snap);
          successCount++;
        } else {
          failCount++;
        }
      }
    } catch (err) {
      console.error('Apply error:', issue.nodeId, err.message || err);
      failCount++;
    }
  }

  figma.ui.postMessage({ type: 'apply-result', successCount, failCount, snapshot: snapshots });
}

// ============================================================
// 되돌리기 실행
// 스냅샷을 역순으로 복원
// ============================================================
async function undoApply(snapshotData) {
  if (!snapshotData || !snapshotData.snapshot) return;

  let restoredCount = 0;
  const snapshots = snapshotData.snapshot;

  // 역순으로 처리 (나중에 적용된 것부터 복원)
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const snap = snapshots[i];
    try {
      const node = await figma.getNodeByIdAsync(snap.nodeId);
      if (!node) continue;

      if (snap.type === 'color') {
        if ((snap.subType === 'fill' || snap.subType === 'textColor') && snap.fillsSnapshot) {
          // Variable 바인딩 해제 후 원래 색상으로 복원
          const newFills = snap.fillsSnapshot.map(f => ({ ...f }));
          node.fills = newFills;
          // Style ID 복원
          if (snap.prevFillStyleId !== undefined) {
            node.fillStyleId = snap.prevFillStyleId;
          }
          restoredCount++;
        } else if (snap.subType === 'stroke' && snap.strokesSnapshot) {
          node.strokes = snap.strokesSnapshot.map(s => ({ ...s }));
          if (snap.prevStrokeStyleId !== undefined) {
            node.strokeStyleId = snap.prevStrokeStyleId;
          }
          restoredCount++;
        }
      } else if (snap.type === 'typography') {
        node.textStyleId = snap.prevTextStyleId || '';
        restoredCount++;
      } else if (snap.type === 'radius') {
        // Variable 바인딩 해제
        figma.variables.setBoundVariableForNode(node, 'cornerRadius', null);
        node.cornerRadius = snap.radiusValue || 0;
        restoredCount++;
      }
    } catch (err) {
      console.error('Undo error:', snap.nodeId, err.message || err);
    }
  }

  figma.ui.postMessage({ type: 'undo-result', restoredCount });
}

// ============================================================
// UI 메시지 수신
// ============================================================
figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'scan':
      await runScan();
      break;

    case 'apply':
      if (Array.isArray(msg.issues) && msg.issues.length > 0) {
        await applyIssues(msg.issues);
      }
      break;

    case 'undo':
      await undoApply(msg.snapshot);
      break;

    case 'select-node':
      try {
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (node && 'parent' in node) {
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
        }
      } catch (e) {}
      break;

    case 'close':
      figma.closePlugin();
      break;

    default:
      break;
  }
};
