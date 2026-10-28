import { state } from './state.js';
import { sbClient, esc, showToast } from './supabase.js';
import { autoGuardarPersonaje, getRecoveryDieData } from './sheet.js';

export function agregarTirada(datos) {
  if (state.roomRolls.some(r => r.id === datos.id)) return;
  state.roomRolls.push(datos);
  if (state.roomRolls.length > 50) state.roomRolls = state.roomRolls.slice(-50);
  renderLiveRollsFeed();
}

export async function publicarTirada(payload) {
  agregarTirada(payload);
  const { error } = await sbClient.from('tiradas').insert([{ sala: state.currentRoom, datos: payload }]);
  if (error) {
    state.roomRolls = state.roomRolls.filter(r => r.id !== payload.id);
    renderLiveRollsFeed();
    showToast("No se pudo enviar la tirada");
  }
}

export async function executePublicRoll() {
  const charName = state.currentCharacterId === 'gm' ? "Director de Juego" : (state.currentCharacter?.profile?.name || "Espectador");
  const label = document.getElementById('roll-label').value || "Prueba General";
  const mod = parseInt(document.getElementById('roll-mod').value) || 0;
  const targetDc = parseInt(document.getElementById('roll-dc').value) || 15;

  const d20_A = Math.floor(Math.random() * 20) + 1;
  const d20_B = Math.floor(Math.random() * 20) + 1;
  let chosen = d20_A;
  let chosenIndex = 1;

  if (state.currentMode === "advantage") {
    chosen = Math.max(d20_A, d20_B);
    chosenIndex = d20_A >= d20_B ? 1 : 2;
  } else if (state.currentMode === "disadvantage") {
    chosen = Math.min(d20_A, d20_B);
    chosenIndex = d20_A <= d20_B ? 1 : 2;
  }

  const total = chosen + mod;
  let plotDie = null, plotResult = null;
  if (state.plotEnabled) {
    plotDie = Math.floor(Math.random() * 6) + 1;
    plotResult = plotDie <= 2 ? "opportunity" : (plotDie >= 5 ? "complication" : "neutral");
  }

  const rollPayload = {
    id: 'roll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    userId: state.myUserId,
    userName: charName,
    timestamp: Date.now(),
    isRecovery: false,
    label, mode: state.currentMode, d20_A, d20_B, chosen, chosenIndex, mod, total,
    hasPlot: state.plotEnabled, plotDie, plotResult,
    hasDc: state.dcEnabled, targetDc
  };

  await publicarTirada(rollPayload);
}

export async function rollRecoveryDie() {
  if (!state.currentCharacter) return alert("Selecciona o crea un personaje primero");
  const wilVal = state.currentCharacter.attributes.vol || 0;
  const rd = getRecoveryDieData(wilVal);
  const recoveredVal = Math.floor(Math.random() * rd.sides) + 1;

  const curHp = state.currentCharacter.vitals.hpCurrent || 0;
  const maxHp = state.currentCharacter.vitals.hpMax || 20;
  const newHp = Math.min(maxHp, curHp + recoveredVal);
  state.currentCharacter.vitals.hpCurrent = newHp;
  document.getElementById('hp-current').value = newHp;
  autoGuardarPersonaje();

  const recoveryPayload = {
    id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    userId: state.myUserId,
    userName: state.currentCharacter.profile.name || "Aventurero",
    timestamp: Date.now(),
    isRecovery: true,
    die: rd.dieStr,
    recovered: recoveredVal,
    newHp, maxHp
  };

  await publicarTirada(recoveryPayload);
}

export async function recargarTiradasSupabase() {
  const container = document.getElementById('live-rolls-container');
  if (!container) return;
  container.innerHTML = `<div class="text-slate-500 text-center py-10 italic text-xs">Cargando tiradas...</div>`;

  const { data, error } = await sbClient
    .from('tiradas')
    .select('*')
    .eq('sala', state.currentRoom)
    .order('id', { ascending: false })
    .limit(50);

  state.roomRolls = [];
  if (!error && data) {
    state.roomRolls = data.map(item => item.datos).reverse();
  }
  renderLiveRollsFeed();
}

