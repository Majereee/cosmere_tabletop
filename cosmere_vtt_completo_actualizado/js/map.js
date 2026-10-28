import { state, isGM } from './state.js';
import { sbClient, showToast } from './supabase.js';

let canvas = null;
let ctx = null;
let bgImage = null;

let isDraggingToken = null;
let dragOffset = { x: 0, y: 0 };
let tokenOrigin = { x: 0, y: 0 };
let tokenWaypoints = [];
let tokenGhostPos = { x: 0, y: 0 };

let isMouseDown = false;
let isPanning = false;
let startPan = { x: 0, y: 0 };

const CELL_SIZE = 50;
const METERS_PER_CELL = 1.5;

export function emitirCambioMapa(tipo, payload) {
  if (state.realtimeChannel) {
    state.realtimeChannel.send({
      type: 'broadcast',
      event: 'map_update',
      payload: { tipo, ...payload }
    });
  }
}

export function aplicarActualizacionMapaRemota(data) {
  if (!data || !data.tipo) return;

  if (data.tipo === 'token_move') {
    if (state.tokens[data.id]) {
      state.tokens[data.id].x = data.x;
      state.tokens[data.id].y = data.y;
    } else {
      state.tokens[data.id] = { id: data.id, name: data.name, x: data.x, y: data.y, radius: 20, color: data.color };
    }
    if (data.revealedFogKeys && Array.isArray(data.revealedFogKeys)) {
      data.revealedFogKeys.forEach(k => { state.fogGrid[k] = true; });
    }
    guardarEstadoMapaLocal();
    dibujarEscenaCompleta();
  }

  if (data.tipo === 'fog_update') {
    state.fogGrid = data.fogGrid || {};
    guardarEstadoMapaLocal();
    dibujarEscenaCompleta();
  }

  if (data.tipo === 'map_bg') {
    state.mapBgUrl = data.url || '';
    const input = document.getElementById('map-bg-url');
    if (input) input.value = state.mapBgUrl;
    guardarEstadoMapaLocal();
    if (state.mapBgUrl) {
      cargarImagenMapa(state.mapBgUrl);
    } else {
      bgImage = null;
      dibujarEscenaCompleta();
    }
  }
}

export async function cargarEstadoMapaDeSala() {
  state.mapBgUrl = localStorage.getItem(`cosmere_map_url_${state.currentRoom}`) || '';
  const input = document.getElementById('map-bg-url');
  if (input) input.value = state.mapBgUrl;

  const savedFog = localStorage.getItem(`cosmere_map_fog_${state.currentRoom}`);
  state.fogGrid = savedFog ? JSON.parse(savedFog) : {};

  const savedTokens = localStorage.getItem(`cosmere_map_tokens_${state.currentRoom}`);
  state.tokens = savedTokens ? JSON.parse(savedTokens) : {};

  if (state.mapBgUrl) {
    cargarImagenMapa(state.mapBgUrl);
  } else {
    bgImage = null;
    dibujarEscenaCompleta();
  }
}

export function guardarEstadoMapaLocal() {
  localStorage.setItem(`cosmere_map_url_${state.currentRoom}`, state.mapBgUrl || '');
  localStorage.setItem(`cosmere_map_fog_${state.currentRoom}`, JSON.stringify(state.fogGrid));
  localStorage.setItem(`cosmere_map_tokens_${state.currentRoom}`, JSON.stringify(state.tokens));
}

export function initMapCanvas() {
  canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  canvas.removeEventListener('mousedown', handleMapMouseDown);
  canvas.removeEventListener('mousemove', handleMapMouseMove);
  canvas.removeEventListener('contextmenu', handleContextMenu);
  canvas.removeEventListener('wheel', handleMapWheel);
  window.removeEventListener('keydown', handleMapKeyDown);

  canvas.addEventListener('mousedown', handleMapMouseDown);
  canvas.addEventListener('mousemove', handleMapMouseMove);
  canvas.addEventListener('contextmenu', handleContextMenu);
  canvas.addEventListener('wheel', handleMapWheel, { passive: false });
  window.addEventListener('mouseup', handleMapMouseUp);
  window.addEventListener('keydown', handleMapKeyDown);

  cargarEstadoMapaDeSala();
}

