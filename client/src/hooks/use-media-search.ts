import { useInfiniteQuery } from "@tanstack/react-query";
import { mediaApi } from "@/services/api";
import type { MediaType } from "@/types/media";

export const useMediaSearch = (query: string, type: MediaType) => {
  return useInfiniteQuery({
    queryKey: ["search", type, query],
    enabled: true,
    initialPageParam: "",
    queryFn: ({ pageParam }) => mediaApi.search(query, type, pageParam || undefined),
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined
  });
};
