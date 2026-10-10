import { RequestCard } from "@/features/RequestCard";
import { useBook } from "@/lib/queries";

export function Requests() {
  const book = useBook();
  if (!book) return <p className="card text-center text-muted">Loading…</p>;
  const me = book.me.id;
  const byNewest = (a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt;
  const inbox = book.requests.filter((r) => r.toId === me).sort((a, b) => Number(a.status !== "pending") - Number(b.status !== "pending") || byNewest(a, b));
  const sent = book.requests.filter((r) => r.fromId === me).sort(byNewest);
  return (
    <>
      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>Sent to you</h2><span className="text-sm text-muted">You approve these</span></div>
        <div className="card">
          {inbox.length ? inbox.map((r) => <RequestCard key={r.id} r={r} book={book} />) : <p className="text-sm text-muted">When a roommate pays you back, their slip shows up here for you to accept.</p>}
        </div>
      </section>
      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>You sent</h2></div>
        <div className="card">
          {sent.length ? sent.map((r) => <RequestCard key={r.id} r={r} book={book} />) : <p className="text-sm text-muted">Tap “Pay back” on Home to send a payment with a slip photo.</p>}
        </div>
      </section>
    </>
  );
}
