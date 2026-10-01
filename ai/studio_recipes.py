"""Prompt material that lifts Product Studio output from 'competent template' to 'premium': screen recipes (which kit components each kind
of screen must use), a reference screen showing the quality bar, curated design directions for the designer, and a deterministic check
that the generated app actually used the kit."""
import re

# ---------------------------------------------------------------- design directions (the designer adapts one to the product)

DIRECTIONS = """DESIGN DIRECTIONS — pick ONE that fits the product, audience and the founder's requirements, then make it your own. INVENT your own exact hex values (never reuse a generic or remembered palette) so no two products share a colour scheme.
MODE: choose LIGHT by default. Choose dark only for products used for long sessions in low light or by a technical/creative audience (developer tools, trading, music/media, creative pro tools), and say why in `reasoning`. Words in the brief like calm, clinical, editorial, warm, fresh, lifestyle, trustworthy all point to light.
- Ivory editorial (light): warm off-white page (hue ~40, lightness ~96%), a slightly brighter card, near-black warm foreground, warm grey secondary text, hairline beige borders; ONE accent such as burnt copper, oxblood or deep ink. Display serif headings (Fraunces, Instrument Serif, Newsreader) + a clean grotesk body (Hanken Grotesk, Inter Tight).
- Sand & terracotta (light, warm lifestyle/consumer): sandy cream page, white-ish cards, terracotta or clay accent, olive success. Headings Bricolage Grotesque or DM Serif Display, body Plus Jakarta Sans.
- Porcelain & forest (light): very pale green-grey page, white cards, deep forest-green accent, soft mint accent surface. Headings Fraunces or Bricolage Grotesque, body Hanken Grotesk.
- Blush & plum (light, wellness/beauty/community): pale blush page, warm white cards, deep plum accent, rose tint surface. Headings Playfair Display or Fraunces, body Manrope.
- Pale sky & navy (light, finance/trust/enterprise): cool near-white page with a hint of blue, white cards, deep navy foreground, one bright cobalt or teal accent. Headings Sora or Manrope, body Inter Tight.
- Slate & citrus (light, high-energy): cool light grey page, white cards, deep navy emphasis surfaces, one citrus orange or lime accent. Headings Manrope or DM Sans with tight tracking.
- Midnight & signal (dark): deep blue-black page, slightly lighter cards, soft off-white text, ONE electric accent (lime, aqua or amber). Headings Space Grotesk, Sora or Geist; mono accents in JetBrains Mono.
- Warm graphite (dark, calm): dark brown-grey page and cards, parchment text, a soft gold or terracotta accent. Headings Instrument Serif or Fraunces, body Inter Tight.
CRAFT RULES: neutrals are TINTED (warm or cool), never pure white/black backgrounds and never flat grey. The accent covers under 10% of any screen (primary actions, active states, key data); everything else is neutral. Borders are hairline and low-contrast. Pair a characterful heading font with a quiet body font. Success/warning/destructive are muted and sit inside the palette (and are never the same hue as the accent). Say which direction you chose and how you changed it."""

# ---------------------------------------------------------------- screen recipes (the UI engineer must follow the one matching each screen)

