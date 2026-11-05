export const knownResourceLabels: Record<string, string> = {
  "5c87f96b-a68f-4928-8888-13c32b5017ff": "Resource A",
  "cb8d3e23-b7d1-4bd5-aec3-656cd38aea72": "Resource B",
};

export type ResourceDiagnosticSnapshot = {
  at: string;
  event: string;
  serverCount: number;
  stateCount: number;
  viewInputCount: number;
  filteredCount: number;
  renderedCount: number;
  knownPresence: Record<string, boolean>;
  searchEmpty: boolean;
  searchLength: number;
  typeFilterSelected: boolean;
  sort: string;
  detailSelected: boolean;
  viewerOpen: boolean;
  pageVisibility: string;
};

export function knownResourcePresence(ids: Array<string | number>): Record<string, boolean> {
  const idSet = new Set(ids.map(String));
  return Object.fromEntries(Object.entries(knownResourceLabels).map(([id, label]) => [label, idSet.has(id)]));
}

export function appendResourceDiagnostic(history: ResourceDiagnosticSnapshot[], snapshot: ResourceDiagnosticSnapshot, limit = 40): ResourceDiagnosticSnapshot[] {
  return [...history, snapshot].slice(-limit);
}

export function sanitizeResourceDiagnostics(history: ResourceDiagnosticSnapshot[]): string {
  return JSON.stringify({ generatedAt: new Date().toISOString(), snapshots: history }, null, 2);
}
