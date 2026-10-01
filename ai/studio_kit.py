"""Product Studio runtime: turns a design spec + generated app code into one runnable HTML file (Tailwind + React,
shadcn-style component kit, design tokens), then runs it in a browser and screenshots it on desktop/tablet/mobile."""
import json
import re

import core

# ---------------------------------------------------------------- design tokens

# Every semantic colour the kit uses. The Product Designer agent supplies the first group; the rest are derived.
TOKEN_NAMES = ["background", "foreground", "card", "primary", "primary_foreground", "secondary", "muted", "muted_foreground",
               "accent", "border", "destructive", "success", "warning"]
DEFAULTS = {"background": "#ffffff", "foreground": "#0f172a", "card": "#ffffff", "primary": "#4f46e5", "primary_foreground": "#ffffff",
            "secondary": "#f1f5f9", "muted": "#f1f5f9", "muted_foreground": "#64748b", "accent": "#eef2ff", "border": "#e2e8f0",
            "destructive": "#dc2626", "success": "#16a34a", "warning": "#d97706"}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _rgb(h: str) -> str:
    return " ".join(str(int(h[i:i + 2], 16)) for i in (1, 3, 5))


def norm_hex(v) -> str | None:
    """'#0c0d0e', '0c0d0e' and '#fff' all become '#rrggbb'; anything else is None (model output lands inside a <style> block)."""
    v = str(v or "").strip().lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{3}", v):
        v = "".join(c * 2 for c in v)
    return "#" + v.lower() if re.fullmatch(r"[0-9a-fA-F]{6}", v) else None


def clean_palette(palette: dict) -> dict:
    return {k: norm_hex(palette.get(k)) or DEFAULTS[k] for k in TOKEN_NAMES}


def _font(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9 ]", "", name or "").strip() or "Inter"


