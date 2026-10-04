// Tiny localStorage helpers plus this phone's code.

export const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};

export const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const remove = (key) => {
  try {
    localStorage.removeItem(key);
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
