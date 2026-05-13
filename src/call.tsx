import {
  Action,
  ActionPanel,
  Icon,
  LaunchProps,
  List,
  open,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Contact, clearContactsCache, loadContacts } from "./contacts";
import { frecencyScore, getFrecency, recordCall } from "./frecency";

type FrecencyMap = Awaited<ReturnType<typeof getFrecency>>;

type CallArgs = { name?: string };

function matchesQuery(contact: Contact, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (contact.name.toLowerCase().includes(q)) return true;
  return contact.phones.some((p) => p.value.includes(q));
}

function rankByQueryRelevance(
  contacts: Contact[],
  query: string,
  frecency: FrecencyMap,
): Contact[] {
  const q = query.toLowerCase();
  return [...contacts].sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    const aStarts = an.startsWith(q)
      ? 0
      : an.split(/\s+/).some((w) => w.startsWith(q))
        ? 1
        : 2;
    const bStarts = bn.startsWith(q)
      ? 0
      : bn.split(/\s+/).some((w) => w.startsWith(q))
        ? 1
        : 2;
    if (aStarts !== bStarts) return aStarts - bStarts;
    const sa = bestScoreForContact(a, frecency);
    const sb = bestScoreForContact(b, frecency);
    if (sa !== sb) return sb - sa;
    return a.name.localeCompare(b.name);
  });
}

function bestScoreForContact(c: Contact, frecency: FrecencyMap): number {
  let best = 0;
  for (const phone of c.phones) {
    const score = frecencyScore(frecency[`${c.id}::${phone.value}`]);
    if (score > best) best = score;
  }
  return best;
}

function rankContacts(contacts: Contact[], frecency: FrecencyMap): Contact[] {
  return [...contacts].sort((a, b) => {
    const sa = bestScoreForContact(a, frecency);
    const sb = bestScoreForContact(b, frecency);
    if (sa !== sb) return sb - sa;
    return a.name.localeCompare(b.name);
  });
}

export default function Command(props: LaunchProps<{ arguments: CallArgs }>) {
  const initialQuery = props.arguments?.name?.trim() ?? "";
  const [searchText, setSearchText] = useState(initialQuery);

  const {
    data: contacts,
    isLoading,
    revalidate,
  } = useCachedPromise(loadContacts, [false], {
    initialData: [] as Contact[],
  });

  const [frecency, setFrecency] = useState<FrecencyMap>({});
  useEffect(() => {
    getFrecency()
      .then(setFrecency)
      .catch(async (err) => {
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not load call history",
          message: String(err),
        });
      });
  }, []);

  async function dial(
    contactId: string,
    phoneValue: string,
    scheme: "tel" | "facetime-audio" | "facetime",
  ) {
    await recordCall(contactId, phoneValue);
    try {
      await open(`${scheme}:${phoneValue}`);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not start call",
        message: String(err),
      });
    }
  }

  const filtered = useMemo(() => {
    const base = contacts ?? [];
    if (!searchText) return rankContacts(base, frecency);
    const matches = base.filter((c) => matchesQuery(c, searchText));
    return rankByQueryRelevance(matches, searchText, frecency);
  }, [contacts, frecency, searchText]);

  const autoDialedRef = useRef(false);
  useEffect(() => {
    if (autoDialedRef.current) return;
    if (!initialQuery) return;
    if (isLoading) return;
    if (filtered.length !== 1) return;
    const target = filtered[0];
    const primary = target.phones[0];
    autoDialedRef.current = true;
    (async () => {
      await dial(target.id, primary.value, "tel");
      await popToRoot();
    })();
  }, [initialQuery, isLoading, filtered]);

  const ranked = filtered;

  async function refresh() {
    await showToast({
      style: Toast.Style.Animated,
      title: "Refreshing contacts…",
    });
    await clearContactsCache();
    await revalidate();
    setFrecency(await getFrecency());
    await showToast({
      style: Toast.Style.Success,
      title: "Contacts refreshed",
    });
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search contacts…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {ranked.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.PersonCircle}
          title="No contacts with phone numbers"
          description="Grant Contacts access in System Settings → Privacy & Security → Contacts, then refresh."
          actions={
            <ActionPanel>
              <Action
                title="Refresh Contacts"
                icon={Icon.ArrowClockwise}
                onAction={refresh}
              />
            </ActionPanel>
          }
        />
      ) : (
        ranked.map((c) => {
          const primary = c.phones[0];
          return (
            <List.Item
              key={c.id}
              icon={Icon.Person}
              title={c.name}
              subtitle={`${primary.label} · ${primary.value}`}
              keywords={c.phones.map((p) => p.value)}
              accessories={
                c.phones.length > 1
                  ? [{ text: `${c.phones.length} numbers` }]
                  : undefined
              }
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action
                      title={`Call ${primary.label}`}
                      icon={Icon.Phone}
                      onAction={() => dial(c.id, primary.value, "tel")}
                    />
                  </ActionPanel.Section>
                  {c.phones.length > 1 && (
                    <ActionPanel.Section title="Other numbers">
                      {c.phones.slice(1).map((p, idx) => (
                        <Action
                          key={`${idx}-${p.label}-${p.value}`}
                          title={`Call ${p.label} · ${p.value}`}
                          icon={Icon.Phone}
                          onAction={() => dial(c.id, p.value, "tel")}
                        />
                      ))}
                    </ActionPanel.Section>
                  )}
                  <ActionPanel.Section>
                    <Action
                      title="FaceTime Audio"
                      icon={Icon.Microphone}
                      shortcut={{ modifiers: ["cmd"], key: "a" }}
                      onAction={() =>
                        dial(c.id, primary.value, "facetime-audio")
                      }
                    />
                    <Action
                      title="FaceTime Video"
                      icon={Icon.Video}
                      shortcut={{ modifiers: ["cmd"], key: "v" }}
                      onAction={() => dial(c.id, primary.value, "facetime")}
                    />
                    <Action.CopyToClipboard
                      title="Copy Number"
                      content={primary.value}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      title="Refresh Contacts"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={refresh}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
