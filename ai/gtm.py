"""Go-To-Market Studio: an agency team (LangGraph) that turns a validated venture + prototype into a launch-ready business:
brand identity, positioning, messaging, launch assets, growth plan, content plan, ads, investor deck and a launch-readiness score.

    brand -> positioning -> messaging -> visual identity -> landing copy -> growth -> content -> marketing assets -> ads -> deck -> readiness

Every agent saves its result to Supabase as it finishes (so the UI can follow along and a failed run resumes), and every file
(logo pack, graphics, ad mockups, PPTX/PDF deck, guidelines PDF, CSVs) is uploaded to Supabase Storage.
"""
import base64
import os
import re
import time
from typing import Literal, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

import core
import design_intel
import gtm_render as R
import studio
from studio import _compact, _why, ask

BUCKET = "gtm-assets"
CONTENT_TYPES = {".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".zip": "application/zip", ".csv": "text/csv", ".txt": "text/plain",
                 ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".html": "text/html"}


# ---------------------------------------------------------------- schemas

class Voice(BaseModel):
    adjectives: list[str] = Field(description="3-4 words, e.g. Trustworthy, Helpful, Student-friendly")
    do: list[str]
    dont: list[str]
    sample_lines: list[str] = Field(description="3 lines the brand would actually say")


class Value(BaseModel):
    name: str
    meaning: str = Field(description="What this value means in daily decisions")


class Brand(BaseModel):
    reasoning: str = _why()
    archetype: str = Field(description="One of the 12 archetypes: Innocent, Sage, Explorer, Outlaw, Magician, Hero, Lover, Jester, Everyman, Caregiver, Ruler, Creator — or 'Guide' (Sage/Caregiver)")
    archetype_reason: str
    personality: list[str]
    mission: str
    vision: str
    core_promise: str = Field(description="One line, e.g. 'The safest way for students to buy and sell locally.'")
    tagline: str
    voice: Voice
    values: list[Value] = Field(min_length=3, description="3-5 values")


class Differentiator(BaseModel):
    against: str = Field(description="A tracked competitor or alternative")
    edge: str


class TargetMarket(BaseModel):
    primary: str
    segments: list[str]
    size_note: str = Field(description="Market size only as stated in the context; otherwise how to size it")


class Category(BaseModel):
    current_category: str
    creation_opportunity: str
    category_name: str = Field(description="The new category to own, e.g. 'Trust-first student exchange'")
    why: str


class Positioning(BaseModel):
    reasoning: str = _why()
    statement: str = Field(description="'For [target] who [need], [brand] is a [category] that [benefit]. Unlike [alternative], [differentiator].'")
    uvp: str
    differentiation: list[Differentiator]
    target_market: TargetMarket
    category: Category
    proof_points: list[str] = Field(description="Only facts present in the context")


class Pillar(BaseModel):
    pillar: str
    proof: str


class AppStore(BaseModel):
    title: str = Field(description="At most 30 characters")
    subtitle: str = Field(description="At most 30 characters")
    promo: str = Field(description="At most 170 characters")
    description: str


class Messaging(BaseModel):
    reasoning: str = _why()
    elevator_pitch: str = Field(description="About 30 seconds spoken (70-90 words)")
    one_sentence: str
    website_headline: str
    subheadline: str
    product_description: str
    app_store: AppStore
    linkedin_description: str
    investor_one_liner: str
    taglines: list[str]
    pillars: list[Pillar] = Field(description="3 messaging pillars with proof")


class ColorSpec(BaseModel):
    name: str
    hex: str = Field(description="6-digit hex with leading #")
    role: Literal["primary", "secondary", "accent", "ink", "paper"]


class LogoConcept(BaseModel):
    name: str
    rationale: str = Field(description="Why this mark fits the brand promise and audience")
    container: Literal["circle", "squircle", "shield", "hexagon", "none"] = Field(description="The shape holding the glyph; 'none' = glyph only")
    glyph: Literal["check", "chat", "cart", "book", "spark", "arrow", "pin", "bolt", "heart", "leaf", "lock", "cap", "bars", "monogram"] = Field(
        description="The symbol; pick the one that signals the core promise (check/lock = trust, cart = commerce, cap/book = education, chat = community, monogram = the brand initial)")
    container_color: Literal["primary", "secondary", "accent", "ink"]
    glyph_color: Literal["primary", "secondary", "accent", "ink", "paper"] = Field(description="Must contrast strongly with the container colour")
    accent_dot: bool = Field(description="A small accent-colour dot at the top-right, for a touch of energy")
    image_prompt: str = Field(description="A prompt for an image model to explore this concept as a clean flat logo on a plain background")


