// src/store/builderStore.js
import { create } from "zustand";

export const useBuilderStore = create((set, get) => ({
    selectedBox: null, // { id, name, capacity, price, imageUrl, slotMap }
    items: [], // [{slot, macaronId}]

    setSelectedBox: (box) => set({ selectedBox: box, items: [] }),

    addItem: (slot, macaron) => {
        const { items, selectedBox } = get();
        if (!selectedBox) return;

        if (items.length >= selectedBox.capacity) return; // capacity guard

        set({
            items: [...items, { slot, macaronId: String(macaron.id) }],
        });
    },


    removeItem: (slot) =>
        set({
            items: get().items.filter((it) => it.slot !== slot),
        }),

    get filled() {
        return get().items.length;
    },

    get capacityLeft() {
        const box = get().selectedBox;
        return box ? box.capacity - get().items.length : 0;
    },
}));
