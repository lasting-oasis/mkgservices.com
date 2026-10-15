/*
  MKG Services site configuration.

  Everything the owner is likely to change lives here: contact details,
  plan names, what each plan includes, placeholder pricing, and the
  recurring discounts. The pages read this file; no markup edits needed.

  PRICING IS A PLACEHOLDER. Replace base/perBedroom/perBathroom with real
  numbers before launch. Estimates are shown as "estimated" on the site and
  the final price is confirmed in the quote reply.
*/
window.MKG = {
  business: {
    name: "MKG Services, LLC",
    shortName: "MKG Services",
    phone: "",            // e.g. "(555) 555-0123" — hidden when empty
    email: "",            // e.g. "hello@mkgservices.com" — hidden when empty
    serviceArea: "",      // e.g. "the greater Richmond area" — hidden when empty
    responseTime: "within one business day",
  },

  // Where quote requests are sent. Leave empty to show a demo confirmation.
  // Works with Formspree, Basin, Netlify Functions, or any endpoint that
  // accepts a JSON POST. Example: "https://formspree.io/f/abcd1234"
  formEndpoint: "",

  // ZIP codes served. Leave empty to accept any ZIP and confirm coverage later.
  serviceZips: [],

  // "short" is what the schedule buttons show; "label" is used in sentences.
  frequencies: [
    { id: "onetime",  label: "One-time",       short: "One-time", perVisitLabel: "per clean",  discount: 0 },
    { id: "monthly",  label: "Monthly",        short: "Monthly",  perVisitLabel: "per visit",  discount: 0.05 },
    { id: "biweekly", label: "Every 2 weeks",  short: "2 weeks",  perVisitLabel: "per visit",  discount: 0.10 },
    { id: "weekly",   label: "Weekly",         short: "Weekly",   perVisitLabel: "per visit",  discount: 0.15 },
  ],

  plans: [
    {
      id: "essentials",
      name: "Essentials",
      tagline: "The rooms that get the most use.",
      bestFor: "Condos, apartments, and smaller homes.",
      base: 89, perBedroom: 0, perBathroom: 22,
      includes: [
        "Kitchen: counters, sink, stovetop, outside of appliances, inside microwave",
        "Every bathroom: toilets, showers, tubs, sinks, mirrors",
        "Main living area dusted and floors cleaned",
        "Trash emptied and relined",
      ],
    },
    {
      id: "family",
      name: "Family",
      tagline: "The whole home, every visit.",
      bestFor: "Most households.",
      recommended: true,
      base: 119, perBedroom: 18, perBathroom: 22,
      includes: [
        "Everything in Essentials",
        "Every bedroom dusted, floors cleaned, beds made",
        "Dining room, hallways, and stairs",
        "Floors vacuumed and mopped throughout",
      ],
    },
    {
      id: "complete",
      name: "Complete",
      tagline: "Whole home, plus the details on rotation.",
      bestFor: "Pets, allergies, or frequent guests.",
      base: 169, perBedroom: 22, perBathroom: 26,
      includes: [
        "Everything in Family",
        "Baseboards, door frames, and interior windowsills",
        "Inside the oven or fridge, alternating visits",
        "Ceiling fans and light fixtures",
        "Bed linens changed when left out",
      ],
    },
  ],

  // Rows of the comparison table. Each value: 0 = not included, 1 = included,
  // 2 = included on rotation.
  comparison: [
    { label: "Kitchen counters, sink, stovetop, appliance exteriors", values: [1, 1, 1] },
    { label: "Inside microwave",                                       values: [1, 1, 1] },
    { label: "Bathrooms: toilets, showers, tubs, sinks, mirrors",      values: [1, 1, 1] },
    { label: "Main living area dusting and floors",                    values: [1, 1, 1] },
    { label: "Trash emptied and relined",                              values: [1, 1, 1] },
    { label: "Bedrooms dusted, floors, beds made",                     values: [0, 1, 1] },
    { label: "Dining room, hallways, stairs",                          values: [0, 1, 1] },
    { label: "Floors vacuumed and mopped throughout",                  values: [0, 1, 1] },
    { label: "Baseboards, door frames, windowsills",                   values: [0, 0, 2] },
    { label: "Inside oven or fridge",                                  values: [0, 0, 2] },
    { label: "Ceiling fans and light fixtures",                        values: [0, 0, 2] },
    { label: "Bed linens changed",                                     values: [0, 0, 1] },
  ],

  // Single cleans are quoted individually; no estimate is shown.
  singleCleans: [
    {
      id: "deep",
      name: "Deep clean",
      description: "A top-to-bottom reset: built-up grime, inside appliances, baseboards, and the spots a regular visit skips. Also the usual first visit before starting a plan.",
    },
    {
      id: "move",
      name: "Move-in or move-out clean",
      description: "An empty home cleaned for its next chapter: inside cabinets and closets, appliances, fixtures, and floors.",
    },
  ],

  defaults: { bedrooms: 3, bathrooms: 2, plan: "family", frequency: "biweekly" },
  limits: { bedrooms: [1, 7], bathrooms: [1, 6] },
};
