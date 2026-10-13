import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "@/components/AppShell";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useMe } from "@/lib/queries";
import { AddBills } from "@/pages/AddBills";
import { History } from "@/pages/History";
import { Home } from "@/pages/Home";
import { Requests } from "@/pages/Requests";
import { Settings } from "@/pages/Settings";
import { Welcome } from "@/pages/Welcome";

export function App() {
  const me = useMe();
  const T = useT();

  if (me.isPending) return <div className="grid min-h-dvh place-items-center text-muted">{T.openingTab}</div>;

  if (me.isError) {
    if (!(me.error instanceof ApiError) || me.error.status !== 401) {
      return (
        <div className="mx-auto grid min-h-dvh max-w-[440px] place-items-center px-4">
          <div className="note note-err">
            <span className="flex-1">{(me.error as Error).message}</span>
            <button className="btn" onClick={() => me.refetch()}>{T.tryAgain}</button>
          </div>
        </div>
      );
    }
    return (
      <Welcome />
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/add" element={<AddBills />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/settings" element={<Settings />} />
        {/* Already logged in: an invite link just opens the app. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
