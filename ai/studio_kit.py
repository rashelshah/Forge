"""Product Studio runtime: turns a design spec + generated app code into one runnable HTML file (Tailwind + React,
shadcn-style component kit, design tokens), then runs it in a browser and screenshots it on desktop/tablet/mobile."""
import json
import re

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
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-border bg-card hover:bg-muted',
  ghost: 'hover:bg-muted',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  link: 'text-primary underline-offset-4 hover:underline',
};
const buttonSizes = { default: 'h-10 px-4 text-sm', sm: 'h-8 px-3 text-xs', lg: 'h-12 px-6 text-base', icon: 'h-10 w-10' };
const Button = React.forwardRef(({ variant = 'default', size = 'default', className, loading, children, ...p }, ref) => (
  <button ref={ref} type="button" {...p} disabled={loading || p.disabled}
    className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50', buttonVariants[variant], buttonSizes[size], className)}>
    {loading && <Spinner />}{children}
  </button>
));

const Card = ({ className, ...p }) => <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...p} />;
const CardHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1.5 p-5', className)} {...p} />;
const CardTitle = ({ className, ...p }) => <h3 className={cn('font-heading text-base font-semibold leading-tight tracking-tight', className)} {...p} />;
const CardDescription = ({ className, ...p }) => <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
const CardContent = ({ className, ...p }) => <div className={cn('p-5 pt-0', className)} {...p} />;
const Badge = ({ className, tone = 'default', ...p }) => {
  const tones = { default: 'bg-primary/10 text-primary', muted: 'bg-muted text-muted-foreground', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', destructive: 'bg-destructive/10 text-destructive', outline: 'border border-border text-foreground' };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...p} />;
};
const Label = ({ className, ...p }) => <label className={cn('text-sm font-medium leading-none', className)} {...p} />;
const fieldCls = 'w-full rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
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
*{{-webkit-font-smoothing:antialiased}} body{{margin:0;font-family:'{body}',system-ui,sans-serif;background:rgb(var(--background));color:rgb(var(--foreground))}}
@keyframes fadeUp{{from{{opacity:0;transform:translateY(6px)}}to{{opacity:1;transform:none}}}}
.anim-in{{animation:fadeUp .25s ease both}}
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
{app_code}
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
        try:
            browser = pw.chromium.launch()
        except Exception:
            browser = pw.chromium.launch(channel="chrome")  # no bundled Chromium: use an installed Chrome
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
