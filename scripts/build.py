#!/usr/bin/env python3
"""Deterministic static build for the portfolio site.

Reads the content model from content/*.json and writes:
  index.html          both facades, one page
  api/portfolio.json  machine-readable content for agents
  llms.txt            discovery description for AI visitors
  robots.txt          crawl allowance

Zero dependencies. Python standard library only.

Usage:  python3 scripts/build.py [--out DIR] [--check]
        --check  verify generated output matches what is on disk (CI mode)
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"

LINE_COLORS = {"red": "#c0392b", "blue": "#2e86c1"}


def load_content() -> dict:
    site = json.loads((CONTENT / "site.json").read_text())
    projects = json.loads((CONTENT / "projects.json").read_text())
    atlas = json.loads((CONTENT / "atlas.json").read_text())
    if not projects.get("public_safe_reviewed"):
        sys.exit("content guard: projects.json must set public_safe_reviewed true")
    for p in projects["projects"]:
        if not p.get("public_safe"):
            sys.exit(f"content guard: {p['slug']} is not marked public_safe")
    return {"site": site, "projects": projects, "atlas": atlas}


def e(s: object) -> str:
    return html.escape(str(s), quote=True)


def content_digest(data: dict) -> str:
    h = hashlib.sha256()
    for name in ("site.json", "projects.json", "atlas.json"):
        h.update(name.encode())
        h.update((CONTENT / name).read_bytes())
    return h.hexdigest()[:16]


# ---------------------------------------------------------------- index.html

PAGE_SKELETON = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>__TITLE__</title>
<meta name="description" content="__DESCRIPTION__"/>
<link rel="alternate" type="application/json" href="api/portfolio.json"/>
<style>
__CSS__
</style>
</head>
<body>
__BODY__
<script>
__JS__
</script>
</body>
</html>
"""


