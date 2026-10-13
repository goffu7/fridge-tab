import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Save, Sun, SunMoon } from "lucide-react";
import { useState } from "react";
import { PersonChip } from "@/components/ui";
import { api } from "@/lib/api";
import { useAction, useBook } from "@/lib/queries";
import { setTheme, SKINS, useTheme, type Mode } from "@/lib/theme";

export function Settings() {
  const book = useBook();
  const theme = useTheme();
  const action = useAction();
  const qc = useQueryClient();
  const [name, setName] = useState(book?.me.name ?? "");
  const [promptpay, setPromptpay] = useState(book?.me.promptpay ?? "");
  if (!book) return <p className="card text-center text-muted">Loading…</p>;

  const saveProfile = async () => {
    if (await action.run(() => api.updateMe({ name: name.trim(), promptpay: promptpay.trim() }), "Saved")) qc.invalidateQueries({ queryKey: ["me"] });
  };
  const logout = async () => {
    await api.logout().catch(() => {});
    qc.clear();
    location.assign("/");
  };

  const modes: [Mode, typeof Sun, string][] = [["auto", SunMoon, "Auto"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]];
  return (
    <>
      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>Theme</h2><span className="text-sm text-muted">Saved on this phone</span></div>
        <div className="card">
          <div className="grid grid-cols-3 gap-2.5">
            {SKINS.map((s) => {
              const on = theme.skin === s.id;
              return (
                <button key={s.id} aria-pressed={on} onClick={() => setTheme({ skin: s.id })}
                  className={`flex flex-col overflow-hidden rounded-ctl border-2 bg-surface text-left ${on ? "border-accent-strong ring-3 ring-accent/35" : "border-line"}`}>
                  <span className="grid h-16 grid-cols-2">
                    <i style={{ background: `linear-gradient(${s.swatch[0]} 55%, ${s.swatch[1]} 55%)` }} />
                    <i style={{ background: `linear-gradient(${s.swatch[2]} 55%, ${s.swatch[3]} 55%)` }} />
                  </span>
                  <span className="px-2.5 py-2 text-[13px] font-semibold">{s.name}</span>
                </button>
              );
            })}
          </div>
          <div role="group" aria-label="Light or dark" className="grid grid-cols-3 gap-1 rounded-ctl bg-surface-2 p-1">
            {modes.map(([m, Icon, label]) => (
              <button key={m} aria-pressed={theme.mode === m} onClick={() => setTheme({ mode: m })}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[calc(var(--radius-sm)-3px)] text-sm ${theme.mode === m ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted"}`}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>You</h2><span className="text-sm text-muted">Everyone in the house sees this</span></div>
        <div className="card">
          <div className="grid grid-cols-2 gap-2 max-[380px]:grid-cols-1">
            <label className="field"><span>Name</span><input className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field"><span>PromptPay (optional)</span><input className="input" type="tel" inputMode="numeric" maxLength={20} placeholder="08x-xxx-xxxx" value={promptpay} onChange={(e) => setPromptpay(e.target.value)} /></label>
          </div>
          <p className="text-sm text-muted">Your PromptPay number is shown when roommates pay you back.</p>
          <button className="btn btn-primary" disabled={action.pending} onClick={saveProfile}><Save />Save</button>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>{book.house.name}</h2><span className="text-sm text-muted">{book.members.length} people</span></div>
        <div className="card">
          <div className="flex flex-wrap gap-2">{book.members.map((m) => <PersonChip key={m.id} member={m} label={m.id === book.me.id ? `${m.name} (you)` : m.name} />)}</div>
        </div>
      </section>

      <button className="btn btn-ghost btn-danger" onClick={logout}><LogOut />Log out on this phone</button>
    </>
  );
}
