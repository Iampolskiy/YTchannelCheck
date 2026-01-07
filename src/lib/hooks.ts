import useSWR from 'swr';
import { api, StatsResponse, ChannelListResponse, CampaignListResponse } from './api-client';

// Fetcher for SWR
const fetcher = <T>(url: string) => api<T>(url);

// Hooks
export function useStats() {
  const { data, error, isLoading, mutate } = useSWR<StatsResponse>('/channels/stats', fetcher, {
    refreshInterval: 5000, // Poll every 5s
  });

  return {
    stats: data?.stats,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useCampaigns() {
  const { data, error, isLoading, mutate } = useSWR<CampaignListResponse>('/campaigns', fetcher);

  return {
    campaigns: data?.campaigns,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useChannels(status: string, limit: number) {
  const { data, error, isLoading, mutate } = useSWR<ChannelListResponse>(
    `/channels?status=${status}&limit=${limit}`,
    fetcher
  );

  return {
    channels: data?.channels,
    isLoading,
    isError: error,
    mutate,
  };
}

