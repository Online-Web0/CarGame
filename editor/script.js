/* Enhanced drop-in replacement JS for your existing map editor.
   - Keeps legacy arrays + undo + pan/zoom + legacy imp()/exp() format
   - Adds: 2000x2000 bounds, fit-to-world, gridStep+snap toggle, spawn zone/point/angle (editable),
           screen-constant spawn arrow, visible-only grid with major/minor, cached canvas resize,
           JSON import/export, HUD overlay.

   NOTE: JSON uses your INTERNAL coords (x right, y down). angleDeg uses 0°=+X (right), 90°=+Y (down).
*/

let camX = 0;
let camY = 0;
let zoom = 40; // pixels per world unit

// ===== Data (MUST KEEP) =====
var walls = [];
var start = [];
var trees = [];
var arrows = [];
var erase = [];
var hist = [];

var mouse = {
  down: false,
  start: { x: 0, y: 0 },
  cur: { x: 0, y: 0 },
  end: { x: 0, y: 0 }
};

var sel = 0;

// DOM refs (initialized in init)
var s = null;  // #menu
var ca = null; // #c
var c = null;

var height = 0;
var width = 0;

// keep your old "scale" only for legacy import/export math
var scale = 10;

// ===== New settings =====
const WORLD_SIZE = 2000;

let snapEnabled = true;
let gridStep = 10; // 5,10,20,25,50
let clampEnabled = true;

// Spacebar pan (optional)
let spacePan = false;

// HUD
let hudEl = null;
let cursorRaw = { x: 0, y: 0 };
let cursorSnap = { x: 0, y: 0 };

// Trees throttle (prevents drag spam duplicates)
let _lastTreeKey = null;

// ===== Spawn system =====
let spawnZone = { x: 150, y: 1700, w: 200, h: 140 };
let spawn = { x: 250, y: 1770, angleRad: -Math.PI / 2 }; // default points up (negative Y)

let spawnDragMode = null; // "zoneMove" | "zoneResize" | "point" | "rotate"
let spawnResizeHandle = null; // "nw"|"ne"|"sw"|"se"
let dragStart = {
  mx: 0, my: 0,
  wx: 0, wy: 0,
  zone: null,
  spawn: null,
  angle: 0
};

// Pan drag state (MUST KEEP behavior: MMB or Shift+drag pans)
let draggingView = false;
let lastX = 0;
let lastY = 0;

// ===== Helpers =====
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function normAngleRad(r) {
  const t = r % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}
function radToDeg(r) { return r * 180 / Math.PI; }
function degToRad(d) { return d * Math.PI / 180; }
function normDeg(d) {
  let t = d % 360;
  if (t < 0) t += 360;
  return t;
}

let _lastClientW = -1, _lastClientH = -1, _lastDPR = -1;
function resizeCanvasIfNeeded() {
  const dpr = window.devicePixelRatio || 1;
  const cw = ca.clientWidth;
  const ch = ca.clientHeight;

  if (cw === _lastClientW && ch === _lastClientH && dpr === _lastDPR) return false;

  _lastClientW = cw; _lastClientH = ch; _lastDPR = dpr;
  width = Math.max(1, Math.floor(cw * dpr));
  height = Math.max(1, Math.floor(ch * dpr));
  ca.width = width;
  ca.height = height;

  // restore context defaults (canvas resize resets state)
  c.lineCap = "round";
  c.lineWidth = 2;

  return true;
}

// Single, consistent transform functions (duplicate removed)
function worldToScreen(wx, wy) {
  return {
    x: (width / 2) + (wx - camX) * zoom,
    y: (height / 2) + (wy - camY) * zoom
  };
}
function screenToWorldX(px) {
  const dpr = window.devicePixelRatio || 1;
  return (px * dpr - width / 2) / zoom + camX;
}
function screenToWorldY(py) {
  const dpr = window.devicePixelRatio || 1;
  return (py * dpr - height / 2) / zoom + camY;
}

function snapVal(v) {
  if (!snapEnabled) return v; // raw world coords when snap off
  return Math.round(v / gridStep) * gridStep;
}
function gridX(px) { return snapVal(screenToWorldX(px)); }
function gridY(py) { return snapVal(screenToWorldY(py)); }

function clampCamera() {
  if (!clampEnabled) return;
  const margin = 200; // allow a small margin outside world
  const halfW = (width / 2) / zoom;
  const halfH = (height / 2) / zoom;

  const minCX = -margin + halfW;
  const maxCX = WORLD_SIZE + margin - halfW;
  const minCY = -margin + halfH;
  const maxCY = WORLD_SIZE + margin - halfH;

  camX = clamp(camX, minCX, maxCX);
  camY = clamp(camY, minCY, maxCY);
}