RECIPES = """SCREEN RECIPES — every screen follows the recipe for its kind, using the kit components named (this is what makes the product look designed, not assembled):
- WORK TOOLS (CRM, ops, finance, admin, analytics, practice management...): every screen wrapped in AppShell (brand, nav from the blueprint with icons and groups, user, actions with a search/command button and a primary action). Exceptions: a pre-login landing page or onboarding wizard. Add CommandPalette with useHotkey('k') when there are 5+ screens.
- CONSUMER / MARKETPLACE / CONTENT products (browse, discover, swap, shop, book, learn): wrap screens in ConsumerShell (top bar with brand, links, search and a primary action; bottom tab bar on mobile). They are NOT dashboards: no StatCard rows or admin tables on the main flows.
- ALWAYS: icon-only buttons get a Tooltip and aria-label. Every action confirms with a toast.
- Overview / dashboard / home: PageHeader (title, one-line description in the product's language, primary action) + a row of 3-4 StatCard (domain labels, believable numbers, deltas) + at least one chart (LineChart for trends, BarChart for comparisons, DonutChart for composition) inside a Card with CardTitle + a DataTable or Timeline of recent activity. An Alert for the one thing that needs attention.
- List / records / directory: PageHeader with the primary action + DataTable (searchable, sortable columns, Badge for status, Avatar for people, DropdownMenu for row actions, onRowClick opening a Sheet or detail route) + a designed EmptyState. Filters as Tabs or Select above the table. ONE search input per screen: use the DataTable `searchable` prop OR your own, never both.
- Detail / profile: Breadcrumb + PageHeader + Tabs (Overview, Activity, Notes...) + Card sections with key facts + Timeline for history + related records in a compact DataTable.
- Board / pipeline / kanban: columns in a horizontal scroll row (`flex gap-4 overflow-x-auto snap-x`, each column `min-w-[17rem] w-[85vw] sm:w-72 shrink-0 snap-start`); column height follows its content (no min-height, no empty tall boxes); cards carry Badge, Avatar and a value; a Sheet opens the card.
- Settings / account: Tabs or stacked Cards per section (Profile, Notifications, Plan, Danger zone) using Input, Switch, Checkbox, RadioGroup, Select; the destructive area in an Alert tone="destructive" Card.
- Browse / discover / feed (consumer): a search + filter row (Tabs or pill buttons), then a responsive grid (grid-cols-2 lg:grid-cols-4) of ListingCard with Photo, a Badge overlay (distance, price, condition), meta line and a quick action; a Sheet or detail route for a listing; designed EmptyState. Leading with imagery matters more than data.
- Landing / first-run / onboarding: Hero (eyebrow, outcome headline, supporting line, primary + secondary CTA, an `aside` with a product mock built from Cards) + a grid of FeatureCard + a social-proof strip (initials Avatars, plausible quotes) + a closing CTA band.
- Forms: Label above every field, helper text, inline validation messages, Button with loading, never an unstyled input.
- Onboarding never blocks the app with a half-built screen: after the first step the user lands on a populated home. Never use emoji as icons or imagery: use Icon or Photo.
- Mobile (390px): stack cards, keep tables scrollable inside their Card, use full-width primary buttons, never leave large empty areas."""

HOOKS = """REACT RULES that crash the app if broken: call EVERY hook (useState, useEffect, useMemo, useLocalState, useRoute, useToast, useLoading...) at the top of the component, before any `return`. Never write `if (cond) { return ... }` above a later hook (onboarding gates and loading states must come after all hooks). Never call hooks inside loops, conditions or callbacks."""

PREMIUM = """PREMIUM QUALITY BAR (the product must feel like a $10k/year tool, not a template):
- A clear type scale: page title text-2xl/3xl font-heading, section titles text-lg, body text-sm, captions text-xs text-muted-foreground. Numbers use tabular-nums. Only 2 font weights per screen region.
- Spacing on an 8px rhythm: p-5/p-6 cards, gap-4/gap-6 between blocks, generous section spacing; never cramped, never sparse.
- Depth and finish: use the kit's cards (hairline border + soft layered shadow), subtle hover states (hover:bg-muted/50, hover:border-foreground/20), 150ms transitions, focus rings. One restrained gradient or glow (bg-primary/10 blur) is allowed as an accent, never rainbow gradients.
- Colour: only the design tokens; text-muted-foreground for secondary text; status colours via Badge tones. No raw hex, no default Tailwind palette classes like bg-blue-500, indigo-*, gray-*, slate-*.
- Content is specific: real-sounding names, amounts, dates and statuses in the product's vocabulary, 8-15 records per list. No lorem ipsum, 'Item 1', 'John Doe', 'Acme' filler, or generic stats (Users/Revenue/Growth) unless the product is analytics.
- No emoji as icons, avatars or photos (use lucide Icon, Avatar initials or Photo). Delight: tasteful entrance animation (`anim-in`), skeletons on first load (useLoading), designed empty states with a next step, toasts on actions, keyboard shortcut hints where natural."""

# ---------------------------------------------------------------- reference screen (shows structure and polish; the domain is unrelated on purpose)