class Visual(BaseModel):
    reasoning: str = _why()
    concept_name: str
    colors: list[ColorSpec] = Field(description="Exactly 5: one each of primary, secondary, accent, ink, paper")
    heading_font: str = Field(description="A real Google Fonts family")
    body_font: str = Field(description="A real Google Fonts family")
    typography_rules: list[str]
    color_usage: str
    design_direction: str
    icon_style: str
    illustration_style: str
    logo_concepts: list[LogoConcept] = Field(description="3 distinct concepts; the first is the recommended primary")


class Hero(BaseModel):
    eyebrow: str
    headline: str
    subheadline: str
    primary_cta: str
    secondary_cta: str
    microcopy: str


class Feature(BaseModel):
    title: str
    description: str


class Step(BaseModel):
    title: str
    description: str


class Stat(BaseModel):
    value: str
    label: str
    basis: str = Field(description="Where this number comes from in the context")


class Testimonial(BaseModel):
    quote: str = Field(description="A TEMPLATE quote to be replaced with a real customer's words; write what a happy customer would ideally say")
    who: str = Field(description="The kind of customer to ask, e.g. 'Sophomore, State University'")


class SocialProof(BaseModel):
    intro: str
    stats: list[Stat] = Field(description="Only real numbers from the context; empty if none")
    testimonial_templates: list[Testimonial]
    how_to_collect: str


class Faq(BaseModel):
    q: str
    a: str


class FinalCta(BaseModel):
    headline: str
    subtext: str
    button: str


class Landing(BaseModel):
    reasoning: str = _why()
    hero: Hero
    problem_headline: str
    problem_body: str
    features: list[Feature] = Field(min_length=5, description="5-6 features")
    benefits: list[Feature] = Field(min_length=3, description="3-4 benefits")
    how_it_works: list[Step] = Field(min_length=3, description="3 steps")
    social_proof: SocialProof
    faq: list[Faq] = Field(min_length=6, description="6-8 questions, including trust, pricing and safety")
    final_cta: FinalCta
    seo_title: str
    meta_description: str


class Phase(BaseModel):
    name: str
    goal: str
    timeframe: str
    tactics: list[str]
    kpi: str


class Action(BaseModel):
    action: str
    detail: str


class Channel(BaseModel):
    channel: str
    why: str
    tactic: str
    cost: Literal["Low", "Medium", "High"]
    expected_result: str


class Loop(BaseModel):
    name: str
    steps: list[str]
    metric: str


class Partner(BaseModel):
    who: str
    offer: str
    why: str


class Growth(BaseModel):
    reasoning: str = _why()
    launch_strategy: list[Phase] = Field(description="3 phases, e.g. campus ambassadors, student communities, referral program")
    first_100: list[Action] = Field(min_length=5, description="5-7 concrete steps, week by week, to the first 100 users")
    first_1000: list[Action] = Field(min_length=5, description="5-7 concrete steps to the first 1000 users")
    channels: list[Channel] = Field(min_length=5, description="5-7 channels")
    growth_loops: list[Loop] = Field(min_length=2, description="2-3 loops")
    referral_ideas: list[str] = Field(min_length=3)
    community_strategy: str
    partnerships: list[Partner] = Field(min_length=3)


class Topic(BaseModel):
    title: str
    angle: str
    keyword: str
    intent: str


class Seo(BaseModel):
    keyword: str
    rationale: str
    difficulty: Literal["Low", "Medium", "High"]


class Thread(BaseModel):
    hook: str
    tweets: list[str]


class RedditPlay(BaseModel):
    subreddit: str
    approach: str
    post_idea: str
    rules_note: str = Field(description="How to stay within the community's self-promotion rules")


class EmailMsg(BaseModel):
    subject: str
    preview: str
    outline: str


class EmailCampaign(BaseModel):
    name: str
    goal: str
    emails: list[EmailMsg]


class Content(BaseModel):
    reasoning: str = _why()
    blog_topics: list[Topic] = Field(min_length=6, description="6-8 topics")
    seo: list[Seo] = Field(min_length=8, description="8-10 keywords")
    linkedin_content: list[str] = Field(min_length=4, description="4 full LinkedIn posts")
    x_threads: list[Thread] = Field(min_length=3, description="3 threads of 4-6 tweets")
    reddit: list[RedditPlay] = Field(min_length=3, description="3-4 communities")
    email_campaigns: list[EmailCampaign] = Field(min_length=3, description="3 campaigns of 2-4 emails: welcome, waitlist, launch")
    newsletter_ideas: list[str] = Field(min_length=4)


class CalendarDay(BaseModel):
    day: int = Field(ge=1, le=30)
    channel: str
    format: str
    topic: str
    hook: str
    cta: str


class Calendar(BaseModel):
    reasoning: str = _why()
    days: list[CalendarDay] = Field(description="Exactly 30 entries, one per day, mixing channels; day 1 is launch day")