function fitToWorld() {
  resizeCanvasIfNeeded();
  camX = WORLD_SIZE / 2;
  camY = WORLD_SIZE / 2;
  const pad = 0.92;
  zoom = Math.min(width, height) / WORLD_SIZE * pad;
  zoom = clamp(zoom, 0.3, 400);
  clampCamera();
}

// ===== UI creation (JS only) =====
function ensureUI() {
  // HUD
  if (!hudEl) {
    hudEl = document.createElement("div");
    hudEl.id = "__map_editor_hud";
    Object.assign(hudEl.style, {
      position: "fixed",
      left: "12px",
      bottom: "12px",
      zIndex: "9999",
      background: "rgba(0,0,0,0.6)",
      color: "#fff",
      padding: "10px 12px",
      borderRadius: "10px",
      font: "12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial",
      whiteSpace: "pre",
      pointerEvents: "none",
      backdropFilter: "blur(6px)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      minWidth: "320px"
    });
    document.body.appendChild(hudEl);
  }

  // Controls container
  if (s && !document.getElementById("__map_editor_controls")) {
    const wrap = document.createElement("div");
    wrap.id = "__map_editor_controls";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "6px";
    wrap.style.marginTop = "8px";

    // Helper to make a menu button (div.button style-agnostic; falls back if CSS exists)
    function makeBtn(label, onClick) {
      const b = document.createElement("div");
      b.className = "button";
      b.textContent = label;
      b.style.cursor = "pointer";
      b.onclick = onClick;
      return b;
    }

    // Fit to world button (required)
    wrap.appendChild(makeBtn("Fit to World (2000x2000)", fitToWorld));

    // Spawn tool button
    wrap.appendChild(makeBtn("Spawn Edit Tool", () => select(5)));

    // Snap + Grid step row
    const row1 = document.createElement("div");
    row1.style.display = "flex";
    row1.style.flexWrap = "wrap";
    row1.style.gap = "6px";

    const snapLabel = document.createElement("label");
    snapLabel.style.display = "inline-flex";
    snapLabel.style.alignItems = "center";
    snapLabel.style.gap = "6px";
    snapLabel.style.userSelect = "none";

    const snapCb = document.createElement("input");
    snapCb.type = "checkbox";
    snapCb.checked = snapEnabled;
    snapCb.onchange = () => { snapEnabled = !!snapCb.checked; };

    snapLabel.appendChild(snapCb);
    snapLabel.appendChild(document.createTextNode("Snap"));
    row1.appendChild(snapLabel);

    const stepSel = document.createElement("select");
    [5, 10, 20, 25, 50].forEach(v => {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = String(v);
      if (v === gridStep) o.selected = true;
      stepSel.appendChild(o);
    });
    stepSel.onchange = () => { gridStep = parseInt(stepSel.value, 10) || 10; };
    row1.appendChild(document.createTextNode(" Grid: "));
    row1.appendChild(stepSel);

    // Clamp pan toggle
    const clampLabel = document.createElement("label");
    clampLabel.style.display = "inline-flex";
    clampLabel.style.alignItems = "center";
    clampLabel.style.gap = "6px";
    clampLabel.style.marginLeft = "8px";
    clampLabel.style.userSelect = "none";

    const clampCb = document.createElement("input");
    clampCb.type = "checkbox";
    clampCb.checked = clampEnabled;
    clampCb.onchange = () => { clampEnabled = !!clampCb.checked; clampCamera(); };

    clampLabel.appendChild(clampCb);
    clampLabel.appendChild(document.createTextNode("Clamp Pan"));
    row1.appendChild(clampLabel);

    wrap.appendChild(row1);

    // JSON export/import row
    const row2 = document.createElement("div");
    row2.style.display = "flex";
    row2.style.flexWrap = "wrap";
    row2.style.gap = "6px";

    row2.appendChild(makeBtn("Export JSON", exportJSON));
    row2.appendChild(makeBtn("Import JSON", importJSON));
    wrap.appendChild(row2);

    s.appendChild(wrap);
  }
}