EXAMPLE = r"""REFERENCE SCREEN — shows the structure, kit usage and polish expected. Its domain, copy and palette are unrelated to your product: copy the quality, NEVER the content.
const ORDERS = [
  { id: 'RL-2041', customer: 'Hollow Oak Café', roast: 'Ethiopia Guji · 5kg', total: 412, status: 'Shipped', city: 'Bristol' },
  { id: 'RL-2040', customer: 'Common Ground', roast: 'House Blend · 10kg', total: 560, status: 'Roasting', city: 'Leeds' },
  { id: 'RL-2039', customer: 'Fieldnotes Bakery', roast: 'Colombia Huila · 2kg', total: 148, status: 'Pending', city: 'Bath' },
];
const STATUS_TONE = { Shipped: 'success', Roasting: 'warning', Pending: 'muted' };
function Overview() {
  const { toast } = useToast();
  const loading = useLoading(600);
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useLocalState('orders', ORDERS);
  const [draft, setDraft] = useState({ customer: '', roast: '' });
  const add = () => { if (!draft.customer.trim()) return; setOrders([{ id: 'RL-' + (2042 + orders.length), ...draft, total: 220, status: 'Pending', city: 'Bristol' }, ...orders]); setOpen(false); setDraft({ customer: '', roast: '' }); toast({ title: 'Order created', description: draft.customer }); };
  return (
    <div className="anim-in">
      <PageHeader title="Good morning, Maya" description="Four batches roast today; two wholesale orders are waiting on you." actions={<Button onClick={() => setOpen(true)}><Icon name="Plus" />New order</Button>} />
      <Alert tone="warning" title="Ethiopia Guji is down to 6kg">At this week's pace you run out Thursday. Reorder green beans from Cafe Imports.</Alert>
      {loading ? <div className="mt-4 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Revenue this week" value="£4,860" delta={12} icon="PoundSterling" hint="vs last week" />
          <StatCard label="Kg roasted" value="212" delta={5} icon="Flame" hint="38 batches" />
          <StatCard label="Open orders" value="9" delta={-2} icon="PackageOpen" hint="2 overdue" />
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2"><CardTitle className="mb-1">Wholesale revenue</CardTitle><CardDescription className="mb-4">Last 8 weeks</CardDescription>
          <LineChart data={[3.1, 3.4, 3.2, 3.9, 4.1, 4.0, 4.5, 4.9].map((v, i) => ({ label: 'W' + (i + 1), value: v }))} format={(v) => '£' + v + 'k'} /></Card>
        <Card className="p-5"><CardTitle className="mb-4">Sales by roast</CardTitle>
          <DonutChart size={116} centerValue="212kg" data={[{ label: 'Single origin', value: 94 }, { label: 'House blend', value: 78 }, { label: 'Decaf', value: 40 }]} /></Card>
      </div>
      <h2 className="mb-3 mt-8 font-heading text-lg font-semibold">Recent orders</h2>
      <DataTable searchable searchPlaceholder="Search orders" rows={orders} pageSize={6} onRowClick={(r) => toast(r.customer)}
        columns={[
          { key: 'customer', label: 'Customer', sortable: true, render: (r) => <div className="flex items-center gap-3"><Avatar name={r.customer} /><div><p className="font-medium">{r.customer}</p><p className="text-xs text-muted-foreground">{r.city}</p></div></div> },
          { key: 'roast', label: 'Roast' },
          { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
          { key: 'total', label: 'Total', sortable: true, align: 'right', render: (r) => '£' + r.total },
        ]} />
      <Sheet open={open} onClose={() => setOpen(false)} title="New wholesale order" description="Add an order to this week's roast plan.">
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="c">Customer</Label><Input id="c" value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} placeholder="Hollow Oak Café" /></div>
          <div className="space-y-1.5"><Label htmlFor="r">Roast and quantity</Label><Input id="r" value={draft.roast} onChange={(e) => setDraft({ ...draft, roast: e.target.value })} placeholder="Ethiopia Guji · 5kg" /></div>
          <Button className="w-full" onClick={add}>Create order</Button>
        </div>
      </Sheet>
    </div>
  );
}
function Orders() {
  const [orders] = useLocalState('orders', ORDERS);
  return (<div className="anim-in"><PageHeader title="Orders" description="Every wholesale order, newest first." /><DataTable rows={orders} searchable columns={[{ key: 'id', label: 'Order', sortable: true }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> }]} /></div>);
}
function Settings() {
  const [digest, setDigest] = useLocalState('digest', true);
  return (<div className="anim-in"><PageHeader title="Settings" /><Card className="flex items-center justify-between p-5"><div><p className="font-medium">Weekly roast digest</p><p className="text-sm text-muted-foreground">Email every Monday.</p></div><Switch checked={digest} onChange={setDigest} label="Weekly digest" /></Card></div>);
}
function App() {
  const [route] = useRoute(); // every nav route renders a screen, and '/' is the home screen
  return (
    <AppShell brand="Roastline" user={{ name: 'Maya Okafor', email: 'maya@roastline.co' }}
      nav={[{ label: 'Overview', to: '/', icon: 'LayoutDashboard', group: 'Workspace' }, { label: 'Orders', to: '/orders', icon: 'PackageOpen', group: 'Workspace', badge: 9 }, { label: 'Settings', to: '/settings', icon: 'Settings', group: 'Account' }]}>
      {route === '/' && <Overview />}
      {route === '/orders' && <Orders />}
      {route === '/settings' && <Settings />}
    </AppShell>
  );
}"""