class Graphic(BaseModel):
    kind: Literal["launch", "announcement", "feature", "waitlist", "referral"]
    headline: str = Field(description="At most 9 words")
    subline: str = Field(description="At most 16 words")
    cta: str
    badge: str = Field(description="1-3 words, e.g. 'Now live'")
    formats: list[Literal["instagram", "linkedin", "x", "story"]] = Field(description="1-2 formats")


class IgPost(BaseModel):
    caption: str
    hashtags: list[str]


class Marketing(BaseModel):
    reasoning: str = _why()
    instagram_posts: list[IgPost] = Field(min_length=3, description="3 posts")
    linkedin_posts: list[str] = Field(min_length=3, description="3 posts")
    x_posts: list[str] = Field(min_length=5, description="5 posts under 280 characters")
    graphics: list[Graphic] = Field(min_length=6, description="6-8 graphics covering launch, announcement, feature (two), waitlist and referral")


class Ad(BaseModel):
    platform: Literal["Meta", "Google", "LinkedIn", "Reddit"]
    variant: str
    headline: str
    creative_headline: str = Field(description="At most 7 words, printed on the ad image (the headline above is shown beside it)")
    primary_text: str
    description: str = ""
    cta: str
    creative_concept: str
    targeting: str = Field(description="Audience or keywords")


class Ads(BaseModel):
    reasoning: str = _why()
    ads: list[Ad] = Field(description="8 ads: two per platform")


class Callout(BaseModel):
    value: str
    label: str


class Slide(BaseModel):
    title: str
    headline: str = Field(description="The one-line claim of the slide")
    bullets: list[str] = Field(description="2-4 short bullets")
    callout: Callout | None = None
    speaker_notes: str = ""


class Deck(BaseModel):
    reasoning: str = _why()
    slides: list[Slide] = Field(description="Exactly 10, in this order: Problem, Solution, Market, Product, Business Model, Competition, Traction, Go-To-Market, Financials, Ask")
    assumptions_note: str = Field(description="Which numbers are illustrative assumptions and which are measured")


class Blocker(BaseModel):
    severity: Literal["high", "medium", "low"]
    issue: str
    fix: str


class CheckItem(BaseModel):
    category: Literal["Brand", "Product", "Marketing", "Sales", "Legal & Operations"]
    task: str
    priority: Literal["High", "Medium", "Low"]
    why: str


class Readiness(BaseModel):
    reasoning: str = _why()
    blocking_issues: list[Blocker] = Field(description="2-4 additional issues that would stop or sink a launch, beyond those already listed")
    checklist: list[CheckItem] = Field(description="14-18 launch tasks across Brand, Product, Marketing, Sales and Legal & Operations")


# ---------------------------------------------------------------- prompts

TEAM = ("You are part of Foundry's Go-To-Market Studio: an agency team (brand strategist, marketing director, growth lead, content team, creative "
        "designer) launching ONE startup. Be specific to this startup and its audience, consistent with the decisions already made, and write in the "
        "brand's voice. Never invent statistics, customers, testimonials, partnerships or prices: use only facts in the context, and where a fact is missing "
        "say what should be measured. Plain, concrete language; no agency fluff.")
BRAND = TEAM + "\n\nROLE: Brand Strategist. Define the brand personality, archetype, mission, vision, core promise, voice and values from the idea, validation, competitor analysis, prototype and audience."
POSITION = TEAM + "\n\nROLE: Positioning Agent. Write the positioning statement, unique value proposition, competitive differentiation against the tracked competitors, target market and category-creation opportunity. The white-space features in the competitor analysis are the raw material."
MESSAGE = TEAM + "\n\nROLE: Messaging Architect. Write the full messaging framework in the brand voice. Respect character limits. The website headline must be a clear benefit, not a slogan."
VISUAL = TEAM + ("\n\nROLE: Visual Branding Agent. Design the visual identity: a 5-colour palette (one each of primary, secondary, accent, ink, paper), Google Fonts, design direction, "
                 "icon and illustration style, and THREE distinct logo mark concepts, each composed from a container shape, a glyph, palette colours and an optional accent dot (the first is your recommendation). Start from the prototype's palette and fonts when it has them, changing them only if the brand "
                 "strategy argues for it. Ink must contrast strongly with paper.")