def render_css() -> str:
    return """  :root{
    --ink:#12100e; --ink-soft:#4a443c; --paper:#f7f4ee; --paper-2:#efe9df;
    --rule:#d8d0c2; --accent:#b3541e; --accent-soft:#f3e3d5;
    --night:#0d0f16; --night-2:#151a28; --night-rule:#2a3348; --night-ink:#e9e6df; --night-soft:#a8b0c4;
    --signal:#e8b04b;
    --sans: ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
  body{margin:0;font-family:var(--sans);color:var(--ink);background:var(--paper);line-height:1.55}
  h1,h2,h3{font-family:var(--serif);font-weight:600;letter-spacing:-0.01em;margin:0}
  p{margin:0}
  a{color:inherit}
  :focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:2px}
  .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
  .concept-bar{position:sticky;top:0;z-index:50;background:var(--paper);border-bottom:1px solid var(--rule)}
  .concept-bar-inner{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:space-between;padding:12px 24px;max-width:1120px;margin:0 auto}
  .concept-title{font-family:var(--mono);font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ink-soft)}
  .seg{display:inline-flex;border:1px solid var(--rule);border-radius:999px;padding:3px;background:var(--paper-2)}
  .seg button{appearance:none;border:0;background:transparent;font:inherit;font-size:14px;font-weight:600;padding:8px 18px;min-height:44px;border-radius:999px;color:var(--ink-soft);cursor:pointer}
  .seg button[aria-pressed="true"]{background:var(--ink);color:var(--paper)}
  .toggle-view{display:none}
  .toggle-view[data-active="true"]{display:block}
  .kicker{font-family:var(--mono);font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:var(--accent)}
  .lede{font-size:19px;color:var(--ink-soft);max-width:62ch}
  .rule{height:1px;background:var(--rule);border:0;margin:0}
  .hero{padding:96px 0 72px;background:radial-gradient(1200px 500px at 78% -10%, var(--accent-soft), transparent 60%), var(--paper)}
  .hero h1{font-size:clamp(40px,6vw,68px);line-height:1.02;margin:20px 0 0;max-width:16ch}
  .hero .lede{margin-top:22px}
  .hero-meta{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:36px;font-size:14px;color:var(--ink-soft)}
  .hero-meta b{color:var(--ink);font-weight:600}
  .impact-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--rule);border-block:1px solid var(--rule)}
  .impact-strip div{background:var(--paper);padding:26px 4px 24px}
  .impact-strip .num{font-family:var(--serif);font-size:38px;line-height:1}
  .impact-strip .lab{font-size:13px;color:var(--ink-soft);margin-top:8px}
  .impact-strip .kind{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-top:6px;display:block}
  section{padding:76px 0}
  .sec-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 24px;justify-content:space-between;margin-bottom:36px}
  .sec-head h2{font-size:clamp(28px,4vw,40px)}
  .card{border:1px solid var(--rule);border-radius:14px;padding:26px;background:var(--paper);display:flex;flex-direction:column;gap:14px}
  .card h3{font-size:21px}
  .card h3 a{text-decoration:none}
  .card h3 a:hover{text-decoration:underline}
  .card p{color:var(--ink-soft);font-size:15px}
  .card .role{font-size:14px;color:var(--ink-soft)}
  .card .role b{color:var(--ink)}
  .card .figs{list-style:none;padding:0;margin:0;font-size:13px;color:var(--ink-soft);display:grid;gap:4px}
  .card .figs b{color:var(--ink);font-family:var(--mono);font-size:12px}
  .pending{border-style:dashed}
  .tags{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}
  .tags li{font-family:var(--mono);font-size:11px;letter-spacing:0.06em;color:var(--ink-soft);border:1px solid var(--rule);border-radius:999px;padding:4px 10px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .ask-box{border:1px solid var(--rule);border-radius:14px;background:var(--paper-2);padding:28px;display:grid;gap:16px}
  .ask-row{display:flex;gap:12px;flex-wrap:wrap}
  .chip{appearance:none;font:inherit;font-size:14px;min-height:44px;padding:10px 16px;border-radius:999px;border:1px solid var(--rule);background:var(--paper);cursor:pointer;text-align:left}
  .chip[aria-pressed="true"]{border-color:var(--ink);background:var(--ink);color:var(--paper)}
  .answer{background:var(--paper);border:1px solid var(--rule);border-radius:12px;padding:18px 20px;min-height:96px}
  .answer .src{display:block;margin-top:12px;font-family:var(--mono);font-size:11px;color:var(--ink-soft)}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
  .atlas{background:var(--night);color:var(--night-ink)}
  .atlas .lede,.atlas .card p,.atlas .card .role{color:var(--night-soft)}
  .atlas .kicker{color:var(--signal)}
  .atlas .card{background:var(--night-2);border-color:var(--night-rule)}
  .atlas .card .figs b,.atlas .card .role b{color:var(--night-ink)}
  .atlas .tags li{border-color:var(--night-rule);color:var(--night-soft)}
  .atlas .impact-strip .kind{color:var(--signal)}
  .atlas .seg{border-color:var(--night-rule);background:var(--night-2)}
  .atlas .seg button{color:var(--night-soft)}
  .atlas .seg button[aria-pressed="true"]{background:var(--signal);color:#171208}
  .atlas .impact-strip{background:var(--night-rule);border-color:var(--night-rule)}
  .atlas .impact-strip div{background:var(--night)}
  .atlas .impact-strip .lab{color:var(--night-soft)}
  .atlas .ask-box{background:var(--night-2);border-color:var(--night-rule)}
  .atlas .chip{background:var(--night-2);border-color:var(--night-rule);color:var(--night-ink)}
  .atlas .chip[aria-pressed="true"]{background:var(--signal);color:#171208;border-color:var(--signal)}
  .atlas .answer{background:var(--night);border-color:var(--night-rule)}
  .atlas .answer .src{color:var(--night-soft)}
  .atlas .card.pending{border-color:var(--night-rule)}
  .atlas :focus-visible{outline-color:var(--signal)}
  .atlas-hero{position:relative;overflow:hidden;border-bottom:1px solid var(--night-rule)}
  .atlas-hero svg{display:block;width:100%;height:auto}
  .atlas-copy{position:relative;padding:56px 0 0}
  .atlas-copy h1{font-size:clamp(36px,5vw,58px);line-height:1.05;margin:18px 0 0;max-width:18ch}
  .atlas-copy .lede{margin-top:20px}
  .atelier-note{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;font-family:var(--mono);font-size:12px;color:var(--night-soft);padding:18px 24px;border:1px dashed var(--night-rule);border-radius:12px;margin-top:32px}
  .atelier-note b{color:var(--signal);font-weight:600}
  footer.site-foot{padding:36px 24px;color:var(--ink-soft);font-size:14px;display:flex;flex-wrap:wrap;gap:8px 24px}
  .atlas footer.site-foot{color:var(--night-soft)}
  [data-facade="atlas"].concept-bar{background:var(--night);border-color:var(--night-rule)}
  [data-facade="atlas"] .concept-title{color:var(--night-soft)}
  [data-facade="atlas"] .seg{border-color:var(--night-rule);background:var(--night-2)}
  [data-facade="atlas"] .seg button{color:var(--night-soft)}
  [data-facade="atlas"] .seg button[aria-pressed="true"]{background:var(--signal);color:#171208}
  .filter-bar{display:grid;gap:14px;margin-bottom:28px}
  .filter-bar input[type="search"]{font:inherit;font-size:15px;min-height:44px;padding:10px 16px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);color:var(--ink);max-width:420px;width:100%}
  .filter-bar input[type="search"]:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
  @media (prefers-reduced-motion: reduce){*{animation:none !important;transition:none !important}}
  @media (max-width:860px){
    .grid-3{grid-template-columns:1fr}
    .impact-strip{grid-template-columns:repeat(2,1fr)}
    .hero{padding:64px 0 56px}
    section{padding:56px 0}
  }"""


