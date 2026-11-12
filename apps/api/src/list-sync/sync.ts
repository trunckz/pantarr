// Two-way sync of an outside list with the shopping list, as a pure function (what to do, from what was seen at the
// last sync): the checked state follows the side that changed; an item removed from the shopping list (« we have it »,
// checked ones cleared) is checked over there; an item deleted over there leaves the shopping list unless already
// checked; new unchecked items over there are added (or linked to an identical unchecked item already in the list).
import type { ListItem } from "@pantarr/connector-sdk";
import { key } from "../common/text";

export interface Link { externalId: string; itemId: string; extChecked: boolean; itemChecked: boolean }
export interface Item { id: string; text: string; checked: boolean }

export interface Plan {
  /** Check / uncheck in the shopping list (checked = bought, for the pantry). */
  check: { itemId: string; checked: boolean }[];
  /** Remove from the shopping list. */
  remove: string[];
  /** Check / uncheck over there. */
  external: { id: string; checked: boolean }[];
  /** Items to create in the shopping list, then to link. */
  add: ListItem[];
  /** Links to keep or create, with the states after the sync. */
  links: Link[];
}

export function plan(links: Link[], outside: ListItem[], items: Item[]): Plan {
  const ext = new Map(outside.map((x) => [x.id, x])), inList = new Map(items.map((x) => [x.id, x]));
  const out: Plan = { check: [], remove: [], external: [], add: [], links: [] };
  const linked = new Set<string>(), used = new Set<string>();
  for (const l of links) {
    const e = ext.get(l.externalId), i = inList.get(l.itemId);
    linked.add(l.externalId);
    if (!e) { if (i && !i.checked) out.remove.push(i.id); continue; }              // deleted over there
    if (!i) { if (!e.checked) out.external.push({ id: e.id, checked: true }); continue; }   // left the shopping list
    used.add(i.id);
    let checked = i.checked;
    if (e.checked !== l.extChecked && e.checked !== i.checked) { out.check.push({ itemId: i.id, checked: e.checked }); checked = e.checked; }
    else if (i.checked !== l.itemChecked && e.checked !== i.checked) out.external.push({ id: e.id, checked: i.checked });
    out.links.push({ externalId: e.id, itemId: i.id, extChecked: checked, itemChecked: checked });
  }
  for (const e of outside) {
    if (linked.has(e.id) || e.checked || !e.text.trim()) continue;
    const same = items.find((i) => !i.checked && !used.has(i.id) && key(i.text.replace(/\(.*?\)/g, "")) === key(e.text));
    if (same) { used.add(same.id); out.links.push({ externalId: e.id, itemId: same.id, extChecked: false, itemChecked: false }); }
    else out.add.push(e);
  }
  return out;
}
