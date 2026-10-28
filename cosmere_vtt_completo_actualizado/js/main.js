import { state, isGM, getBlankSheet } from './state.js';
import { sbClient, esc, showToast } from './supabase.js';
import {
  cargarPersonajesDeSala,
  seleccionarPersonaje,
  promptCrearPersonaje,
  eliminarPersonajeActual,
  renderFichaCompleta,
  renderAttributes,
  renderSkills,
  renderExtraSkills,
  renderPartyDashboard,
  autoGuardarPersonaje,
  actualizarVistaFicha,
  toggleCharStatus,
  promptCustomStatus,
  removeCharStatus
} from './sheet.js';
import {
  executePublicRoll,
  rollRecoveryDie,
  recargarTiradasSupabase,
  renderLiveRollsFeed,
  clearRoomHistoryPrompt
} from './dice.js';
import {
  initMapCanvas,
  setMapTool,
  resetRuler,
  toggleGrid,
  zoomIn,
  zoomOut,
  resetZoom,
  clearAllFog,
  resetAllFog,
  cargarMapaFondo,
  cargarEstadoMapaDeSala,
  aplicarActualizacionMapaRemota
} from './map.js';
import {
  cargarGaleriaDeSala,
  renderGallery,
  filtrarGaleria,
  abrirModalSubirImagen,
  cerrarModalSubirImagen,
  guardarImagenEnGaleria,
  eliminarImagenGaleria,
  copiarUrlAlMapa,
  actualizarVisibilidadBotonSubir
} from './gallery.js';

let mapDiceOpen = false;

window.cambiarPestana = function(tabName) {
  ['sheet', 'map', 'gallery'].forEach(t => {
    const tabEl = document.getElementById(`tab-${t}`);
    const btnEl = document.getElementById(`tab-btn-${t}`);
    if (tabEl && btnEl) {
      if (t === tabName) {
        tabEl.classList.remove('hidden');
        btnEl.className = "px-3 py-1 rounded font-bold text-sky-300 bg-slate-800 transition shadow";
      } else {
        tabEl.classList.add('hidden');
        btnEl.className = "px-3 py-1 rounded font-bold text-slate-400 hover:text-slate-200 transition";
      }
    }
  });

  if (tabName === 'map') {
    setTimeout(initMapCanvas, 50);
  } else if (tabName === 'gallery') {
    cargarGaleriaDeSala();
  }
};

window.cambiarSala = async function() {
  const input = document.getElementById('room-input');
  if (!input) return;
  const nuevaSala = input.value.trim().toUpperCase();
  if (!nuevaSala) return;

  if (state.realtimeChannel && sbClient) {
    try { sbClient.removeChannel(state.realtimeChannel); } catch (e) {}
    state.realtimeChannel = null;
  }

  state.onlineUsers = {};
  state.currentCharacterId = 'none';
  state.currentCharacter = null;
  state.currentRoom = nuevaSala;
  localStorage.setItem('cosmere_room_id', state.currentRoom);

  document.getElementById('dash-room-name').innerText = state.currentRoom;
  actualizarVistaFicha();
  actualizarVisibilidadBotonSubir();

  try {
    await cargarPersonajesDeSala();
    await recargarTiradasSupabase();
    await cargarGaleriaDeSala();
    await cargarEstadoMapaDeSala();
    iniciarSupabaseRealtime();
    showToast(`Entraste a la sala ${state.currentRoom}`);
  } catch (err) {
    console.error("Error al cargar sala:", err);
  }
};

window.seleccionarPersonaje = function(id) {
  seleccionarPersonaje(id);
  actualizarVisibilidadBotonSubir();
};

window.promptCrearPersonaje = promptCrearPersonaje;
window.eliminarPersonajeActual = eliminarPersonajeActual;
window.executePublicRoll = executePublicRoll;
window.rollRecoveryDie = rollRecoveryDie;
window.recargarTiradasSupabase = recargarTiradasSupabase;
window.clearRoomHistoryPrompt = clearRoomHistoryPrompt;

