import { state, isGM } from './state.js';
import { sbClient, esc, showToast } from './supabase.js';

let galleryItems = [];

export async function cargarGaleriaDeSala() {
  actualizarVisibilidadBotonSubir();
  try {
    const { data, error } = await sbClient
      .from('galeria')
      .select('*')
      .eq('sala', state.currentRoom)
      .order('id', { ascending: false });

    if (!error && data) {
      galleryItems = data;
    } else {
      galleryItems = [];
    }
  } catch (err) {
    console.warn("Tabla galeria:", err);
    galleryItems = [];
  }
  renderGallery();
}

export function actualizarVisibilidadBotonSubir() {
  const btn = document.getElementById('btn-open-add-img');
  const aviso = document.getElementById('gallery-gm-notice');
  if (btn) {
    if (isGM()) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
  if (aviso) {
    if (!isGM()) {
      aviso.classList.remove('hidden');
    } else {
      aviso.classList.add('hidden');
    }
  }
}

export function renderGallery(filter = 'all') {
  const container = document.getElementById('gallery-grid');
  if (!container) return;

  const activeFilter = filter || document.getElementById('gallery-category-filter')?.value || 'all';
  const filtered = activeFilter === 'all' ? galleryItems : galleryItems.filter(i => i.categoria === activeFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center text-slate-500 py-12 italic text-xs">
        No hay imágenes registradas para la sala <strong class="text-sky-400 font-mono">${esc(state.currentRoom)}</strong>.
        ${isGM() ? '<br><span class="text-amber-400 font-semibold mt-1 inline-block">Pulsa "+ Añadir Imagen" para subir mapas o ilustraciones.</span>' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = "sheet-box overflow-hidden bg-slate-950/80 border-slate-800 rounded-lg group transition hover:border-sky-500/60 flex flex-col justify-between";
    card.innerHTML = `
      <div class="h-44 overflow-hidden relative bg-slate-900 flex items-center justify-center">
        <img src="${esc(item.url)}" alt="${esc(item.titulo)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.onerror=null; this.src='https://placehold.co/400x300/0f172a/94a3b8?text=Error+al+cargar';">
      </div>
      <div class="p-2.5 flex items-center justify-between text-xs border-t border-slate-800 bg-slate-900/60">
        <div class="truncate pr-1">
          <span class="font-cinzel font-bold text-slate-200 block text-[11px] truncate" title="${esc(item.titulo)}">${esc(item.titulo)}</span>
          <span class="text-[9px] uppercase font-mono text-slate-400 font-semibold">${esc(item.categoria)}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button onclick="copiarUrlAlMapa('${esc(item.url)}')" class="px-2 py-1 bg-slate-800 hover:bg-sky-950 hover:text-sky-300 border border-slate-700 rounded text-[9px] font-bold transition cursor-pointer" title="Cargar como mapa táctico en esta sala">
            Mapa
          </button>
          ${isGM() ? `<button onclick="eliminarImagenGaleria(${item.id})" class="text-rose-400 hover:text-rose-300 px-1 py-0.5 text-xs font-bold" title="Eliminar imagen">✕</button>` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

export function filtrarGaleria(cat) {
  renderGallery(cat);
}

export function abrirModalSubirImagen() {
  if (!isGM()) {
    showToast("Solo el Director (DJ) puede subir imágenes");
    return;
  }
  document.getElementById('modal-add-image').classList.remove('hidden');
}

export function cerrarModalSubirImagen() {
  document.getElementById('modal-add-image').classList.add('hidden');
}

export async function guardarImagenEnGaleria() {
  if (!isGM()) {
    showToast("Solo el Director (DJ) puede subir imágenes");
    return;
  }

  const title = document.getElementById('img-input-title').value.trim();
  const cat = document.getElementById('img-input-cat').value;
  const fileInput = document.getElementById('img-input-file');
  const urlInput = document.getElementById('img-input-url').value.trim();
  const btnGuardar = document.getElementById('btn-submit-img');

  if (!title) {
    alert("Introduce un título para la imagen");
    return;
  }

  let finalUrl = "";
  btnGuardar.disabled = true;
  btnGuardar.innerText = "Subiendo...";

  try {
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${state.currentRoom}/${Date.now()}_${cleanFileName}`;

      const { data: uploadData, error: uploadErr } = await sbClient.storage
        .from('galeria')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) {
        throw new Error("Error en Supabase Storage: " + uploadErr.message + " (¿Existe el bucket público 'galeria'?)");
      }

      const { data: urlData } = sbClient.storage.from('galeria').getPublicUrl(filePath);
      finalUrl = urlData.publicUrl;
    } else if (urlInput) {
      finalUrl = urlInput;
    } else {
      alert("Selecciona un archivo desde tu equipo o introduce una URL");
      btnGuardar.disabled = false;
      btnGuardar.innerText = "Guardar";
      return;
    }

    const { error: dbErr } = await sbClient.from('galeria').insert([{
      sala: state.currentRoom,
      titulo: title,
      categoria: cat,
      url: finalUrl
    }]);

    if (dbErr) {
      console.warn("Aviso al insertar en tabla galeria:", dbErr);
      galleryItems.unshift({
        id: Date.now(),
        sala: state.currentRoom,
        titulo: title,
        categoria: cat,
        url: finalUrl
      });
    } else {
      await cargarGaleriaDeSala();
    }

    document.getElementById('img-input-title').value = '';
    document.getElementById('img-input-url').value = '';
    if (fileInput) fileInput.value = '';
    cerrarModalSubirImagen();
    renderGallery();
    showToast("Imagen añadida con éxito");
  } catch (err) {
    alert(err.message || "Error al subir la imagen");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.innerText = "Guardar";
  }
}

export async function eliminarImagenGaleria(id) {
  if (!isGM()) return;
  if (!confirm("¿Eliminar esta imagen de la galería de la sala?")) return;

  await sbClient.from('galeria').delete().eq('id', id);
  galleryItems = galleryItems.filter(i => i.id !== id);
  renderGallery();
  showToast("Imagen eliminada");
}

export function copiarUrlAlMapa(url) {
  const input = document.getElementById('map-bg-url');
  if (input) input.value = url;
  window.cambiarPestana('map');
  window.cargarMapaFondo();
  showToast("Mapa cargado en el lienzo");
}