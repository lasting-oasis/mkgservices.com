#!/usr/bin/env python3
"""
Builds docs/MKG-pricing-logic.pdf from the live numbers in plans.js, in English
then Spanish. Rerun after changing prices so the document never drifts from the site.

    node -e 'global.window={};require("./plans.js");...'  (done below)
    python3 docs/make-pricing-pdf.py [font-dir]
"""
import json, os, subprocess, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT_DIR = sys.argv[1] if len(sys.argv) > 1 else ""
OUT = os.path.join(HERE, "MKG-pricing-logic.pdf")

cfg = json.loads(subprocess.check_output(["node", "-e", """
global.window={}; require(process.argv[1]); const s=window.MKG.segments;
const pick=(x)=>({dims:x.dims,frequencies:x.frequencies,plans:x.plans.map(p=>({id:p.id,name:p.name,base:p.base,per:p.per,recommended:!!p.recommended})),singleCleans:x.singleCleans.map(c=>({id:c.id,name:c.name})),followUp:x.followUp,defaults:x.defaults});
process.stdout.write(JSON.stringify({residential:pick(s.residential),commercial:pick(s.commercial)}));
""", os.path.join(ROOT, "plans.js")]))

def money(n): return "${:,.0f}".format(n)
def money2(n):
    if n == int(n): return "${:,.0f}".format(n)
    return "$" + ("{:,.3f}".format(n).rstrip("0"))
def pct(d): return f"{round(d*100)}%"
def num(n): return f"{n:,}"

