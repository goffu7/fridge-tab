import { RequestCard } from "@/features/RequestCard";
import { useT } from "@/lib/i18n";
import { useBook } from "@/lib/queries";

export function Requests() {
  const book = useBook();
  const T = useT();
  if (!book) return <p className="card text-center text-muted">{T.loading}</p>;
  const me = book.me.id;
  const byNewest = (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt;
  const inbox = book.requests.filter((r) => r.toId === me).sort((a, b) => Number(a.status !== "pending") - Number(b.status !== "pending") || byNewest(a, b));
  const sent = book.requests.filter((r) => r.fromId === me).sort(byNewest);
  return (
    <>
      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>{T.sentToYou}</h2><span className="text-sm text-muted">{T.youApprove}</span></div>
        <div className="card">
          {inbox.length ? inbox.map((r) => <RequestCard key={r.id} r={r} book={book} />) : <p className="text-sm text-muted">{T.inboxEmpty}</p>}
        </div>
      </section>
      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>{T.youSent}</h2></div>
        <div className="card">
          {sent.length ? sent.map((r) => <RequestCard key={r.id} r={r} book={book} />) : <p className="text-sm text-muted">{T.sentEmpty}</p>}
        </div>
      </section>
    </>
  );
}