export function setMapTool(tool) {
  state.mapTool = tool;
  resetRuler();

  ['move', 'ruler', 'reveal', 'hide'].forEach(t => {
    const btn = document.getElementById(`map-tool-${t}`);
    if (!btn) return;
    if (t === tool) {
      btn.className = "px-2.5 py-1 rounded bg-sky-950 text-sky-300 border border-sky-600/50 font-bold cursor-pointer";
    } else {
      btn.className = "px-2.5 py-1 rounded text-slate-400 hover:text-slate-200 cursor-pointer";
    }
  });

  dibujarEscenaCompleta();
}

export function resetRuler() {
  state.rulerPoints = [];
  state.rulerCurrent = null;
  dibujarEscenaCompleta();
}

function handleMapKeyDown(e) {
  if (e.key === 'Escape') {
    if (isDraggingToken) {
      isDraggingToken.x = tokenOrigin.x;
      isDraggingToken.y = tokenOrigin.y;
      isDraggingToken = null;
      tokenWaypoints = [];
      isMouseDown = false;
      dibujarEscenaCompleta();
      showToast("Movimiento cancelado");
      return;
    }

    if (state.mapTool === 'ruler') {
      resetRuler();
      setMapTool('move');
      showToast("Regla desactivada");
    }
  }
}

export function toggleGrid() {
  state.showGrid = !state.showGrid;
  const btn = document.getElementById('btn-grid-toggle');
  if (btn) btn.innerText = state.showGrid ? "Cuadrícula: ON" : "Cuadrícula: OFF";
  dibujarEscenaCompleta();
}

export function zoomIn() {
  state.zoom = Math.min(3.0, state.zoom + 0.15);
  actualizarBadgeZoom();
  dibujarEscenaCompleta();
}

export function zoomOut() {
  state.zoom = Math.max(0.3, state.zoom - 0.15);
  actualizarBadgeZoom();
  dibujarEscenaCompleta();
}

export function resetZoom() {
  state.zoom = 1.0;
  state.panX = 0;
  state.panY = 0;
  actualizarBadgeZoom();
  dibujarEscenaCompleta();
}

function actualizarBadgeZoom() {
  const badge = document.getElementById('zoom-level-badge');
  if (badge) badge.innerText = `${Math.round(state.zoom * 100)}%`;
}

function handleMapWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  const newZoom = Math.min(3.0, Math.max(0.3, state.zoom + delta));

  state.panX -= (mouseX - state.panX) * (newZoom / state.zoom - 1);
  state.panY -= (mouseY - state.panY) * (newZoom / state.zoom - 1);
  state.zoom = newZoom;

  actualizarBadgeZoom();
  dibujarEscenaCompleta();
}

export function clearAllFog() {
  if (!isGM()) {
    showToast("Solo el Director (DJ) puede alterar toda la niebla");
    return;
  }
  state.fogGrid = {};
  for (let x = 0; x < canvas.width; x += CELL_SIZE) {
    for (let y = 0; y < canvas.height; y += CELL_SIZE) {
      state.fogGrid[`${x}_${y}`] = true;
    }
  }
  guardarEstadoMapaLocal();
  dibujarEscenaCompleta();
  emitirCambioMapa('fog_update', { fogGrid: state.fogGrid });
  showToast("Niebla despejada");
}

export function resetAllFog() {
  if (!isGM()) {
    showToast("Solo el Director (DJ) puede alterar toda la niebla");
    return;
  }
  state.fogGrid = {};
  guardarEstadoMapaLocal();
  dibujarEscenaCompleta();
  emitirCambioMapa('fog_update', { fogGrid: state.fogGrid });
  showToast("Mapa cubierto de niebla");
}

