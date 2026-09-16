import { create } from "zustand";

type User = { id: string; name: string; email: string; role: string };

type AuthState = {
  isSignedIn: boolean;
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  isSignedIn: false,
  token: null,
  user: null,
  setAuth: (token, user) => set({ isSignedIn: true, token, user }),
  clearAuth: () => set({ isSignedIn: false, token: null, user: null }),
}));