def render_js() -> str:
    return """(function(){
  var d=document, btnD=d.getElementById('btn-dispatch'), btnA=d.getElementById('btn-atlas'),
      vD=d.getElementById('view-dispatch'), vA=d.getElementById('view-atlas'),
      bar=d.getElementById('concept-bar');
  function show(which){
    var dispatch = which==='dispatch';
    vD.hidden=!dispatch; vD.dataset.active=String(dispatch);
    vA.hidden=dispatch;  vA.dataset.active=String(!dispatch);
    btnD.setAttribute('aria-pressed',String(dispatch));
    btnA.setAttribute('aria-pressed',String(!dispatch));
    bar.dataset.facade = which;
    document.title = dispatch ? 'Aditya Patel: The Dispatch' : 'Aditya Patel: The Atlas';
  }
  btnD.addEventListener('click',function(){show('dispatch')});
  btnA.addEventListener('click',function(){show('atlas')});
  if(location.hash==='#atlas') show('atlas');
  d.querySelectorAll('.chip').forEach(function(btn){
    btn.addEventListener('click',function(){
      var box = btn.closest('.ask-box').querySelector('.answer');
      box.firstChild.nodeValue = ' ' + btn.dataset.answer;
      box.querySelector('.src').textContent = 'Source: ' + btn.dataset.source;
      btn.closest('.ask-row').querySelectorAll('.chip').forEach(function(c){c.setAttribute('aria-pressed','false')});
      btn.setAttribute('aria-pressed','true');
    });
  });
  var filter = d.getElementById('project-filter');
  var countEl = d.getElementById('project-count');
  var chips = d.getElementById('tag-chips');
  var cards = Array.from(d.querySelectorAll('#view-dispatch article'));
  if (filter && cards.length) {
    var tags = [];
    cards.forEach(function(c){
      c.querySelectorAll('.tags li').forEach(function(t){
        var v = t.textContent.trim();
        if (tags.indexOf(v) === -1) tags.push(v);
      });
    });
    tags.slice(0, 14).forEach(function(t){
      var b2 = d.createElement('button');
      b2.type = 'button'; b2.className = 'chip'; b2.textContent = t;
      b2.addEventListener('click', function(){
        var on = b2.getAttribute('aria-pressed') === 'true';
        d.querySelectorAll('#tag-chips .chip').forEach(function(c){c.setAttribute('aria-pressed','false')});
        b2.setAttribute('aria-pressed', String(!on));
        filter.value = on ? '' : t;
        apply();
      });
      chips.appendChild(b2);
    });
    function apply(){
      var q = filter.value.trim().toLowerCase();
      var n = 0;
      cards.forEach(function(c){
        var match = c.textContent.toLowerCase().indexOf(q) !== -1;
        c.style.display = match ? '' : 'none';
        if (match) n++;
      });
      countEl.textContent = n + ' of ' + cards.length + ' projects';
    }
    filter.addEventListener('input', apply);
    apply();
  }
  var hero = d.querySelector('.atlas-hero svg');
  if(hero && matchMedia('(pointer:fine)').matches){
    var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!calm){
      var region = hero.parentElement;
      region.addEventListener('pointermove', function(ev){
        var r = this.getBoundingClientRect();
        var nx = (ev.clientX - r.left)/r.width - 0.5;
        var ny = (ev.clientY - r.top)/r.height - 0.5;
        hero.style.transform = 'translate('+(nx*-10).toFixed(1)+'px,'+(ny*-6).toFixed(1)+'px) scale(1.02)';
      });
      region.addEventListener('pointerleave', function(){ hero.style.transform=''; });
    }
  }
})();"""