def _lum(h: str) -> float:
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a: str, b: str) -> float:
    hi, lo = sorted((_lum(a), _lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _mix(a: str, b: str, t: float) -> str:
    return "#" + "".join(f"{round(int(a[i:i + 2], 16) * (1 - t) + int(b[i:i + 2], 16) * t):02x}" for i in (1, 3, 5))


def _readable(fg: str, bgs: list[str], ratio: float, toward: str) -> str:
    for step in range(11):
        c = _mix(fg, toward, step / 10)
        if all(_contrast(c, bg) >= ratio for bg in bgs):
            return c
    return toward


def fix_contrast(p: dict) -> dict:
    """Accessibility guard: the model picks the palette, but text colours are nudged until they meet WCAG AA."""
    bgs = [p["background"], p["card"]]
    p["foreground"] = _readable(p["foreground"], bgs, 7, "#000000" if _lum(p["background"]) > 0.4 else "#ffffff")
    p["muted_foreground"] = _readable(p["muted_foreground"], bgs + [p["muted"]], 4.5, p["foreground"])
    white, black = "#ffffff", "#000000"
    if _contrast(p["primary_foreground"], p["primary"]) < 4.5:
        p["primary_foreground"] = white if _contrast(white, p["primary"]) >= _contrast(black, p["primary"]) else black
    return p


def tokens(spec: dict) -> dict:
    p = fix_contrast(clean_palette(spec.get("palette", {})))
    return {**p, "card_foreground": p["foreground"], "secondary_foreground": p["foreground"], "accent_foreground": p["foreground"],
            "destructive_foreground": "#ffffff", "input": p["border"], "ring": p["primary"]}


# ---------------------------------------------------------------- component kit (shadcn-style, written for Babel standalone)

KIT = r"""
const { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, Fragment } = React;
const cn = (...a) => a.flat(Infinity).filter(Boolean).join(' ');

const Icon = ({ name, className = 'h-4 w-4', ...p }) => {
  const L = window.LucideReact || {};
  const C = L[name] || L.Circle;
  return C ? <C className={className} aria-hidden="true" {...p} /> : null;
};
const Spinner = ({ className = 'h-4 w-4' }) => <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" /><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>;

const buttonVariants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.18)]',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-border bg-card shadow-[0_1px_1px_rgb(0_0_0/0.04)] hover:bg-muted',
  ghost: 'hover:bg-muted',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  link: 'text-primary underline-offset-4 hover:underline',
};
const buttonSizes = { default: 'h-10 px-4 text-sm', sm: 'h-8 px-3 text-xs', lg: 'h-12 px-6 text-base', icon: 'h-10 w-10' };
const Button = React.forwardRef(({ variant = 'default', size = 'default', className, loading, children, ...p }, ref) => (
  <button ref={ref} type="button" {...p} disabled={loading || p.disabled}
    className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50', buttonVariants[variant], buttonSizes[size], className)}>
    {loading && <Spinner />}{children}
  </button>
));

const Card = ({ className, ...p }) => <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04),0_14px_32px_-18px_rgb(0_0_0/0.14)]', className)} {...p} />;
const CardHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1.5 p-5', className)} {...p} />;
const CardTitle = ({ className, ...p }) => <h3 className={cn('font-heading text-base font-semibold leading-tight tracking-tight', className)} {...p} />;
const CardDescription = ({ className, ...p }) => <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
const CardContent = ({ className, ...p }) => <div className={cn('p-5 pt-0', className)} {...p} />;
const Badge = ({ className, tone = 'default', ...p }) => {
  const tones = { default: 'bg-primary/10 text-primary', muted: 'bg-muted text-muted-foreground', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', destructive: 'bg-destructive/10 text-destructive', outline: 'border border-border text-foreground' };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...p} />;
};
const Label = ({ className, ...p }) => <label className={cn('text-sm font-medium leading-none', className)} {...p} />;
const fieldCls = 'w-full rounded-md border border-border bg-card px-3 text-sm transition-shadow hover:border-foreground/25 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const Input = React.forwardRef(({ className, ...p }, ref) => <input ref={ref} className={cn(fieldCls, 'h-10', className)} {...p} />);
const Textarea = ({ className, ...p }) => <textarea className={cn(fieldCls, 'min-h-[88px] py-2', className)} {...p} />;
const Select = ({ className, children, ...p }) => <select className={cn(fieldCls, 'h-10', className)} {...p}>{children}</select>;
const Separator = ({ className }) => <div role="separator" className={cn('h-px w-full bg-border', className)} />;
const Skeleton = ({ className }) => <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-muted', className)} />;
const Progress = ({ value = 0, className }) => <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}><div className="h-full rounded-full bg-primary transition-all" style={{ width: value + '%' }} /></div>;
const Avatar = ({ name = '?', className }) => <span aria-hidden="true" className={cn('inline-grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary', className)}>{name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>;
const Switch = ({ checked, onChange, label }) => <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', checked ? 'bg-primary' : 'bg-border')}><span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform', checked && 'translate-x-5')} /></button>;

const TabsCtx = createContext({});
const Tabs = ({ value, onValueChange, children, className }) => <TabsCtx.Provider value={{ value, onValueChange }}><div className={className}>{children}</div></TabsCtx.Provider>;
const TabsList = ({ className, ...p }) => <div role="tablist" className={cn('inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1', className)} {...p} />;
const TabsTrigger = ({ value, children, className }) => { const c = useContext(TabsCtx); const on = c.value === value; return <button type="button" role="tab" aria-selected={on} onClick={() => c.onValueChange(value)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground', className)}>{children}</button>; };
const TabsContent = ({ value, children, className }) => { const c = useContext(TabsCtx); return c.value === value ? <div role="tabpanel" className={className}>{children}</div> : null; };

const Dialog = ({ open, onClose, title, description, children, className }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current && ref.current.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cn('anim-in relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-card p-6 shadow-xl outline-none sm:rounded-xl', className)}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 className="font-heading text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><Icon name="X" /></Button>
        </div>
        {children}
      </div>
    </div>
  );
};

const ToastCtx = createContext({ toast: () => {} });
const useToast = () => useContext(ToastCtx);
const ToastProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, ...(typeof t === 'string' ? { title: t } : t) }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((i) => <div key={i.id} className="anim-in rounded-lg border border-border bg-card p-3 shadow-lg"><p className="text-sm font-medium">{i.title}</p>{i.description && <p className="mt-0.5 text-xs text-muted-foreground">{i.description}</p>}</div>)}
      </div>
    </ToastCtx.Provider>
  );
};

const EmptyState = ({ icon = 'Inbox', title, description, action }) => (
  <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
    <div className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon name={icon} className="h-5 w-5" /></div>
    <h3 className="font-heading text-base font-semibold">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
const ErrorState = ({ title = 'Something went wrong', description = 'We could not load this. Check your connection and try again.', onRetry }) => (
  <div role="alert" className="flex flex-col items-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
    <Icon name="AlertTriangle" className="mb-3 h-6 w-6 text-destructive" />
    <h3 className="font-heading text-base font-semibold">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    {onRetry && <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}
  </div>
);

const useRoute = () => {
  const get = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(get);
  useEffect(() => { const f = () => setRoute(get()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const navigate = useCallback((to) => { window.location.hash = to; }, []);
  return [route, navigate];
};
const Link = ({ to, className, children, ...p }) => <a href={'#' + to} className={className} {...p}>{children}</a>;
const useLocalState = (key, initial) => {
  const init = () => (typeof initial === 'function' ? initial() : initial);
  const [v, setV] = useState(() => { try { const s = localStorage.getItem('app:' + key); return s ? JSON.parse(s) : init(); } catch (e) { return init(); } });
  useEffect(() => { try { localStorage.setItem('app:' + key, JSON.stringify(v)); } catch (e) {} }, [key, v]);
  return [v, setV];
};
const useLoading = (ms = 700) => { const [l, setL] = useState(true); useEffect(() => { const t = setTimeout(() => setL(false), ms); return () => clearTimeout(t); }, []); return l; };

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { window.__appError = String(error && error.stack || error); console.error('RenderError: ' + (error && error.message)); }
  render() { return this.state.error ? <div className="p-6"><ErrorState title="This screen crashed" description={String(this.state.error.message || this.state.error)} onRetry={() => this.setState({ error: null })} /></div> : this.props.children; }
}
/* ---------- marketing / first-run building blocks ---------- */
const Eyebrow = ({ children, className }) => <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur', className)}>{children}</span>;
// Hero({ eyebrow, title, description, actions, aside }): outcome headline + supporting line + CTAs, with a soft brand glow. `aside` takes a product mock built from Cards.
const Hero = ({ eyebrow, title, description, actions, aside, className }) => (
  <section className={cn('relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-10 sm:px-10 sm:py-14', className)}>
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-accent blur-3xl" />
    <div className={cn('relative grid items-center gap-10', aside && 'lg:grid-cols-[1.1fr_1fr]')}>
      <div className="max-w-xl">
        {eyebrow && <Eyebrow className="mb-5">{eyebrow}</Eyebrow>}
        <h1 className="font-heading text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">{title}</h1>
        {description && <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>}
        {actions && <div className="mt-7 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {aside && <div className="relative">{aside}</div>}
    </div>
  </section>
);
const FeatureCard = ({ icon = 'Sparkles', title, description, className }) => (
  <Card className={cn('p-5 transition-colors hover:border-foreground/20', className)}>
    <span className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon name={icon} className="h-5 w-5" /></span>
    <h3 className="font-heading text-base font-semibold tracking-tight">{title}</h3>
    {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}
  </Card>
);

/* ---------- consumer building blocks: imagery without image files, browse cards, top bar + mobile tabs ---------- */
const PHOTO_TINTS = ['rgb(var(--primary) / .38)', 'rgb(var(--accent))', 'rgb(var(--success) / .38)', 'rgb(var(--warning) / .38)', 'rgb(var(--secondary))', 'rgb(var(--destructive) / .22)'];
const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
// Photo({ seed, icon, ratio }): a designed image stand-in (palette gradient + soft shapes + icon). Same seed, same picture. Use it wherever a photo would go.
const ICON_HINTS = [[/\b(?:plant|cutting|seed|sprout|garden|herb|basil|mint|fern)(?:s|es)?\b/i, 'Sprout'], [/\b(?:flower|bloom|orchid|rose)(?:s|es)?\b/i, 'Flower2'], [/\b(?:leaf|heartleaf|monstera|pothos|vine|philodendron|succulent|cactus|foliage|houseplant)(?:s|es)?\b/i, 'Leaf'], [/\b(?:coffee|espresso|cafe|café)(?:s|es)?\b/i, 'Coffee'], [/\b(?:book|textbook|novel|study|course)(?:s|es)?\b/i, 'BookOpen'], [/\b(?:bike|cycle|scooter)(?:s|es)?\b/i, 'Bike'], [/\b(?:shirt|jacket|dress|cloth|shoe|sneaker|fashion)(?:s|es)?\b/i, 'Shirt'], [/\b(?:chair|sofa|table|desk|furniture|lamp)(?:s|es)?\b/i, 'Armchair'], [/\b(?:laptop|phone|computer|monitor|tablet|gadget)(?:s|es)?\b/i, 'Laptop'], [/\b(?:art|paint|print|poster|craft)(?:s|es)?\b/i, 'Palette'], [/\b(?:music|guitar|piano|vinyl|record|speaker)(?:s|es)?\b/i, 'Music'], [/\b(?:food|meal|cake|bread|bake|pizza|recipe|tomato|fruit)(?:s|es)?\b/i, 'UtensilsCrossed'], [/\b(?:home|house|room|apartment|flat)(?:s|es)?\b/i, 'Home'], [/\b(?:car|truck|van)(?:s|es)?\b/i, 'Car'], [/\b(?:camera|photo)(?:s|es)?\b/i, 'Camera'], [/\b(?:toy|game|puzzle|lego)(?:s|es)?\b/i, 'Puzzle'], [/\b(?:dog|cat|pet|puppy)(?:s|es)?\b/i, 'Heart'], [/\b(?:baby|kid|child)(?:s|es)?\b/i, 'Baby'], [/\b(?:tool|drill|hammer|wrench)(?:s|es)?\b/i, 'Wrench'], [/\b(?:ring|jewel|watch|gem)(?:s|es)?\b/i, 'Gem'], [/\b(?:travel|trip|flight|hotel|stay)(?:s|es)?\b/i, 'Plane'], [/\b(?:gym|fitness|yoga|run)(?:s|es)?\b/i, 'Dumbbell']];
const FALLBACK_ICONS = ['Sparkles', 'Star', 'Heart', 'Gem', 'Leaf', 'Sun'];
const guessIcon = (text, h) => { const hit = ICON_HINTS.find(([re]) => re.test(text)); return hit ? hit[1] : FALLBACK_ICONS[h % FALLBACK_ICONS.length]; };
const Photo = ({ seed = 'x', icon, ratio = 'aspect-[4/3]', className, children }) => {
  const h = hashStr(String(seed));
  icon = icon || guessIcon(String(seed), h);
  const [a, b] = [PHOTO_TINTS[h % PHOTO_TINTS.length], PHOTO_TINTS[(h >> 3) % PHOTO_TINTS.length]];
  return (
    <div className={cn('relative w-full overflow-hidden bg-muted', ratio, className)} style={{ background: 'linear-gradient(' + (h % 160 + 20) + 'deg, ' + a + ', ' + b + ')' }}>
      <span aria-hidden="true" className="absolute rounded-full bg-card/40" style={{ width: '55%', paddingBottom: '55%', left: (h % 40) - 10 + '%', top: '-18%' }} />
      <span aria-hidden="true" className="absolute rounded-full bg-foreground/5" style={{ width: '38%', paddingBottom: '38%', right: ((h >> 5) % 30) - 8 + '%', bottom: '-14%' }} />
      <div className="absolute inset-0 grid place-items-center text-foreground/30"><Icon name={icon} className="h-1/4 w-1/4 min-h-8 min-w-8" strokeWidth={1.25} /></div>
      {children}
    </div>
  );
};
// ListingCard({ seed, icon, title, subtitle, badge, meta, price, action, onClick }): the browse-grid card for marketplaces, catalogues and content.
const ListingCard = ({ seed, icon, title, subtitle, badge, meta, price, action, onClick, className }) => (
  <Card className={cn('group overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-foreground/20', onClick && 'cursor-pointer', className)} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}>
    <Photo seed={seed || title} icon={icon} className="transition duration-300 group-hover:scale-[1.02]">
      {badge && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur">{badge}</span>}
    </Photo>
    <div className="space-y-1 p-4">
      <h3 className="font-heading text-base font-semibold leading-snug tracking-tight">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="flex items-center justify-between gap-2 pt-2 text-sm">
        <span className="inline-flex items-center gap-1 text-muted-foreground">{meta}</span>
        {price != null && <span className="font-semibold tabular-nums">{price}</span>}
        {action}
      </div>
    </div>
  </Card>
);
// ConsumerShell({ brand, nav:[{label,to,icon}], actions }): sticky top bar with links on desktop, bottom tab bar on mobile. For browse/discover/shop/book products (not work tools).
const ConsumerShell = ({ brand, nav, actions, children }) => {
  const [route] = useRoute();
  const active = (to) => (to === '/' ? route === '/' : route === to || route.startsWith(to + '/'));
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#/" className="font-heading text-lg font-semibold tracking-tight">{brand}</a>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav.map((n) => <a key={n.to} href={'#' + n.to} aria-current={active(n.to) ? 'page' : undefined} className={cn('rounded-full px-3.5 py-2 text-sm transition-colors', active(n.to) ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{n.label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" style={{ gridTemplateColumns: 'repeat(' + Math.min(nav.length, 5) + ', minmax(0, 1fr))' }}>
        {nav.slice(0, 5).map((n) => (
          <a key={n.to} href={'#' + n.to} aria-current={active(n.to) ? 'page' : undefined} className={cn('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors', active(n.to) ? 'text-primary' : 'text-muted-foreground')}>
            <Icon name={n.icon || 'Circle'} className="h-5 w-5" />{n.label}
          </a>
        ))}
      </nav>
    </div>
  );
};

/* ---------- extended components: layout, data, overlays, charts ---------- */
const useModal = (open, onClose, ref) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current && ref.current.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); };
  }, [open]);
};
const useHotkey = (key, cb) => {
  useEffect(() => {
    const f = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key) { e.preventDefault(); cb(); } };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  });
};

const Table = ({ className, ...p }) => <div className="w-full overflow-x-auto"><table className={cn('w-full caption-bottom text-sm', className)} {...p} /></div>;
const TableHeader = (p) => <thead className="border-b border-border" {...p} />;
const TableBody = (p) => <tbody className="divide-y divide-border" {...p} />;
const TableRow = ({ className, ...p }) => <tr className={cn('transition-colors hover:bg-muted/50', className)} {...p} />;
const TableHead = ({ className, ...p }) => <th scope="col" className={cn('h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground', className)} {...p} />;
const TableCell = ({ className, ...p }) => <td className={cn('px-4 py-3 align-middle', className)} {...p} />;

const Pagination = ({ page, pageCount, onPage }) => pageCount < 2 ? null : (
  <nav aria-label="Pagination" className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
    <span>Page {page + 1} of {pageCount}</span>
    <div className="flex gap-1">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  </nav>
);

// columns: [{ key, label, sortable, align: 'right', render: (row) => node }]. Sort and paging are built in; pass searchable for its own search box (don't also write one).
const DataTable = ({ columns, rows, rowKey = 'id', onRowClick, pageSize = 8, searchable = false, searchPlaceholder = 'Search…', empty, toolbar }) => {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  const data = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(needle))) : rows;
    if (sort) out = [...out].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
      return sort.dir === 'asc' ? r : -r;
    });
    return out;
  }, [rows, q, sort]);
  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const cur = Math.min(page, pageCount - 1);
  const slice = data.slice(cur * pageSize, cur * pageSize + pageSize);
  const toggle = (key) => setSort((s) => (s && s.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && <div className="relative min-w-[12rem] flex-1 sm:max-w-xs"><Icon name="Search" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search" className="pl-9" placeholder={searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>}
          {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar}</div>}
        </div>
      )}
      {slice.length === 0 ? (empty || <EmptyState icon="Search" title="No results" description={q ? 'Nothing matches your search.' : 'Nothing here yet.'} />) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : ''} aria-sort={sort && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable ? <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground">{c.label}<Icon name={sort && sort.key === c.key ? (sort.dir === 'asc' ? 'ArrowUp' : 'ArrowDown') : 'ChevronsUpDown'} className="h-3 w-3" /></button> : c.label}
                </TableHead>
              ))}
            </TableRow></TableHeader>
            <TableBody>
              {slice.map((r) => (
                <TableRow key={r[rowKey]} className={onRowClick ? 'cursor-pointer' : ''} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}>
                  {columns.map((c) => <TableCell key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : ''}>{c.render ? c.render(r) : r[c.key]}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={cur} pageCount={pageCount} onPage={setPage} />
    </div>
  );
};

// items: [{ label, icon, onClick, destructive }, { separator: true }]. Pass a <Button> as `trigger`.
const DropdownMenu = ({ trigger, items, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      {React.cloneElement(trigger, { onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && (
        <div role="menu" className={cn('anim-in absolute z-40 mt-1 min-w-[11rem] rounded-md border border-border bg-card p-1 shadow-lg', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) => it.separator ? <Separator key={i} className="my-1" /> : (
            <button key={i} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick && it.onClick(); }}
              className={cn('flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none', it.destructive && 'text-destructive')}>
              {it.icon && <Icon name={it.icon} className="h-4 w-4" />}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Tooltip = ({ content, children }) => (
  <span className="group relative inline-flex">
    {children}
    <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{content}</span>
  </span>
);

const Sheet = ({ open, onClose, title, description, side = 'right', children, className }) => {
  const ref = useRef(null);
  useModal(open, onClose, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cn('absolute inset-y-0 flex w-full max-w-md flex-col overflow-y-auto border-border bg-card p-6 shadow-xl outline-none', side === 'right' ? 'right-0 border-l anim-sheet-right' : 'left-0 border-r anim-sheet-left', className)}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="font-heading text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><Icon name="X" /></Button>
        </div>
        {children}
      </div>
    </div>
  );
};

// items: [{ title, content, defaultOpen }]
const Accordion = ({ items, multiple = false, className }) => {
  const [open, setOpen] = useState(() => items.flatMap((it, i) => (it.defaultOpen ? [i] : [])));
  const toggle = (i) => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : multiple ? [...o, i] : [i]));
  return (
    <div className={cn('divide-y divide-border rounded-lg border border-border bg-card', className)}>
      {items.map((it, i) => (
        <div key={i}>
          <h3><button type="button" aria-expanded={open.includes(i)} onClick={() => toggle(i)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {it.title}<Icon name="ChevronDown" className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open.includes(i) && 'rotate-180')} />
          </button></h3>
          {open.includes(i) && <div className="anim-in px-4 pb-4 text-sm text-muted-foreground">{it.content}</div>}
        </div>
      ))}
    </div>
  );
};

const Breadcrumb = ({ items }) => (
  <nav aria-label="Breadcrumb"><ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
    {items.map((it, i) => (
      <li key={i} className="flex items-center gap-1.5">
        {i > 0 && <Icon name="ChevronRight" className="h-3.5 w-3.5" />}
        {it.to && i < items.length - 1 ? <Link to={it.to} className="hover:text-foreground">{it.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined} className={i === items.length - 1 ? 'font-medium text-foreground' : ''}>{it.label}</span>}
      </li>
    ))}
  </ol></nav>
);

// items: [{ label, hint, icon, group, onSelect }]. Open it from useHotkey('k', ...) and a search button.
const CommandPalette = ({ open, onClose, items, placeholder = 'Type a command or search…' }) => {
  const ref = useRef(null);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  useModal(open, onClose, ref);
  useEffect(() => { if (open) { setQ(''); setIdx(0); } }, [open]);
  const list = useMemo(() => items.filter((it) => (it.label + ' ' + (it.hint || '') + ' ' + (it.group || '')).toLowerCase().includes(q.toLowerCase())), [items, q]);
  if (!open) return null;
  const run = (it) => { onClose(); it && it.onSelect && it.onSelect(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(list[idx]); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Command palette" className="anim-in relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-xl outline-none">
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Icon name="Search" className="h-4 w-4 text-muted-foreground" />
          <input autoFocus aria-label="Search commands" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} placeholder={placeholder} className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {list.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No results.</li>}
          {list.map((it, i) => (
            <li key={i} role="option" aria-selected={i === idx}>
              <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => run(it)} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm', i === idx && 'bg-muted')}>
                {it.icon && <Icon name={it.icon} className="h-4 w-4 text-muted-foreground" />}
                <span className="flex-1">{it.label}</span>
                {it.group && <span className="text-xs text-muted-foreground">{it.group}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const Alert = ({ tone = 'info', title, children, className }) => {
  const t = { info: ['Info', 'border-primary/30 bg-primary/5 text-primary'], success: ['CheckCircle2', 'border-success/30 bg-success/5 text-success'], warning: ['AlertTriangle', 'border-warning/30 bg-warning/5 text-warning'], destructive: ['AlertCircle', 'border-destructive/30 bg-destructive/5 text-destructive'] }[tone];
  return (
    <div role={tone === 'destructive' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-4', t[1], className)}>
      <Icon name={t[0]} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-sm text-foreground">{title && <p className="font-medium">{title}</p>}{children && <div className={cn('text-muted-foreground', title && 'mt-0.5')}>{children}</div>}</div>
    </div>
  );
};

const Checkbox = ({ checked, onChange, label, className }) => (
  <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{checked && <Icon name="Check" className="h-3.5 w-3.5" />}</button>
    {label}
  </label>
);
// options: [{ value, label, description }]
const RadioGroup = ({ value, onChange, options, className }) => (
  <div role="radiogroup" className={cn('grid gap-2', className)}>
    {options.map((o) => (
      <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', value === o.value ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50')}>
        <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border', value === o.value ? 'border-primary' : 'border-border')}>{value === o.value && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
        <span><span className="block text-sm font-medium">{o.label}</span>{o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}</span>
      </button>
    ))}
  </div>
);

// delta: percent change. Green when it is good news: up by default, or down when goodWhen="down" (e.g. response time, churn). hint: small text under the value.
const StatCard = ({ label, value, delta, goodWhen = 'up', icon, hint, className }) => (
  <Card className={cn('p-5', className)}>
    <div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p>{icon && <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><Icon name={icon} className="h-4 w-4" /></span>}</div>
    <p className="mt-2 font-heading text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
    <div className="mt-1 flex items-center gap-2 text-xs">
      {delta != null && <span className={cn('inline-flex items-center gap-0.5 font-medium', (goodWhen === 'down' ? delta <= 0 : delta >= 0) ? 'text-success' : 'text-destructive')}><Icon name={delta >= 0 ? 'ArrowUp' : 'ArrowDown'} className="h-3 w-3" />{Math.abs(delta)}%</span>}
      {hint && <span className="text-muted-foreground">{hint}</span>}
    </div>
  </Card>
);

const PageHeader = ({ title, description, actions, breadcrumb }) => (
  <div className="mb-6 space-y-3">
    {breadcrumb && <Breadcrumb items={breadcrumb} />}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0"><h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </div>
);

// items: [{ title, description, time, icon }]
const Timeline = ({ items }) => (
  <ol className="relative space-y-5 border-l border-border pl-6">
    {items.map((it, i) => (
      <li key={i} className="relative">
        <span className="absolute -left-[37px] grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-muted-foreground"><Icon name={it.icon || 'Circle'} className="h-3 w-3" /></span>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3"><p className="text-sm font-medium">{it.title}</p>{it.time && <span className="text-xs text-muted-foreground">{it.time}</span>}</div>
        {it.description && <p className="mt-0.5 text-sm text-muted-foreground">{it.description}</p>}
      </li>
    ))}
  </ol>
);

// Charts are dependency-free SVG/div: data = [{ label, value }].
const CHART_COLORS = ['rgb(var(--primary))', 'rgb(var(--muted-foreground))', 'rgb(var(--success))', 'rgb(var(--destructive))', 'rgb(var(--warning))', 'rgb(var(--foreground) / .35)'];
const BarChart = ({ data, height = 180, format = (v) => v, className }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={'Bar chart: ' + data.map((d) => d.label + ' ' + format(d.value)).join(', ')} className={cn('flex items-end gap-2', className)} style={{ height }}>
      {data.map((d) => (
        <div key={d.label} title={d.label + ': ' + format(d.value)} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
          <span className="text-center text-[11px] font-medium tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{format(d.value)}</span>
          <div className="w-full rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: (100 * d.value / max) * 0.78 + '%', minHeight: d.value ? 3 : 0 }} />
          <span className="truncate text-center text-[11px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
};
const LineChart = ({ data, height = 180, area = true, format = (v) => v, className }) => {
  const id = useMemo(() => 'lg' + Math.random().toString(36).slice(2), []);
  if (data.length < 2) return <div className={cn('grid place-items-center text-sm text-muted-foreground', className)} style={{ height }}>Not enough data yet</div>;
  const vals = data.map((d) => d.value), min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * 100, 46 - ((d.value - min) / span) * 40]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
  return (
    <div className={cn('text-primary', className)} role="img" aria-label={'Line chart from ' + format(vals[0]) + ' to ' + format(vals[vals.length - 1])}>
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="w-full" style={{ height }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".25" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        {area && <path d={line + ' L100 50 L0 50 Z'} fill={'url(#' + id + ')'} />}
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{data[0].label}</span><span>{data[Math.floor(data.length / 2)].label}</span><span>{data[data.length - 1].label}</span></div>
    </div>
  );
};
const DonutChart = ({ data, size = 140, centerValue, centerLabel, className }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  return (
    <div className={cn('flex flex-wrap items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={'Donut chart: ' + data.map((d) => d.label + ' ' + Math.round(100 * d.value / total) + '%').join(', ')}>
        <svg viewBox="0 0 36 36" className="-rotate-90">
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgb(var(--muted))" strokeWidth="4" />
          {data.map((d, i) => { const len = 100 * d.value / total; const el = <circle key={d.label} cx="18" cy="18" r="15.9155" fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="4" strokeDasharray={len + ' ' + (100 - len)} strokeDashoffset={-acc} />; acc += len; return el; })}
        </svg>
        {(centerValue != null || centerLabel) && <div className="absolute inset-0 grid place-content-center text-center"><span className="font-heading text-xl font-semibold tabular-nums">{centerValue}</span>{centerLabel && <span className="text-[11px] text-muted-foreground">{centerLabel}</span>}</div>}
      </div>
      <ul className="space-y-1.5 text-sm">{data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{d.label}<span className="ml-1 tabular-nums text-muted-foreground">{Math.round(100 * d.value / total)}%</span></li>)}</ul>
    </div>
  );
};
const Sparkline = ({ values, className }) => {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const d = values.map((v, i) => (i ? 'L' : 'M') + ((i / (values.length - 1)) * 100).toFixed(1) + ' ' + (22 - ((v - min) / span) * 20).toFixed(1)).join(' ');
  return <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" className={cn('h-6 w-20 text-primary', className)}><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>;
};

// App frame: sticky sidebar on desktop, drawer on mobile, active-route highlighting via useRoute. Wrap each screen's content in it.
// nav: [{ label, to, icon, group, badge }]; user: { name, email }; actions: node shown in the top bar.
const AppShell = ({ brand, nav, user, actions, children }) => {
  const [route] = useRoute();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  const active = (to) => (to === '/' ? route === '/' : route === to || route.startsWith(to + '/'));
  const groups = [];
  nav.forEach((n) => { let g = groups.find((x) => x[0] === (n.group || '')); if (!g) groups.push((g = [n.group || '', []])); g[1].push(n); });
  const links = (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto p-3">
      {groups.map(([g, items]) => (
        <div key={g} className="space-y-0.5">
          {g && <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g}</p>}
          {items.map((n) => (
            <a key={n.to} href={'#' + n.to} aria-current={active(n.to) ? 'page' : undefined} className={cn('flex min-h-[40px] items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active(n.to) ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <Icon name={n.icon || 'Circle'} className="h-4 w-4 shrink-0" /><span className="flex-1">{n.label}</span>{n.badge != null && <Badge tone="muted">{n.badge}</Badge>}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
  const foot = user && <div className="flex items-center gap-3 border-t border-border p-3"><Avatar name={user.name} /><div className="min-w-0"><p className="truncate text-sm font-medium">{user.name}</p>{user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}</div></div>;
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center px-5 font-heading text-lg font-semibold">{brand}</div>{links}{foot}
      </aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} /><aside className="anim-sheet-left absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-xl"><div className="flex h-16 items-center justify-between px-5 font-heading text-lg font-semibold">{brand}<Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="X" /></Button></div>{links}{foot}</aside></div>}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="Menu" /></Button>
          <span className="font-heading text-base font-semibold lg:hidden">{brand}</span>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};

"""

MOUNT = "\nReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><ToastProvider><App /></ToastProvider></ErrorBoundary>);\n"

# Generated code runs in a sandboxed iframe / opaque origin where localStorage throws; give it an in-memory stand-in.
STORAGE_SHIM = ("<script>try{window.localStorage.getItem('x')}catch(e){var __m={};Object.defineProperty(window,'localStorage',{configurable:true,"
                "value:{getItem:function(k){return k in __m?__m[k]:null},setItem:function(k,v){__m[k]=String(v)},removeItem:function(k){delete __m[k]},"
                "clear:function(){__m={}},key:function(i){return Object.keys(__m)[i]||null},get length(){return Object.keys(__m).length}}})}</script>")


def assemble(spec: dict, app_code: str, title: str) -> str:
    """One runnable HTML document: design tokens -> Tailwind theme, the component kit, then the generated app."""
    t = tokens(spec)
    heading, body = _font(spec.get("heading_font")), _font(spec.get("body_font"))
    mono = _font(spec.get("mono_font") or "JetBrains Mono")
    radius = spec.get("radius") if re.fullmatch(r"\d{1,2}(\.\d)?px|\d(\.\d+)?rem", str(spec.get("radius", ""))) else "10px"
    css_vars = "".join(f"--{k.replace('_', '-')}:{_rgb(v)};" for k, v in t.items())
    colors = {k.replace("_", "-"): f"rgb(var(--{k.replace('_', '-')}) / <alpha-value>)" for k in t}
    theme = {"theme": {"extend": {
        "colors": colors,
        "fontFamily": {"heading": [heading, "system-ui", "sans-serif"], "sans": [body, "system-ui", "sans-serif"], "mono": [mono, "ui-monospace", "monospace"]},
        "borderRadius": {"lg": "var(--radius)", "md": "calc(var(--radius) - 2px)", "sm": "calc(var(--radius) - 4px)"}}}}
    fonts = "&family=".join(f.replace(" ", "+") + ":wght@400;500;600;700" for f in dict.fromkeys([heading, body]))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{re.sub(r"[<>&]", "", title)[:80]}</title>
{STORAGE_SHIM}
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family={fonts}&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = {json.dumps(theme)}</script>
<style>
:root{{{css_vars}--radius:{radius}}}
*{{-webkit-font-smoothing:antialiased;scrollbar-width:thin;scrollbar-color:rgb(var(--border)) transparent}} h1,h2,h3,.font-heading{{letter-spacing:-.022em}} .grid>*{{min-width:0}} body{{overflow-x:clip}} h1,h2,h3{{text-wrap:balance}} p{{text-wrap:pretty}} ::selection{{background:rgb(var(--primary)/.22)}} body{{margin:0;font-family:'{body}',system-ui,sans-serif;background:rgb(var(--background));color:rgb(var(--foreground))}}
@keyframes fadeUp{{from{{opacity:0;transform:translateY(6px)}}to{{opacity:1;transform:none}}}}
.anim-in{{animation:fadeUp .25s ease both}}
@keyframes slideR{{from{{transform:translateX(100%)}}to{{transform:none}}}} @keyframes slideL{{from{{transform:translateX(-100%)}}to{{transform:none}}}}
.anim-sheet-right{{animation:slideR .25s ease both}} .anim-sheet-left{{animation:slideL .25s ease both}}
@media (prefers-reduced-motion:reduce){{*{{animation-duration:.01ms!important;transition-duration:.01ms!important}}}}
</style>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>window.react=window.React</script>
<script src="https://unpkg.com/lucide-react@0.263.1/dist/umd/lucide-react.min.js"></script>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react">{KIT}
/* ---------- generated app ---------- */
/* own scope: if the app declares a name the kit also has (StatCard, Table, ...), it shadows the kit instead of crashing the page */
const App = (() => {{
{app_code}
return App;
}})();
{MOUNT}</script></body></html>"""


# ---------------------------------------------------------------- screenshots

DEVICES = {"desktop": (1440, 900, 2600), "tablet": (820, 1180, 2600), "mobile": (390, 844, 3000)}


def screenshot(html: str, shots: list[tuple[str, str]]) -> dict:
    """Run the app in Chromium and capture [(device, route)]. Returns {"shots": [{device, route, jpeg}], "errors": [...], "rendered": bool}.
    The page is served from a fake https origin so the app gets a real origin, localStorage and hash routing."""
    from playwright.sync_api import sync_playwright

    errors: list[str] = []
    out, rendered = [], True
    with sync_playwright() as pw:
        browser = core.launch_browser(pw)
        try:
            for device, route in shots:
                w, h, cap = DEVICES[device]
                ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=device == "mobile", has_touch=device != "desktop")
                ctx.route("https://prototype.local/", lambda r: r.fulfill(status=200, content_type="text/html", body=html))
                page = ctx.new_page()
                page.on("pageerror", lambda e: errors.append(f"{e}"[:300]))
                page.on("console", lambda m: m.type == "error" and errors.append(m.text[:300]))
                page.goto("https://prototype.local/#" + route, wait_until="domcontentloaded", timeout=45_000)
                try:
                    page.wait_for_function("document.getElementById('root') && document.getElementById('root').innerText.trim().length > 40", timeout=25_000)
                except Exception:
                    rendered = False
                page.wait_for_timeout(1800)  # loading skeletons, entrance animations, web fonts
                # Grow the viewport to the page height instead of a full-page capture, so fixed bars (mobile tab bar, sticky
                # headers) sit at the edges where users see them, not floating mid-page.
                bad = page.evaluate(r"(document.body.innerText.match(/\b(undefined|NaN|null|\[object Object\])\b/) || [])[0] || null")
                if bad:
                    errors.append(f"PlaceholderValue: the {route} screen shows \"{bad}\" as text where a real value should be (a field read from the sample data does not exist, or a calculation is wrong): find it and fix the data or the code")
                if device == "mobile":
                    over = page.evaluate("""(() => { const w = innerWidth; const bad = [...document.querySelectorAll('body *')].filter((e) => {
                        const r = e.getBoundingClientRect(); if (!(r.width > 0) || r.right <= w + 1) return false;
                        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return false; }
                        return true; }).slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 3).join('.'));
                        return bad.length ? bad : null; })()""")
                    if over:
                        errors.append("LayoutOverflow: content is wider than the 390px mobile screen and gets cut off; widest elements: " + ", ".join(over))
                height = min(page.evaluate("document.documentElement.scrollHeight"), cap)
                page.set_viewport_size({"width": w, "height": max(height, h)})
                page.wait_for_timeout(500)
                out.append({"device": device, "route": route, "jpeg": page.screenshot(type="jpeg", quality=68)})
                ctx.close()
        finally:
            browser.close()
    # Browser noise that doesn't indicate a broken app.
    errors = [e for e in dict.fromkeys(errors) if not re.search(r"favicon|Failed to load resource: net::ERR_(BLOCKED|FAILED)|fonts\.g", e)]
    return {"shots": out, "errors": errors[:12], "rendered": rendered and not any("RenderError" in e for e in errors)}