window.toggleCharStatus = toggleCharStatus;
window.promptCustomStatus = promptCustomStatus;
window.removeCharStatus = removeCharStatus;

window.setMapTool = setMapTool;
window.resetRuler = resetRuler;
window.toggleGrid = toggleGrid;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.resetZoom = resetZoom;
window.clearAllFog = clearAllFog;
window.resetAllFog = resetAllFog;
window.cargarMapaFondo = cargarMapaFondo;

window.filtrarGaleria = filtrarGaleria;
window.abrirModalSubirImagen = abrirModalSubirImagen;
window.cerrarModalSubirImagen = cerrarModalSubirImagen;
window.guardarImagenEnGaleria = guardarImagenEnGaleria;
window.eliminarImagenGaleria = eliminarImagenGaleria;
window.copiarUrlAlMapa = copiarUrlAlMapa;

window.toggleMapDiceDrawer = function() {
  mapDiceOpen = !mapDiceOpen;
  const drawer = document.getElementById('map-dice-drawer');
  const btnText = document.getElementById('map-dice-btn-text');
  
  if (!drawer) return;

  if (mapDiceOpen) {
    drawer.classList.remove('translate-x-[110%]', 'opacity-0', 'pointer-events-none');
    drawer.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');
    if (btnText) btnText.innerText = "Cerrar Dados";
    actualizarHistorialMapa();
  } else {
    drawer.classList.add('translate-x-[110%]', 'opacity-0', 'pointer-events-none');
    drawer.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
    if (btnText) btnText.innerText = "Dados Rápidos";
  }
};

window.ejecutarTiradaDesdeMapa = async function() {
  const labelInput = document.getElementById('map-roll-label');
  const modInput = document.getElementById('map-roll-mod');
  const modeSelect = document.getElementById('map-roll-mode');

  if (labelInput) document.getElementById('roll-label').value = labelInput.value;
  if (modInput) document.getElementById('roll-mod').value = modInput.value;
  if (modeSelect) state.currentMode = modeSelect.value;

  await executePublicRoll();
  actualizarHistorialMapa();
};

export function actualizarHistorialMapa() {
  const container = document.getElementById('map-live-rolls-container');
  const badge = document.getElementById('map-rolls-count');
  if (!container) return;

  const rolls = state.roomRolls || [];
  if (badge) badge.innerText = `${rolls.length}`;

  if (rolls.length === 0) {
    container.innerHTML = `<div class="text-slate-500 text-center py-6 italic text-[11px]">Sin tiradas recientes.</div>`;
    return;
  }

  container.innerHTML = "";
  rolls.slice(-15).reverse().forEach(roll => {
    const isMine = roll.userId === state.myUserId;
    const item = document.createElement('div');
    item.className = `p-1.5 rounded border ${isMine ? 'bg-slate-900 border-sky-500/50' : 'bg-slate-950/90 border-slate-800'} text-[10px] space-y-0.5`;

    if (roll.isRecovery) {
      item.innerHTML = `
        <div class="flex justify-between font-cinzel font-bold ${isMine ? 'text-sky-300' : 'text-slate-300'}">
          <span>${esc(roll.userName)}</span>
          <span class="text-emerald-400 font-mono">+${esc(roll.recovered)} PS</span>
        </div>
        <div class="text-slate-400">Recuperación (${esc(roll.die)})</div>
      `;
      container.appendChild(item);
      return;
    }

    let plotTxt = "";
    if (roll.hasPlot && roll.plotDie) {
      if (roll.plotResult === "opportunity") plotTxt = `<span class="text-emerald-400 font-bold ml-1">★ Oportunidad (${roll.plotDie})</span>`;
      else if (roll.plotResult === "complication") plotTxt = `<span class="text-rose-400 font-bold ml-1">⚠ Complicación (${roll.plotDie})</span>`;
    }

    item.innerHTML = `
      <div class="flex justify-between font-cinzel font-bold ${isMine ? 'text-sky-300' : 'text-slate-300'}">
        <span class="truncate max-w-[170px]">${esc(roll.userName)}: ${esc(roll.label)}</span>
        <span class="text-sky-400 font-mono text-xs font-black">${esc(roll.total)}</span>
      </div>
      <div class="text-[9px] text-slate-400 flex items-center justify-between">
        <span>d20: ${esc(roll.chosen)} (mod ${esc(roll.mod)})</span>
        ${plotTxt}
      </div>
    `;
    container.appendChild(item);
  });
}

