import { History } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FilterSelect, RangeForm } from "@/components/app/range-form";
import { activityPeople, getActivity } from "@/lib/activity";
import { ACTIVITY_GROUP_LABELS, ACTIVITY_GROUPS, isActivityGroup } from "@/lib/audit-rules";
import { formatDateTime } from "@/lib/datetime";
import { stagger } from "@/lib/motion";
import { rolesFor } from "@/lib/permissions";
import { optionalRange, pageParam, param } from "@/lib/report-range";
import { requireRole } from "@/lib/session";
import { emptyListTitle } from "@/lib/words";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewActivity"));
  const sp = await searchParams;
  const range = optionalRange({ from: param(sp.from), to: param(sp.to) });
  const people = await activityPeople();
  const who = param(sp.who);
  const actorId = people.some((p) => p.id === who) ? who : "";
  const type = param(sp.type);
  const group = isActivityGroup(type) ? type : null;
  const page = pageParam(sp.page);
  const { rows, hasOlder } = await getActivity({ actorId, group, start: range.start, end: range.end, page });

  const link = (p: number) => {
    const q = new URLSearchParams();
    if (actorId) q.set("who", actorId);
    if (group) q.set("type", group);
    if (range.from) q.set("from", range.from);
    if (range.to) q.set("to", range.to);
    if (p > 0) q.set("page", String(p));
    const s = q.toString();
    return s ? `/activity?${s}` : "/activity";
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Activity" />
      <RangeForm from={range.from} to={range.to}>
        <div className="grid grid-cols-2 gap-2">
          <FilterSelect
            name="who"
            label="Person"
            value={actorId}
            options={[{ value: "", label: "Everyone" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <FilterSelect
            name="type"
            label="Type"
            value={group ?? ""}
            options={[
              { value: "", label: "All" },
              ...(Object.keys(ACTIVITY_GROUPS) as (keyof typeof ACTIVITY_GROUPS)[]).map((g) => ({ value: g, label: ACTIVITY_GROUP_LABELS[g] })),
            ]}
          />
        </div>
      </RangeForm>
      {rows.length === 0 ? (
        <EmptyState
          title={emptyListTitle({ dates: !!(range.from || range.to), other: !!(actorId || group) })}
          icon={History}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className="animate-in-up flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6"
              style={stagger(i)}
            >
              <span className="text-sm leading-snug font-medium [overflow-wrap:anywhere]">{r.sentence}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(r.createdAt)}
                {r.group ? ` · ${ACTIVITY_GROUP_LABELS[r.group]}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(page > 0 || hasOlder) && (
        <div className="flex items-center justify-between text-sm font-semibold">
          {page > 0 ? (
            <Link href={link(page - 1)} className="flex h-12 items-center px-2 text-primary">
              Newer
            </Link>
          ) : (
            <span />
          )}
          {hasOlder && (
            <Link href={link(page + 1)} className="flex h-12 items-center px-2 text-primary">
              Older
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
