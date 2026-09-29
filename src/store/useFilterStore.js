// places2go — Filter store (session only, NOT persisted)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Shared between the Map and Results screens so search text, active chips,
// sort order and the selected pin stay in sync when the user switches views.

import { create } from 'zustand';
import { DEFAULT_ACTIVE_CHIP_KEYS, DEFAULT_SORT_KEY, FILTER_CHIP_BY_KEY } from '../constants/filters';

const useFilterStore = create((set, get) => ({
  query:           '',
  activeChipKeys:  [...DEFAULT_ACTIVE_CHIP_KEYS],
  sortKey:         DEFAULT_SORT_KEY,
  selectedPlaceId: null,

  setQuery: (query) => set({ query }),

  toggleChip: (key) => {
    if (!FILTER_CHIP_BY_KEY[key]) return;
    set((state) => ({
      activeChipKeys: state.activeChipKeys.includes(key)
        ? state.activeChipKeys.filter((k) => k !== key)
        : [...state.activeChipKeys, key],
    }));
  },

  setChipActive: (key, active) => {
    if (!FILTER_CHIP_BY_KEY[key]) return;
    const isActive = get().activeChipKeys.includes(key);
    if (active === isActive) return;
    set((state) => ({
      activeChipKeys: active
        ? [...state.activeChipKeys, key]
        : state.activeChipKeys.filter((k) => k !== key),
    }));
  },

  setSortKey: (sortKey) => set({ sortKey }),

  selectPlace: (placeId) => set({ selectedPlaceId: placeId }),

  clearFilters: () =>
    set({
      query:          '',
      activeChipKeys: [...DEFAULT_ACTIVE_CHIP_KEYS],
      sortKey:        DEFAULT_SORT_KEY,
    }),
}));

export default useFilterStore;