# ---------------------------------------------------------------- deterministic kit-usage check

LAYOUT = {"AppShell"}
CONSUMER = {"ConsumerShell", "ListingCard", "Photo"}
CORE = ["PageHeader", "StatCard", "DataTable", "Sheet", "Tabs", "DropdownMenu", "Tooltip", "Timeline", "Alert", "Badge", "Avatar", "EmptyState", "Skeleton",
        "LineChart", "BarChart", "DonutChart", "Dialog", "Breadcrumb", "Accordion", "Switch", "Checkbox", "RadioGroup", "Hero", "FeatureCard"]


def hook_order_issues(code: str) -> list[str]:
    """Components that return early before a later hook: React crashes ('rendered more hooks') the moment the early-return condition flips."""
    out = []
    for part in re.split(r"(?m)^(?=(?:function|const) [A-Z]\w*\s*(?:=|\())", code):
        m = re.match(r"(?:function|const) ([A-Z]\w*)", part)
        if not m:
            continue
        early, in_if = False, False
        for ln in part.split("\n")[1:]:
            if re.match(r"^  (?:if|else if) \(.*\)\s*return\b", ln):
                early = True
            elif re.match(r"^  (?:if|else if) \(.*\)\s*\{\s*$", ln):
                in_if = True
            elif in_if and re.match(r"^    return\b", ln):
                early, in_if = True, True
            elif in_if and re.match(r"^  \}", ln):
                in_if = False
            elif early and re.match(r"^  .*\buse[A-Z]\w*\(", ln):
                out.append(m[1])
                break
    return out


HTML_TAGS = set("""a abbr address article aside audio b blockquote body br button canvas caption cite code col colgroup dd del details dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i iframe img input ins kbd label legend li main mark menu nav ol optgroup option output p picture pre progress q s samp section select small source span strong sub summary sup table tbody td template textarea tfoot th thead time tr u ul var video
svg g path circle ellipse line polygon polyline rect text tspan defs use symbol marker mask pattern clipPath linearGradient radialGradient stop filter feGaussianBlur feOffset feBlend feColorMatrix foreignObject animate animateTransform title desc""".split())


def unknown_tags(code: str) -> list[str]:
    """Lowercase JSX tags that are not HTML/SVG (model typos such as <py> for <td>): they render as unstyled inline junk and break layouts."""
    return sorted({t for t in re.findall(r"(?<![\w)\]])<([a-z][A-Za-z0-9]*)(?=[\s/>])", code) if t not in HTML_TAGS})


