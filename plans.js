/*
  MKG Services site configuration.

  Everything the owner is likely to change lives here: contact details,
  plan names, what each plan includes, placeholder pricing, and the
  recurring discounts. The pages read this file; no markup edits needed.

  Text that visitors see is written twice, { en: "...", es: "..." }, so the
  site can show English or Spanish. Fixed page text lives in i18n.js.

  PRICING IS A PLACEHOLDER. Replace base/perBedroom/perBathroom with real
  numbers before launch. Estimates are shown as "estimated" on the site and
  the final price is confirmed in the quote reply.
*/
window.MKG = window.MKG || {};
Object.assign(window.MKG, {
  business: {
    name: "MKG Services, LLC",
    shortName: "MKG Services",
    phone: "(980) 319-0015",            // shown as written; call and text links are built from the digits
    email: "mkgservices704@gmail.com",
    serviceArea: { en: "", es: "" },    // e.g. { en: "the Charlotte area", es: "el área de Charlotte" } — hidden while empty
    responseTime: { en: "within one business day", es: "en un día hábil" },
  },

  // Where quote requests are sent. Leave empty to show a demo confirmation.
  // Works with Formspree, Basin, Netlify Functions, or any endpoint that
  // accepts a JSON POST. Example: "https://formspree.io/f/abcd1234"
  formEndpoint: "",

  // ZIP codes served. Leave empty to accept any ZIP and confirm coverage later.
  serviceZips: [],

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
      base: 89, perBedroom: 0, perBathroom: 22,
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
      base: 119, perBedroom: 18, perBathroom: 22,
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
      base: 169, perBedroom: 22, perBathroom: 26,
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

  // Single cleans are quoted individually; no estimate is shown.
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

  defaults: { bedrooms: 3, bathrooms: 2, plan: "family", frequency: "biweekly" },
  limits: { bedrooms: [1, 7], bathrooms: [1, 6] },
});