window.actualizarHistorialMapa = actualizarHistorialMapa;

window.updateAttr = function(k, d) {
  if (!state.currentCharacter) return;
  state.currentCharacter.attributes[k] = Math.max(0, Math.min(10, (state.currentCharacter.attributes[k] || 0) + d));
  renderAttributes();
  renderSkills();
  autoGuardarPersonaje();
};

window.updateSkillAttr = function(k, a) {
  if (state.currentCharacter?.skills[k]) {
    state.currentCharacter.skills[k].attr = a;
    renderSkills();
    autoGuardarPersonaje();
  }
};

window.setSkillRank = function(k, r) {
  const s = state.currentCharacter?.skills[k];
  if (!s) return;
  s.rank = (s.rank === r) ? r - 1 : r;
  renderSkills();
  autoGuardarPersonaje();
};

window.updateCustomSkillName = function(k, n) {
  if (state.currentCharacter?.skills[k]) {
    state.currentCharacter.skills[k].name = n;
    autoGuardarPersonaje();
  }
};

window.addCustomSkill = function() {
  if (!state.currentCharacter) return;
  if (!state.currentCharacter.extraSkills) state.currentCharacter.extraSkills = [];
  state.currentCharacter.extraSkills.push({ id: "extra_" + Date.now(), name: "", attr: "", rank: 0 });
  renderExtraSkills();
  autoGuardarPersonaje();
};

window.updateExtraSkillName = function(i, n) {
  if (state.currentCharacter?.extraSkills[i]) {
    state.currentCharacter.extraSkills[i].name = n;
    autoGuardarPersonaje();
  }
};

window.updateExtraSkillAttr = function(i, a) {
  if (state.currentCharacter?.extraSkills[i]) {
    state.currentCharacter.extraSkills[i].attr = a;
    renderExtraSkills();
    autoGuardarPersonaje();
  }
};

window.setExtraSkillRank = function(i, r) {
  const ex = state.currentCharacter?.extraSkills[i];
  if (!ex) return;
  ex.rank = (ex.rank === r) ? r - 1 : r;
  renderExtraSkills();
  autoGuardarPersonaje();
};

window.removeExtraSkill = function(i) {
  if (state.currentCharacter?.extraSkills) {
    state.currentCharacter.extraSkills.splice(i, 1);
    renderExtraSkills();
    autoGuardarPersonaje();
  }
};

window.modifyPool = function(id, d) {
  if (!state.currentCharacter) return;
  const input = document.getElementById(id);
  let val = parseInt(input.value) || 0;
  val = Math.max(0, val + d);
  input.value = val;

  if (id === 'hp-current') state.currentCharacter.vitals.hpCurrent = val;
  if (id === 'focus-current') state.currentCharacter.vitals.focusCurrent = val;
  if (id === 'investiture-current') state.currentCharacter.vitals.investitureCurrent = val;
  autoGuardarPersonaje();
};

window.rollSkill = function(k) {
  const s = state.currentCharacter?.skills[k];
  if (!s) return;
  const attrMod = state.currentCharacter?.attributes[s.attr] || 0;
  const totalBonus = attrMod + (s.rank || 0);
  document.getElementById('roll-label').value = `${s.name} (${s.attr ? s.attr.toUpperCase() : 'LIBRE'})`;
  document.getElementById('roll-mod').value = totalBonus;
  executePublicRoll();
};

