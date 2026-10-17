/*
  MKG Services site configuration.

  Everything the owner is likely to change lives here: contact details,
  plan names, what each plan includes, placeholder pricing, and the
  recurring discounts. The pages read this file; no markup edits needed.

  There are two service lines, "segments", with the same logic and their own
  numbers: RESIDENTIAL (priced by bedrooms and bathrooms) and COMMERCIAL
  (priced by square feet and restrooms, with a visits-per-week ladder).
  A page picks its segment with  <script>window.MKG_SEGMENT = "commercial"</script>
  before this file; pages without it are residential.

  Text that visitors see is written twice, { en: "...", es: "..." }, so the
  site can show English or Spanish. Fixed page text lives in i18n.js.

  PRICING IS A PLACEHOLDER. Replace base / per-unit amounts with real numbers
  before launch. Estimates are shown as "estimated" on the site and the final
  price is confirmed in the quote reply.

  Price per visit = (base + sum of per[dim] x size[dim]) x (1 - schedule discount)
*/
(function () {
  var shared = {
    business: {
      name: "MKG Services, LLC",
      shortName: "MKG Services",
      phone: "(980) 319-0015",            // shown as written; call and text links are built from the digits
      email: "mkgservices704@gmail.com",
      serviceArea: { en: "the Charlotte area", es: "el área de Charlotte" },   // shown in the footer and used on the pages; "" hides it
      responseTime: { en: "within one business day", es: "en un día hábil" },
    },

    // Quote requests are saved to the site's Firebase database (see
    // docs/SETUP-firebase.md) and show up on admin.html. The business ALSO
    // gets an email for each new request, and when a client moves or cancels
    // a booking from their account, through this form service (Formspree,
    // form "MKG quote requests", owned by mkgservices704@gmail.com). Any
    // endpoint that accepts a JSON POST works; "" turns the emails off.
    formEndpoint: "https://formspree.io/f/xjyglbgo",

    // Firebase App Check: a reCAPTCHA (Fraud Defense) site key, so the
    // database can tell this site's pages from scripts and bots. Public by
    // design. Only used on mkgservices.com, the domain the key allows.
    appCheckKey: "6LckBPMtAAAAAMrY8dXpkrE9QKJJudt3yfvhDjsO",

    // ZIP codes served. Leave empty to accept any ZIP and confirm coverage later.
    serviceZips: [],

    // The booking calendar. A "slot" is a time window a crew can start in;
    // `capacity` is how many jobs can start in the same window on one day
    // (roughly, how many crews you run). Visitors see a window as full once
    // that many requests hold it. Days off and blocked windows are set on
    // admin.html, not here.
    availability: {
      capacity: 2,
      weekdays: [1, 2, 3, 4, 5, 6],   // 0 = Sunday ... 6 = Saturday
      leadDays: 2,                    // earliest bookable day is this many days out
      horizonDays: 60,                // how far ahead the calendar opens
      slots: [
        { id: "0800", label: { en: "Morning", es: "Mañana" },         time: "8:00–11:00",  segments: ["residential", "commercial"] },
        { id: "1130", label: { en: "Midday", es: "Mediodía" },        time: "11:30–2:30",  segments: ["residential", "commercial"] },
        { id: "1500", label: { en: "Afternoon", es: "Tarde" },        time: "3:00–6:00",   segments: ["residential", "commercial"] },
        { id: "1830", label: { en: "After hours", es: "Fuera de horario" }, time: "6:30–9:30 pm", segments: ["commercial"] },
      ],
    },

    // Online payment. Create a Payment Link in Stripe (no code needed) and paste
    // it here to show a "Pay online" button to signed-in clients; a link pasted
    // on a single request in admin.html overrides it for that client.
    payments: { link: "" },

    // Changes and cancellations. terms.html promises a confirmed visit can be
    // changed or cancelled free with this much notice; inside it, the account
    // page tells clients to call or text instead of offering the buttons.
    policy: { changeNoticeHours: 24 },
  };

  var segments = {};

  // =====================================================================
  // RESIDENTIAL
  // =====================================================================
  segments.residential = {
    pages: { home: "index.html", plans: "plans.html", quote: "quote.html" },

    // The size inputs. Each becomes a stepper; `per[id]` on a plan prices it.
    dims: [
      { id: "bedrooms",  min: 1, max: 7, step: 1, default: 3 },
      { id: "bathrooms", min: 1, max: 6, step: 1, default: 2 },
    ],

    // Fields on the quote form that differ by segment (see quote.html).
    quote: { typeField: "homeType", extraField: "pets", company: false },

    // "short" is what the schedule buttons show; "label" is used in sentences.
    frequencies: [
      { id: "onetime",  discount: 0,
        label: { en: "One-time", es: "Única" },        short: { en: "One-time", es: "Única" },
        perVisitLabel: { en: "per clean", es: "por limpieza" } },
      { id: "monthly",  discount: 0.05,
        label: { en: "Monthly", es: "Mensual" },        short: { en: "Monthly", es: "Mensual" },
        perVisitLabel: { en: "per visit", es: "por visita" } },
      { id: "biweekly", discount: 0.10,
        label: { en: "Every 2 weeks", es: "Cada 2 semanas" }, short: { en: "2 weeks", es: "2 semanas" },
        perVisitLabel: { en: "per visit", es: "por visita" } },
      { id: "weekly",   discount: 0.15,
        label: { en: "Weekly", es: "Semanal" },         short: { en: "Weekly", es: "Semanal" },
        perVisitLabel: { en: "per visit", es: "por visita" } },
    ],

    plans: [
      {
        id: "essentials",
        name: { en: "Essentials", es: "Esencial" },
        tagline: { en: "The rooms that get the most use.", es: "Los espacios que más se usan." },
        bestFor: { en: "Condos, apartments, and smaller homes.", es: "Condominios, apartamentos y casas pequeñas." },
        base: 89, per: { bedrooms: 0, bathrooms: 22 },
        includes: [
          { en: "Kitchen: counters, sink, stovetop, outside of appliances, inside microwave",
            es: "Cocina: encimeras, fregadero, estufa, exterior de electrodomésticos, interior del microondas" },
          { en: "Every bathroom: toilets, showers, tubs, sinks, mirrors",
            es: "Todos los baños: inodoros, duchas, tinas, lavamanos, espejos" },
          { en: "Main living area dusted and floors cleaned",
            es: "Sala principal desempolvada y pisos limpios" },
          { en: "Trash emptied and relined",
            es: "Basura vaciada y bolsas repuestas" },
        ],
      },
      {
        id: "family",
        name: { en: "Family", es: "Familiar" },
        tagline: { en: "The whole home, every visit.", es: "Toda la casa, en cada visita." },
        bestFor: { en: "Most households.", es: "La mayoría de los hogares." },
        recommended: true,
        base: 119, per: { bedrooms: 18, bathrooms: 22 },
        includes: [
          { en: "Everything in Essentials", es: "Todo lo del plan Esencial" },
          { en: "Every bedroom dusted, floors cleaned, beds made",
            es: "Todas las habitaciones desempolvadas, pisos limpios, camas tendidas" },
          { en: "Dining room, hallways, and stairs", es: "Comedor, pasillos y escaleras" },
          { en: "Floors vacuumed and mopped throughout", es: "Pisos aspirados y trapeados en toda la casa" },
        ],
      },
      {
        id: "complete",
        name: { en: "Complete", es: "Completo" },
        tagline: { en: "Whole home, plus the details on rotation.", es: "Toda la casa, más los detalles en rotación." },
        bestFor: { en: "Pets, allergies, or frequent guests.", es: "Mascotas, alergias o visitas frecuentes." },
        base: 169, per: { bedrooms: 22, bathrooms: 26 },
        includes: [
          { en: "Everything in Family", es: "Todo lo del plan Familiar" },
          { en: "Baseboards, door frames, and interior windowsills",
            es: "Zócalos, marcos de puertas y repisas interiores de ventanas" },
          { en: "Inside the oven or fridge, alternating visits",
            es: "Interior del horno o del refrigerador, en visitas alternas" },
          { en: "Ceiling fans and light fixtures", es: "Ventiladores de techo y lámparas" },
          { en: "Bed linens changed when left out", es: "Cambio de sábanas si las dejas listas" },
        ],
      },
    ],

    // Rows of the comparison table. Each value: 0 = not included, 1 = included,
    // 2 = included on rotation.
    comparison: [
      { label: { en: "Kitchen counters, sink, stovetop, appliance exteriors", es: "Encimeras, fregadero, estufa, exterior de electrodomésticos" }, values: [1, 1, 1] },
      { label: { en: "Inside microwave", es: "Interior del microondas" }, values: [1, 1, 1] },
      { label: { en: "Bathrooms: toilets, showers, tubs, sinks, mirrors", es: "Baños: inodoros, duchas, tinas, lavamanos, espejos" }, values: [1, 1, 1] },
      { label: { en: "Main living area dusting and floors", es: "Sala principal: polvo y pisos" }, values: [1, 1, 1] },
      { label: { en: "Trash emptied and relined", es: "Basura vaciada y bolsas repuestas" }, values: [1, 1, 1] },
      { label: { en: "Bedrooms dusted, floors, beds made", es: "Habitaciones: polvo, pisos, camas tendidas" }, values: [0, 1, 1] },
      { label: { en: "Dining room, hallways, stairs", es: "Comedor, pasillos, escaleras" }, values: [0, 1, 1] },
      { label: { en: "Floors vacuumed and mopped throughout", es: "Pisos aspirados y trapeados en toda la casa" }, values: [0, 1, 1] },
      { label: { en: "Baseboards, door frames, windowsills", es: "Zócalos, marcos de puertas, repisas de ventanas" }, values: [0, 0, 2] },
      { label: { en: "Inside oven or fridge", es: "Interior del horno o refrigerador" }, values: [0, 0, 2] },
      { label: { en: "Ceiling fans and light fixtures", es: "Ventiladores de techo y lámparas" }, values: [0, 0, 2] },
      { label: { en: "Bed linens changed", es: "Cambio de sábanas" }, values: [0, 0, 1] },
    ],

    // Single cleans are quoted individually (no estimate), except the follow-up below.
    singleCleans: [
      {
        id: "deep",
        name: { en: "Deep clean", es: "Limpieza profunda" },
        description: {
          en: "A top-to-bottom reset: built-up grime, inside appliances, baseboards, and the spots a regular visit skips. Also the usual first visit before starting a plan.",
          es: "Un reinicio de arriba abajo: mugre acumulada, interior de electrodomésticos, zócalos y los rincones que una visita regular no cubre. También es la primera visita habitual antes de empezar un plan.",
        },
      },
      {
        id: "followup",
        name: { en: "Recent deep clean follow-up", es: "Seguimiento de limpieza profunda reciente" },
        description: {
          en: "For a home that had a deep clean recently and only needs to be kept up: a lighter one-time visit that builds on that clean, with no plan.",
          es: "Para una casa que tuvo una limpieza profunda hace poco y solo necesita mantenimiento: una visita única más ligera que se apoya en esa limpieza, sin plan.",
        },
      },
      {
        id: "move",
        name: { en: "Move-in or move-out clean", es: "Limpieza de mudanza" },
        description: {
          en: "An empty home cleaned for its next chapter: inside cabinets and closets, appliances, fixtures, and floors.",
          es: "Una casa vacía lista para su siguiente capítulo: interior de gabinetes y clósets, electrodomésticos, accesorios y pisos.",
        },
      },
    ],

    // Follow-up clean after a recent deep clean. Priced from the Essentials one-time
    // price for the home's size. The sooner the follow-up comes after the deep clean,
    // the less there is to do, so it earns the same discount ladder members get:
    // within 1 week = weekly's %, within 2 weeks = every-2-weeks' %, within 1 month =
    // monthly's %, older = full price. Change a % in `frequencies` and this follows.
    // A tier may also carry its own `discount` instead of `uses`.
    followUp: {
      basePlan: "essentials",
      defaultTier: "month",
      tiers: [
        { id: "week",     uses: "weekly",   label: { en: "Within 1 week",    es: "En la última semana" } },
        { id: "twoweeks", uses: "biweekly", label: { en: "Within 2 weeks",   es: "En las últimas 2 semanas" } },
        { id: "month",    uses: "monthly",  label: { en: "Within 1 month",   es: "En el último mes" } },
        { id: "older",    uses: "onetime",  label: { en: "Over a month ago", es: "Hace más de un mes" } },
      ],
    },

    defaults: { plan: "family", frequency: "biweekly" },
  };

  // =====================================================================
  // COMMERCIAL  (offices, clinics, retail, restaurants, gyms, churches)
  // Priced per visit by square footage and restrooms. Businesses are usually
  // cleaned several times a week, so the ladder is visits per week, and each
  // step up means less build-up per visit and a bigger per-visit discount.
  // `visitsPerMonth` lets the site show an approximate monthly figure.
  // =====================================================================
  segments.commercial = {
    pages: { home: "commercial.html", plans: "commercial-plans.html", quote: "commercial-quote.html" },

    dims: [
      { id: "sqft",      min: 500, max: 20000, step: 250, default: 3000 },
      { id: "restrooms", min: 1,   max: 12,    step: 1,   default: 2 },
    ],

    quote: { typeField: "facilityType", extraField: "floors", company: true },

    frequencies: [
      { id: "onetime", discount: 0,
        label: { en: "One-time", es: "Única" },               short: { en: "One-time", es: "Única" },
        perVisitLabel: { en: "per clean", es: "por limpieza" } },
      { id: "weekly",  discount: 0.10, visitsPerMonth: 4.33,
        label: { en: "Weekly", es: "Semanal" },               short: { en: "Weekly", es: "Semanal" },
        perVisitLabel: { en: "per visit", es: "por visita" } },
      { id: "twice",   discount: 0.18, visitsPerMonth: 8.67,
        label: { en: "Twice a week", es: "Dos veces por semana" }, short: { en: "2× a week", es: "2× por semana" },
        perVisitLabel: { en: "per visit", es: "por visita" } },
      { id: "thrice",  discount: 0.25, visitsPerMonth: 13,
        label: { en: "Three times a week", es: "Tres veces por semana" }, short: { en: "3× a week", es: "3× por semana" },
        perVisitLabel: { en: "per visit", es: "por visita" } },
      { id: "daily",   discount: 0.35, visitsPerMonth: 21.67,
        label: { en: "Every weekday", es: "Todos los días hábiles" }, short: { en: "Mon–Fri", es: "Lun–Vie" },
        perVisitLabel: { en: "per visit", es: "por visita" } },
    ],

    plans: [
      {
        id: "essentials",
        name: { en: "Essentials", es: "Esencial" },
        tagline: { en: "Restrooms, trash, and the shared spaces.", es: "Baños, basura y las áreas comunes." },
        bestFor: { en: "Small offices and suites that mostly need upkeep.", es: "Oficinas pequeñas y locales que sobre todo necesitan mantenimiento." },
        base: 45, per: { sqft: 0.035, restrooms: 14 },
        includes: [
          { en: "Restrooms cleaned, sanitized, and restocked", es: "Baños limpios, desinfectados y reabastecidos" },
          { en: "Trash and recycling emptied, liners replaced", es: "Basura y reciclaje vaciados, bolsas repuestas" },
          { en: "High-touch surfaces disinfected: handles, switches, rails", es: "Superficies de contacto desinfectadas: manijas, interruptores, barandas" },
          { en: "Entry, lobby, and common-area floors vacuumed and mopped", es: "Pisos de entrada, recepción y áreas comunes aspirados y trapeados" },
        ],
      },
      {
        id: "professional",
        name: { en: "Professional", es: "Profesional" },
        tagline: { en: "The whole workplace, every visit.", es: "Todo el espacio de trabajo, en cada visita." },
        bestFor: { en: "Most offices, clinics, and storefronts.", es: "La mayoría de oficinas, clínicas y locales." },
        recommended: true,
        base: 60, per: { sqft: 0.05, restrooms: 16 },
        includes: [
          { en: "Everything in Essentials", es: "Todo lo del plan Esencial" },
          { en: "Desks, workstations, and conference tables wiped (cleared surfaces)", es: "Escritorios, puestos de trabajo y mesas de juntas limpios (superficies despejadas)" },
          { en: "Kitchen or breakroom: counters, sink, tables, appliance exteriors", es: "Cocina o comedor: encimeras, fregadero, mesas, exterior de electrodomésticos" },
          { en: "Floors throughout, including offices", es: "Pisos en todo el espacio, incluidas las oficinas" },
          { en: "Supply report when soap, paper, or liners run low", es: "Aviso cuando falte jabón, papel o bolsas" },
        ],
      },
      {
        id: "complete",
        name: { en: "Complete", es: "Completo" },
        tagline: { en: "Whole workplace, plus the details on rotation.", es: "Todo el espacio, más los detalles en rotación." },
        bestFor: { en: "Client-facing spaces, medical, food, and fitness.", es: "Espacios con clientes, salud, alimentos y gimnasios." },
        base: 85, per: { sqft: 0.07, restrooms: 20 },
        includes: [
          { en: "Everything in Professional", es: "Todo lo del plan Profesional" },
          { en: "Interior glass, partitions, and entry doors", es: "Vidrios interiores, divisiones y puertas de entrada" },
          { en: "Detailed dusting on rotation: vents, blinds, baseboards, ledges", es: "Desempolvado detallado en rotación: rejillas, persianas, zócalos, repisas" },
          { en: "Inside microwave and fridge on rotation", es: "Interior del microondas y del refrigerador en rotación" },
          { en: "Spot-cleaning of walls, doors, and frames", es: "Limpieza de manchas en paredes, puertas y marcos" },
        ],
      },
    ],

    comparison: [
      { label: { en: "Trash and recycling emptied, liners replaced", es: "Basura y reciclaje vaciados, bolsas repuestas" }, values: [1, 1, 1] },
      { label: { en: "Restrooms cleaned, sanitized, and restocked", es: "Baños limpios, desinfectados y reabastecidos" }, values: [1, 1, 1] },
      { label: { en: "High-touch surfaces disinfected", es: "Superficies de contacto desinfectadas" }, values: [1, 1, 1] },
      { label: { en: "Entry, lobby, and common-area floors", es: "Pisos de entrada, recepción y áreas comunes" }, values: [1, 1, 1] },
      { label: { en: "Desks, workstations, conference tables", es: "Escritorios, puestos de trabajo, mesas de juntas" }, values: [0, 1, 1] },
      { label: { en: "Kitchen or breakroom", es: "Cocina o comedor" }, values: [0, 1, 1] },
      { label: { en: "Floors throughout, including offices", es: "Pisos en todo el espacio, incluidas oficinas" }, values: [0, 1, 1] },
      { label: { en: "Supply report (soap, paper, liners)", es: "Aviso de insumos (jabón, papel, bolsas)" }, values: [0, 1, 1] },
      { label: { en: "Interior glass, partitions, entry doors", es: "Vidrios interiores, divisiones, puertas de entrada" }, values: [0, 2, 1] },
      { label: { en: "Detailed dusting: vents, blinds, baseboards", es: "Desempolvado detallado: rejillas, persianas, zócalos" }, values: [0, 0, 2] },
      { label: { en: "Inside microwave and fridge", es: "Interior del microondas y refrigerador" }, values: [0, 0, 2] },
      { label: { en: "Spot-cleaning walls, doors, frames", es: "Manchas en paredes, puertas, marcos" }, values: [0, 0, 1] },
    ],

    singleCleans: [
      {
        id: "deep",
        name: { en: "Deep clean", es: "Limpieza profunda" },
        description: {
          en: "A full reset of the space: build-up in restrooms and kitchens, edges and corners, vents, glass, and the spots a routine visit skips. The usual first visit before a plan starts.",
          es: "Un reinicio completo del espacio: acumulación en baños y cocinas, bordes y esquinas, rejillas, vidrios y los puntos que una visita de rutina no cubre. La primera visita habitual antes de empezar un plan.",
        },
      },
      {
        id: "followup",
        name: { en: "Recent deep clean follow-up", es: "Seguimiento de limpieza profunda reciente" },
        description: {
          en: "For a space that had a deep clean recently and only needs to be kept up: a lighter one-time visit that builds on that clean, with no plan.",
          es: "Para un espacio que tuvo una limpieza profunda hace poco y solo necesita mantenimiento: una visita única más ligera que se apoya en esa limpieza, sin plan.",
        },
      },
      {
        id: "floors",
        name: { en: "Floor care", es: "Cuidado de pisos" },
        description: {
          en: "Carpet extraction, or strip and wax for hard floors. Scheduled after hours so the space is ready by morning.",
          es: "Extracción de alfombras, o decapado y encerado de pisos duros. Programado fuera del horario para que el espacio esté listo por la mañana.",
        },
      },
      {
        id: "move",
        name: { en: "Move-in, move-out, or post-construction", es: "Mudanza o post-construcción" },
        description: {
          en: "An empty or newly finished space made ready: dust from every surface, inside cabinets and fixtures, glass, and floors.",
          es: "Un espacio vacío o recién terminado listo para usarse: polvo de cada superficie, interior de gabinetes y accesorios, vidrios y pisos.",
        },
      },
    ],

    // Follow-up after a recent deep clean, priced from the Essentials one-time
    // price for the space. Within a week it earns the weekly rate's discount.
    followUp: {
      basePlan: "essentials",
      defaultTier: "twoweeks",
      tiers: [
        { id: "week",     uses: "weekly", label: { en: "Within 1 week",   es: "En la última semana" } },
        { id: "twoweeks", discount: 0.05, label: { en: "Within 2 weeks",  es: "En las últimas 2 semanas" } },
        { id: "older",    uses: "onetime", label: { en: "Over 2 weeks ago", es: "Hace más de 2 semanas" } },
      ],
    },

    defaults: { plan: "professional", frequency: "twice" },
  };

  var seg = window.MKG_SEGMENT && segments[window.MKG_SEGMENT] ? window.MKG_SEGMENT : "residential";
  window.MKG = window.MKG || {};
  Object.assign(window.MKG, shared, segments[seg], { segment: seg, segments: segments });
})();
