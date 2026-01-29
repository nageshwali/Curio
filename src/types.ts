export interface VaultItem {
  id: string;
  title: string;
  subtext: string;
  image_url: string;
  badges: string[];
  collection: string;
  summary: string;
  anomaly: string;
  known_facts: string[];
  unknowns: string[];
  myths: string[];
  evidence_tier: 'verified' | 'strong' | 'emerging' | 'theoretical' | 'debated';
}

export interface VaultState {
  items: VaultItem[];
  savedItems: string[];
  currentIndex: number;
  isMuted: boolean;
  showIntelligenceCore: boolean;
  showAdminPanel: boolean;
  activeCollection: string | null;
}
