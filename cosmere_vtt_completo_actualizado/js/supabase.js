export const SUPABASE_URL = "https://oubevgbchjfofjqvhben.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_fBVjOhPd_4VFiOzFV95adw_m28TYaG_";

export const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);

export function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.remove('opacity-0', 'pointer-events-none');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add('opacity-0', 'pointer-events-none'), 2500);
}