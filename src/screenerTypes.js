
// Proposed schema for new filtering system
// To be added to src/screenerTypes.js or similar

/**
 * @typedef {Object} FilterRule
 * @property {string} id - Unique identifier
 * @property {string} col - Column key
 * @property {string} op - Operator
 * @property {string|number} val - Value
 * @property {'number'|'column'|'boolean'} valType
 * @property {string} [rhsCol] - For column-comparison
 * @property {string} [rhsMul] - Multiplier
 */

/**
 * @typedef {Object} FilterGroup
 * @property {string} id - Unique identifier
 * @property {'AND'|'OR'} logicalOperator
 * @property {Array<FilterRule|FilterGroup>} rules - Nested structure
 */

/**
 * @typedef {Object} SavedFilter
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {FilterGroup} definition
 * @property {string} folderId
 * @property {boolean} isFavorite
 * @property {number} created_at
 * @property {number} updated_at
 */

export const DEFAULT_OPERATORS = [">", "<", ">=", "<=", "=", "!="];
