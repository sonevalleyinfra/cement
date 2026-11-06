/** A list group's small heading, with how many it holds. */
export function GroupCaption({
  id,
  label,
  count,
  as: Tag = "h2",
}: {
  id?: string;
  label: string;
  count?: number;
  as?: "h2" | "h3";
}) {
  return (
    <Tag id={id} className="flex items-baseline gap-2 px-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {count !== undefined && <span className="tabular text-xs text-muted-foreground">{count}</span>}
    </Tag>
  );
}
