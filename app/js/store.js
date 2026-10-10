// Tiny localStorage helpers plus this phone's code.
// Dev aid: open the app as ?as=2 to get a second, separate "phone" in another tab.

const NS = (() => {
  try {
    return new URLSearchParams(location.search).get('as') || '';
  } catch {
    return '';
  }
})();
const k = (key) => (NS ? key.replace(/^am\./, `am${NS}.`) : key);

export const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(k(key));
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};

export const save = (key, value) => {
  try {
    localStorage.setItem(k(key), JSON.stringify(value));
  } catch {}
};

export const remove = (key) => {
  try {
    localStorage.removeItem(k(key));
  } catch {}
};

// Four characters from an alphabet with no look-alikes (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const randomCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

export function deviceCode() {
  let code = load('am.code', '');
  if (!code || code.length !== 4) {
    code = randomCode();
    save('am.code', code);
  }
  return code;
}
