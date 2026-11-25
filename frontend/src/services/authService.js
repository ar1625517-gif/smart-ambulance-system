// Auth state management - localStorage backed

const TOKEN_KEY = 'mediroute_token';
const USER_KEY = 'mediroute_user';

export function saveAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore storage errors
  }
}

export function loadAuth() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    if (!token || !userJson) return { token: null, user: null };
    return { token, user: JSON.parse(userJson) };
  } catch {
    return { token: null, user: null };
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export function isTokenExpired(user) {
  if (!user?.exp) return true;
  return user.exp <= Math.floor(Date.now() / 1000);
}
