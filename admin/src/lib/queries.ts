import { useQuery } from '@tanstack/react-query';
import type { KitInfo, LeaderboardEntry, Me, ProspectDetail, ProspectSummary, StoredMessage } from '@worker/api-types';
import { api } from './api';

export const keys = {
  me: ['me'] as const,
  games: ['games'] as const,
  game: (id: number) => ['game', id] as const,
  kit: ['kit'] as const,
  messages: (id: number) => ['messages', id] as const,
  board: (id: number, mode: string) => ['board', id, mode] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/me'), staleTime: Number.POSITIVE_INFINITY });
export const useGames = () =>
  useQuery({ queryKey: keys.games, queryFn: async () => (await api<{ prospects: ProspectSummary[] }>('/prospects')).prospects });
export const useGame = (id: number) =>
  useQuery({ queryKey: keys.game(id), queryFn: async () => await api<{ prospect: ProspectDetail; url: string }>(`/prospects/${id}`) });
export const useKit = () => useQuery({ queryKey: keys.kit, queryFn: () => api<KitInfo>('/kit'), staleTime: Number.POSITIVE_INFINITY });
export const useBoard = (id: number, mode: string) =>
  useQuery({
    queryKey: keys.board(id, mode),
    queryFn: async () => (await api<{ top: LeaderboardEntry[] }>(`/prospects/${id}/leaderboard/${mode}`)).top,
  });
export const fetchMessages = async (id: number) => (await api<{ messages: StoredMessage[] }>(`/prospects/${id}/messages`)).messages;