def kit_gaps(code: str, nav_items: int, consumer: bool = False) -> list[str]:
    """What a generated app got wrong against the kit and React rules. Empty list = acceptable."""
    used = {n for n in LAYOUT | CONSUMER | set(CORE) if re.search(rf"<{n}[\s/>]", code)}
    gaps = []
    if consumer:
        if not used & {"ConsumerShell", "AppShell"}:
            gaps.append("wrap every screen in <ConsumerShell> (top bar with links and actions, bottom tab bar on mobile) instead of hand-building navigation")
        if not used & {"ListingCard", "Photo"}:
            gaps.append("lead with imagery: browse grids of <ListingCard> with <Photo>, not text-only cards")
        need = 6
    else:
        if nav_items >= 3 and "AppShell" not in used:
            gaps.append("wrap every screen in <AppShell> (brand, nav, user, actions) instead of hand-building a sidebar")
        if not used & {"LineChart", "BarChart", "DonutChart", "Sparkline", "DataTable"}:
            gaps.append("add real data presentation: a <DataTable> for records and/or a chart (LineChart, BarChart, DonutChart) with domain data")
        need = 7
    distinct = len(used & (set(CORE) | CONSUMER))
    if distinct < need:
        gaps.append(f"use more kit components: only {distinct} distinct ones are used and at least {need} are required")
    if not re.search(r"\bdefault\s*:", code) and not re.search(r"""(?:route|pathname|path|r)\s*===?\s*['"]/['"]|case\s+['"]/['"]|['"]/['"]\s*:|['"]/['"]\s*\?""", code):
        gaps.append("no screen is rendered for the default route '/': the home screen MUST render at route '/' (useRoute returns '/' on first load), otherwise the app opens blank")
    for t in unknown_tags(code):
        gaps.append(f"<{t}> is not a real HTML tag (a typo?): fix every <{t}> to the element you meant")
    for name in hook_order_issues(code):
        gaps.append(f"{name} returns early before later hooks run, which crashes React when the condition changes: move every hook above any `return`, and put onboarding/loading gates after the hooks")
    if re.search(r"[\U0001F300-\U0001FAFF]", code):
        gaps.append("remove emoji used as icons or imagery: use <Icon>, <Avatar> or <Photo>")
    return gaps


# ---------------------------------------------------------------- generic-palette detector (the designer gets one forced retry)

def generic_palette(palette: dict) -> str | None:
    """Why a palette reads as a template, or None. Catches the two tells: the default indigo/violet accent and untinted pure white/black or flat zinc neutrals."""
    import colorsys

    def hls(h):
        h = str(h or "").lstrip("#")
        if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
            return None
        return colorsys.rgb_to_hls(*(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)))

    problems = []
    p, bg = hls(palette.get("primary")), hls(palette.get("background"))
    if p and 0.65 <= p[0] <= 0.79 and p[2] >= 0.4 and 0.3 <= p[1] <= 0.7:
        problems.append("the primary colour is the default indigo/violet that marks template SaaS: choose a different, purposeful accent (copper, forest, citrus, signal lime, teal, gold...)")
    if bg:
        raw = str(palette.get("background")).lstrip("#").lower()
        if raw in {"ffffff", "fafafa", "f8fafc", "f9fafb", "000000", "09090b", "0a0a0a", "111111", "18181b"} or (bg[2] < 0.04 and (bg[1] > 0.97 or bg[1] < 0.03)):
            problems.append("the background is an untinted default (pure white/black or flat zinc/slate): use a deliberately tinted neutral from one of the design directions")
    return "; ".join(problems) or None


# ---------------------------------------------------------------- guards against the designer's habits (dark mode, repeated palettes)

DARK_OK = re.compile(r"developer|engineer|\bcode\b|coding|terminal|devops|trading|trader|crypto|music|audio|video|stream|gaming|\bgame|photograph|creative|film|podcast|security|cyber|night|data scien", re.I)


def dark_unjustified(mode: str, brief: str) -> str | None:
    """Dark is the model's reflex. It is only right for developer, trading, media, gaming and creative-pro audiences."""
    if mode == "dark" and not DARK_OK.search(brief):
        return ("dark mode was chosen but this is not a developer, trading, music/media, gaming or creative-pro product: choose a LIGHT direction (ivory, sand, porcelain, blush, pale sky or slate & citrus) "
                "with a tinted off-white page")
    return None


def palette_clash(palette: dict, prior: list[dict]) -> str | None:
    """Rejects a palette that is (nearly) the same as one an earlier product by this founder already uses."""
    def rgb(h):
        h = str(h or "").lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) if re.fullmatch(r"[0-9a-fA-F]{6}", h) else (0, 0, 0)

    def dist(a, b):
        return sum((x - y) ** 2 for x, y in zip(rgb(a), rgb(b))) ** 0.5

    for pr in prior:
        p = pr["palette"]
        same_page = dist(palette.get("background"), p.get("background")) < 18
        if (same_page and (dist(palette.get("card"), p.get("card")) < 18 or dist(palette.get("primary"), p.get("primary")) < 70)) or (
                dist(palette.get("primary"), p.get("primary")) < 35 and dist(palette.get("background"), p.get("background")) < 60):
            return f"its colour scheme is nearly the same as the earlier product '{pr['name']}': invent a visibly different page colour, card colour and accent for this product"
    return None