// ===== Drawing =====
function drawGrid() {
  c.clearRect(0, 0, width, height);

  // Fill background
  c.fillStyle = "#0f1116";
  c.fillRect(0, 0, width, height);

  // Determine visible world bounds
  const wMinX = Math.min(screenToWorldX(0), screenToWorldX(ca.clientWidth));
  const wMaxX = Math.max(screenToWorldX(0), screenToWorldX(ca.clientWidth));
  const wMinY = Math.min(screenToWorldY(0), screenToWorldY(ca.clientHeight));
  const wMaxY = Math.max(screenToWorldY(0), screenToWorldY(ca.clientHeight));

  const step = gridStep;
  const spacingPx = step * zoom;

  // If extremely dense, only draw major lines
  const drawMinor = spacingPx >= 6;
  const majorEvery = 5;
  const majorStep = step * majorEvery;

  function drawLines(stepWorld, strokeStyle, lineWidth) {
    const startX = Math.floor(wMinX / stepWorld) * stepWorld;
    const endX = Math.ceil(wMaxX / stepWorld) * stepWorld;
    const startY = Math.floor(wMinY / stepWorld) * stepWorld;
    const endY = Math.ceil(wMaxY / stepWorld) * stepWorld;

    c.strokeStyle = strokeStyle;
    c.lineWidth = lineWidth;
    c.beginPath();

    for (let x = startX; x <= endX; x += stepWorld) {
      const sx = worldToScreen(x, 0).x;
      c.moveTo(sx, 0);
      c.lineTo(sx, height);
    }
    for (let y = startY; y <= endY; y += stepWorld) {
      const sy = worldToScreen(0, y).y;
      c.moveTo(0, sy);
      c.lineTo(width, sy);
    }
    c.stroke();
  }

  if (drawMinor) drawLines(step, "#22283a", 1);
  drawLines(majorStep, "#2f3850", 1);
}

function drawWorldBounds() {
  const a = worldToScreen(0, 0);
  const b = worldToScreen(WORLD_SIZE, WORLD_SIZE);
  c.save();
  c.strokeStyle = "rgba(255,255,255,0.8)";
  c.lineWidth = 3;
  c.setLineDash([10, 8]);
  c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  c.restore();
}

function drawWalls() {
  c.lineCap = "round";
  c.lineWidth = 2;
  c.strokeStyle = "#f48342";
  c.beginPath();
  for (var i = 0; i < walls.length; i++) {
    let a = worldToScreen(walls[i].start.x, walls[i].start.y);
    let b = worldToScreen(walls[i].end.x, walls[i].end.y);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  }
  c.stroke();
}

function drawStartLines() {
  c.lineWidth = 2;

  c.strokeStyle = "#428ff4";
  c.beginPath();
  for (var i = 0; i < start.length && i < 1; i++) {
    let a = worldToScreen(start[i].start.x, start[i].start.y);
    let b = worldToScreen(start[i].end.x, start[i].end.y);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  }
  c.stroke();

  c.strokeStyle = "#ff3b3b";
  c.beginPath();
  for (var i = 1; i < start.length; i++) {
    let a = worldToScreen(start[i].start.x, start[i].start.y);
    let b = worldToScreen(start[i].end.x, start[i].end.y);
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  }
  c.stroke();
}

function drawTrees() {
  c.fillStyle = "#08cc3c";
  const r = clamp(zoom * 0.18, 2, 8);
  for (var i = 0; i < trees.length; i++) {
    let p = worldToScreen(trees[i].x, trees[i].y);
    c.beginPath();
    c.arc(p.x, p.y, r, 0, 2 * Math.PI);
    c.fill();
  }
}

function drawArrows() {
  c.strokeStyle = "#ff4a4a";
  c.lineWidth = 2;
  c.beginPath();
  for (var i = 0; i < arrows.length; i++) {
    let p = worldToScreen(arrows[i].x, arrows[i].y);
    let q = worldToScreen(
      arrows[i].x - Math.cos(arrows[i].angle) / 2,
      arrows[i].y - Math.sin(arrows[i].angle) / 2
    );
    c.moveTo(p.x, p.y);
    c.lineTo(q.x, q.y);
  }
  c.stroke();
}

// ===== Spawn drawing (screen-constant arrow size, world-accurate anchor) =====
function drawSpawnZone() {
  const tl = worldToScreen(spawnZone.x, spawnZone.y);
  const br = worldToScreen(spawnZone.x + spawnZone.w, spawnZone.y + spawnZone.h);

  c.save();
  c.fillStyle = "rgba(8,204,60,0.15)";
  c.strokeStyle = "rgba(8,204,60,0.8)";
  c.lineWidth = 2;
  c.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  c.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  // corner handles when using spawn tool
  if (sel === 5 || spawnDragMode) {
    const corners = getZoneCornersWorld();
    for (const k in corners) {
      const p = worldToScreen(corners[k].x, corners[k].y);
      c.fillStyle = "rgba(8,204,60,0.95)";
      c.beginPath();
      c.arc(p.x, p.y, 6, 0, Math.PI * 2);
      c.fill();
    }
  }

  c.restore();
}

