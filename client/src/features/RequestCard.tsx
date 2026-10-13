import { Banknote, Check, CircleCheck, CircleX, Clock } from "lucide-react";
import { PersonChip } from "@/components/ui";
import { api } from "@/lib/api";
import { useT, type Dict } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { useAction, type Book, type RequestView } from "@/lib/queries";
import { openSheet } from "@/lib/sheets";

const ago = (T: Dict, t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return T.justNow;
  if (s < 3600) return T.minAgo(Math.floor(s / 60));
  if (s < 86400) return T.hAgo(Math.floor(s / 3600));
  return T.dAgo(Math.floor(s / 86400));
};

export function RequestCard({ r, book }: { r: RequestView; book: Book }) {
  const action = useAction();
  const T = useT();
  const mine = r.fromId === book.me.id;
  const forMe = r.toId === book.me.id;
  const status =
    r.status === "accepted" ? (
      <span className="pill pill-ok"><CircleCheck />{T.accepted}{r.decision && r.decision.amount !== r.amount ? ` ${fmt(r.decision.amount)}` : ""}</span>
    ) : r.status === "declined" ? (
      <span className="pill pill-bad"><CircleX />{T.declined}</span>
    ) : (
      <span className="pill pill-wait"><Clock />{T.waiting}</span>
    );
  const cancel = () =>
    openSheet({ kind: "confirm", title: T.cancelRequestQ, text: T.cancelRequestText, ok: T.cancelRequest, onOk: () => action.run(() => api.cancelRequest(r.id), T.requestCancelled) });

  return (
    <div className="grid grid-cols-[56px_1fr] items-center gap-3 border-line [&+&]:border-t [&+&]:border-dashed [&+&]:pt-3.5">
      {r.slipId ? (
        <button className="h-[72px] w-14 overflow-hidden rounded-ctl border border-line bg-surface-2" onClick={() => openSheet({ kind: "slip", slipId: r.slipId! })} aria-label={T.viewSlip}>
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
          {ago(T, r.createdAt)}
          {r.note ? ` · ${r.note}` : ""}
        </span>
      </div>
      {r.status === "pending" && (forMe || mine) && (
        <div className="col-span-2 flex gap-2">
          {forMe ? (
            <button className="btn btn-primary flex-1" onClick={() => openSheet({ kind: "review", requestId: r.id })}><Check />{T.review}</button>
          ) : (
            <button className="btn flex-1" onClick={cancel}>{T.cancelRequest}</button>
          )}
        </div>
      )}
    </div>
  );
}
