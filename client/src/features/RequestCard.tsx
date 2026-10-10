import { Banknote, Check, CircleCheck, CircleX, Clock } from "lucide-react";
import { PersonChip } from "@/components/ui";
import { api } from "@/lib/api";
import { fmt } from "@/lib/money";
import { useAction, type Book, type RequestView } from "@/lib/queries";
import { openSheet } from "@/lib/sheets";

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

export function RequestCard({ r, book }: { r: RequestView; book: Book }) {
  const action = useAction();
  const mine = r.fromId === book.me.id;
  const forMe = r.toId === book.me.id;
  const status =
    r.status === "accepted" ? (
      <span className="pill pill-ok"><CircleCheck />Accepted{r.decision && r.decision.amount !== r.amount ? ` ${fmt(r.decision.amount)}` : ""}</span>
    ) : r.status === "declined" ? (
      <span className="pill pill-bad"><CircleX />Declined</span>
    ) : (
      <span className="pill pill-wait"><Clock />Waiting</span>
    );
  const cancel = () =>
    openSheet({ kind: "confirm", title: "Cancel this request?", text: "It's removed before it gets accepted.", ok: "Cancel request", onOk: () => action.run(() => api.cancelRequest(r.id), "Request cancelled") });

  return (
    <div className="grid grid-cols-[56px_1fr] items-center gap-3 border-line [&+&]:border-t [&+&]:border-dashed [&+&]:pt-3.5">
      {r.slipId ? (
        <button className="h-[72px] w-14 overflow-hidden rounded-ctl border border-line bg-surface-2" onClick={() => openSheet({ kind: "slip", slipId: r.slipId! })} aria-label="View slip">
          <img src={api.slipUrl(r.slipId)} alt="" loading="lazy" className="size-full object-cover" />
        </button>
      ) : (
        <div className="grid h-[72px] w-14 place-items-center rounded-ctl border border-line bg-surface-2 text-muted"><Banknote /></div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <PersonChip member={book.member(r.fromId)} />
          <span className="text-sm text-muted">→</span>
          <PersonChip member={book.member(r.toId)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <b className="num text-lg">{fmt(r.amount)}</b>
          {status}
        </div>
        <span className="text-xs text-muted">
          {ago(r.createdAt)}
          {r.note ? ` · ${r.note}` : ""}
        </span>
      </div>
      {r.status === "pending" && (forMe || mine) && (
        <div className="col-span-2 flex gap-2">
          {forMe ? (
            <button className="btn btn-primary flex-1" onClick={() => openSheet({ kind: "review", requestId: r.id })}><Check />Review</button>
          ) : (
            <button className="btn flex-1" onClick={cancel}>Cancel request</button>
          )}
        </div>
      )}
    </div>
  );
}
