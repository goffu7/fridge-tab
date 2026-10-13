import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";

/** Logged-out screen: tap your name to log in. */
export function Welcome() {
  const friends = useQuery({ queryKey: ["friends"], queryFn: api.friends, retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const pick = async (id: string) => {
    setBusy(id);
    try {
      await api.login(id);
      await qc.invalidateQueries();
      navigate("/", { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col justify-center gap-5 px-4 py-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="!text-4xl">Fridge Tab</h1>
        <p className="text-muted">Scan 7-Eleven receipts, tick who ate what, settle up later.</p>
      </div>
      <div className="card">
        <h2>Who are you?</h2>
        {friends.isPending && <p className="text-center text-muted">Loading…</p>}
        {friends.isError && <p className="note note-err">{(friends.error as Error).message}</p>}
        <div className="flex flex-col gap-2">
          {friends.data?.members.map((m) => (
            <button key={m.id} type="button" disabled={busy !== null} onClick={() => pick(m.id)}
              className="flex items-center gap-3 rounded-ctl border-2 border-line p-3 text-left hover:border-accent-strong disabled:opacity-60">
              <Avatar member={{ ...m, promptpay: "" }} size={40} />
              <b className="flex-1 text-lg">{m.name}</b>
              {busy === m.id ? <span className="text-sm text-muted">Opening…</span> : <ArrowRight className="size-5 text-muted" />}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
