import axios from 'axios';
import { demoAdapter, isDemo } from './demoAdapter';

export const api = axios.create({ baseURL: '/api' });

// On the static host (GitHub Pages) there is no backend — serve everything from
// an in-memory demo adapter. Local dev keeps hitting the real API on :5001.
if (isDemo) {
  api.defaults.adapter = demoAdapter as never;
}

const TOKEN_KEY = 'murlee_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
