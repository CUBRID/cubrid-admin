export const theme = {
  colors: {
    // Active/selected state — used by all three tree systems
    primary: "amber-500",
    primaryHover: "amber-400",

    // Tree guide lines
    treeBorder: "slate-200",   // light mode  → border-l
    treeBorderDark: "slate-800",   // dark mode   → border-l

    // StatusIndicator dots
    statusOn: "green-500",
    statusOff: "slate-400",
    statusUnknown: "yellow-500",
  },

  tree: {
    levelOneIndent: "ml-[22px]",   // Database / Log / Broker root nodes
    levelDeepIndent: "ml-4",        // Tables, columns, sub-brokers
    activeBarColor: "bg-amber-500",
    activeBarClass: "absolute -left-px top-0 bottom-0 w-[2px]",
    hoverClass: "hover:bg-slate-100 dark:hover:bg-slate-800/60",
  },

  typography: {
    treeLabel: "text-15 font-medium font-mono",
    columnDetail: "text-13 text-slate-400",
    statusLabel: "text-13 font-medium uppercase tracking-wide",
  },

  shadows: {
    // Protected — do not remove or change
    warningGlow: "shadow-[0_0_8px_rgba(217,119,6,0.2)]",
    activeNodeRing: "shadow-[0_0_0_2px_rgba(217,119,6,0.3)]",
  },
};