export function cargarMapaFondo() {
  const input = document.getElementById('map-bg-url');
  const url = input ? input.value.trim() : '';
  if (!url) return;
  state.mapBgUrl = url;
  guardarEstadoMapaLocal();
  cargarImagenMapa(url);
  emitirCambioMapa('map_bg', { url });
}

export function cargarImagenMapa(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    bgImage = img;
    canvas.width = Math.max(1600, img.width);
    canvas.height = Math.max(1000, img.height);
    dibujarEscenaCompleta();
    showToast("Mapa de la sala cargado");
  };
  img.onerror = () => {
    showToast("Error al cargar imagen del mapa");
  };
  img.src = url;
}

export function dibujarEscenaCompleta() {
  if (!ctx || !canvas) return;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0);
  } else {
    ctx.fillStyle = "#070c18";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 16px 'Cinzel', serif";
    ctx.textAlign = "center";
    ctx.fillText(`Mesa Táctica de Roshar • Sala: ${state.currentRoom}`, canvas.width / 2, canvas.height / 2);
  }

  if (state.showGrid) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  asegurarTokensPersonajes();
  Object.values(state.tokens).forEach(tok => dibujarToken(tok));

  dibujarNiebla();
  dibujarTrayectoriaToken();
  dibujarRegla();

  ctx.restore();
}

function asegurarTokensPersonajes() {
  state.availableCharacters.forEach((c, idx) => {
    if (!state.tokens[c.id]) {
      state.tokens[c.id] = {
        id: c.id,
        name: c.nombre,
        x: 100 + (idx * 60),
        y: 100,
        radius: 20,
        color: idx % 2 === 0 ? "#38bdf8" : "#f59e0b"
      };
    }
  });
}

function dibujarToken(tok) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(tok.x, tok.y, tok.radius, 0, Math.PI * 2);
  ctx.fillStyle = tok.color || "#38bdf8";
  ctx.shadowColor = tok.color || "#38bdf8";
  ctx.shadowBlur = 8;
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#050811";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 0;
  ctx.fillText(tok.name ? tok.name.charAt(0).toUpperCase() : "P", tok.x, tok.y);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "10px Inter, sans-serif";
  ctx.fillText(tok.name, tok.x, tok.y + tok.radius + 12);

  const charObj = state.availableCharacters.find(c => c.id === tok.id);
  const statuses = charObj?.datos?.statuses || [];
  if (statuses.length > 0) {
    const startX = tok.x - ((statuses.length - 1) * 14) / 2;
    statuses.forEach((st, i) => {
      const ix = startX + i * 14;
      const iy = tok.y - tok.radius - 6;

      ctx.beginPath();
      ctx.arc(ix, iy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#f59e0b";
      ctx.stroke();

      ctx.font = "10px sans-serif";
      ctx.fillText(st.icon, ix, iy + 1);
    });
  }

  ctx.restore();
}

function dibujarTrayectoriaToken() {
  if (!isDraggingToken || tokenWaypoints.length === 0) return;

  const points = [...tokenWaypoints, tokenGhostPos];

  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#38bdf8";
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  points.forEach((pt, idx) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = idx === 0 ? "#94a3b8" : (idx === points.length - 1 ? "#38bdf8" : "#f59e0b");
    ctx.fill();
  });

  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dPixels = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    totalMeters += (dPixels / CELL_SIZE) * METERS_PER_CELL;
  }

  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(tokenGhostPos.x, tokenGhostPos.y, isDraggingToken.radius, 0, Math.PI * 2);
  ctx.fillStyle = isDraggingToken.color || "#38bdf8";
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  dibujarBadgeDistancia(tokenGhostPos.x, tokenGhostPos.y - isDraggingToken.radius - 14, `${totalMeters.toFixed(1)} m (${Math.round(totalMeters / METERS_PER_CELL)} casillas)`, true);

  ctx.restore();
}