T = {
  "en": dict(
    title="How the price is calculated", sub="Residential and commercial estimators on mkgservices.com",
    note="All amounts below are the placeholder rates currently in plans.js, shown as “estimates” on the site. Replace them with real rates before launch; the logic stays the same.",
    formula_h="The formula (both service lines)",
    formula="Price per visit = (base + Σ rate per unit × size) × (1 − schedule discount), rounded to the nearest dollar",
    formula_p="Each plan has a base price plus an amount per unit of size. The size units differ by service line. The schedule you pick sets a discount that applies to every visit, not just the first. More frequent visits mean less build-up between them, so each visit costs less.",
    res="Residential", com="Commercial",
    res_size="Size inputs: bedrooms (1–7) and bathrooms (1–6). A half bath counts as one.",
    com_size="Size inputs: floor space in square feet (500–20,000, in steps of 250) and restrooms (1–12). Restrooms count separately because they take the most time per square foot.",
    plans_h="Plans and rates", plan="Plan", base="Base", per="Per {u}",
    units={"bedrooms":"bedroom","bathrooms":"bathroom","sqft":"sq ft","restrooms":"restroom"},
    unit_short={"bedrooms":"bed","bathrooms":"bath","sqft":"sq ft","restrooms":"restroom"},
    rec="(recommended)",
    ladder_h="Schedule discounts", sched="Schedule", off="Discount", vpm="Visits / month",
    monthly_note="The commercial estimator also shows an approximate monthly figure: price per visit × visits per month.",
    ex_h="Worked example", ex_size_res="A {b}-bedroom, {ba}-bathroom home on the {p} plan:", ex_size_com="A {s} sq ft office with {r} restrooms on the {p} plan:",
    full="Full price per visit", step="Step",
    fu_h="Recent deep clean follow-up", fu_p="A one-time visit for a home or space that had a deep clean recently. It is priced from the {plan} one-time price for the same size, less a discount that depends on how recent the deep clean was. The discounts are borrowed from the schedule ladder, so changing a schedule discount changes these too.",
    fu_when="Last deep clean", fu_disc="Discount", fu_price="Example price",
    singles_h="Other single cleans", singles_p="Quoted individually after we see the home or space. The site shows “Custom — quoted for you” and sends no number:",
    change_h="What can change the final price", change_res="Unusually large rooms, heavy build-up that needs a deep clean first, or extras the customer asks for. The quote reply states the exact per-visit price before the first visit.",
    change_com="Heavy foot traffic, mostly carpet, kitchens that cook, or a deep clean needed first. The exact price is confirmed after a walk-through.",
    where_h="Where the numbers live", where_p="Everything above is read from plans.js: segments.residential and segments.commercial. Each has dims (size inputs), plans (base and per-unit rates), frequencies (discounts and visits per month), and followUp (tiers). Change a number there and every page, estimate, and this document update together.",
    generated="Generated {d} from plans.js",
  ),
  "es": dict(
    title="Cómo se calcula el precio", sub="Estimadores residencial y comercial en mkgservices.com",
    note="Todos los montos son las tarifas provisionales que están hoy en plans.js, mostradas como “estimados” en el sitio. Reemplázalas con tarifas reales antes del lanzamiento; la lógica no cambia.",
    formula_h="La fórmula (ambas líneas de servicio)",
    formula="Precio por visita = (base + Σ tarifa por unidad × tamaño) × (1 − descuento por frecuencia), redondeado al dólar",
    formula_p="Cada plan tiene un precio base más un monto por unidad de tamaño. Las unidades cambian según la línea de servicio. La frecuencia elegida define un descuento que aplica a todas las visitas, no solo a la primera. Visitas más frecuentes significan menos acumulación entre una y otra, así que cada visita cuesta menos.",
    res="Residencial", com="Comercial",
    res_size="Datos de tamaño: recámaras (1–7) y baños (1–6). Un medio baño cuenta como uno.",
    com_size="Datos de tamaño: superficie en pies cuadrados (500–20,000, en pasos de 250) y baños (1–12). Los baños cuentan aparte porque toman más tiempo por pie cuadrado.",
    plans_h="Planes y tarifas", plan="Plan", base="Base", per="Por {u}",
    units={"bedrooms":"recámara","bathrooms":"baño","sqft":"pie²","restrooms":"baño"},
    unit_short={"bedrooms":"rec.","bathrooms":"baño","sqft":"pies²","restrooms":"baño"},
    rec="(recomendado)",
    ladder_h="Descuentos por frecuencia", sched="Frecuencia", off="Descuento", vpm="Visitas / mes",
    monthly_note="El estimador comercial también muestra una cifra mensual aproximada: precio por visita × visitas por mes.",
    ex_h="Ejemplo resuelto", ex_size_res="Una casa de {b} recámaras y {ba} baños con el plan {p}:", ex_size_com="Una oficina de {s} pies² con {r} baños con el plan {p}:",
    full="Precio completo por visita", step="Paso",
    fu_h="Seguimiento de limpieza profunda reciente", fu_p="Una visita única para una casa o espacio que tuvo una limpieza profunda hace poco. Se calcula desde el precio único del plan {plan} para el mismo tamaño, menos un descuento según qué tan reciente fue la limpieza profunda. Los descuentos se toman de la escalera de frecuencias, así que cambiar un descuento de frecuencia también cambia estos.",
    fu_when="Última limpieza profunda", fu_disc="Descuento", fu_price="Precio de ejemplo",
    singles_h="Otras limpiezas únicas", singles_p="Se cotizan por separado después de ver la casa o el espacio. El sitio muestra “Personalizado — cotizado para ti” y no envía un número:",
    change_h="Qué puede cambiar el precio final", change_res="Habitaciones inusualmente grandes, acumulación fuerte que requiere una limpieza profunda primero, o extras que pida el cliente. La respuesta de cotización indica el precio exacto por visita antes de la primera visita.",
    change_com="Mucho tráfico, piso mayormente alfombrado, cocinas en uso o una limpieza profunda necesaria primero. El precio exacto se confirma tras un recorrido.",
    where_h="Dónde viven los números", where_p="Todo lo anterior se lee de plans.js: segments.residential y segments.commercial. Cada uno tiene dims (datos de tamaño), plans (tarifas base y por unidad), frequencies (descuentos y visitas por mes) y followUp (niveles). Cambia un número ahí y todas las páginas, estimados y este documento se actualizan juntos.",
    generated="Generado el {d} a partir de plans.js",
  ),
}

def L(v, lang): return v[lang] if isinstance(v, dict) else v

def per_visit(plan, size, discount):
    one = plan["base"] + sum(plan["per"].get(d, 0) * size[d] for d in size)
    return one, round(one * (1 - discount))

def freq(seg, fid):
    for f in seg["frequencies"]:
        if f["id"] == fid: return f
    return None

