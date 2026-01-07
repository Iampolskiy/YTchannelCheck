// Simple typed fetch wrapper
export async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed with status ${res.status}`);
  }
  
  return res.json();
}

// Stats Type
export interface Stats {
  total: number;
  unchecked: number;
  prefiltered: number;
  positive: number;
  negative: number;
}

export interface StatsResponse {
  ok: boolean;
  stats: Stats;
}

// Channel Type (Simplified for list)
export interface Channel {
  _id: string;
  youtubeId: string;
  youtubeUrl: string;
  status: 'unchecked' | 'prefiltered' | 'positive' | 'negative';
  channelInfo?: {
    title?: string;
    country?: string;
    handle?: string;
  };
  prefilterCheck?: {
    failedRule?: string;
  };
  sources?: {
    socialBlade?: boolean;
  };
}

export interface ChannelListResponse {
  ok: boolean;
  channels: Channel[];
}

export interface Campaign {
  _id: string;
  name: string;
  type: 'channel' | 'video';
}

export interface CampaignListResponse {
  ok: boolean;
  campaigns: Campaign[];
}

