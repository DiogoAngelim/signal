import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WeatherStore {
  selectedRegionId: string | null;
  darkMode: boolean;
  lastRefreshed: number;
  refreshCount: number;
  setSelectedRegion: (id: string | null) => void;
  toggleDarkMode: () => void;
  refreshNow: () => void;
}

export const useWeatherStore = create<WeatherStore>()(
  persist(
    (set) => ({
      selectedRegionId: null,
      darkMode: false,
      lastRefreshed: Date.now(),
      refreshCount: 0,

      setSelectedRegion: (id) => set({ selectedRegionId: id }),

      toggleDarkMode: () => set((state) => {
        const newMode = !state.darkMode;
        if (newMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        return { darkMode: newMode };
      }),

      refreshNow: () => set((state) => ({
        lastRefreshed: Date.now(),
        refreshCount: state.refreshCount + 1,
      })),
    }),
    {
      name: 'weather-signal-storage',
      partialize: (state) => ({ darkMode: state.darkMode }),
      onRehydrateStorage: () => (state) => {
        if (state?.darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },
    }
  )
);