def section(seg, key, lang):
    t = T[lang]; s = cfg[key]
    size = {d["id"]: d["default"] for d in s["dims"]}
    dims = [d["id"] for d in s["dims"]]
    out = [f'<h2>{t[key[:3]]}</h2>', f'<p>{t[key[:3]+"_size"]}</p>']
    # plans table
    head = "".join(f'<th>{t["per"].format(u=t["units"][d])}</th>' for d in dims)
    rows = ""
    for p in s["plans"]:
        cells = "".join(f'<td>{money2(p["per"].get(d,0))}</td>' for d in dims)
        rows += f'<tr><td><strong>{L(p["name"],lang)}</strong> {t["rec"] if p["recommended"] else ""}</td><td>{money(p["base"])}</td>{cells}</tr>'
    out.append(f'<div class="keep"><h3>{t["plans_h"]}</h3><table><thead><tr><th>{t["plan"]}</th><th>{t["base"]}</th>{head}</tr></thead><tbody>{rows}</tbody></table></div>')
    # ladder
    has_vpm = any(f.get("visitsPerMonth") for f in s["frequencies"])
    rows = ""
    for f in s["frequencies"]:
        vpm = (f'<td>{f["visitsPerMonth"]:g}</td>' if f.get("visitsPerMonth") else "<td>—</td>") if has_vpm else ""
        rows += f'<tr><td>{L(f["label"],lang)}</td><td>{pct(f["discount"]) if f["discount"] else "—"}</td>{vpm}</tr>'
    out.append(f'<div class="keep"><h3>{t["ladder_h"]}</h3><table class="narrow"><thead><tr><th>{t["sched"]}</th><th>{t["off"]}</th>{"<th>"+t["vpm"]+"</th>" if has_vpm else ""}</tr></thead><tbody>{rows}</tbody></table>' + (f'<p class="small">{t["monthly_note"]}</p>' if has_vpm else "") + '</div>')
    # worked example
    plan = next(p for p in s["plans"] if p["id"] == s["defaults"]["plan"])
    f = freq(s, s["defaults"]["frequency"])
    one, pv = per_visit(plan, size, f["discount"])
    if key == "residential":
        intro = t["ex_size_res"].format(b=size["bedrooms"], ba=size["bathrooms"], p=L(plan["name"],lang))
    else:
        intro = t["ex_size_com"].format(s=num(size["sqft"]), r=size["restrooms"], p=L(plan["name"],lang))
    terms = " + ".join(f'{money2(plan["per"].get(d,0))} × {num(size[d])}' for d in dims)
    steps = [
        f'{t["full"]}: {money(plan["base"])} + {terms} = <strong>{money(one)}</strong>',
        f'{L(f["label"],lang)}: {pct(f["discount"])} → {money(one)} × {1-f["discount"]:.2f} = <strong>{money(pv)}</strong>',
    ]
    if f.get("visitsPerMonth"):
        steps.append(f'{t["vpm"]}: {money(pv)} × {f["visitsPerMonth"]:g} ≈ <strong>{money(round(pv*f["visitsPerMonth"]))}</strong>')
    out.append(f'<div class="keep"><h3>{t["ex_h"]}</h3><p>{intro}</p><ol class="calc">' + "".join(f"<li>{x}</li>" for x in steps) + "</ol></div>")
    # follow-up
    fu = s["followUp"]; bp = next(p for p in s["plans"] if p["id"] == fu["basePlan"])
    one_b, _ = per_visit(bp, size, 0)
    rows = ""
    for tier in fu["tiers"]:
        disc = freq(s, tier["uses"])["discount"] if "uses" in tier else tier.get("discount", 0)
        rows += f'<tr><td>{L(tier["label"],lang)}</td><td>{pct(disc) if disc else "—"}</td><td>{money(round(one_b*(1-disc)))}</td></tr>'
    out.append(f'<div class="keep"><h3>{t["fu_h"]}</h3><p>{t["fu_p"].format(plan=L(bp["name"],lang))}</p>'
               f'<table class="narrow"><thead><tr><th>{t["fu_when"]}</th><th>{t["fu_disc"]}</th><th>{t["fu_price"]} ({L(bp["name"],lang)} {money(one_b)})</th></tr></thead><tbody>{rows}</tbody></table></div>')
    # singles
    names = [L(c["name"],lang) for c in s["singleCleans"] if c["id"] != "followup"]
    out.append(f'<div class="keep"><h3>{t["singles_h"]}</h3><p>{t["singles_p"]} {", ".join(names)}.</p></div>')
    out.append(f'<div class="keep"><h3>{t["change_h"]}</h3><p>{t["change_res" if key=="residential" else "change_com"]}</p></div>')
    return "\n".join(out)

