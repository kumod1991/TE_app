import { createContext } from "react";

// ===== GLOBAL QUOTE CONTEXT =====
// Shared between App.jsx and any module (e.g. ForumModule.jsx) that needs
// live/cached quote data without prop-drilling. Must live in its own file
// so every importer resolves to the same context instance.
export const QuoteContext = createContext({
    quotes: {},
    setQuotes: () => { },
});
