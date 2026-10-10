import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import type { Member } from "@shared/types";

const initial = (name: string) => (name.trim()[0] || "?").toUpperCase();

/** A roommate's name in their colour. Pass onClick to make it a toggle. */
export function PersonChip({ member, pressed, onClick, label }: { member: Member; pressed?: boolean; onClick?: () => void; label?: string }) {
  const style = { "--c": `var(--m${member.color % 6})` } as React.CSSProperties;
  const body = (
    <>
      <span className="dot">{initial(member.name)}</span>
      {label ?? member.name}
    </>
  );
  if (!onClick) return <span className="chip chip-static" style={style}>{body}</span>;
  return (
    <button type="button" className="chip" style={style} aria-pressed={!!pressed} onClick={onClick}>
      {body}
    </button>
  );
}

export function Avatar({ member, size = 42 }: { member: Member; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-bold text-surface" style={{ width: size, height: size, background: `var(--m${member.color % 6})` }}>
      {initial(member.name)}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-6 text-center [&>svg]:size-9 [&>svg]:text-accent-strong">
      {icon}
      <p className="display text-xl">{title}</p>
      {children}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Drawer.Content aria-describedby={undefined} className="sheet fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[560px]">
          <div className="mx-auto mb-1 h-[5px] w-10 shrink-0 rounded-full bg-line" />
          <div className="flex items-center gap-2.5">
            <Drawer.Title asChild>
              <h2 className="flex-1">{title}</h2>
            </Drawer.Title>
            <button type="button" className="btn btn-ghost !min-h-10 !px-2" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
          <div className="-mx-1 flex flex-col gap-3.5 overflow-y-auto px-1 pb-1">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Quick amount buttons: all, half, and round numbers below the full amount. */
export function QuickAmounts({ full, onPick, fmt }: { full: number; onPick: (satang: number) => void; fmt: (n: number) => string }) {
  const half = Math.round(full / 200) * 100;
  const opts = [full, half, 2000, 5000, 10000].filter((v, i, a) => v > 0 && (i < 2 || v < full) && a.indexOf(v) === i);
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((v, i) => (
        <button key={v} type="button" className="btn !min-h-[38px] flex-1 !px-3 !text-[13.5px]" onClick={() => onPick(v)}>
          {i === 0 ? "All " : i === 1 ? "Half " : ""}
          {fmt(v)}
        </button>
      ))}
    </div>
  );
}