function drawSpawnPointAndArrow() {
  const p = worldToScreen(spawn.x, spawn.y);

  // spawn point
  c.save();
  c.fillStyle = "rgba(8,204,60,1)";
  c.strokeStyle = "rgba(0,0,0,0.6)";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(p.x, p.y, 7, 0, Math.PI * 2);
  c.fill();
  c.stroke();

  // Arrow size clamped in screen pixels: 30..80 px
  const lenPx = clamp(zoom * 1.2, 30, 80);
  const wingPx = clamp(lenPx * 0.33, 10, 26);

  const a = normAngleRad(spawn.angleRad);
  const dx = Math.cos(a);
  const dy = Math.sin(a);

  // shaft
  const tip = { x: p.x + dx * lenPx, y: p.y + dy * lenPx };
  c.strokeStyle = "rgba(8,204,60,1)";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(p.x, p.y);
  c.lineTo(tip.x, tip.y);
  c.stroke();

  // head (triangle)
  const left = {
    x: p.x + dx * (lenPx * 0.65) + (-dy) * wingPx,
    y: p.y + dy * (lenPx * 0.65) + ( dx) * wingPx
  };
  const right = {
    x: p.x + dx * (lenPx * 0.65) + ( dy) * wingPx,
    y: p.y + dy * (lenPx * 0.65) + (-dx) * wingPx
  };

  c.fillStyle = "rgba(8,204,60,1)";
  c.beginPath();
  c.moveTo(tip.x, tip.y);
  c.lineTo(left.x, left.y);
  c.lineTo(right.x, right.y);
  c.closePath();
  c.fill();

  // rotate handle (white circle) when in spawn tool
  if (sel === 5 || spawnDragMode) {
    const handle = { x: p.x + dx * (lenPx + 18), y: p.y + dy * (lenPx + 18) };
    c.fillStyle = "rgba(255,255,255,0.95)";
    c.beginPath();
    c.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
    c.fill();
  }

  c.restore();
}

function getZoneCornersWorld() {
  return {
    nw: { x: spawnZone.x, y: spawnZone.y },
    ne: { x: spawnZone.x + spawnZone.w, y: spawnZone.y },
    sw: { x: spawnZone.x, y: spawnZone.y + spawnZone.h },
    se: { x: spawnZone.x + spawnZone.w, y: spawnZone.y + spawnZone.h }
  };
}

function applySpawnClamp() {
  // keep zone inside bounds (soft)
  spawnZone.w = Math.max(5, spawnZone.w);
  spawnZone.h = Math.max(5, spawnZone.h);
  spawnZone.x = clamp(spawnZone.x, 0, WORLD_SIZE - spawnZone.w);
  spawnZone.y = clamp(spawnZone.y, 0, WORLD_SIZE - spawnZone.h);

  // keep spawn point inside world
  spawn.x = clamp(spawn.x, 0, WORLD_SIZE);
  spawn.y = clamp(spawn.y, 0, WORLD_SIZE);
  spawn.angleRad = normAngleRad(spawn.angleRad);
}

function hitTestSpawn(mxClient, myClient) {
  // All tests in canvas pixel space
  const dpr = window.devicePixelRatio || 1;
  const mx = mxClient * dpr;
  const my = myClient * dpr;

  // rotate handle
  const p = worldToScreen(spawn.x, spawn.y);
  const lenPx = clamp(zoom * 1.2, 30, 80);
  const a = normAngleRad(spawn.angleRad);
  const hx = p.x + Math.cos(a) * (lenPx + 18);
  const hy = p.y + Math.sin(a) * (lenPx + 18);
  if (Math.hypot(mx - hx, my - hy) < 10) return { type: "rotate" };

  // spawn point
  if (Math.hypot(mx - p.x, my - p.y) < 12) return { type: "point" };

  // zone corner handles
  const corners = getZoneCornersWorld();
  for (const k of ["nw", "ne", "sw", "se"]) {
    const cp = worldToScreen(corners[k].x, corners[k].y);
    if (Math.hypot(mx - cp.x, my - cp.y) < 10) return { type: "zoneResize", handle: k };
  }

  // zone body
  const tl = worldToScreen(spawnZone.x, spawnZone.y);
  const br = worldToScreen(spawnZone.x + spawnZone.w, spawnZone.y + spawnZone.h);
  const minX = Math.min(tl.x, br.x), maxX = Math.max(tl.x, br.x);
  const minY = Math.min(tl.y, br.y), maxY = Math.max(tl.y, br.y);
  if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) return { type: "zoneMove" };

  return null;
}

function toolName() {
  return (["Walls", "Start/CP", "Trees", "Arrows", "Eraser", "Spawn Edit"][sel] || ("Tool " + sel));
}

function updateHUD() {
  if (!hudEl) return;
  const angDeg = normDeg(radToDeg(spawn.angleRad)).toFixed(1);
  hudEl.textContent =
`Tool: ${toolName()}
Zoom: ${zoom.toFixed(2)} px/unit   camX=${camX.toFixed(2)} camY=${camY.toFixed(2)}
Grid: step=${gridStep}   snap=${snapEnabled ? "ON" : "OFF"}   clampPan=${clampEnabled ? "ON" : "OFF"}
Cursor raw:     x=${cursorRaw.x.toFixed(2)} y=${cursorRaw.y.toFixed(2)}
Cursor snapped: x=${cursorSnap.x.toFixed(2)} y=${cursorSnap.y.toFixed(2)}
Spawn: x=${spawn.x.toFixed(2)} y=${spawn.y.toFixed(2)} angleDeg=${angDeg}
Zone:  x=${spawnZone.x.toFixed(2)} y=${spawnZone.y.toFixed(2)} w=${spawnZone.w.toFixed(2)} h=${spawnZone.h.toFixed(2)}`;
}