def doc(lang):
    t = T[lang]
    d = datetime.date.today().strftime("%B %d, %Y") if lang == "en" else datetime.date.today().strftime("%d/%m/%Y")
    return f'''
<section class="lang" lang="{lang}">
  <header>
    <img src="file://{ROOT}/brand/logo-full-640.png" alt="">
    <div><h1>{t["title"]}</h1><p class="sub">{t["sub"]}</p></div>
  </header>
  <p class="note">{t["note"]}</p>
  <h2>{t["formula_h"]}</h2>
  <p class="formula">{t["formula"]}</p>
  <p>{t["formula_p"]}</p>
  {section(cfg["residential"], "residential", lang)}
  {section(cfg["commercial"], "commercial", lang)}
  <h2>{t["where_h"]}</h2>
  <p>{t["where_p"]}</p>
  <p class="gen">{t["generated"].format(d=d)}</p>
</section>'''

faces = ""
if FONT_DIR:
    for w in (400, 500, 600, 700, 800):
        faces += f"@font-face{{font-family:'Bricolage Grotesque';font-weight:{w};src:url('file://{FONT_DIR}/bricolage-grotesque-latin-{w}-normal.woff') format('woff');}}\n"

html = f'''<!doctype html><html><head><meta charset="utf-8"><title>MKG Services pricing logic</title>
<style>
{faces}
:root {{ --ink:#0f2e2c; --pine:#176b61; --mist:#edf4f1; --lemon:#ffd93b; --muted:#4d6662; --line:#d7e2de; }}
@page {{ size: Letter; margin: 0.7in 0.75in 0.8in; }}
body {{ font-family: 'Bricolage Grotesque', system-ui, sans-serif; color: var(--ink); font-size: 10.6pt; line-height: 1.45; margin: 0; }}
section.lang {{ page-break-after: always; }}
section.lang:last-child {{ page-break-after: auto; }}
header {{ display: flex; align-items: center; gap: 18px; margin-bottom: 14px; }}
header img {{ width: 84px; height: 84px; }}
h1 {{ font-size: 24pt; margin: 0; letter-spacing: -0.01em; line-height: 1.05; }}
.sub {{ margin: 4px 0 0; color: var(--muted); }}
h2 {{ font-size: 15pt; margin: 22px 0 6px; padding-top: 10px; border-top: 2px solid var(--ink); }}
h3 {{ font-size: 11.5pt; margin: 14px 0 4px; color: var(--pine); text-transform: uppercase; letter-spacing: 0.06em; }}
p {{ margin: 4px 0 8px; }}
.note {{ background: var(--mist); border-left: 4px solid var(--lemon); padding: 8px 12px; border-radius: 6px; }}
.formula {{ font-weight: 700; font-size: 11.5pt; background: var(--ink); color: #fff; padding: 10px 14px; border-radius: 10px; }}
table {{ border-collapse: collapse; width: 100%; margin: 4px 0 8px; page-break-inside: avoid; }}
table.narrow {{ width: auto; min-width: 60%; }}
th, td {{ text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }}
th {{ font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }}
td:not(:first-child), th:not(:first-child) {{ text-align: right; }}
.keep {{ page-break-inside: avoid; break-inside: avoid; }}
h2, h3 {{ page-break-after: avoid; break-after: avoid; }}
.calc {{ margin: 4px 0 8px 18px; padding: 0; }}
.calc li {{ margin: 3px 0; }}
.small {{ font-size: 9.5pt; color: var(--muted); }}
.gen {{ margin-top: 24px; font-size: 9pt; color: var(--muted); }}
</style></head><body>{doc("en")}{doc("es")}</body></html>'''

src = os.path.join(HERE, "MKG-pricing-logic.html")
open(src, "w").write(html)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto("file://" + src); pg.wait_for_timeout(300)
    pg.pdf(path=OUT, format="Letter", print_background=True, display_header_footer=True,
           header_template="<span></span>",
           footer_template='<div style="font-family:sans-serif;font-size:8px;color:#4d6662;width:100%;padding:0 0.75in;display:flex;justify-content:space-between"><span>MKG Services, LLC · mkgservices.com</span><span class="pageNumber"></span></div>')
os.remove(src)
print("wrote", OUT)