export function renderLiveRollsFeed() {
  const container = document.getElementById('live-rolls-container');
  const countLabel = document.getElementById('rolls-count-label');
  if (!container || !countLabel) return;

  let filtered = state.rollFilter === "mine" ? state.roomRolls.filter(r => r.userId === state.myUserId) : state.roomRolls;

  countLabel.innerText = `${filtered.length} guardadas`;
  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-slate-500 text-center py-12 italic text-xs">No hay tiradas en la sala.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.slice().reverse().forEach(roll => {
    const isMine = roll.userId === state.myUserId;
    const timeStr = new Date(roll.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.className = `p-2.5 rounded-lg border ${isMine ? 'bg-slate-900/90 border-sky-500/50 shadow-sm' : 'bg-slate-950/90 border-slate-800'}`;

    if (roll.isRecovery) {
      item.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
          <span class="font-cinzel font-bold text-xs ${isMine ? 'text-sky-300' : 'text-slate-200'}">${esc(roll.userName)}</span>
          <span class="text-[9px] font-mono text-slate-500">${timeStr}</span>
        </div>
        <div class="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/60 p-2 rounded">
          <div>
            <span class="text-[10px] font-bold text-emerald-400 block uppercase">🌿 Recuperación (${esc(roll.die)})</span>
            <span class="text-xs text-slate-300">Recuperó <strong class="text-emerald-300 font-bold">+${esc(roll.recovered)} Salud</strong></span>
          </div>
          <div class="font-cinzel text-xl font-black text-emerald-400">+${esc(roll.recovered)}</div>
        </div>
      `;
      frag.appendChild(item);
      return;
    }

    let plotHtml = "";
    if (roll.hasPlot && roll.plotDie) {
      if (roll.plotResult === "opportunity") plotHtml = `<div class="mt-1.5 p-1 px-2 rounded bg-emerald-950/70 border border-emerald-600/60 flex items-center justify-between text-[10px]"><span class="font-bold text-emerald-300">★ ¡OPORTUNIDAD!</span><span class="font-mono text-emerald-200 font-bold">Dado Trama: ${esc(roll.plotDie)}</span></div>`;
      else if (roll.plotResult === "complication") plotHtml = `<div class="mt-1.5 p-1 px-2 rounded bg-rose-950/70 border border-rose-600/60 flex items-center justify-between text-[10px]"><span class="font-bold text-rose-300">⚠ COMPLICACIÓN</span><span class="font-mono text-rose-200 font-bold">Dado Trama: ${esc(roll.plotDie)}</span></div>`;
    }

    let dcHtml = "";
    if (roll.hasDc && roll.targetDc !== null) {
      dcHtml = roll.total >= roll.targetDc 
        ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/60">Éxito vs DC ${esc(roll.targetDc)}</span>`
        : `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/60">Fallo vs DC ${esc(roll.targetDc)}</span>`;
    }

    item.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
        <span class="font-cinzel font-bold text-xs ${isMine ? 'text-sky-300' : 'text-slate-200'}">${esc(roll.userName)}</span>
        <span class="text-[9px] font-mono text-slate-500">${timeStr}</span>
      </div>
      <div class="text-[11px] font-semibold text-slate-300 mb-1">${esc(roll.label)}</div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <span class="text-xl font-cinzel font-black text-sky-300">${esc(roll.total)}</span>
          <span class="text-[10px] text-slate-400 font-mono">(d20: ${esc(roll.chosen)} + mod ${esc(roll.mod)})</span>
        </div>
        <div>${dcHtml}</div>
      </div>
      ${plotHtml}
    `;
    frag.appendChild(item);
  });
  container.replaceChildren(frag);

  if (typeof window.actualizarHistorialMapa === 'function') {
    window.actualizarHistorialMapa();
  }
}

export async function clearRoomHistoryPrompt() {
  if (!confirm("¿Seguro que deseas vaciar las tiradas de esta sala en Supabase?")) return;
  const { error } = await sbClient.from('tiradas').delete().eq('sala', state.currentRoom);
  if (error) showToast("No se pudo limpiar la sala");
}