// ===== Main loop =====
function update() {
  requestAnimationFrame(update);

  resizeCanvasIfNeeded();
  ensureUI();

  drawGrid();
  drawWorldBounds();
  drawWalls();
  drawStartLines();
  drawTrees();
  drawArrows();
  drawSpawnZone();
  drawSpawnPointAndArrow();

  updateHUD();
}

// ===== UI selection (MUST KEEP name + behavior; enhanced to not depend on child count) =====
function select(n) {
  sel = n;

  // Best-effort highlight: if menu has .button elements, mark first 6 "tool-like" buttons
  if (!s) return;

  // Prefer buttons that are already wired to select(n) by onclick or dataset
  const btns = Array.from(s.querySelectorAll(".button"));

  // If we can detect tool buttons (first 5 existing + our spawn tool), highlight by order:
  // This preserves the common layout of your existing menu.
  let toolBtns = btns;

  // Only highlight if there are at least 5 (existing tools). Don't try to be too clever.
  if (toolBtns.length >= 5) {
    // Highlight based on first 6 .button entries (0..5)
    for (let i = 0; i < toolBtns.length; i++) {
      // only apply selected styling to first 6; leave others alone
      if (i < 6) {
        toolBtns[i].className = "button" + (i === n ? " selected" : "");
      }
    }
  }
}
window.select = select;

// ===== Editing handlers (MUST KEEP pan/zoom behavior) =====
function onMouseDown(e) {
  // Pan: MMB or Shift+Left (and Space+Left optional)
  const wantPan = (e.button === 1) || (e.button === 0 && e.shiftKey) || (e.button === 0 && spacePan);
  if (wantPan) {
    draggingView = true;
    lastX = e.clientX;
    lastY = e.clientY;
    return;
  }

  mouse.down = true;
  mouse.cur.x = e.clientX; mouse.cur.y = e.clientY;
  mouse.start.x = e.clientX; mouse.start.y = e.clientY;

  if (sel === 5) {
    const ht = hitTestSpawn(e.clientX, e.clientY);
    if (ht) {
      spawnDragMode = ht.type;
      spawnResizeHandle = ht.handle || null;

      dragStart.mx = e.clientX;
      dragStart.my = e.clientY;
      dragStart.wx = screenToWorldX(e.clientX);
      dragStart.wy = screenToWorldY(e.clientY);
      dragStart.zone = { ...spawnZone };
      dragStart.spawn = { ...spawn };
      dragStart.angle = spawn.angleRad;
      return;
    }
  }

  if (sel == 0) {
    walls.push({
      start: { x: gridX(mouse.start.x), y: gridY(mouse.start.y) },
      end: { x: gridX(mouse.start.x), y: gridY(mouse.start.y) }
    });
  }
  if (sel == 1) {
    start.push({
      start: { x: gridX(mouse.start.x), y: gridY(mouse.start.y) },
      end: { x: gridX(mouse.start.x), y: gridY(mouse.start.y) }
    });
  }
  if (sel == 2) {
    const x = gridX(mouse.start.x);
    const y = gridY(mouse.start.y);
    const key = snapEnabled ? (x + "," + y) : (Math.floor(x / gridStep) + "," + Math.floor(y / gridStep));
    trees.push({ x, y });
    _lastTreeKey = key;
  }
  if (sel == 3) {
    arrows.push({ x: gridX(mouse.start.x), y: gridY(mouse.start.y), angle: 0 });
  }
  if (sel == 4) {
    eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
  }
}