def render_hero(site: dict) -> str:
    return f"""  <header class="hero">
    <div class="wrap">
      <span class="kicker">{e(site['owner'])} &middot; {e(site['role'])}, {e(site['location'])}</span>
      <h1>{e(site['tagline'])}</h1>
      <p class="lede">{e(site['intro'])}</p>
      <p class="hero-meta">{''.join(f'<span><b>{e(i["value"])}</b> {e(i["label"].split(",")[0])}</span>' for i in site['impact'][:3])}</p>
      {f'<p class="lede" style="margin-top:18px">{e(site["academics_line"])}</p>' if site.get("academics_line") else ''}
    </div>
  </header>"""


def render_impact(site: dict) -> str:
    cells = "".join(
        f"""<div><div class="num">{e(i['value'])}</div><div class="lab">{e(i['label'])}</div><span class="kind">{e(i['kind'])}</span></div>"""
        for i in site["impact"]
    )
    return f'  <div class="impact-strip" aria-label="Headline impact figures">\n{cells}\n  </div>'


def project_card(p: dict, pending_label: str) -> str:
    cls = "card pending" if p.get("status") == "pending-content" else "card"
    figs = "".join(
        f'<li><b>{e(f["value"])}</b> {e(f["label"])} <i>({e(f["kind"])})</i></li>'
        for f in p.get("figures", [])
    )
    figblock = f'<ul class="figs">{figs}</ul>' if figs else ""
    tags = "".join(f"<li>{e(t)}</li>" for t in p.get("tags", []))
    approach = "".join(f"<li>{e(a)}</li>" for a in p.get("approach", []))
    role = f'<p class="role"><b>Role:</b> {e(p["role"])}</p>' if p.get("role") else ""
    kicker = f"{e(p['line'])} line"
    if p.get("course"):
        kicker += f" &middot; {e(p['course'])}"
    return f"""      <article class="{cls}">
        <span class="kicker">{kicker}</span>
        <h3><a href="projects/{e(p['slug'])}/">{e(p['title'])}</a></h3>
        <p>{e(p['summary'])}</p>
        {role}{figblock}
        <ul class="tags">{tags}</ul>
      </article>"""


