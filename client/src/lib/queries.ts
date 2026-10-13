import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { computeLedger, requestStatus, type RequestStatus } from "@shared/ledger";
import type { Member, PayRequest, Payment } from "@shared/types";
import { api } from "./api";
import { t } from "./i18n";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: api.me, retry: false, staleTime: 5 * 60_000 });

/** The whole house; refreshed every 15 s and when the app comes back to the foreground. */
export const useHouse = () => useQuery({ queryKey: ["state"], queryFn: api.state, refetchInterval: 15_000 });

export type RequestView = PayRequest & { status: RequestStatus; decision: Payment | null };

/** Everything the screens derive from the house state. */
export function useBook() {
  const { data } = useHouse();
  return useMemo(() => {
    if (!data) return null;
    const ledger = computeLedger(data);
    const requests: RequestView[] = data.requests.map((r) => ({
      ...r,
      status: requestStatus(r, data.payments),
      decision: data.payments.find((p) => p.requestId === r.id) ?? null,
    }));
    const members = new Map<string, Member>(data.members.map((m) => [m.id, m]));
    const member = (id: string): Member => members.get(id) ?? { id, name: t().someone, promptpay: "", color: 0 };
    return { ...data, ledger, requests, pending: requests.filter((r) => r.status === "pending"), member };
  }, [data]);
}
export type Book = NonNullable<ReturnType<typeof useBook>>;

/**
 * Runs a write, shows a toast, then refreshes the house state.
 * Returns true on success so callers can close sheets.
 */
export function useAction() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async ({ run }: { run: () => Promise<unknown>; ok?: string }) => run(),
    onSuccess: (_d, v) => {
      if (v.ok) toast.success(v.ok);
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["state"] }),
  });
  return {
    pending: m.isPending,
    run: (run: () => Promise<unknown>, ok?: string) =>
      m.mutateAsync({ run, ok }).then(
        () => true,
        () => false,
      ),
  };
}