function onMouseMove(e) {
  mouse.cur.x = e.clientX;
  mouse.cur.y = e.clientY;

  cursorRaw.x = screenToWorldX(e.clientX);
  cursorRaw.y = screenToWorldY(e.clientY);
  cursorSnap.x = snapVal(cursorRaw.x);
  cursorSnap.y = snapVal(cursorRaw.y);

  // Pan drag
  if (draggingView) {
    camX -= (e.clientX - lastX) / zoom;
    camY -= (e.clientY - lastY) / zoom;
    lastX = e.clientX;
    lastY = e.clientY;
    clampCamera();
    return;
  }

  // Spawn editing
  if (spawnDragMode) {
    const wNowX = screenToWorldX(e.clientX);
    const wNowY = screenToWorldY(e.clientY);
    const dx = wNowX - dragStart.wx;
    const dy = wNowY - dragStart.wy;

    if (spawnDragMode === "zoneMove") {
      spawnZone.x = dragStart.zone.x + dx;
      spawnZone.y = dragStart.zone.y + dy;

      spawn.x = dragStart.spawn.x + dx;
      spawn.y = dragStart.spawn.y + dy;

      if (snapEnabled) {
        spawnZone.x = snapVal(spawnZone.x);
        spawnZone.y = snapVal(spawnZone.y);
        spawn.x = snapVal(spawn.x);
        spawn.y = snapVal(spawn.y);
      }

      applySpawnClamp();
      return;
    }

    if (spawnDragMode === "zoneResize") {
      const z = dragStart.zone;
      let x1 = z.x, y1 = z.y, x2 = z.x + z.w, y2 = z.y + z.h;

      if (spawnResizeHandle === "nw") { x1 = wNowX; y1 = wNowY; }
      if (spawnResizeHandle === "ne") { x2 = wNowX; y1 = wNowY; }
      if (spawnResizeHandle === "sw") { x1 = wNowX; y2 = wNowY; }
      if (spawnResizeHandle === "se") { x2 = wNowX; y2 = wNowY; }

      let nx = Math.min(x1, x2);
      let ny = Math.min(y1, y2);
      let nw = Math.abs(x2 - x1);
      let nh = Math.abs(y2 - y1);

      if (snapEnabled) {
        nx = snapVal(nx);
        ny = snapVal(ny);
        nw = Math.max(gridStep, snapVal(nw));
        nh = Math.max(gridStep, snapVal(nh));
      } else {
        nw = Math.max(5, nw);
        nh = Math.max(5, nh);
      }

      spawnZone.x = nx;
      spawnZone.y = ny;
      spawnZone.w = nw;
      spawnZone.h = nh;

      applySpawnClamp();
      return;
    }

    if (spawnDragMode === "point") {
      let px = wNowX, py = wNowY;
      if (snapEnabled) { px = snapVal(px); py = snapVal(py); }
      spawn.x = px;
      spawn.y = py;
      applySpawnClamp();
      return;
    }

    if (spawnDragMode === "rotate") {
      // angle computed in screen space around anchor => stable, no drift
      const dpr = window.devicePixelRatio || 1;
      const mx = e.clientX * dpr;
      const my = e.clientY * dpr;
      const sp = worldToScreen(spawn.x, spawn.y);
      spawn.angleRad = normAngleRad(Math.atan2(my - sp.y, mx - sp.x));
      return;
    }
  }

  // Legacy drawing tools
  if (sel == 0 && mouse.down && walls.length) {
    walls[walls.length - 1].end.x = gridX(mouse.cur.x);
    walls[walls.length - 1].end.y = gridY(mouse.cur.y);
  }
  if (sel == 1 && mouse.down && start.length) {
    start[start.length - 1].end.x = gridX(mouse.cur.x);
    start[start.length - 1].end.y = gridY(mouse.cur.y);
  }
  if (sel == 2 && mouse.down) {
    // Drop trees only when snapped cell changes (throttle)
    const x = gridX(mouse.cur.x);
    const y = gridY(mouse.cur.y);
    const key = snapEnabled ? (x + "," + y) : (Math.floor(x / gridStep) + "," + Math.floor(y / gridStep));
    if (key !== _lastTreeKey) {
      trees.push({ x, y });
      hist.push(sel);
      _lastTreeKey = key;
    }
  }
  if (sel == 3 && mouse.down && arrows.length) {
    arrows[arrows.length - 1].angle = Math.atan2(mouse.start.y - mouse.cur.y, mouse.start.x - mouse.cur.x);
  }
  if (sel == 4 && mouse.down) {
    eraseL(gridX(mouse.cur.x), gridY(mouse.cur.y));
  }
}

function onMouseUp(e) {
  mouse.down = false;
  mouse.end.x = e.clientX;
  mouse.end.y = e.clientY;

  draggingView = false;

  if (spawnDragMode) {
    spawnDragMode = null;
    spawnResizeHandle = null;
    return;
  }

  if (sel == 0 && walls.length) {
    walls[walls.length - 1].end.x = gridX(mouse.end.x);
    walls[walls.length - 1].end.y = gridY(mouse.end.y);
  }
  if (sel == 1 && start.length) {
    start[start.length - 1].end.x = gridX(mouse.end.x);
    start[start.length - 1].end.y = gridY(mouse.end.y);
  }
  if (sel == 2 && trees.length) {
    trees[trees.length - 1] = { x: gridX(mouse.end.x), y: gridY(mouse.end.y) };
  }

  // IMPORTANT: only push hist for legacy tools 0..4 (so Ctrl+Z remains valid)
  if (sel >= 0 && sel <= 4) hist.push(sel);
}