function dibujarNiebla() {
  ctx.save();
  for (let x = 0; x < canvas.width; x += CELL_SIZE) {
    for (let y = 0; y < canvas.height; y += CELL_SIZE) {
      const key = `${x}_${y}`;
      if (!state.fogGrid[key]) {
        ctx.fillStyle = "rgba(5, 8, 17, 0.94)";
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }
  ctx.restore();
}

function dibujarRegla() {
  const points = [...state.rulerPoints];
  if (state.rulerCurrent) {
    points.push(state.rulerCurrent);
  }

  if (points.length < 2) return;

  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#38bdf8";
  ctx.setLineDash([6, 6]);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  points.forEach((pt, idx) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = idx === 0 ? "#10b981" : (idx === points.length - 1 ? "#f59e0b" : "#38bdf8");
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const segMeters = (pixelDist / CELL_SIZE) * METERS_PER_CELL;
    totalMeters += segMeters;

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    dibujarBadgeDistancia(midX, midY, `${segMeters.toFixed(1)} m`, false);
  }

  const lastPt = points[points.length - 1];
  dibujarBadgeDistancia(lastPt.x, lastPt.y - 18, `Total: ${totalMeters.toFixed(1)} m (${Math.round(totalMeters / METERS_PER_CELL)} casillas)`, true);

  ctx.restore();
}

function dibujarBadgeDistancia(x, y, texto, esTotal) {
  ctx.save();
  ctx.font = esTotal ? "bold 12px Inter, sans-serif" : "10px Inter, sans-serif";
  const padding = esTotal ? 6 : 4;
  const width = ctx.measureText(texto).width + padding * 2;
  const height = esTotal ? 22 : 18;

  ctx.fillStyle = esTotal ? "rgba(15, 23, 42, 0.95)" : "rgba(11, 17, 32, 0.85)";
  ctx.strokeStyle = esTotal ? "#f59e0b" : "#38bdf8";
  ctx.lineWidth = esTotal ? 2 : 1;

  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = esTotal ? "#f59e0b" : "#e2e8f0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x, y);
  ctx.restore();
}

export function aplicarPincelNiebla(mx, my, descubrir, outKeysArray = null) {
  const radius = 2;
  const startX = Math.floor((mx - radius * CELL_SIZE) / CELL_SIZE) * CELL_SIZE;
  const endX = Math.floor((mx + radius * CELL_SIZE) / CELL_SIZE) * CELL_SIZE;
  const startY = Math.floor((my - radius * CELL_SIZE) / CELL_SIZE) * CELL_SIZE;
  const endY = Math.floor((my + radius * CELL_SIZE) / CELL_SIZE) * CELL_SIZE;

  let huboCambio = false;

  for (let x = startX; x <= endX; x += CELL_SIZE) {
    for (let y = startY; y <= endY; y += CELL_SIZE) {
      const dist = Math.hypot(x + CELL_SIZE / 2 - mx, y + CELL_SIZE / 2 - my);
      if (dist <= radius * CELL_SIZE) {
        const key = `${x}_${y}`;
        if (state.fogGrid[key] !== descubrir) {
          state.fogGrid[key] = descubrir;
          huboCambio = true;
          if (outKeysArray) outKeysArray.push(key);
        }
      }
    }
  }

  if (huboCambio) {
    guardarEstadoMapaLocal();
    dibujarEscenaCompleta();
  }
}

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  return {
    x: (screenX - state.panX) / state.zoom,
    y: (screenY - state.panY) / state.zoom,
    screenX,
    screenY
  };
}

function handleMapMouseDown(e) {
  const { x, y, screenX, screenY } = getCanvasCoords(e);

  if (e.button === 1) {
    isPanning = true;
    startPan = { x: screenX - state.panX, y: screenY - state.panY };
    return;
  }

  if (e.button === 2) {
    if (isDraggingToken) {
      tokenWaypoints.push({ x: tokenGhostPos.x, y: tokenGhostPos.y });
      dibujarEscenaCompleta();
      return;
    }

    if (state.mapTool === 'ruler') {
      state.rulerPoints.push({ x, y });
      state.rulerCurrent = { x, y };
      dibujarEscenaCompleta();
      return;
    }
  }

  if (e.button === 0) {
    isMouseDown = true;

    if (state.mapTool === 'ruler') {
      if (state.rulerPoints.length > 0) {
        resetRuler();
        setMapTool('move');
        showToast("Medición finalizada");
        return;
      }
      state.rulerPoints = [{ x, y }];
      state.rulerCurrent = { x, y };
      dibujarEscenaCompleta();
      return;
    }

    if (state.mapTool === 'reveal') {
      aplicarPincelNiebla(x, y, true);
      return;
    }

    if (state.mapTool === 'hide') {
      if (!isGM()) {
        showToast("Solo el Director (DJ) puede ocultar con niebla");
        return;
      }
      aplicarPincelNiebla(x, y, false);
      return;
    }

    for (const id in state.tokens) {
      const tok = state.tokens[id];
      const dist = Math.hypot(tok.x - x, tok.y - y);
      if (dist <= tok.radius) {
        isDraggingToken = tok;
        dragOffset.x = x - tok.x;
        dragOffset.y = y - tok.y;
        tokenOrigin = { x: tok.x, y: tok.y };
        tokenGhostPos = { x: tok.x, y: tok.y };
        tokenWaypoints = [{ x: tok.x, y: tok.y }];
        break;
      }
    }
  }
}

function handleMapMouseMove(e) {
  const { x, y, screenX, screenY } = getCanvasCoords(e);

  let hoverTooltip = "";
  for (const id in state.tokens) {
    const tok = state.tokens[id];
    if (Math.hypot(tok.x - x, tok.y - y) <= tok.radius + 10) {
      const charObj = state.availableCharacters.find(c => c.id === id);
      const sts = charObj?.datos?.statuses || [];
      if (sts.length > 0) {
        hoverTooltip = `${tok.name}: ` + sts.map(s => `${s.icon} ${s.label}`).join(' | ');
      }
      break;
    }
  }
  if (canvas) canvas.title = hoverTooltip;

  if (isPanning) {
    state.panX = screenX - startPan.x;
    state.panY = screenY - startPan.y;
    dibujarEscenaCompleta();
    return;
  }

  if (state.mapTool === 'ruler') {
    if (state.rulerPoints.length > 0) {
      state.rulerCurrent = { x, y };
      dibujarEscenaCompleta();
    }
    return;
  }

  if (!isMouseDown) return;

  if (state.mapTool === 'reveal') {
    aplicarPincelNiebla(x, y, true);
    return;
  }

  if (state.mapTool === 'hide') {
    if (isGM()) aplicarPincelNiebla(x, y, false);
    return;
  }

  if (isDraggingToken) {
    tokenGhostPos.x = Math.max(isDraggingToken.radius, Math.min(canvas.width - isDraggingToken.radius, x - dragOffset.x));
    tokenGhostPos.y = Math.max(isDraggingToken.radius, Math.min(canvas.height - isDraggingToken.radius, y - dragOffset.y));
    dibujarEscenaCompleta();
  }
}

function handleMapMouseUp(e) {
  if (isDraggingToken) {
    isDraggingToken.x = tokenGhostPos.x;
    isDraggingToken.y = tokenGhostPos.y;

    const revealedKeys = [];
    tokenWaypoints.forEach(pt => aplicarPincelNiebla(pt.x, pt.y, true, revealedKeys));
    aplicarPincelNiebla(isDraggingToken.x, isDraggingToken.y, true, revealedKeys);

    guardarEstadoMapaLocal();
    showToast("Movido a destino");

    emitirCambioMapa('token_move', {
      id: isDraggingToken.id,
      name: isDraggingToken.name,
      x: isDraggingToken.x,
      y: isDraggingToken.y,
      color: isDraggingToken.color,
      revealedFogKeys: revealedKeys
    });

    isDraggingToken = null;
    tokenWaypoints = [];
  }

  isMouseDown = false;
  isPanning = false;
  dibujarEscenaCompleta();
}

function handleContextMenu(e) {
  e.preventDefault();
}