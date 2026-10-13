import { Heart, House, Inbox, Moon, Plus, Receipt, ScanLine, Settings, Sun, SunMoon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { toast } from "sonner";
import { Sheets } from "@/features/sheets";
import { enqueueScans } from "@/lib/drafts";
import { useBook, useMe } from "@/lib/queries";
import { setTheme, useTheme, type Mode } from "@/lib/theme";
import { Avatar } from "./ui";

const SCAN_INPUT = "scan-input";
const CAMERA_INPUT = "camera-input";
/** Opens the phone's photo picker for one or many receipts. */
export const pickReceipts = () => document.getElementById(SCAN_INPUT)?.click();
/** Opens the phone's back camera to snap one receipt. */
export const takeReceiptPhoto = () => document.getElementById(CAMERA_INPUT)?.click();

const MODE_ICON = { auto: SunMoon, light: Sun, dark: Moon };
const NEXT_MODE: Record<Mode, Mode> = { auto: "light", light: "dark", dark: "auto" };
const MODE_LABEL: Record<Mode, string> = { auto: "Following your device", light: "Light mode", dark: "Dark mode" };

export function AppShell({ children }: { children: ReactNode }) {
  const { data: meData } = useMe();
  const book = useBook();
  const theme = useTheme();
  const navigate = useNavigate();
  const ModeIcon = MODE_ICON[theme.mode];
  const scanEnabled = meData?.scanEnabled ?? false;
  const waiting = book ? book.pending.filter((r) => r.toId === book.me.id).length : 0;

  const onFiles = (files: FileList | null) => {
    if (!files?.length || !book) return;
    const n = enqueueScans(Array.from(files), book.me.id);
    if (n > 1) toast(`Reading ${n} receipts. Each one becomes its own bill.`);
    navigate("/add");
  };

  return (
    <>
      <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[640px] items-center gap-2.5 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="mark skin-only only-pink bg-accent text-accent-ink"><Heart className="size-4" fill="currentColor" /></span>
            <span className="mark skin-only only-vscode !rounded bg-accent font-mono text-sm font-extrabold text-white">{"{}"}</span>
            <span className="mark mark-dbz skin-only only-dbz" aria-hidden>★★<br />★★</span>
            <div className="min-w-0">
              <h1 className="whitespace-nowrap">Fridge Tab</h1>
              <p className="truncate text-xs text-muted">{book?.house.name ?? ""}</p>
            </div>
          </div>
          <button
            className="btn !size-[42px] !rounded-full !p-0"
            aria-label={`Theme: ${theme.mode}. Change`}
            onClick={() => {
              setTheme({ mode: NEXT_MODE[theme.mode] });
              toast(MODE_LABEL[NEXT_MODE[theme.mode]]);
            }}
          >
            <ModeIcon />
          </button>
          {book && (
            <NavLink to="/settings" aria-label={`You are ${book.me.name}. Settings`}>
              <Avatar member={book.me} />
            </NavLink>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-[640px] flex-col gap-[18px] px-4 pt-1.5 pb-[calc(140px+env(safe-area-inset-bottom))]">{children}</main>

      <nav className="tabbar" aria-label="Sections">
        <div className="mx-auto grid max-w-[640px] grid-cols-5 items-end">
          <Tab to="/" icon={<House />} label="Home" />
          <Tab to="/history" icon={<Receipt />} label="History" />
          <div>
            <button className="fab" aria-label={scanEnabled ? "Scan receipts" : "Add a bill"} onClick={() => navigate("/add")}>
              {scanEnabled ? <ScanLine /> : <Plus />}
            </button>
          </div>
          <Tab to="/requests" icon={<Inbox />} label="Requests" badge={waiting} />
          <Tab to="/settings" icon={<Settings />} label="Settings" />
        </div>
      </nav>

      <input id={SCAN_INPUT} type="file" accept="image/*" multiple hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
      <input id={CAMERA_INPUT} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
      <Sheets />
    </>
  );
}

function Tab({ to, icon, label, badge = 0 }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <NavLink to={to} end className="tab">
      {icon}
      <span>{label}</span>
      {badge > 0 && (
        <span className="absolute top-1.5 left-[calc(50%+6px)] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-owe px-1.5 text-[11px] font-bold text-white">{badge}</span>
      )}
    </NavLink>
  );
}