// ===== Wheel zoom around cursor (MUST KEEP) =====
function onWheel(e) {
  e.preventDefault();

  const beforeX = screenToWorldX(e.clientX);
  const beforeY = screenToWorldY(e.clientY);

  zoom *= (e.deltaY > 0 ? 0.9 : 1.1);
  zoom = clamp(zoom, 0.3, 400);

  const afterX = screenToWorldX(e.clientX);
  const afterY = screenToWorldY(e.clientY);

  camX += (beforeX - afterX);
  camY += (beforeY - afterY);

  clampCamera();
}

// ===== Undo / Erase (MUST KEEP; made safe for extra tools) =====
function onKeyDown(e) {
  // space pan
  if (e.code === "Space") {
    spacePan = true;
    // avoid page scroll
    e.preventDefault();
  }

  // Ctrl+Z undo (same logic, but guarded)
  if (e.keyCode == 90 && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (!hist.length) return;

    var a = hist.splice(hist.length - 1, 1)[0];
    if (a < 0 || a > 4) return;

    var ar = [walls, start, trees, arrows, erase][a];
    if (!ar || !ar.length) return;

    var del = ar.splice(ar.length - 1, 1)[0];
    if (ar == erase && del && del.list) {
      del.list.splice(del.pos, 0, del.ob);
    }
    return;
  }

  // Spawn rotate Q/E (works anytime, best in spawn tool)
  if (e.key === "q" || e.key === "Q") {
    spawn.angleRad = normAngleRad(spawn.angleRad - degToRad(5));
  }
  if (e.key === "e" || e.key === "E") {
    spawn.angleRad = normAngleRad(spawn.angleRad + degToRad(5));
  }
}

function onKeyUp(e) {
  if (e.code === "Space") spacePan = false;
}

// Keep eraseL exactly compatible
function eraseL(x, y) {
  for (var i = 0; i < walls.length; i++)
    if (Math.hypot(walls[i].start.x - x, walls[i].start.y - y) < 1 || Math.hypot(walls[i].end.x - x, walls[i].end.y - y) < 1) {
      hist.push(sel);
      erase.push({
        list: walls,
        ob: walls.splice(i, 1)[0],
        pos: i
      });
    }
  for (var i = 0; i < start.length; i++)
    if (Math.hypot(start[i].start.x - x, start[i].start.y - y) < 1 || Math.hypot(start[i].end.x - x, start[i].end.y - y) < 1) {
      hist.push(sel);
      erase.push({
        list: start,
        ob: start.splice(i, 1)[0],
        pos: i
      });
    }
  for (var i = 0; i < trees.length; i++)
    if (Math.hypot(trees[i].x - x, trees[i].y - y) < 1) {
      hist.push(sel);
      erase.push({
        list: trees,
        ob: trees.splice(i, 1)[0],
        pos: i
      });
    }
  for (var i = 0; i < arrows.length; i++)
    if (Math.hypot(arrows[i].x - x, arrows[i].y - y) < 1) {
      hist.push(sel);
      erase.push({
        list: arrows,
        ob: arrows.splice(i, 1)[0],
        pos: i
      });
    }
}

// ===== Misc (kept) =====
function help() {
  var el = document.getElementById("help");
  if (el && el.parentElement) el.parentElement.style.transform = "none";
}

function dedupTrees() {
  var poss = [];
  for (var i = 0; i < trees.length; i++) {
    for (var n = 0; n < poss.length; n++) {
      if (poss[n].x == trees[i].x && poss[n].y == trees[i].y) {
        trees.splice(i--, 1);
        break;
      }
    }
    poss.push(trees[i]);
  }
}

// ===== Legacy Import/Export (MUST KEEP EXACT FORMAT) =====
function imp() {
  var text = prompt("Track data?").trim().split("|");

  if (!text || text.length < 4)
    return;

  var wallsText = text[0].split(" ");
  var startText = text[1].split(" ");
  var treesText = text[2].split(" ");
  var arrowsText = text[3].split(" ");

  walls = [];
  for (var i = 0; i < wallsText.length; i++) {
    var t = wallsText[i].split("/");
    if (t.length < 2)
      continue;

    walls.push({
      start: { x: parseInt(t[0].split(",")[0]), y: -parseInt(t[0].split(",")[1]) },
      end: { x: parseInt(t[1].split(",")[0]), y: -parseInt(t[1].split(",")[1]) }
    });
  }

  start = [];
  for (var i = 0; i < startText.length; i++) {
    var t = startText[i].split("/");
    if (t.length < 2)
      continue;

    start.push({
      start: { x: parseInt(t[0].split(",")[0]), y: -parseInt(t[0].split(",")[1]) },
      end: { x: parseInt(t[1].split(",")[0]), y: -parseInt(t[1].split(",")[1]) }
    });
  }

  trees = [];
  for (var i = 0; i < treesText.length; i++) {
    if (treesText[i].trim().length == 0)
      continue;

    trees.push({
      x: parseInt(treesText[i].split(",")[0]),
      y: -parseInt(treesText[i].split(",")[1])
    });
  }

  arrows = [];
  for (var i = 0; i < arrowsText.length; i++) {
    var t = arrowsText[i].split("/");
    if (t.length < 2)
      continue;

    arrows.push({
      x: parseInt(t[0].split(",")[0]),
      y: -parseInt(t[0].split(",")[2]),
      angle: (90 - parseInt(t[1])) * Math.PI / 180
    });
  }
}

