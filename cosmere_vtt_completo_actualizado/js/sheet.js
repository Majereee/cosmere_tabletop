import { state, isGM, getBlankSheet } from './state.js';
import { sbClient, esc, showToast } from './supabase.js';
import { executePublicRoll, rollRecoveryDie } from './dice.js';
import { actualizarPresence } from './main.js';
import { dibujarEscenaCompleta } from './map.js';

export function getLiftingAndCarrying(str) {
  const val = Math.max(0, str);
  if (val === 0) return { lifting: "45 kg", carrying: "22,5 kg" };
  if (val <= 2) return { lifting: "90 kg", carrying: "45 kg" };
  if (val <= 4) return { lifting: "225 kg", carrying: "112,5 kg" };
  if (val <= 6) return { lifting: "450 kg", carrying: "225 kg" };
  if (val <= 8) return { lifting: "2250 kg", carrying: "1125 kg" };
  return { lifting: "4500 kg", carrying: "2250 kg" };
}

export function getMovementValue(spd) {
  const val = Math.max(0, spd);
  if (val === 0) return "6 m por acción";
  if (val <= 2) return "7,5 m por acción";
  if (val <= 4) return "9 m por acción";
  if (val <= 6) return "12 m por acción";
  if (val <= 8) return "18 m por acción";
  return "24 m por acción";
}

export function getRecoveryDieData(wil) {
  const val = Math.max(0, wil);
  if (val === 0) return { dieStr: "1d4", sides: 4 };
  if (val <= 2) return { dieStr: "1d6", sides: 6 };
  if (val <= 4) return { dieStr: "1d8", sides: 8 };
  if (val <= 6) return { dieStr: "1d10", sides: 10 };
  if (val <= 8) return { dieStr: "1d12", sides: 12 };
  return { dieStr: "1d20", sides: 20 };
}

export async function cargarPersonajesDeSala() {
  try {
    const { data, error } = await sbClient
      .from('personajes')
      .select('*')
      .eq('sala', state.currentRoom)
      .order('nombre', { ascending: true });

    state.availableCharacters = (!error && data) ? data : [];
    renderCharacterSwitcher();
    renderPartyDashboard();
    dibujarEscenaCompleta();
  } catch (err) {
    console.warn("Error cargando personajes:", err);
  }
}

