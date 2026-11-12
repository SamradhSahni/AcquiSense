import { create } from 'zustand';
import { Deal, Finding, Citation, DiligenceDomain, Severity } from '../types';

export type DealDossierTab = 'verdict' | 'findings' | 'heatmap' | 'graph' | 'analyst_q' | 'vdr';

interface DealState {
  selectedDeal: Deal | null;
  activeTab: DealDossierTab;
  domainFilter: DiligenceDomain | null;
  severityFilter: Severity | null;
  searchQuery: string;
  selectedFinding: Finding | null;
  isCopilotOpen: boolean;
  isCitationsOpen: boolean;
  activeCitation: Citation | null;
  pendingSyncCount: number;

  setSelectedDeal: (deal: Deal | null) => void;
  setActiveTab: (tab: DealDossierTab) => void;
  setDomainFilter: (domain: DiligenceDomain | null) => void;
  setSeverityFilter: (sev: Severity | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedFinding: (finding: Finding | null) => void;
  setCopilotOpen: (open: boolean) => void;
  setCitationsOpen: (open: boolean, citation?: Citation | null) => void;
  setPendingSyncCount: (count: number) => void;
}

export const useDealStore = create<DealState>((set) => ({
  selectedDeal: null,
  activeTab: 'verdict',
  domainFilter: null,
  severityFilter: null,
  searchQuery: '',
  selectedFinding: null,
  isCopilotOpen: false,
  isCitationsOpen: false,
  activeCitation: null,
  pendingSyncCount: 0,

  setSelectedDeal: (selectedDeal) => set({ selectedDeal }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setDomainFilter: (domainFilter) => set({ domainFilter }),
  setSeverityFilter: (severityFilter) => set({ severityFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedFinding: (selectedFinding) => set({ selectedFinding }),
  setCopilotOpen: (isCopilotOpen) => set({ isCopilotOpen }),
  setCitationsOpen: (isCitationsOpen, activeCitation = null) =>
    set({ isCitationsOpen, activeCitation: activeCitation ?? null }),
  setPendingSyncCount: (pendingSyncCount) => set({ pendingSyncCount }),
}));