function exp() {
  var text = "";
  for (var i = 0; i < walls.length; i++) {
    text += walls[i].start.x + ",";
    text += -1 * (walls[i].start.y) + "/";
    text += walls[i].end.x + ",";
    text += -1 * (walls[i].end.y) + " ";
  }
  text += "|";
  for (var i = 0; i < start.length; i++) {
    text += start[i].start.x + ",";
    text += -1 * (start[i].start.y) + "/";
    text += start[i].end.x + ",";
    text += -1 * (start[i].end.y) + " ";
  }
  text += "|";
  for (var i = 0; i < trees.length; i++) {
    text += trees[i].x + ",";
    text += -1 * (trees[i].y) + " ";
  }
  text += "|";
  for (var i = 0; i < arrows.length; i++) {
    text += arrows[i].x + ",3,";
    text += -1 * (arrows[i].y) + "/";
    text += Math.floor(90 - arrows[i].angle * 180 / Math.PI) + " ";
  }
  text += "|";
  text += "<br/>";
  var win = window.open();
  win.document.body.innerHTML = text;
}

// ===== NEW: JSON export/import (additional) =====
function exportJSON() {
  const payload = {
    worldSize: WORLD_SIZE,
    gridStep: gridStep,
    snapEnabled: snapEnabled,
    cam: { camX, camY, zoom },
    spawnZone: { x: spawnZone.x, y: spawnZone.y, w: spawnZone.w, h: spawnZone.h },
    spawn: { x: spawn.x, y: spawn.y, angleDeg: normDeg(radToDeg(spawn.angleRad)) },
    walls,
    start,
    trees,
    arrows
  };

  const json = JSON.stringify(payload, null, 2);

  // Download + also open in new window for easy copy
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "track_editor_export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_) {}

  const w = window.open();
  if (w && w.document && w.document.body) {
    w.document.body.style.margin = "0";
    const pre = w.document.createElement("pre");
    pre.textContent = json;
    pre.style.whiteSpace = "pre-wrap";
    pre.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
    pre.style.padding = "16px";
    w.document.body.appendChild(pre);
  }
}

function importJSON() {
  const txt = prompt("Paste JSON:");
  if (!txt) return;
  let obj = null;
  try { obj = JSON.parse(txt); } catch (e) { alert("Invalid JSON"); return; }
  if (!obj || obj.worldSize !== WORLD_SIZE) {
    // still allow, but clamp to our world size
  }

  if (obj.cam) {
    camX = +obj.cam.camX || camX;
    camY = +obj.cam.camY || camY;
    zoom = +obj.cam.zoom || zoom;
  }

  if (typeof obj.gridStep === "number") gridStep = obj.gridStep;
  if (typeof obj.snapEnabled === "boolean") snapEnabled = obj.snapEnabled;

  if (obj.spawnZone) {
    spawnZone.x = +obj.spawnZone.x || spawnZone.x;
    spawnZone.y = +obj.spawnZone.y || spawnZone.y;
    spawnZone.w = +obj.spawnZone.w || spawnZone.w;
    spawnZone.h = +obj.spawnZone.h || spawnZone.h;
  }
  if (obj.spawn) {
    spawn.x = +obj.spawn.x || spawn.x;
    spawn.y = +obj.spawn.y || spawn.y;
    if (typeof obj.spawn.angleDeg === "number") {
      spawn.angleRad = normAngleRad(degToRad(obj.spawn.angleDeg));
    }
  }

  if (Array.isArray(obj.walls)) walls = obj.walls;
  if (Array.isArray(obj.start)) start = obj.start;
  if (Array.isArray(obj.trees)) trees = obj.trees;
  if (Array.isArray(obj.arrows)) arrows = obj.arrows;

  applySpawnClamp();
  clampCamera();
}

// ===== Init =====
function init() {
  ca = document.getElementById("c");
  s = document.getElementById("menu");
  if (!ca || !s) return false;

  c = ca.getContext("2d");
  c.lineCap = "round";
  c.lineWidth = 2;

  ensureUI();
  resizeCanvasIfNeeded();
  clampCamera();

  // Hook events (preserve behavior)
  ca.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  ca.addEventListener("wheel", onWheel, { passive: false });

  // prevent context menu for MMB usage
  ca.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  // Start loop
  update();

  return true;
}

// Try immediate init; otherwise wait for DOM
if (!init()) {
  window.addEventListener("DOMContentLoaded", () => { init(); }, { once: true });
}