window.rollExtraSkill = function(i) {
  const ex = state.currentCharacter?.extraSkills[i];
  if (!ex) return;
  const attrMod = state.currentCharacter?.attributes[ex.attr] || 0;
  const totalBonus = attrMod + (ex.rank || 0);
  document.getElementById('roll-label').value = `${ex.name || 'Poder'} (${ex.attr ? ex.attr.toUpperCase() : 'LIBRE'})`;
  document.getElementById('roll-mod').value = totalBonus;
  executePublicRoll();
};

window.rollDirectAttr = function(name, k) {
  const val = state.currentCharacter?.attributes[k] || 0;
  document.getElementById('roll-label').value = `Prueba de ${name}`;
  document.getElementById('roll-mod').value = val;
  executePublicRoll();
};

window.adjustMod = function(d) {
  const input = document.getElementById('roll-mod');
  input.value = (parseInt(input.value) || 0) + d;
};

window.setRollFilter = function(filter) {
  state.rollFilter = filter;
  const on = "px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-600/40 font-semibold cursor-pointer";
  const off = "px-2 py-0.5 rounded bg-slate-900 text-slate-400 hover:text-slate-200 cursor-pointer";
  document.getElementById('filter-all').className = filter === 'all' ? on : off;
  document.getElementById('filter-mine').className = filter === 'mine' ? on : off;
  renderLiveRollsFeed();
};

export function iniciarSupabaseRealtime() {
  if (!sbClient) return;
  if (state.realtimeChannel) {
    try { sbClient.removeChannel(state.realtimeChannel); } catch (e) {}
    state.realtimeChannel = null;
  }

  state.realtimeChannel = sbClient.channel(`room_${state.currentRoom}`, {
    config: { 
      presence: { key: state.myUserId },
      broadcast: { self: false }
    }
  })
    .on('broadcast', { event: 'map_update' }, ({ payload }) => {
      aplicarActualizacionMapaRemota(payload);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tiradas', filter: `sala=eq.${state.currentRoom}` }, payload => {
      if (!state.roomRolls.some(r => r.id === payload.new.datos.id)) {
        state.roomRolls.push(payload.new.datos);
        if (state.roomRolls.length > 50) state.roomRolls = state.roomRolls.slice(-50);
        renderLiveRollsFeed();
      }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tiradas', filter: `sala=eq.${state.currentRoom}` }, () => {
      state.roomRolls = [];
      renderLiveRollsFeed();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'personajes', filter: `sala=eq.${state.currentRoom}` }, cargarPersonajesDeSala)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'galeria', filter: `sala=eq.${state.currentRoom}` }, cargarGaleriaDeSala)
    .on('presence', { event: 'sync' }, () => {
      try {
        const pstate = state.realtimeChannel.presenceState();
        state.onlineUsers = {};
        Object.values(pstate).forEach(presences => {
          presences.forEach(p => {
            if (p.characterId) state.onlineUsers[p.characterId] = p;
          });
        });
        renderPartyDashboard();
      } catch (e) {}
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        actualizarPresence();
      }
    });
}