def render_ask(site: dict, facade_id: str) -> str:
    chips = "".join(
        f'<button type="button" class="chip" data-answer="{e(a["answer"])}" data-source="{e(a["source"])}">{e(a["question"])}</button>'
        for a in site["ask_examples"]
    )
    return f"""  <section aria-labelledby="{facade_id}-ask"{" style=\"background:var(--paper-2)\"" if facade_id == "f1" else ""}>
    <div class="wrap">
      <div class="sec-head">
        <div>
          <span class="kicker">Ask the guide</span>
          <h2 id="{facade_id}-ask">{"Questions get sourced answers" if facade_id == "f1" else "The Atlas answers too"}</h2>
        </div>
      </div>
      <div class="ask-box">
        <div class="ask-row" role="group" aria-label="Example questions">
{chips}
        </div>
        <div class="answer" id="{facade_id}-answer" role="status" aria-live="polite"> Pick a question to see how answers stay tied to the evidence.
          <span class="src">No answer yet</span>
        </div>
      </div>
    </div>
  </section>"""


def render_atlas_svg(atlas: dict, projects: dict) -> str:
    buildings = []
    for b in atlas["buildings"]:
        extra = ""
        if b.get("extra"):
            if b.get("extra_fill"):
                extra = f'<path d="{b["extra"]}" fill="{b["extra_fill"]}" stroke="none"/>'
            else:
                extra = f'<path d="{b["extra"]}" stroke="{b["extra_stroke"]}" stroke-width="{b["extra_width"]}" fill="none"/>'
        buildings.append(f'<g><title>{e(b["name"])}: {e(b["feature"])}</title><path d="{b["d"]}" fill="url(#towerGlass)" stroke="#3a4a6e" stroke-width="1"/>{extra}</g>')
    lights = atlas["window_lights"]
    w, h = atlas["window_size"]
    # A list of rect strings, not one joined string: the renderer below joins it
    # with newlines again, and iterating a string would split it per character.
    light_rects = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>' for x, y in lights]
    river = []
    for r in atlas["river"]:
        attrs = f'stroke="{r["stroke"]}" stroke-width="{r["width"]}"'
        if "fill" in r:
            attrs = f'fill="{r["fill"]}" ' + attrs
        else:
            attrs = 'fill="none" ' + attrs
        if "opacity" in r:
            attrs += f' opacity="{r["opacity"]}"'
        river.append(f'<path d="{r["d"]}" {attrs}/>')
    routes = []
    for r in atlas.get("routes", []):
        line = r["line"]
        routes.append(
            f'<path d="{r["d"]}" stroke="{LINE_COLORS.get(line, "#c0392b")}" marker-end="url(#arrow{line.capitalize()})"/>'
        )
    stations = []
    for slug, s in atlas["labels"].items():
        project = next((p for p in projects["projects"] if p["slug"] == slug), None)
        color = LINE_COLORS.get(project["line"], "#c0392b") if project else "#c0392b"
        stations.append(
            f'<g><title>{e(s["label"])}</title>'
            f'<circle cx="{s["cx"]}" cy="{s["cy"]}" r="{atlas["station_style"]["r"]}" fill="{atlas["station_style"]["fill"]}" stroke="{color}" stroke-width="{atlas["station_style"]["stroke_width"]}"/>'
            f'<text x="{s["cx"] + s["dx"]}" y="{s["cy"] + s["dy"]}">{e(s["label"])}</text></g>'
        )
    sky, fill = atlas["sky"], atlas["building_fill"]
    sky_stops = "".join(f'<stop offset="{s["offset"]}" stop-color="{s["color"]}"/>' for s in sky["stops"])
    fill_stops = "".join(f'<stop offset="{s["offset"]}" stop-color="{s["color"]}"/>' for s in fill["stops"])
    return f"""    <svg viewBox="{atlas['viewBox']}" role="img" aria-label="The Atlas: a Chicago rail-map world where projects become stations">
      <defs>
        <linearGradient id="{sky['id']}" x1="{sky['x1']}" y1="{sky['y1']}" x2="{sky['x2']}" y2="{sky['y2']}">
          {sky_stops}
        </linearGradient>
        <linearGradient id="{fill['id']}" x1="{fill['x1']}" y1="{fill['y1']}" x2="{fill['x2']}" y2="{fill['y2']}">
          {fill_stops}
        </linearGradient>
        <marker id="arrowRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#c0392b"/>
        </marker>
        <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#2e86c1"/>
        </marker>
      </defs>
      <rect width="1200" height="470" fill="url(#{sky['id']})"/>
      <g>
{chr(10).join("        " + b for b in buildings)}
      </g>
      <g fill="#e8b04b" opacity="0.75">
{chr(10).join("        " + r for r in light_rects)}
      </g>
      <g>
{chr(10).join("        " + r for r in river)}
      </g>
      <g fill="none" stroke-width="3">
        {chr(10).join("        " + r for r in routes)}
      </g>
      <g font-family="ui-monospace, Menlo, monospace" font-size="13" fill="#e9e6df" style="paint-order:stroke" stroke="{atlas['station_style']['halo']}" stroke-width="5" stroke-linejoin="round">
{chr(10).join("        " + s for s in stations)}
      </g>
    </svg>"""


