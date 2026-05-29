import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';

type SanityResponse<T> = {
  result: T;
};

export type User = {
  _id: string;
  username: string;
  created_at: string;
};

const USERS_QUERY = `*[_type == "user"] | order(_createdAt desc) {
  _id,
  username,
  "created_at": _createdAt
}`;

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch(getApiUrl(USERS_QUERY));
  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.status}`);
  }
  const data: SanityResponse<User[]> = await response.json();
  return data.result ?? [];
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });
}