export function actualizarPresence() {
  if (state.realtimeChannel) {
    try {
      state.realtimeChannel.track({
        userId: state.myUserId,
        characterId: state.currentCharacterId
      });
    } catch (e) {}
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('room-input').value = state.currentRoom;
  document.getElementById('dash-room-name').innerText = state.currentRoom;

  await cargarPersonajesDeSala();
  await recargarTiradasSupabase();
  await cargarGaleriaDeSala();
  iniciarSupabaseRealtime();

  document.getElementById('room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.cambiarSala();
    }
  });

  const modeBtns = document.querySelectorAll('.mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => { b.classList.remove('bg-slate-800', 'text-sky-300', 'shadow'); b.classList.add('text-slate-400'); });
      btn.classList.add('bg-slate-800', 'text-sky-300', 'shadow');
      btn.classList.remove('text-slate-400');
      state.currentMode = btn.dataset.mode;
    });
  });

  document.getElementById('tile-plot').addEventListener('click', () => {
    state.plotEnabled = !state.plotEnabled;
    document.getElementById('badge-plot').innerText = state.plotEnabled ? "ON" : "OFF";
    document.getElementById('tile-plot').className = state.plotEnabled ? "cursor-pointer p-2 rounded border border-sky-500/70 bg-sky-950/40" : "cursor-pointer p-2 rounded border border-slate-700 bg-slate-950 opacity-60";
  });

  document.getElementById('tile-dc').addEventListener('click', () => {
    state.dcEnabled = !state.dcEnabled;
    document.getElementById('badge-dc').innerText = state.dcEnabled ? "ON" : "OFF";
    document.getElementById('tile-dc').className = state.dcEnabled ? "cursor-pointer p-2 rounded border border-amber-500/70 bg-amber-950/40" : "cursor-pointer p-2 rounded border border-slate-700 bg-slate-950 opacity-60";
    document.getElementById('dc-container').classList.toggle('opacity-40', !state.dcEnabled);
    document.getElementById('roll-dc').disabled = !state.dcEnabled;
  });

  ['char-name', 'char-heritage', 'char-level', 'char-path', 'char-bond'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      if (state.currentCharacter) {
        state.currentCharacter.profile[id.replace('char-', '')] = e.target.value;
        autoGuardarPersonaje();
      }
    });
  });

  ['def-fisica', 'def-cognitiva', 'def-espiritual'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      if (state.currentCharacter) {
        state.currentCharacter.defenses[id.replace('def-', '')] = parseInt(e.target.value) || 0;
        autoGuardarPersonaje();
      }
    });
  });

  const vitalMap = [
    { id: 'hp-max', key: 'hpMax' }, { id: 'hp-current', key: 'hpCurrent' },
    { id: 'vital-desvio', key: 'desvio' }, { id: 'focus-max', key: 'focusMax' },
    { id: 'focus-current', key: 'focusCurrent' }, { id: 'investiture-max', key: 'investitureMax' },
    { id: 'investiture-current', key: 'investitureCurrent' }
  ];
  vitalMap.forEach(item => {
    document.getElementById(item.id).addEventListener('input', e => {
      if (state.currentCharacter) {
        state.currentCharacter.vitals[item.key] = parseInt(e.target.value) || 0;
        autoGuardarPersonaje();
      }
    });
  });

  document.getElementById('btn-export-sheet').addEventListener('click', () => {
    if (!state.currentCharacter?.attributes) return showToast("Selecciona un personaje primero");
    const blob = new Blob([JSON.stringify(state.currentCharacter, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.currentCharacter.profile.name || 'ficha').replace(/\\W+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import-sheet').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const base = getBlankSheet();
      const ficha = {
        ...base, ...raw,
        profile: { ...base.profile, ...raw.profile },
        attributes: { ...base.attributes, ...raw.attributes },
        defenses: { ...base.defenses, ...raw.defenses },
        vitals: { ...base.vitals, ...raw.vitals },
        skills: { ...base.skills, ...raw.skills },
        derived: { ...base.derived, ...raw.derived },
        extraSkills: Array.isArray(raw.extraSkills) ? raw.extraSkills : [],
        statuses: Array.isArray(raw.statuses) ? raw.statuses : []
      };
      const id = "char_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const { error } = await sbClient.from('personajes').insert([{
        id, sala: state.currentRoom, nombre: ficha.profile.name || "Importado", datos: ficha
      }]);
      if (error) throw error;
      await cargarPersonajesDeSala();
      seleccionarPersonaje(id);
      showToast("Ficha importada");
    } catch (err) {
      alert("No se pudo importar la ficha: " + err.message);
    }
  });
});