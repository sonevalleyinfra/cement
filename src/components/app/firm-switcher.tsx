import { cookies } from "next/headers";
import { getAccessibleFirms } from "@/lib/firm-access";
import { ALL_FIRMS, FIRM_COOKIE, resolveFirmSelection } from "@/lib/firm-selection";
import { isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { FirmSwitcherClient } from "./firm-switcher-client";

/** The current firm choice for this request (use in pages to scope data). */
export async function getFirmSelection() {
  const { user } = await requireUser();
  const firms = await getAccessibleFirms(user.id, user.role);
  const cookieValue = (await cookies()).get(FIRM_COOKIE)?.value;
  return { firms, selection: resolveFirmSelection(cookieValue, firms.map((f) => f.id), isAdmin(user.role)), admin: isAdmin(user.role) };
}

/** Put this in `AppShell`'s `headerRight`. Hidden when the user has no firms. */
export async function FirmSwitcher() {
  const { firms, selection, admin } = await getFirmSelection();
  if (firms.length === 0) return null;
  return (
    <FirmSwitcherClient
      firms={firms.map((f) => ({ id: f.id, name: f.name, slot: f.slot }))}
      selectedId={selection.mode === "all" ? ALL_FIRMS : selection.firmId}
      canSelectAll={admin}
    />
  );
}