def render_index(data: dict) -> str:
    site, projects, atlas = data["site"], data["projects"], data["atlas"]
    dispatch_cards = "".join(project_card(p, "pending") for p in projects["projects"])
    body = f"""<div class="concept-bar" id="concept-bar" data-facade="dispatch" role="region" aria-label="Facade switch">
  <div class="concept-bar-inner">
    <span class="concept-title">Aditya Patel: Engineering Portfolio</span>
    <div class="seg" role="group" aria-label="Choose a facade">
      <button type="button" id="btn-dispatch" aria-pressed="true">{e(site['facades']['dispatch']['name'])}</button>
      <button type="button" id="btn-atlas" aria-pressed="false">{e(site['facades']['atlas']['name'])}</button>
    </div>
  </div>
</div>

<main>
<div class="toggle-view" id="view-dispatch" data-active="true" aria-label="{e(site['facades']['dispatch']['name'])}">
{render_hero(site)}
{render_impact(site)}
  <section aria-labelledby="f1-work">
    <div class="wrap">
      <div class="sec-head">
        <div>
          <span class="kicker">Selected work</span>
          <h2 id="f1-work">Projects and what changed</h2>
        </div>
        <span class="concept-title" id="project-count"></span>
      </div>
      <div class="filter-bar">
        <label class="sr-only" for="project-filter">Filter projects</label>
        <input type="search" id="project-filter" placeholder="Filter by name, tag, or skill" autocomplete="off"/>
        <div class="ask-row" id="tag-chips" role="group" aria-label="Filter by tag"></div>
      </div>
      <div class="grid-3">
{dispatch_cards}
      </div>
    </div>
  </section>
  <section aria-labelledby="f1-about">
    <div class="wrap">
      <div class="sec-head">
        <div>
          <span class="kicker">About</span>
          <h2 id="f1-about">The short version</h2>
        </div>
      </div>
      <div class="card">
        <p>{e(site['about'])}</p>
        <p class="role"><b>GitHub:</b> <a href="{e(site['contact']['github'])}">{e(site['contact']['github'].replace('https://', ''))}</a></p>
      </div>
    </div>
  </section>
{render_ask(site, "f1")}
  <hr class="rule"/>
  <footer class="wrap site-foot"><span>{e(site['facades']['dispatch']['description'])}</span><span>Machine-readable content: <a href="api/portfolio.json">portfolio.json</a></span></footer>
</div>

<div class="toggle-view atlas" id="view-atlas" data-active="false" aria-label="{e(site['facades']['atlas']['name'])}" hidden>
  <header class="atlas-hero">
{render_atlas_svg(atlas, projects)}
{render_impact(site)}
  </header>
  <div class="atlas-copy">
    <div class="wrap">
      <span class="kicker">Facade 2: The Atlas</span>
      <h1>The city is the navigation.</h1>
      <p class="lede">Same portfolio, different facade: the skyline is authored SVG, the river and elevated lines are routes, and each project is a station on the map.</p>
      <p class="atelier-note"><b>Art pipeline:</b> {len(atlas['buildings'])} named landmarks as authored SVG. <span>Routes and stations render from data, so the map is diffable source.</span></p>
    </div>
  </div>
  <section aria-labelledby="f2-work">
    <div class="wrap">
      <div class="sec-head">
        <div>
          <span class="kicker">Stations</span>
          <h2 id="f2-work">The same projects, mapped</h2>
        </div>
      </div>
      <div class="grid-3">
{dispatch_cards}
      </div>
    </div>
  </section>
{render_ask(site, "f2")}
  <hr class="rule"/>
  <footer class="wrap site-foot"><span>{e(site['facades']['atlas']['description'])}</span><span>Machine-readable content: <a href="api/portfolio.json">portfolio.json</a></span></footer>
</div>
</main>"""
    page = PAGE_SKELETON
    page = page.replace("__DESCRIPTION__", e(site["tagline"] + " " + site["intro"]))
    page = page.replace("__TITLE__", "Aditya Patel: Engineering Portfolio")
    page = page.replace("__CSS__", render_css())
    page = page.replace("__BODY__", body)
    page = page.replace("__JS__", render_js())
    return page