LANDING = TEAM + "\n\nROLE: Landing Page Copywriter. Write complete launch page copy (hero, problem, features, benefits, how it works, social proof, FAQ, final CTA) using the positioning and audience research. Social proof uses ONLY real numbers from the context; testimonial quotes are templates to be replaced by real ones."
GROWTH = TEAM + "\n\nROLE: Growth Strategist. Build the launch strategy in 3 phases, a first-100-users plan and a first-1000-users plan, acquisition channels, growth loops, referral ideas, community strategy and partnerships. Be concrete (who to contact, what to offer, what to measure); prefer low-cost tactics suited to a pre-launch startup."
CONTENT = TEAM + "\n\nROLE: Content Marketing Agent. Plan blog topics, SEO opportunities, LinkedIn content, X threads, Reddit strategies (respecting each community's rules), email campaigns and newsletter ideas."
CALENDAR = TEAM + "\n\nROLE: Content Marketing Agent. Produce a 30-day content calendar: exactly one entry per day 1-30, mixing the channels that the growth plan prioritises, day 1 is launch day, every entry has a topic, hook and CTA."
MARKETING = TEAM + "\n\nROLE: Marketing Asset Generator. Write social posts (Instagram, LinkedIn, X) and the copy for 6-8 launch graphics: launch, announcement, two feature graphics, waitlist and referral. Graphic headlines are short and punchy."
ADS = TEAM + "\n\nROLE: Ad Creative Agent. Write two ads for each of Meta, Google, LinkedIn and Reddit, each with headline, primary text, CTA and a creative concept. Respect platform limits (Google headline 30 chars). Reddit ads must feel native, not corporate."
DECK = TEAM + ("\n\nROLE: Presentation Generator. Write an investor pitch deck of exactly 10 slides in this order: Problem, Solution, Market, Product, Business Model, Competition, Traction, Go-To-Market, Financials, Ask. "
               "Traction uses only measured numbers from the context (validation scores, experiments, board verdict) — if there are none, say it is pre-launch and list the validation evidence. "
               "Market uses only the market size in the context. Financials and the Ask are clearly labelled illustrative assumptions/proposals built from the MVP cost estimate and pricing in the context; do not present forecasts as facts.")
READY = TEAM + "\n\nROLE: Launch Readiness Agent. Identify the additional issues that could block or sink the launch and produce a practical launch checklist across Brand, Product, Marketing, Sales and Legal & Operations. Reference the measured gaps provided."


class State(TypedDict, total=False):
    brand: dict
    positioning: dict
    messaging: dict
    visual: dict
    kit: dict
    landing: dict
    growth: dict
    content: dict
    calendar: dict
    marketing: dict
    ads: dict
    deck: dict
    readiness: dict


# ---------------------------------------------------------------- files

class Files:
    """Uploads generated files to Supabase Storage and keeps the manifest the UI shows downloads from."""

    def __init__(self, run):
        self.run, self.items = run, []

    def add(self, key: str, label: str, group: str, filename: str, data: bytes | str, preview: bool = False) -> str:
        data = data.encode() if isinstance(data, str) else data
        path = f"{self.run.id}/{filename}"
        design_intel._sb("POST", f"object/{BUCKET}/{path}", {"Content-Type": CONTENT_TYPES[os.path.splitext(filename)[1]], "x-upsert": "true"}, content=data)
        url = f"{core.SB_URL}/storage/v1/object/public/{BUCKET}/{path}"
        self.items = [i for i in self.items if i["key"] != key] + [{"key": key, "label": label, "group": group, "filename": filename, "url": url, "bytes": len(data), "preview": preview}]
        return url

    def save(self):
        self.run.save("assets", {"files": self.items})