export function renderCharacterSwitcher() {
  const select = document.getElementById('char-switcher');
  if (!select) return;
  select.innerHTML = `
    <option value="none" ${state.currentCharacterId === 'none' ? 'selected' : ''}>Ninguno (Espectador)</option>
    <option value="gm" ${state.currentCharacterId === 'gm' ? 'selected' : ''}>👑 Director (DJ)</option>
  `;

  state.availableCharacters.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.nombre} (${c.datos?.profile?.path || 'Sin vía'})`;
    if (state.currentCharacterId === c.id) opt.selected = true;
    select.appendChild(opt);
  });
}

export function seleccionarPersonaje(id) {
  state.currentCharacterId = id;
  if (id === 'none') {
    state.currentCharacter = null;
  } else if (id === 'gm') {
    state.currentCharacter = { profile: { name: "Director de Juego", path: "Narrador" } };
  } else {
    const found = state.availableCharacters.find(c => c.id === id);
    state.currentCharacter = found ? found.datos : null;
  }

  actualizarVistaFicha();
  if (state.currentCharacter && id !== 'gm') {
    renderFichaCompleta();
  }
  actualizarPresence();
}

export function actualizarVistaFicha() {
  const noCharPrompt = document.getElementById('no-char-prompt');
  const sheetContainer = document.getElementById('character-sheet-container');
  if (!noCharPrompt || !sheetContainer) return;

  if (!state.currentCharacterId || state.currentCharacterId === 'none') {
    noCharPrompt.classList.remove('hidden');
    noCharPrompt.innerHTML = `
      <div class="w-12 h-12 rounded-full bg-slate-800 text-amber-400 font-cinzel text-xl flex items-center justify-center mx-auto">❖</div>
      <div>
        <h2 class="font-cinzel text-base font-bold text-slate-200">Estás en la sala como Espectador</h2>
        <p class="text-xs text-slate-400 max-w-md mx-auto mt-1">Elige un personaje del desplegable superior o crea uno nuevo para participar en la partida.</p>
      </div>
      <div class="flex justify-center gap-3 pt-2">
        <button onclick="promptCrearPersonaje()" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow active:scale-95 cursor-pointer">+ Crear Nuevo Personaje</button>
      </div>
    `;
    sheetContainer.classList.add('hidden');
  } else if (state.currentCharacterId === 'gm') {
    noCharPrompt.classList.remove('hidden');
    noCharPrompt.innerHTML = `
      <div class="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 font-cinzel text-xl flex items-center justify-center mx-auto">👑</div>
      <h2 class="font-cinzel text-base font-bold text-amber-300">Modo Director de Juego</h2>
      <p class="text-xs text-slate-400 max-w-md mx-auto">Supervisa tiradas, administra la niebla del mapa y sube imágenes a la galería.</p>
    `;
    sheetContainer.classList.add('hidden');
  } else {
    noCharPrompt.classList.add('hidden');
    sheetContainer.classList.remove('hidden');
  }
}

export async function promptCrearPersonaje() {
  const nombre = prompt("Nombre del nuevo personaje:", "Kaladin");
  if (!nombre || !nombre.trim()) return;

  const nuevoId = "char_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const nuevaFicha = getBlankSheet(nombre.trim());

  const { error } = await sbClient.from('personajes').insert([{
    id: nuevoId,
    sala: state.currentRoom,
    nombre: nombre.trim(),
    datos: nuevaFicha
  }]);

  if (!error) {
    await cargarPersonajesDeSala();
    seleccionarPersonaje(nuevoId);
    showToast("Personaje creado en Supabase");
  } else {
    alert("Error al guardar personaje en Supabase: " + error.message);
  }
}

export async function eliminarPersonajeActual() {
  if (!state.currentCharacterId || state.currentCharacterId === 'none' || state.currentCharacterId === 'gm') return;
  if (!confirm(`¿Seguro que deseas eliminar definitivamente a ${state.currentCharacter?.profile?.name || 'este personaje'}?`)) return;

  await sbClient.from('personajes').delete().eq('id', state.currentCharacterId);
  await cargarPersonajesDeSala();
  seleccionarPersonaje('none');
  showToast("Personaje eliminado");
}

let saveTimeout = null;
export function autoGuardarPersonaje() {
  if (!state.currentCharacterId || state.currentCharacterId === 'none' || state.currentCharacterId === 'gm') return;

  const statusEl = document.getElementById('save-status');
  if (statusEl) {
    statusEl.textContent = "Guardando cambios...";
    statusEl.className = "text-[10px] text-amber-400 font-medium";
  }

  const ficha = state.currentCharacter, id = state.currentCharacterId;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const { error } = await sbClient.from('personajes').update({
        nombre: ficha.profile.name || "Sin nombre",
        datos: ficha,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;

      if (statusEl) {
        statusEl.textContent = "✓ Sincronizado en Supabase";
        statusEl.className = "text-[10px] text-emerald-400 font-medium";
      }
    } catch (err) {
      console.error("Error al guardar:", err);
      if (statusEl) {
        statusEl.textContent = "Error al sincronizar";
        statusEl.className = "text-[10px] text-rose-400 font-medium";
      }
    }
  }, 800);
}

export function renderFichaCompleta() {
  if (!state.currentCharacter) return;

  document.getElementById('char-name').value = state.currentCharacter.profile.name || "";
  document.getElementById('char-heritage').value = state.currentCharacter.profile.heritage || "";
  document.getElementById('char-level').value = state.currentCharacter.profile.level || 1;
  document.getElementById('char-path').value = state.currentCharacter.profile.path || "";
  document.getElementById('char-bond').value = state.currentCharacter.profile.bond || "";

  document.getElementById('def-fisica').value = state.currentCharacter.defenses.fisica;
  document.getElementById('def-cognitiva').value = state.currentCharacter.defenses.cognitiva;
  document.getElementById('def-espiritual').value = state.currentCharacter.defenses.espiritual;

  document.getElementById('hp-max').value = state.currentCharacter.vitals.hpMax;
  document.getElementById('hp-current').value = state.currentCharacter.vitals.hpCurrent;
  document.getElementById('vital-desvio').value = state.currentCharacter.vitals.desvio;

  document.getElementById('focus-max').value = state.currentCharacter.vitals.focusMax;
  document.getElementById('focus-current').value = state.currentCharacter.vitals.focusCurrent;

  document.getElementById('investiture-max').value = state.currentCharacter.vitals.investitureMax;
  document.getElementById('investiture-current').value = state.currentCharacter.vitals.investitureCurrent;

  document.getElementById('stat-senses').value = state.currentCharacter.derived?.senses || "Normal (15 m)";

  renderAttributes();
  renderSkills();
  renderSheetStatuses();
}

export function renderAttributes() {
  if (!state.currentCharacter) return;
  const keys = ['fue', 'vel', 'int', 'vol', 'dis', 'pre'];
  keys.forEach(k => {
    const val = state.currentCharacter.attributes[k] || 0;
    const disp = document.getElementById(`attr-${k}-display`);
    if (disp) disp.innerText = (val >= 0 ? "+" : "") + val;
  });
  renderDerivedStats();
}

export function renderDerivedStats() {
  if (!state.currentCharacter) return;
  const strVal = state.currentCharacter.attributes.fue || 0;
  const lc = getLiftingAndCarrying(strVal);
  document.getElementById('stat-lifting').innerText = lc.lifting;
  document.getElementById('stat-carrying').innerText = `Carga: ${lc.carrying}`;

  const spdVal = state.currentCharacter.attributes.vel || 0;
  const mv = getMovementValue(spdVal);
  document.getElementById('stat-movement').innerText = mv.replace(' por acción', '');

  const wilVal = state.currentCharacter.attributes.vol || 0;
  const rd = getRecoveryDieData(wilVal);
  document.getElementById('stat-recovery-die').innerText = rd.dieStr;
}

export function calculateSkillTotal(skill) {
  if (!skill || !skill.attr || skill.attr === "" || skill.attr === "-") {
    return skill?.rank || 0;
  }
  const attrMod = state.currentCharacter?.attributes[skill.attr] || 0;
  return attrMod + (skill.rank || 0);
}

function getAttrSelectHtml(currentVal, onChangeFn) {
  const options = [
    { val: "", label: "-" }, { val: "fue", label: "FUE" },
    { val: "vel", label: "VEL" }, { val: "int", label: "INT" },
    { val: "vol", label: "VOL" }, { val: "dis", label: "DIS" },
    { val: "pre", label: "PRE" }
  ];
  return `
    <select onchange="${onChangeFn}" class="bg-slate-900 border border-slate-700 rounded text-[9px] text-sky-300 font-bold px-1 py-0.5 focus:outline-none">
      ${options.map(o => `<option value="${o.val}" ${o.val === currentVal ? "selected" : ""}>${o.label}</option>`).join('')}
    </select>
  `;
}

export function renderColumn(elementId, skillKeys) {
  const col = document.getElementById(elementId);
  if (!col) return;
  col.innerHTML = "";

  skillKeys.forEach(key => {
    const s = state.currentCharacter?.skills[key];
    if (!s) return;

    const totalBonus = calculateSkillTotal(s);
    const bonusStr = (totalBonus >= 0 ? "+" : "") + totalBonus;

    const row = document.createElement('div');
    row.className = "flex items-center justify-between bg-slate-900/70 hover:bg-slate-800/80 p-1.5 rounded border border-slate-800 gap-1.5 text-xs";

    const bonusBtn = `
      <button type="button" onclick="rollSkill('${key}')" class="w-7 h-7 rounded bg-slate-950 border border-slate-700 hover:border-sky-400 font-mono font-bold text-sky-400 text-xs flex items-center justify-center transition shrink-0 cursor-pointer">
        ${bonusStr}
      </button>
    `;

    let labelContent = "";
    if (s.custom) {
      const selectHtml = getAttrSelectHtml(s.attr, `updateSkillAttr('${key}', this.value)`);
      labelContent = `
        <div class="flex items-center gap-1 flex-grow min-w-0">
          <input type="text" placeholder="Extra..." value="${esc(s.name)}" onchange="updateCustomSkillName('${key}', this.value)" class="bg-transparent border-b border-slate-700 text-[11px] text-slate-200 w-full focus:outline-none focus:border-sky-400 py-0.5">
          ${selectHtml}
        </div>
      `;
    } else {
      labelContent = `
        <div class="flex-grow min-w-0 flex items-center justify-between pr-1">
          <span class="font-semibold text-[11px] text-slate-200 tracking-tight truncate cursor-pointer hover:text-sky-300" onclick="rollSkill('${key}')">${esc(s.name)}</span>
          <span class="text-[9px] font-mono text-slate-400 uppercase font-bold">(${s.attr.toUpperCase()})</span>
        </div>
      `;
    }

    let pips = `<div class="flex items-center gap-1 shrink-0 ml-1">`;
    for (let i = 1; i <= 5; i++) {
      const isFilled = i <= (s.rank || 0);
      pips += `<div onclick="setSkillRank('${key}', ${i})" class="rank-pip ${isFilled ? 'filled' : ''}" title="Rango ${i}"></div>`;
    }
    pips += `</div>`;

    row.innerHTML = bonusBtn + labelContent + pips;
    col.appendChild(row);
  });
}

export function renderSkills() {
  if (!state.currentCharacter) return;
  const col1Keys = ['agilidad', 'armamento_ligero', 'armamento_pesado', 'atletismo', 'hurto', 'sigilo', 'custom_col1'];
  const col2Keys = ['deduccion', 'disciplina', 'intimidacion', 'manufactura', 'medicina', 'saber', 'custom_col2'];
  const col3Keys = ['engano', 'liderazgo', 'percepcion', 'perspicacia', 'persuasion', 'supervivencia', 'custom_col3'];

  renderColumn('col-skills-1', col1Keys);
  renderColumn('col-skills-2', col2Keys);
  renderColumn('col-skills-3', col3Keys);

  renderExtraSkills();
}

export function renderExtraSkills() {
  const container = document.getElementById('custom-skills-list');
  const wrapper = document.getElementById('custom-skills-wrapper');
  if (!container || !wrapper) return;
  
  if (!state.currentCharacter?.extraSkills || state.currentCharacter.extraSkills.length === 0) {
    wrapper.classList.add('hidden');
    container.innerHTML = "";
    return;
  }

  wrapper.classList.remove('hidden');
  container.innerHTML = "";

  state.currentCharacter.extraSkills.forEach((ex, idx) => {
    const totalBonus = calculateSkillTotal(ex);
    const bonusStr = (totalBonus >= 0 ? "+" : "") + totalBonus;

    const row = document.createElement('div');
    row.className = "flex items-center justify-between bg-slate-900/80 p-1.5 rounded border border-slate-800 gap-1.5 text-xs";

    const selectHtml = getAttrSelectHtml(ex.attr, `updateExtraSkillAttr(${idx}, this.value)`);

    let pips = `<div class="flex items-center gap-1 shrink-0">`;
    for (let i = 1; i <= 5; i++) {
      const isFilled = i <= (ex.rank || 0);
      pips += `<div onclick="setExtraSkillRank(${idx}, ${i})" class="rank-pip ${isFilled ? 'filled' : ''}" title="Rango ${i}"></div>`;
    }
    pips += `</div>`;

    row.innerHTML = `
      <button type="button" onclick="rollExtraSkill(${idx})" class="w-7 h-7 rounded bg-slate-950 border border-slate-700 hover:border-sky-400 font-mono font-bold text-sky-400 text-xs flex items-center justify-center transition shrink-0 cursor-pointer">
        ${bonusStr}
      </button>
      <div class="flex items-center gap-1.5 flex-grow min-w-0">
        <input type="text" placeholder="Poder..." value="${esc(ex.name)}" onchange="updateExtraSkillName(${idx}, this.value)" class="bg-transparent border-b border-slate-700 text-xs text-slate-100 font-medium w-full focus:outline-none focus:border-sky-400 py-0.5">
        ${selectHtml}
      </div>
      ${pips}
      <button type="button" onclick="removeExtraSkill(${idx})" class="text-rose-400 hover:text-rose-300 p-1 text-xs shrink-0 cursor-pointer">✕</button>
    `;
    container.appendChild(row);
  });
}

export function renderPartyDashboard() {
  const container = document.getElementById('party-list');
  const badge = document.getElementById('party-count-badge');
  if (!container || !badge) return;

  badge.innerText = `${state.availableCharacters.length} personaje(s)`;

  if (state.availableCharacters.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center text-slate-500 italic text-xs py-2">No hay fichas creadas en esta sala aún.</div>`;
    return;
  }

  container.innerHTML = "";
  state.availableCharacters.forEach(c => {
    const p = c.datos;
    const isSelected = state.currentCharacterId === c.id;
    const isOnline = !!state.onlineUsers[c.id];

    const hpCur = p?.vitals?.hpCurrent ?? 0;
    const hpMax = p?.vitals?.hpMax || 20;
    const hpPct = Math.min(100, Math.round((hpCur / hpMax) * 100));

    const focCur = p?.vitals?.focusCurrent ?? 0;
    const focMax = p?.vitals?.focusMax || 4;
    const focPct = Math.min(100, Math.round((focCur / focMax) * 100));

    const invCur = p?.vitals?.investitureCurrent ?? 0;
    const invMax = p?.vitals?.investitureMax || 6;
    const invPct = Math.min(100, Math.round((invCur / invMax) * 100));

    const statuses = Array.isArray(p?.statuses) ? p.statuses : [];
    const statusIconsHtml = statuses.length > 0 ? `
      <div class="flex items-center gap-1 bg-slate-900/95 border border-slate-700/80 rounded-full px-1.5 py-0.5 shadow-md">
        ${statuses.map(st => `
          <span title="${esc(st.label)}" class="text-xs leading-none cursor-help hover:scale-125 transition-transform select-none">
            ${esc(st.icon)}
          </span>
        `).join('')}
      </div>
    ` : '';

    const card = document.createElement('div');
    card.className = `p-2.5 rounded-lg border cursor-pointer transition ${isSelected ? 'border-sky-500/80 bg-sky-950/30' : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'} text-xs flex flex-col justify-between gap-2`;
    card.onclick = () => {
      document.getElementById('char-switcher').value = c.id;
      seleccionarPersonaje(c.id);
    };

    card.innerHTML = `
      <div class="flex items-center justify-between gap-1">
        <div class="flex items-center gap-1.5 truncate">
          <span class="w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-600'}" title="${isOnline ? 'En línea' : 'Desconectado'}"></span>
          <div class="truncate">
            <span class="font-cinzel font-bold text-slate-200 block truncate text-[11px]">${esc(c.nombre)} ${isSelected ? '<span class="text-sky-400 font-sans text-[9px] font-bold">(Tú)</span>' : ''}</span>
            <span class="text-[9px] text-slate-400 truncate block">${esc(p?.profile?.path || 'Sin vía')} • Nvl ${esc(p?.profile?.level || 1)}</span>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${statusIconsHtml}
          <span class="text-[8px] uppercase px-1 py-0.5 rounded font-mono font-bold ${isOnline ? 'bg-emerald-950/80 border border-emerald-600/50 text-emerald-300' : 'bg-slate-800 text-slate-400'}">
            ${isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div class="space-y-1.5 pt-0.5">
        <div>
          <div class="flex justify-between text-[8px] text-slate-400 font-semibold mb-0.5">
            <span class="text-rose-400">Salud</span>
            <span class="font-mono text-slate-300">${esc(hpCur)} / ${esc(hpMax)}</span>
          </div>
          <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div class="bg-rose-500 h-1.5 rounded-full transition-all duration-300" style="width: ${hpPct}%"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="flex justify-between text-[8px] text-amber-400 font-semibold mb-0.5">
              <span>Conc.</span>
              <span class="font-mono text-slate-300">${esc(focCur)}/${esc(focMax)}</span>
            </div>
            <div class="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
              <div class="bg-amber-500 h-1 rounded-full transition-all duration-300" style="width: ${focPct}%"></div>
            </div>
          </div>

          <div>
            <div class="flex justify-between text-[8px] text-sky-400 font-semibold mb-0.5">
              <span>Invest.</span>
              <span class="font-mono text-slate-300">${esc(invCur)}/${esc(invMax)}</span>
            </div>
            <div class="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
              <div class="bg-sky-400 h-1 rounded-full transition-all duration-300" style="width: ${invPct}%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

export function renderSheetStatuses() {
  const container = document.getElementById('active-statuses-sheet');
  if (!container || !state.currentCharacter) return;
  const list = state.currentCharacter.statuses || [];

  if (list.length === 0) {
    container.innerHTML = `<span class="text-[9px] text-slate-500 italic">Sin estados activos</span>`;
    return;
  }

  container.innerHTML = list.map((st, idx) => `
    <span onclick="removeCharStatus(${idx})" title="${esc(st.label)} (Clic para quitar)" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/60 text-amber-200 text-[10px] font-semibold cursor-pointer hover:bg-rose-950 hover:border-rose-500 hover:text-rose-200 transition">
      <span>${esc(st.icon)}</span>
      <span>${esc(st.label)}</span>
      <span class="text-[8px] opacity-70 ml-0.5">✕</span>
    </span>
  `).join('');
}

export function toggleCharStatus(icon, defaultLabel) {
  if (!state.currentCharacter) return;
  if (!Array.isArray(state.currentCharacter.statuses)) state.currentCharacter.statuses = [];

  const existingIdx = state.currentCharacter.statuses.findIndex(s => s.icon === icon && s.label === defaultLabel);
  if (existingIdx >= 0) {
    state.currentCharacter.statuses.splice(existingIdx, 1);
  } else {
    if (state.currentCharacter.statuses.length >= 5) {
      return showToast("Máximo 5 estados por personaje");
    }
    const customText = prompt(`Descripción para el icono ${icon}:`, defaultLabel);
    if (customText === null) return;
    state.currentCharacter.statuses.push({
      icon,
      label: customText.trim() || defaultLabel
    });
  }

  renderSheetStatuses();
  renderPartyDashboard();
  dibujarEscenaCompleta();
  autoGuardarPersonaje();
}

export function promptCustomStatus() {
  if (!state.currentCharacter) return;
  if (!Array.isArray(state.currentCharacter.statuses)) state.currentCharacter.statuses = [];
  if (state.currentCharacter.statuses.length >= 5) {
    return showToast("Máximo 5 estados por personaje");
  }

  const icon = prompt("Introduce un emoji o icono (ej: 🔥, 💀, ❄️, ✨):", "🔥");
  if (!icon) return;
  const label = prompt("Describe el estado (aparecerá al pasar el ratón):", "En llamas");
  if (!label) return;

  state.currentCharacter.statuses.push({
    icon: icon.trim().slice(0, 2),
    label: label.trim()
  });

  renderSheetStatuses();
  renderPartyDashboard();
  dibujarEscenaCompleta();
  autoGuardarPersonaje();
}

export function removeCharStatus(index) {
  if (!state.currentCharacter?.statuses) return;
  state.currentCharacter.statuses.splice(index, 1);
  renderSheetStatuses();
  renderPartyDashboard();
  dibujarEscenaCompleta();
  autoGuardarPersonaje();
}