# ------------------------------------------------------------ detail pages

def render_project_page(project: dict, site: dict) -> str:
    """Standalone page for one project: the full record behind the card."""
    course = f'<span class="kicker">{e(project["course"])}</span>' if project.get("course") else ""
    figs = "".join(
        f'<li><b>{e(f["value"])}</b> {e(f["label"])} <i>({e(f["kind"])}, source: {e(f["source"])})</i></li>'
        for f in project.get("figures", [])
    )
    figblock = f'<ul class="figs">{figs}</ul>' if figs else ""
    steps = "".join(f"<li>{e(a)}</li>" for a in project.get("approach", []))
    steps_block = f'<h3>Approach</h3><ol class="steps">{steps}</ol>' if steps else ""
    tags = "".join(f"<li>{e(t)}</li>" for t in project.get("tags", []))
    back = "".join(f'<li><a href="../../#atlas">Back to the Atlas</a></li>' for _ in [0])
    body = f"""  <header class="detail-head">
    <div class="wrap">
      <p class="back"><a href="../../">&larr; The Dispatch</a> &middot; <a href="../../#atlas">The Atlas</a></p>
      {course}
      <span class="kicker">{e(project['line'])} line</span>
      <h1>{e(project['title'])}</h1>
      <p class="lede">{e(project['summary'])}</p>
    </div>
  </header>
  <main class="wrap detail-body">
    <section aria-labelledby="d-problem"><h2 id="d-problem">The problem</h2><p>{e(project['problem'] or 'See the summary above.')}</p></section>
    <section aria-labelledby="d-role"><h2 id="d-role">What was owned</h2><p>{e(project['role'] or 'See the summary above.')}</p></section>
    {steps_block}
    <section aria-labelledby="d-outcome"><h2 id="d-outcome">Outcome</h2><p>{e(project['outcome'] or 'See the summary above.')}</p></section>
    {f'<section aria-labelledby="d-figures"><h2 id="d-figures">Figures</h2>{figblock}</section>' if figs else ''}
    <section aria-labelledby="d-tags"><h2 id="d-tags">Tags</h2><ul class="tags">{tags}</ul></section>
  </main>"""
    page = PAGE_SKELETON
    page = page.replace("__DESCRIPTION__", e(project["summary"]))
    page = page.replace("__TITLE__", e(project["title"] + " | Aditya Patel"))
    page = page.replace("__CSS__", render_css() + """
  .detail-head{padding:56px 0 40px;border-bottom:1px solid var(--rule)}
  .detail-head h1{font-size:clamp(32px,5vw,52px);line-height:1.06;margin:16px 0 0;max-width:20ch}
  .detail-head .back{font-family:var(--mono);font-size:13px;margin:0 0 20px}
  .detail-head .back a{color:var(--accent)}
  .detail-body section{padding:36px 0;border-bottom:1px solid var(--rule);display:grid;gap:14px}
  .detail-body h2{font-size:24px}
  .detail-body h3{font-size:20px;margin-top:8px}
  .detail-body p{color:var(--ink-soft);max-width:70ch}
  .detail-body .steps{color:var(--ink-soft);display:grid;gap:10px;padding-left:22px;max-width:70ch}
  .detail-body .figs{list-style:none;padding:0;display:grid;gap:8px;color:var(--ink-soft)}
  .detail-body .figs b{color:var(--ink);font-family:var(--mono);font-size:13px}""")
    page = page.replace("__BODY__", body)
    page = page.replace("__JS__", "")
    return page


