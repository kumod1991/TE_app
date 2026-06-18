import React from 'react';
import { DEFAULT_OPERATORS } from '../screenerTypes';

export function FilterRuleCard({ rule, onChange, onRemove, DS }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px', border: `1px solid ${DS.border}`,
            borderRadius: '8px', background: DS.card, marginBottom: '8px'
        }}>
            {/* Metric Selector (Simplified for now) */}
            <select value={rule.col} onChange={e => onChange({ ...rule, col: e.target.value })}
                style={{ background: 'transparent', color: DS.text, border: `1px solid ${DS.border}` }}>
                {/* To be replaced with full metric list mapping */}
                <option value="roe">ROE %</option>
                <option value="roce">ROCE %</option>
                <option value="debt_eq">Debt/Equity</option>
            </select>

            {/* Operator */}
            <select value={rule.op} onChange={e => onChange({ ...rule, op: e.target.value })}
                style={{ background: 'transparent', color: DS.text, border: `1px solid ${DS.border}` }}>
                {DEFAULT_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
            </select>

            {/* Value Input */}
            <input type="number" value={rule.val} onChange={e => onChange({ ...rule, val: e.target.value })}
                style={{ background: 'transparent', color: DS.text, border: `1px solid ${DS.border}`, width: '80px' }}
            />

            <button onClick={onRemove} style={{ marginLeft: 'auto', cursor: 'pointer' }}>×</button>
        </div>
    );
}
