import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";

/** Logged-out layout: centred card with the brand. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col justify-center gap-5 px-4 py-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="!text-4xl">Fridge Tab</h1>
        <p className="text-muted">Scan 7-Eleven receipts, tick who ate what, settle up later.</p>
      </div>
      {children}
    </main>
  );
}

const PinInput = ({ value, onChange, label = "PIN (4–6 digits)", autoFocus }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean }) => (
  <label className="field">
    <span>{label}</span>
    <input className="input text-center font-mono !text-2xl tracking-[.4em]" type="password" inputMode="numeric" autoComplete="current-password"
      pattern="\d{4,6}" maxLength={6} required autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
  </label>
);

function useEnter() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.invalidateQueries();
    navigate("/", { replace: true });
  };
}

export function Welcome() {
  const [houseName, setHouseName] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const enter = useEnter();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createHouse({ houseName: houseName.trim(), name: name.trim(), pin });
      toast.success("House created. Share the invite link from Settings.");
      await enter();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame>
      <form className="card" onSubmit={submit}>
        <h2>Start a house</h2>
        <label className="field"><span>House name</span><input className="input" required maxLength={40} placeholder="Room 402" value={houseName} onChange={(e) => setHouseName(e.target.value)} /></label>
        <label className="field"><span>Your name</span><input className="input" required maxLength={24} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <PinInput value={pin} onChange={setPin} />
        <button className="btn btn-primary btn-lg" disabled={busy}>Create house<ArrowRight /></button>
      </form>
      <p className="text-center text-sm text-muted">Joining roommates? Open the invite link they sent you.</p>
    </Frame>
  );
}

export function Join() {
  const { code = "" } = useParams();
  const invite = useQuery({ queryKey: ["invite", code], queryFn: () => api.invite(code), retry: false });
  const [who, setWho] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const enter = useEnter();

  if (invite.isPending) return <Frame><p className="card text-center text-muted">Opening invite…</p></Frame>;
  if (invite.isError) return <Frame><p className="note note-err">{(invite.error as Error).message}</p></Frame>;
  const info = invite.data;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (who === "new") await api.join(code, { name: name.trim(), pin });
      else if (who) await api.login(code, { memberId: who, pin });
      await enter();
    } catch (err) {
      toast.error((err as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <form className="card" onSubmit={submit}>
        <div className="flex items-center gap-2"><Users className="size-5 text-accent-strong" /><h2>{info.house.name}</h2></div>
        <p className="text-sm text-muted">Who are you?</p>
        <div className="flex flex-col gap-2">
          {info.members.map((m) => (
            <button type="button" key={m.id} onClick={() => (setWho(m.id), setPin(""))}
              className={`flex items-center gap-3 rounded-ctl border-2 p-2.5 text-left ${who === m.id ? "border-accent-strong bg-accent/10" : "border-line"}`}>
              <Avatar member={{ ...m, promptpay: "" }} size={36} /><b>{m.name}</b>
            </button>
          ))}
          {!info.full && (
            <button type="button" onClick={() => (setWho("new"), setPin(""))}
              className={`rounded-ctl border-2 border-dashed p-3 text-left ${who === "new" ? "border-accent-strong bg-accent/10" : "border-line"}`}>
              <b>I'm new here</b>
              <span className="block text-sm text-muted">Add my name to this house</span>
            </button>
          )}
        </div>
        {who === "new" && (
          <label className="field"><span>Your name</span><input className="input" required maxLength={24} autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
        )}
        {who && <PinInput value={pin} onChange={setPin} label={who === "new" ? "Choose a PIN (4–6 digits)" : "Your PIN"} autoFocus={who !== "new"} />}
        {who && <button className="btn btn-primary btn-lg" disabled={busy}>{who === "new" ? "Join house" : "Log in"}<ArrowRight /></button>}
      </form>
    </Frame>
  );
}
