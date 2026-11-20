import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from './safe-storage';
import { useThemeStore, type ThemeMode } from './theme-store';

export type OrgId = string;

/** Dashboard layout density — controls table/card compactness app-wide. */
export type DashboardDensity = 'comfortable' | 'compact';
export type DashboardCurrency = 'USD' | 'USDC';
export type CashflowDisplay = 'area' | 'line';

/** Channel-level notification toggles. */
export interface NotificationPreferences {
  proposals: boolean;
  budgetAlerts: boolean;
  riskAlerts: boolean;
  weeklyDigest: boolean;
}

interface PreferencesState {
  /** Active organization for the workspace switcher. */
  activeOrgId: OrgId;
  /** Theme mode mirrored from the canonical theme store for quick reads. */
  themeMode: ThemeMode;
  /** UI density for tables and card grids. */
  density: DashboardDensity;
  sidebarCollapsed: boolean;
  activeCurrency: DashboardCurrency;
  cashflowDisplay: CashflowDisplay;
  /** Notification channel toggles. */
  notifications: NotificationPreferences;
  /** True once the persisted snapshot has rehydrated from localStorage. */
  hasHydrated: boolean;
  setActiveOrg: (id: OrgId) => void;
  /** Updates the canonical theme store and mirrors the mode here. */
  setThemeMode: (mode: ThemeMode) => void;
  setDensity: (density: DashboardDensity) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveCurrency: (currency: DashboardCurrency) => void;
  setCashflowDisplay: (display: CashflowDisplay) => void;
  toggleNotification: (channel: keyof NotificationPreferences) => void;
  setHasHydrated: (value: boolean) => void;
}


export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      activeOrgId: 'org_nova',
      themeMode: 'light',
      density: 'comfortable',
      sidebarCollapsed: false,
      activeCurrency: 'USD',
      cashflowDisplay: 'area',
      notifications: {
        proposals: true,
        budgetAlerts: true,
        riskAlerts: true,
        weeklyDigest: false,
      },
      hasHydrated: false,
      setActiveOrg: (id) => set({ activeOrgId: id }),
      setThemeMode: (mode) => {
        // Keep the canonical theme store in sync; the ThemeProvider applies
        // `data-theme` from there, so preferences only hold a mirror.
        useThemeStore.getState().setMode(mode);
        set({ themeMode: mode });
      },
      setDensity: (density) => set({ density }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setActiveCurrency: (activeCurrency) => set({ activeCurrency }),
      setCashflowDisplay: (cashflowDisplay) => set({ cashflowDisplay }),
      toggleNotification: (channel) =>
        set((s) => ({
          notifications: { ...s.notifications, [channel]: !s.notifications[channel] },
        })),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'astroid-preferences',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      // Only user-facing preferences persist; hydration bookkeeping stays out.
      partialize: (state) => ({
        activeOrgId: state.activeOrgId,
        themeMode: state.themeMode,
        density: state.density,
        sidebarCollapsed: state.sidebarCollapsed,
        activeCurrency: state.activeCurrency,
        cashflowDisplay: state.cashflowDisplay,
        notifications: state.notifications,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