def image_concept(prompt: str) -> bytes | None:
    """Optional AI concept image (Gemini image model). Needs an image-capable plan; returns None when unavailable."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    try:
        r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{os.getenv('IMAGE_MODEL', 'gemini-2.5-flash-image')}:generateContent", timeout=90,
                       headers={"x-goog-api-key": key}, json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["IMAGE"]}})
        if r.status_code != 200:
            return None
        for part in r.json()["candidates"][0]["content"]["parts"]:
            if "inlineData" in part:
                return base64.b64decode(part["inlineData"]["data"])
    except Exception as e:
        print("image concept failed:", str(e)[:120])
    return None


# ---------------------------------------------------------------- the graph

def build(run, ctx: dict):
    name = ctx["venture"]["name"]
    files = Files(run)
    CTX = "STARTUP CONTEXT (measured facts only):\n" + _compact(ctx)
    prior = lambda s, *keys: "\n\n".join(f"{k.upper()} (decided):\n{_compact(s[k])}" for k in keys if k in s)

    def gen(kind, schema, system, user, max_tokens=6500):
        """Run an LLM agent, or reuse its saved result when resuming a failed run."""
        cached = run.load(kind)
        if cached:
            return cached, True
        d = ask(schema, system, user, max_tokens=max_tokens, temperature=0.6).model_dump()
        run.save(kind, d)
        return d, False

    def reuse(box, fresh, text):
        box["summary"] = text + ("" if fresh else " (reused from the earlier run)")

    def strategist(key, agent, schema, system, keys, summary, max_tokens=6500):
        def fn(s):
            with run.step(agent) as box:
                d, cached = gen(key, schema, system, f"{CTX}\n\n{prior(s, *keys)}", max_tokens)
                box["summary"], box["detail"] = summary(d) + (" (reused from the earlier run)" if cached else ""), d.get("reasoning")
            return {key: d}
        return fn

    def brand_kit(s):
        v = s["visual"]
        t = R.brand_tokens(v["colors"], v["heading_font"], v["body_font"])
        return {"t": t, "icon": R.build_mark(v["logo_concepts"][0], name, t), "concept": v["logo_concepts"][0]}

    def visual(s):
        with run.step("Visual Branding Agent") as box:
            v, cached = gen("visual", Visual, VISUAL, f"{CTX}\n\n{prior(s, 'brand', 'positioning')}", 7000)
            kit = brand_kit({"visual": v})
            t, icon = kit["t"], kit["icon"]
            concepts = [dict(c) for c in v["logo_concepts"]]
            with R.Renderer() as r:
                variants = R.logo_variants(name, kit["concept"], t)
                pack = dict(variants)
                prim = R.logo_png(r, variants["logo-primary.svg"], 2000, 500)
                sec = R.logo_png(r, variants["logo-secondary-stacked.svg"], 1200, 1000)
                ico = R.logo_png(r, variants["icon-mark.svg"], 1024, 1024)
                dark = R.logo_png(r, variants["logo-primary-on-dark.svg"], 2000, 500, t["ink"])
                pack.update({"logo-primary.png": prim, "logo-secondary-stacked.png": sec, "icon-mark.png": ico, "logo-primary-on-dark.png": dark})
                pack["README.txt"] = (f"{name} logo pack\nPrimary: horizontal logo. Secondary: stacked logo. Icon mark: app icon / avatar. '-on-dark' versions are for dark backgrounds; "
                                      f"mono versions for one-colour printing.\nSVGs reference the brand font ({t['heading']}) from Google Fonts; PNGs have it embedded.\n")
                files.add("logo_pack_zip", "Logo pack (SVG + PNG)", "brand", "logo-pack.zip", R.zip_bytes(pack))
                files.add("logo_primary", "Primary logo", "brand", "logo-primary.png", prim, preview=True)
                files.add("logo_secondary", "Secondary logo", "brand", "logo-secondary.png", sec, preview=True)
                files.add("logo_icon", "Icon mark", "brand", "icon-mark.png", ico, preview=True)
                files.add("logo_dark", "Primary logo on dark", "brand", "logo-primary-on-dark.png", dark, preview=True)
                for i, c in enumerate(concepts):
                    png = R.logo_png(r, R.logo_svg("icon", name, R.build_mark(c, name, t), t), 512, 512, t["paper"])
                    c["png_url"] = files.add(f"concept_{i + 1}", f"Logo concept {i + 1}: {c['name']}", "concepts", f"concept-{i + 1}.png", png, preview=True)
                image_ok = False
                for i, c in enumerate(concepts):
                    img = image_concept(c["image_prompt"])
                    if not img:
                        break
                    image_ok = True
                    c["image_url"] = files.add(f"concept_image_{i + 1}", f"AI concept image {i + 1}", "concepts", f"concept-ai-{i + 1}.png", img, preview=True)
                d = {"brand": s["brand"], "positioning": s["positioning"], "messaging": s["messaging"], "visual": {**v}}
                pdf = r.pdf(R.guidelines_html(d, name, icon, t), 1280, 720)
                files.add("brand_guidelines_pdf", "Brand guidelines (PDF)", "brand", "brand-guidelines.pdf", pdf)
            files.save()
            run.save("kit", {"tokens": t, "icon": icon, "concepts": concepts, "image_generation": "generated" if image_ok else "unavailable"})
            box["summary"] = f"{v['concept_name']}: {', '.join(c['name'] for c in v['colors'])} · {v['heading_font']} / {v['body_font']}" + ("" if not cached else " (design reused)")
            box["detail"] = v["reasoning"] + ("" if image_ok else "\n\nAI concept images were skipped: the image model is not available on this API plan. Logos are editable SVG.")
        return {"visual": v, "kit": kit}

    def content(s):
        with run.step("Content Marketing Agent") as box:
            c, cached = gen("content", Content, CONTENT, f"{CTX}\n\n{prior(s, 'brand', 'positioning', 'messaging', 'growth')}", 7500)
            cal, cached2 = gen("calendar", Calendar, CALENDAR, f"{CTX}\n\n{prior(s, 'brand', 'messaging', 'growth')}\n\nCONTENT PLAN:\n{_compact({k: c[k] for k in ('blog_topics', 'x_threads', 'reddit')})[:3500]}", 6500)
            days = sorted(cal["days"], key=lambda d: d["day"])
            files.add("content_calendar_csv", "30-day content calendar (CSV)", "content", "content-calendar.csv",
                      R.csv_bytes(["Day", "Channel", "Format", "Topic", "Hook", "CTA"], [[d["day"], d["channel"], d["format"], d["topic"], d["hook"], d["cta"]] for d in days]))
            files.save()
            box["summary"] = f"{len(c['blog_topics'])} blog topics, {len(c['seo'])} SEO keywords, {len(days)}-day calendar" + (" (reused)" if cached and cached2 else "")
            box["detail"] = c["reasoning"]
        return {"content": c, "calendar": cal}

    def marketing(s):
        with run.step("Marketing Asset Generator") as box:
            m, cached = gen("marketing", Marketing, MARKETING, f"{CTX}\n\n{prior(s, 'brand', 'positioning', 'messaging', 'growth')}", 6500)
            t, icon = s["kit"]["t"], s["kit"]["icon"]
            by_kind, by_platform, n = {}, {}, 0
            with R.Renderer() as r:
                for g in m["graphics"][:8]:
                    for fmt in (g["formats"] or ["instagram"])[:2]:
                        w, h = R.SIZES[fmt]
                        html = R.graphic_html(g, name, icon, t, w, h)
                        png = r.png(html, w, h)
                        n += 1
                        stem = f"graphic-{n:02d}-{g['kind']}-{fmt}"
                        by_kind[f"{stem}.png"], by_kind[f"{stem}.html"] = png, html
                        by_platform[f"{fmt}/{stem}.png"] = png
                        files.add(f"graphic_{n}", f"{g['kind'].title()} · {fmt.title()}", "graphics", f"{stem}.png", png, preview=True)
            files.add("marketing_graphics_zip", "Marketing graphics (PNG + editable HTML)", "graphics", "marketing-graphics.zip", R.zip_bytes({**by_kind, "README.txt": "Each graphic ships as a PNG and an HTML source file: open the HTML in a browser and edit the text/colours, or re-export."}))
            posts = [["Instagram", p["caption"], " ".join("#" + h.lstrip("#") for h in p["hashtags"])] for p in m["instagram_posts"]] + [["LinkedIn", p, ""] for p in m["linkedin_posts"]] + [["X", p, ""] for p in m["x_posts"]]
            files.add("social_assets_zip", "Social media assets (graphics by platform + captions)", "graphics", "social-assets.zip",
                      R.zip_bytes({**by_platform, "captions.csv": R.csv_bytes(["Platform", "Copy", "Hashtags"], posts)}))
            files.save()
            box["summary"] = f"{n} graphics, {len(m['instagram_posts'])} Instagram, {len(m['linkedin_posts'])} LinkedIn, {len(m['x_posts'])} X posts" + (" (copy reused)" if cached else "")
            box["detail"] = m["reasoning"]
        return {"marketing": m}

    def ads(s):
        with run.step("Ad Creative Agent") as box:
            a, cached = gen("ads", Ads, ADS, f"{CTX}\n\n{prior(s, 'brand', 'positioning', 'messaging', 'growth')}", 6500)
            t, icon = s["kit"]["t"], s["kit"]["icon"]
            out = {}
            with R.Renderer() as r:
                for i, ad in enumerate(a["ads"][:8], 1):
                    html, w, h = R.ad_html(ad, name, icon, t)
                    png = r.png(html, w, h)
                    out[f"ad-{i:02d}-{ad['platform'].lower()}.png"] = png
                    files.add(f"ad_{i}", f"{ad['platform']} ad · {ad['variant']}", "ads", f"ad-{i:02d}-{ad['platform'].lower()}.png", png, preview=True)
            out["ads.csv"] = R.csv_bytes(["Platform", "Variant", "Headline", "Image text", "Primary text", "Description", "CTA", "Creative concept", "Targeting"],
                                         [[x["platform"], x["variant"], x["headline"], x["creative_headline"], x["primary_text"], x["description"], x["cta"], x["creative_concept"], x["targeting"]] for x in a["ads"]])
            files.add("ad_creatives_zip", "Ad creatives (mockups + copy)", "ads", "ad-creatives.zip", R.zip_bytes(out))
            files.save()
            box["summary"] = f"{len(a['ads'])} ads across Meta, Google, LinkedIn and Reddit" + (" (copy reused)" if cached else "")
            box["detail"] = a["reasoning"]
        return {"ads": a}

    def deck(s):
        with run.step("Presentation Generator") as box:
            d, cached = gen("deck", Deck, DECK, f"{CTX}\n\n{prior(s, 'brand', 'positioning', 'messaging', 'growth')}\n\nCOMPETITION NOTE: use the competitors and white space in the context.", 7000)
            t, icon = s["kit"]["t"], s["kit"]["icon"]
            slides = [{"layout": "cover", "title": name, "headline": s["brand"]["tagline"]}] + [
                {"title": x["title"], "headline": x["headline"], "bullets": x["bullets"], "callout": x.get("callout"), "layout": "split" if x.get("callout") else "bullets"} for x in d["slides"][:10]]
            for sl in slides:  # the deck must say which numbers are assumptions, on the slide where they appear
                if sl["title"].lower().startswith("financ"):
                    sl["bullets"] = [*sl["bullets"][:4], "Note: " + d["assumptions_note"]]
            html = R.deck_html(slides, name, icon, t)
            with R.Renderer() as r:
                pdf = r.pdf(html, 1280, 720)
                thumbs = r.slides(html, 1280, 720, "section.s")
                icon_png = R.logo_png(r, R.logo_svg("icon", name, icon, t), 256, 256)
            files.add("deck_pdf", "Investor pitch deck (PDF)", "deck", "pitch-deck.pdf", pdf)
            files.add("deck_pptx", "Investor pitch deck (PPTX)", "deck", "pitch-deck.pptx", R.deck_pptx(slides, name, t, icon_png))
            for i, th in enumerate(thumbs):
                files.add(f"slide_{i}", f"Slide {i}" if i else "Cover", "slides", f"slide-{i:02d}.png", th, preview=True)
            files.save()
            box["summary"] = f"{len(slides)} slides (cover + Problem to Ask) exported as PPTX and PDF" + (" (copy reused)" if cached else "")
            box["detail"] = d["reasoning"] + "\n\n" + d["assumptions_note"]
        return {"deck": d}

    def readiness(s):
        with run.step("Launch Readiness Agent") as box:
            rd = ctx.get("readiness", {}).get("by_module", {})
            tr = ctx.get("traction", [])
            visitors = max([x.get("visitors", 0) for x in tr] or [0])
            assets = {i["key"] for i in files.items} | {i["key"] for i in (run.load("assets") or {}).get("files", [])}
            has = lambda *ks: all(k in assets for k in ks)
            brand_r = 25 * has("logo_pack_zip") + 25 * has("brand_guidelines_pdf") + 25 * bool(s["brand"].get("voice")) + 25
            mkt_r = min(30, 5 * len(s["marketing"]["graphics"])) + 25 * (len(s["calendar"]["days"]) >= 28) + min(25, 3 * len(s["ads"]["ads"])) + 20 * bool(s["growth"]["first_100"])
            prod_r = round(0.5 * rd.get("prototype", 0) + 0.3 * rd.get("validation", 0) + 0.2 * rd.get("experiments", 0))
            sales_r = 30 * has("deck_pptx", "deck_pdf") + 25 * bool(s["landing"]["hero"]["headline"]) + 20 * bool(s["messaging"]["elevator_pitch"]) + (25 if visitors >= 30 else 10 if visitors > 0 else 0)
            overall = round(0.2 * brand_r + 0.25 * mkt_r + 0.3 * prod_r + 0.25 * sales_r)
            blockers = []
            board = ctx.get("boardroom") or {}
            if board.get("decision") == "KILL":
                blockers.append({"severity": "high", "issue": f"The Boardroom voted KILL ({board.get('confidence')}% confidence).", "fix": "Address the board's objections or pivot before spending on a launch."})
            val = ctx.get("validation")
            if not val or val.get("overall", 0) < 50:
                blockers.append({"severity": "high", "issue": "Validation is missing or scores below 50.", "fix": "Re-run validation and raise the weakest score with real evidence."})
            if visitors < 30:
                blockers.append({"severity": "high", "issue": f"No real-world traction evidence yet ({visitors} visitors in the busiest experiment).", "fix": "Put the prototype in front of 30+ target users and measure sign-ups before launch; the deck's Traction slide needs real numbers."})
            if not ctx["prototype"].get("built"):
                blockers.append({"severity": "high", "issue": "There is no prototype yet.", "fix": "Build one in the Prototype tab so the launch page and ads can point to something real."})
            elif (ctx["prototype"].get("quality") or 0) < 7:
                blockers.append({"severity": "medium", "issue": f"The prototype's quality score is {ctx['prototype'].get('quality') or 'unreviewed'}/10.", "fix": "Improve the weakest screens with 'Change anything' before sending traffic to it."})
            r_out, cached = gen("readiness_llm", Readiness, READY,
                                f"{CTX}\n\nMEASURED SCORES: brand {brand_r}, marketing {mkt_r}, product {prod_r}, sales {sales_r}. Issues already listed: {_compact(blockers)}\n\n{prior(s, 'brand', 'positioning', 'growth')}", 5000)
            checklist = [{**c, "id": f"c{i}"} for i, c in enumerate(r_out["checklist"])]
            issues = sorted(blockers + r_out["blocking_issues"], key=lambda b: {"high": 0, "medium": 1, "low": 2}[b["severity"]])
            penalty = sum({"high": 10, "medium": 4, "low": 1}[b["severity"]] for b in issues)  # generated assets don't make a business launch-ready
            final = max(0, overall - penalty)
            result = {"launch_score": round(final / 10, 1), "readiness_percent": final, "asset_readiness": overall, "penalty": penalty,
                      "areas": {"brand": brand_r, "marketing": mkt_r, "product": prod_r, "sales": sales_r, "launch": final},
                      "blocking_issues": issues, "checklist": checklist}
            run.save("readiness", result)
            order = {"High": 0, "Medium": 1, "Low": 2}
            files.add("launch_checklist_csv", "Launch checklist (CSV)", "checklist", "launch-checklist.csv", R.csv_bytes(
                ["Category", "Task", "Priority", "Why", "Done"], [[c["category"], c["task"], c["priority"], c["why"], ""] for c in sorted(checklist, key=lambda c: order[c["priority"]])]))
            files.save()
            run.patch(launch_score=result["launch_score"])
            box["summary"] = f"Launch score {result['launch_score']}/10 · {len(result['blocking_issues'])} blocking issue(s)"
            box["detail"] = r_out["reasoning"] + f"\n\nBrand {brand_r}%, marketing {mkt_r}%, product {prod_r}%, sales {sales_r}%."
        return {"readiness": result}

    g = StateGraph(State)
    nodes = {
        "brand": strategist("brand", "Brand Strategist", Brand, BRAND, [], lambda d: f"{d['archetype']} · {', '.join(d['voice']['adjectives'])} · “{d['core_promise']}”"),
        "positioning": strategist("positioning", "Positioning Agent", Positioning, POSITION, ["brand"], lambda d: d["statement"]),
        "messaging": strategist("messaging", "Messaging Architect", Messaging, MESSAGE, ["brand", "positioning"], lambda d: f"“{d['website_headline']}”", 7000),
        "visual": visual,
        "landing": strategist("landing", "Landing Page Copywriter", Landing, LANDING, ["brand", "positioning", "messaging"], lambda d: f"“{d['hero']['headline']}” + {len(d['features'])} features, {len(d['faq'])} FAQs", 7000),
        "growth": strategist("growth", "Growth Strategist", Growth, GROWTH, ["brand", "positioning", "messaging"], lambda d: " → ".join(p["name"] for p in d["launch_strategy"]), 7500),
        "content": content, "marketing": marketing, "ads": ads, "deck": deck, "readiness": readiness,
    }
    order = list(nodes)
    for n, fn in nodes.items():
        g.add_node(n, fn)
    g.add_edge(START, order[0])
    for a, b in zip(order, order[1:]):
        g.add_edge(a, b)
    g.add_edge(order[-1], END)
    return g.compile()


def run_gtm(run_id: str, ctx: dict, fresh: bool = False) -> dict:
    if not core.OPENAI:
        raise studio.StudioError("Go-To-Market Studio needs an LLM: set GEMINI_API_KEY (recommended) or GROQ_API_KEY")
    if not core.PGVECTOR:
        raise studio.StudioError("Go-To-Market Studio needs Supabase for file storage")
    rows = studio._db("GET", f"gtm_runs?id=eq.{run_id}&select=*")
    if not rows:
        raise studio.StudioError("Run not found")
    run = studio.Run(rows[0], ("gtm_runs", "gtm_events", "gtm_artifacts", "run_id"))
    run.patch(status="running", stage="Starting", error=None)
    try:
        s = build(run, ctx).invoke({}, config={"recursion_limit": 60})
    except Exception as e:
        run.patch(status="failed", error=str(e)[:500])
        raise
    b, p, m, g, rd = s["brand"], s["positioning"], s["messaging"], s["growth"], s["readiness"]
    run.patch(status="done", stage="Done", error=None)
    k = s["kit"]["t"]
    return {"launch_score": rd["launch_score"], "memory": [
        {"title": "Brand decisions", "content": f"Archetype {b['archetype']}; promise: {b['core_promise']}; tagline: {b['tagline']}; voice: {', '.join(b['voice']['adjectives'])}; "
                                                f"values: {', '.join(v['name'] for v in b['values'])}; colours {k['primary']}/{k['secondary']}/{k['accent']}, fonts {k['heading']} + {k['body']}."},
        {"title": "Positioning decisions", "content": f"{p['statement']} UVP: {p['uvp']} Category to own: {p['category']['category_name']}."},
        {"title": "Messaging decisions", "content": f"Headline: {m['website_headline']}. One sentence: {m['one_sentence']}. Pillars: {'; '.join(x['pillar'] for x in m['pillars'])}."},
        {"title": "Marketing strategy", "content": f"Launch phases: {' → '.join(x['name'] for x in g['launch_strategy'])}. Channels: {', '.join(x['channel'] for x in g['channels'][:5])}. Referral: {g['referral_ideas'][0] if g['referral_ideas'] else ''}"},
        {"title": "Launch assets generated", "content": f"Logo pack, brand guidelines, marketing graphics, ad creatives, 30-day content calendar, investor deck and launch checklist. Launch score {rd['launch_score']}/10 ({rd['readiness_percent']}% ready); blockers: {'; '.join(x['issue'] for x in rd['blocking_issues'][:3])}."}]}
