import { useState, useEffect } from 'react';

const STORAGE_KEY = 'te_screener_saved_filters';

export function useScreenerFilters() {
    const [filters, setFilters] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to load filters", e);
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    }, [filters]);

    const saveFilter = (filter) => {
        setFilters(prev => {
            const index = prev.findIndex(f => f.id === filter.id);
            if (index > -1) {
                const next = [...prev];
                next[index] = { ...filter, updated_at: Date.now() };
                return next;
            }
            return [...prev, { ...filter, id: Date.now().toString(), created_at: Date.now(), updated_at: Date.now() }];
        });
    };

    const deleteFilter = (id) => {
        setFilters(prev => prev.filter(f => f.id !== id));
    };

    return { filters, saveFilter, deleteFilter };
}