# ------------------------------------------------------------ api + discovery

def render_api(data: dict, digest: str) -> str:
    site, projects = data["site"], data["projects"]
    return json.dumps(
        {
            "owner": site["owner"],
            "role": site["role"],
            "location": site["location"],
            "tagline": site["tagline"],
            "content_sha256": digest,
            "facades": list(site["facades"].keys()),
            "impact": site["impact"],
            "projects": projects["projects"],
        },
        indent=2,
    )


def render_llms(data: dict, digest: str) -> str:
    site, projects = data["site"], data["projects"]
    lines = [
        f"# {site['owner']}",
        "",
        f"> {site['tagline']}",
        "",
        f"{site['intro']} {site['location']}-based {site['role']}.",
        "",
        "## Content",
        "",
        "- Engineering projects with roles, approaches, outcomes, and figures with their hedging (measured, projected, self-reported) and sources.",
        "- Two facades over one content model: The Dispatch (classic scroll, default) and The Atlas (explorable Chicago world, enhancement only).",
        "",
        "## For agents",
        "",
        "- `api/portfolio.json` serves the same project records this page renders. Use it instead of scraping.",
        "- A read-only MCP endpoint is planned but not deployed yet; treat `api/portfolio.json` as the machine-readable source until then.",
        "",
        "## Figures policy",
        "",
        "Figures keep their source hedging. A projection is labeled a projection; nothing on this site should be quoted as a realized saving when it is an estimate.",
        "",
        f"Content hash: {digest}",
        "",
    ]
    return "\n".join(lines)


def render_robots() -> str:
    return "User-agent: *\nAllow: /\n"


# ---------------------------------------------------------------------- main

def build(out: Path) -> list[Path]:
    data = load_content()
    digest = content_digest(data)
    written = []
    targets = [
        (out / "index.html", render_index(data)),
        (out / "api" / "portfolio.json", render_api(data, digest)),
        (out / "llms.txt", render_llms(data, digest)),
        (out / "robots.txt", render_robots()),
    ]
    for path, content in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        written.append(path)
    for p in data["projects"]["projects"]:
        page = out / "projects" / p["slug"] / "index.html"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(render_project_page(p, data["site"]))
        written.append(page)
    return written


def check(out: Path) -> bool:
    data = load_content()
    digest = content_digest(data)
    targets = [
        (out / "index.html", render_index(data)),
        (out / "api" / "portfolio.json", render_api(data, digest)),
        (out / "llms.txt", render_llms(data, digest)),
        (out / "robots.txt", render_robots()),
    ]
    ok = True
    for p in data["projects"]["projects"]:
        page = out / "projects" / p["slug"] / "index.html"
        if not page.exists():
            print(f"MISSING: {page.relative_to(ROOT)}")
            ok = False
        elif page.read_text() != render_project_page(p, data["site"]):
            print(f"STALE:   {page.relative_to(ROOT)}")
            ok = False
    for path, expected in targets:
        if not path.exists():
            print(f"MISSING: {path.relative_to(ROOT)}")
            ok = False
        elif path.read_text() != expected:
            print(f"STALE:   {path.relative_to(ROOT)}")
            ok = False
    print("check: PASS" if ok else "check: FAIL")
    return ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT))
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    if args.check:
        return 0 if check(out) else 1
    written = build(out)
    for p in written:
        print(f"wrote {p.relative_to(ROOT) if ROOT in p.parents or p == ROOT else p} ({p.stat().st_size} bytes)")
    data = load_content()
    print(f"content: {len(data['projects']['projects'])} projects, {len(data['site']['impact'])} impact figures, {len(data['atlas']['buildings'])} landmarks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
