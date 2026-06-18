import React, { useState } from 'react';
import { FilterRuleCard } from './FilterRuleCard';

export function FilterBuilder({ rules, onChange, DS }) {
    const addRule = () => {
        onChange([...rules, { id: Date.now(), col: 'roe', op: '>', val: 0 }]);
    };

    const updateRule = (id, newRule) => {
        onChange(rules.map(r => r.id === id ? newRule : r));
    };

    const removeRule = (id) => {
        onChange(rules.filter(r => r.id !== id));
    };

    return (
        <div style={{ padding: '16px', background: DS.surface, borderRadius: '8px' }}>
            <h3 style={{ color: DS.text, marginBottom: '16px' }}>Custom Filter</h3>
            {rules.map(rule => (
                <FilterRuleCard key={rule.id} rule={rule}
                    onChange={(newRule) => updateRule(rule.id, newRule)}
                    onRemove={() => removeRule(rule.id)}
                    DS={DS}
                />
            ))}
            <button onClick={addRule}
                style={{
                    background: DS.accent, color: 'white', border: 'none',
                    padding: '8px 16px', borderRadius: '6px', cursor: 'pointer'
                }}>
                + Add Filter
            </button>
        </div>
    );
}
