/*
  Languages: English (en) and Spanish (es).

  Every piece of fixed text on the site lives here under a key. Pages mark
  elements with data-i18n="key" (text) or data-i18n-attr="attr:key" (an
  attribute such as placeholder or aria-label). Plan names and the other
  owner-edited content are bilingual in plans.js instead.

  Placeholders inside a string become live elements:
    {bedrooms} {bathrooms} {planName} {frequencyLabel} {discountSentence}
    {perVisit} {unit} {oneTimeStruck} {saving} {discount}
    {phone} {sms} {email} {responseTime} {serviceArea} {zip}

  Language is chosen from ?lang=es in the URL, then the visitor's saved
  choice, then the browser language. Share a Spanish link with ?lang=es.
*/
(function () {
  "use strict";

  var D = {};

  D.en = {
    "meta.title.home": "MKG Services | Home cleaning plans that cost less the more often you book",
    "meta.desc.home": "MKG Services cleans homes on a schedule that fits yours. Pick a plan, pick how often, and see your estimated price before you book. No contracts.",
    "meta.title.plans": "Plans and pricing | MKG Services",
    "meta.desc.plans": "Compare MKG Services cleaning plans. Set your home size and schedule to see an estimated per-visit price, with the recurring discount shown up front.",
    "meta.title.quote": "Get a quote | MKG Services",
    "meta.desc.quote": "Request a cleaning quote from MKG Services. Tell us about your home, pick a plan and schedule, and get an exact per-visit price.",

    "brand.home": "MKG Services home",
    "nav.menu": "Menu",
    "nav.main": "Main",
    "nav.plans": "Plans",
    "nav.singles": "Single cleans",
    "nav.faq": "FAQ",
    "nav.quote": "Get a quote",
    "top.language": "Language",
    "top.en": "English",
    "top.es": "Español",
    "top.call": "Call",
    "top.text": "Text",
    "top.contact": "Contact",

    "hero.h1": "A clean home, on repeat.",
    "hero.lead": "Pick a plan, pick how often, and watch the price come down. Skip a visit or change your plan whenever life changes.",
    "hero.cta": "Get my quote",
    "hero.compare": "Compare plans",
    "hero.single": "Book a single clean",
    "hero.note": "Estimates are for planning. Your exact price is confirmed in your quote, before anyone shows up.",

    "dial.aria": "Plan price estimator",
    "dial.plan": "Plan",
    "dial.save": "Save {discount}",
    "dial.was": "{oneTimeStruck} at full price. You keep {saving} every visit.",
    "dial.full": "Full price. Choose a schedule below to see the discount.",
    "dial.howOften": "How often?",
    "dial.li1": "Same checklist every visit, so nothing gets missed",
    "dial.li2": "Skip, pause, or switch plans with no fee",
    "dial.li3": "Price confirmed before your first clean",
    "dial.cta": "Get a quote for the {planName} plan",
    "dial.fine": "Estimate for a {bedrooms}-bedroom, {bathrooms}-bathroom home.",

    "seg.off": "{pct} off",
    "seg.full": "full price",
    "seg.aria": "How often",
    "stepper.bedrooms.one": "bed",
    "stepper.bedrooms.other": "bed",
    "stepper.bathrooms.one": "bath",
    "stepper.bathrooms.other": "bath",
    "stepper.fewer.bedrooms": "Fewer bedrooms",
    "stepper.more.bedrooms": "More bedrooms",
    "stepper.fewer.bathrooms": "Fewer bathrooms",
    "stepper.more.bathrooms": "More bathrooms",
    "unit.bedroom.one": "bedroom",
    "unit.bedroom.other": "bedrooms",
    "unit.bathroom.one": "bathroom",
    "unit.bathroom.other": "bathrooms",

    "how.h2": "How a plan works",
    "how.1.h": "Tell us about your home",
    "how.1.p": "Bedrooms, bathrooms, pets, and anything you want handled a certain way. Two minutes, no account.",
    "how.2.h": "Pick a plan and a rhythm",
    "how.2.p": "Choose how much of the home we cover and how often we come. Weekly saves the most; monthly still saves.",
    "how.3.h": "Come home to clean",
    "how.3.p": "We confirm your price, then show up on schedule. Skip a week or change plans by text whenever you need.",

    "plans.h2": "Three plans. One rule: more often costs less.",
    "plans.lead": "Every plan is priced per visit. The schedule you choose sets the discount, and it applies to every visit, not just the first.",
    "plans.yourHome": "Your home:",
    "plans.tag": "Fits most homes",
    "plans.atFull": "at full price",
    "plans.save": "Save",
    "plans.fullSingle": "Full price for a single visit",
    "plans.bestFor": "Best for:",
    "plans.cta": "Get a quote for {name}",
    "plans.note.home": "Estimates use placeholder pricing until MKG confirms rates. Your quote reply has the exact per-visit price for your home.",
    "plans.note.link": "See the full comparison.",
    "plans.note.plans": "Estimates use placeholder pricing until MKG confirms rates. Homes that need a deep clean first are quoted separately, so the plan price stays the same from the first regular visit on.",
    "plans.noscript": "Turn on JavaScript to see plans and prices, or",
    "plans.noscriptLink": "request a quote",

    "singles.h2.home": "Need one clean, not a plan?",
    "singles.lead.home": "These are quoted individually because every home is different. Most plans start with a deep clean, so the regular visits only have to keep up.",
    "singles.h2.plans": "Single cleans",
    "singles.lead.plans": "Quoted individually, because a first deep clean or an empty house for move-out is a different job from keeping a home tidy.",
    "singles.cta": "Get a quote",

    "why.h2": "What you can count on",
    "why.1.h": "The price before the visit",
    "why.1.p": "You see an estimate here and an exact price in your quote. The number on the invoice is the number you agreed to.",
    "why.2.h": "Change your mind any time",
    "why.2.p": "No contracts. Skip a visit, pause for a trip, move from weekly to monthly, or stop altogether.",
    "why.3.h": "The same checklist, every time",
    "why.3.p": "Each plan has a written list of what gets done. Add a note about your home and it becomes part of the list.",

    "faq.h2": "Questions people ask first",
    "faq.q1": "How does the recurring discount work?",
    "faq.a1": "Each plan has a full per-visit price based on your home's bedrooms and bathrooms. {discountSentence} The discount stays as long as the schedule does.",
    "faq.q2": "Can I skip a week or pause?",
    "faq.a2": "Yes. Let us know before your visit and we'll skip it. If you pause for a while and come back, your plan and discount pick up where they left off.",
    "faq.q3": "Do I need to be home?",
    "faq.a3": "No. Most clients give us a way in: a lockbox, a door code, or a neighbor. We'll sort out what works for you when we confirm your first visit.",
    "faq.q4": "Do you bring supplies and equipment?",
    "faq.a4": "Yes. If you'd rather we use specific products in your home, leave them out and add a note to your plan.",
    "faq.q5": "How is the price set?",
    "faq.a5": "By the plan you choose and the size of your home. Bedrooms and bathrooms are the biggest factors. If the home needs a deep clean first, we'll quote that separately so the plan price stays predictable.",
    "faq.q6": "Where do you work?",
    "faq.a6": "Enter your ZIP code in the quote form and we'll confirm whether you're in our area before anything else. You can also call or text {phone}.",

    "band.h2.home": "Ready for a cleaner week?",
    "band.p.home": "Two minutes to request a quote. No account, no commitment.",
    "band.cta.home": "Get my quote",
    "band.or": "Or call or text {phone}",
    "band.h2.plans": "Get an exact price for your home",
    "band.p.plans": "Your plan and schedule carry over to the quote form.",
    "band.cta.plans": "Get a quote for the {planName} plan",

    "footer.serving": "Serving {serviceArea}",
    "footer.call": "Call",
    "footer.text": "Text us",
    "footer.nav": "Footer",

    "plansPage.h1": "Pick what gets cleaned. Pick how often.",
    "plansPage.lead": "The price adjusts as you go. Set your home size and schedule once; every number on this page updates.",
    "compare.h2": "What each plan covers",
    "compare.lead": "The same list every visit. “Rotation” items are done on alternating visits so each clean stays the same length.",
    "compare.legend": "Add a note about your home in the quote form and it becomes part of your list.",
    "compare.aria": "What each plan includes",
    "compare.col": "What gets cleaned",
    "compare.yes": "Included",
    "compare.no": "Not included",
    "compare.rot": "Rotation",
    "notes.h2": "How the estimate is built",
    "notes.1.h": "Home size",
    "notes.1.p": "Each plan starts from a base price and adds an amount per bedroom and per bathroom. Essentials skips bedrooms, so only bathrooms change its price.",
    "notes.2.h": "Schedule discount",
    "notes.2.p": "{discountSentence} It applies to the full per-visit price and stays as long as the schedule does.",
    "notes.3.h": "What can change the final price",
    "notes.3.p": "Unusually large rooms, heavy build-up that needs a deep clean first, or extras you ask for. If anything moves the number, you hear about it in the quote reply, never on the invoice.",

    "discount.first": "{label}: {pct} off every visit.",
    "discount.rest": "{label}: {pct} off.",

    "q.progress": "Progress",
    "q.step.1": "Home",
    "q.step.2": "Details",
    "q.step.3": "Plan",
    "q.step.4": "Contact",
    "q.step.5": "Review",
    "q.fu.legend": "When was your last deep clean?",
    "q.fu.unit": "one visit",
    "q.fu.optPrice": "Estimate",
    "q.fu.optSub": "shown below",
    "q.fu.was": "Essentials one-time price for your home: {oneTime}. You save {saving} because the home was cleaned recently.",
    "q.fu.full": "Essentials one-time price for your home: {oneTime}. After a month the follow-up discount ends, and a new deep clean may fit better.",
    "q.fu.note": "Based on a {bedrooms}-bedroom, {bathrooms}-bathroom home. The exact price is confirmed in your reply.",
    "review.fuTiming": "Last deep clean",
    "review.fuEstimateV": "{price} for one visit ({pct} off the {oneTime} one-time price)",
    "review.fuEstimateFull": "{price} for one visit",
    "q.tabs.label": "Type of clean",
    "q.s1.h": "Where's the home?",
    "q.s1.p": "We'll check your area first so you don't fill in anything for nothing.",
    "q.zip": "ZIP code",
    "q.zipPh": "e.g. 28202",
    "q.outOfArea": "We don't cover {zip} yet. You can still send your details and we'll let you know when we do.",
    "q.continue": "Continue",
    "q.back": "Back",
    "q.s2.h": "Tell us about it",
    "q.homeType": "Type of home",
    "q.homeType.House": "House",
    "q.homeType.Apartment or condo": "Apartment or condo",
    "q.homeType.Townhome": "Townhome",
    "q.bedrooms": "Bedrooms",
    "q.bathrooms": "Bathrooms",
    "q.halfBath": "Count a half bath as one.",
    "q.pets": "Pets at home",
    "q.pets.None": "None",
    "q.pets.Dog": "Dog",
    "q.pets.Cat": "Cat",
    "q.pets.More than one": "More than one",
    "q.notes": "Anything we should know?",
    "q.optional": "Optional",
    "q.notesPh": "Products you prefer, rooms to skip, a tricky floor, a nervous dog.",
    "q.s3.h": "Pick your plan and schedule",
    "q.s3.p": "Prices are estimates for a {bedrooms}-bedroom, {bathrooms}-bathroom home. The exact price comes with your quote.",
    "q.plan": "Plan",
    "q.howOften": "How often",
    "q.single.desc": "One visit. No schedule needed.",
    "q.custom": "Custom",
    "q.customSub": "quoted for you",
    "q.fits": "Fits most homes.",
    "q.singleNote": "Single cleans are quoted after we hear about the home. We'll reply with a price, not a range.",
    "q.est.full": "Full price for a single visit. A schedule brings it down.",
    "q.s4.h": "How should we reach you?",
    "q.name": "Your name",
    "q.email": "Email",
    "q.phone": "Phone",
    "q.method": "Best way to reach you",
    "q.method.Text": "Text",
    "q.method.Email": "Email",
    "q.method.Call": "Call",
    "q.days": "Days that work",
    "q.pickAny": "Pick any",
    "q.day.Mon": "Mon",
    "q.day.Tue": "Tue",
    "q.day.Wed": "Wed",
    "q.day.Thu": "Thu",
    "q.day.Fri": "Fri",
    "q.day.Sat": "Sat",
    "q.time": "Time of day",
    "q.time.Morning": "Morning",
    "q.time.Afternoon": "Afternoon",
    "q.time.Either": "Either",
    "q.s5.h": "Check and send",
    "q.s5.p": "Change anything here before it goes out.",
    "q.change": "Change",
    "q.send": "Send my quote request",
    "q.sending": "Sending…",
    "q.done.h": "Request sent",
    "q.done.p": "We'll reply {responseTime} with an exact price for your home.",
    "q.demo": "This form isn't connected to an inbox yet. Set formEndpoint in plans.js to start receiving requests.",
    "q.home": "Back to the home page",
    "q.talk": "Rather talk it through? Call or text {phone}, or email {email}.",

    "err.zip": "Enter a 5-digit ZIP code.",
    "err.name": "Enter your name.",
    "err.email": "Enter an email address we can reply to.",
    "err.phone.Text": "Add a phone number so we can text you.",
    "err.phone.Call": "Add a phone number so we can call you.",
    "err.submit": "Couldn't send your request. Check your connection and try again{alt}.",
    "err.submitAlt": " or email {email}",

    "review.home": "Home",
    "review.size": "Size",
    "review.service": "Service",
    "review.plan": "Plan",
    "review.estimate": "Estimate",
    "review.contact": "Contact",
    "review.timing": "Timing",
    "review.notes": "Notes",
    "review.in": "{type} in {zip}",
    "review.outside": "(outside our current area)",
    "review.pets.None": "no pets",
    "review.pets.Dog": "a dog",
    "review.pets.Cat": "a cat",
    "review.pets.More than one": "more than one pet",
    "review.quoted": "quoted after we hear about the home",
    "review.estimateV": "{perVisit} {unit} ({pct} off the full price of {oneTime})",
    "review.prefers.Text": "Prefers text.",
    "review.prefers.Email": "Prefers email.",
    "review.prefers.Call": "Prefers a call.",
    "review.anyDay": "Any day",
    "review.time.Morning": "mornings",
    "review.time.Afternoon": "afternoons",
    "review.time.Either": "morning or afternoon",
  };

  D.es = {
    "meta.title.home": "MKG Services | Planes de limpieza que cuestan menos cuanto más seguido reservas",
    "meta.desc.home": "MKG Services limpia casas con la frecuencia que mejor te acomode. Elige un plan, elige cada cuánto y mira tu precio estimado antes de reservar. Sin contratos.",
    "meta.title.plans": "Planes y precios | MKG Services",
    "meta.desc.plans": "Compara los planes de limpieza de MKG Services. Define el tamaño de tu casa y la frecuencia para ver un precio estimado por visita, con el descuento recurrente a la vista.",
    "meta.title.quote": "Pedir cotización | MKG Services",
    "meta.desc.quote": "Pide una cotización de limpieza a MKG Services. Cuéntanos de tu casa, elige un plan y una frecuencia, y recibe un precio exacto por visita.",

    "brand.home": "Inicio de MKG Services",
    "nav.menu": "Menú",
    "nav.main": "Principal",
    "nav.plans": "Planes",
    "nav.singles": "Limpiezas únicas",
    "nav.faq": "Preguntas",
    "nav.quote": "Pedir cotización",
    "top.language": "Idioma",
    "top.en": "English",
    "top.es": "Español",
    "top.call": "Llamar",
    "top.text": "Texto",
    "top.contact": "Contacto",

    "hero.h1": "Tu casa limpia, en automático.",
    "hero.lead": "Elige un plan, elige cada cuánto, y mira cómo baja el precio. Salta una visita o cambia de plan cuando la vida cambie.",
    "hero.cta": "Pedir mi cotización",
    "hero.compare": "Comparar planes",
    "hero.single": "Una sola limpieza",
    "hero.note": "Los estimados son para orientarte. Tu precio exacto se confirma en la cotización, antes de que llegue nadie.",

    "dial.aria": "Estimador de precio del plan",
    "dial.plan": "Plan",
    "dial.save": "Ahorra {discount}",
    "dial.was": "{oneTimeStruck} a precio completo. Te quedas con {saving} en cada visita.",
    "dial.full": "Precio completo. Elige una frecuencia abajo para ver el descuento.",
    "dial.howOften": "¿Cada cuánto?",
    "dial.li1": "La misma lista en cada visita, para que nada se olvide",
    "dial.li2": "Salta, pausa o cambia de plan sin cargo",
    "dial.li3": "Precio confirmado antes de tu primera limpieza",
    "dial.cta": "Pedir cotización del plan {planName}",
    "dial.fine": "Estimado para una casa de {bedrooms} habitaciones y {bathrooms} baños.",

    "seg.off": "ahorra {pct}",
    "seg.full": "precio completo",
    "seg.aria": "Cada cuánto",
    "stepper.bedrooms.one": "hab.",
    "stepper.bedrooms.other": "hab.",
    "stepper.bathrooms.one": "baño",
    "stepper.bathrooms.other": "baños",
    "stepper.fewer.bedrooms": "Menos habitaciones",
    "stepper.more.bedrooms": "Más habitaciones",
    "stepper.fewer.bathrooms": "Menos baños",
    "stepper.more.bathrooms": "Más baños",
    "unit.bedroom.one": "habitación",
    "unit.bedroom.other": "habitaciones",
    "unit.bathroom.one": "baño",
    "unit.bathroom.other": "baños",

    "how.h2": "Cómo funciona un plan",
    "how.1.h": "Cuéntanos de tu casa",
    "how.1.p": "Habitaciones, baños, mascotas y cualquier cosa que quieras de una forma en particular. Dos minutos, sin crear cuenta.",
    "how.2.h": "Elige un plan y un ritmo",
    "how.2.p": "Decide cuánto de la casa cubrimos y cada cuánto venimos. Semanal ahorra más; mensual también ahorra.",
    "how.3.h": "Llega a una casa limpia",
    "how.3.p": "Confirmamos tu precio y llegamos según lo acordado. Salta una semana o cambia de plan por mensaje de texto cuando lo necesites.",

    "plans.h2": "Tres planes. Una regla: más seguido cuesta menos.",
    "plans.lead": "Cada plan tiene precio por visita. La frecuencia que elijas define el descuento, y aplica a todas las visitas, no solo a la primera.",
    "plans.yourHome": "Tu casa:",
    "plans.tag": "Para la mayoría",
    "plans.atFull": "a precio completo",
    "plans.save": "Ahorra",
    "plans.fullSingle": "Precio completo por una sola visita",
    "plans.bestFor": "Ideal para:",
    "plans.cta": "Cotizar el plan {name}",
    "plans.note.home": "Los estimados usan precios provisionales hasta que MKG confirme sus tarifas. La respuesta a tu cotización tiene el precio exacto por visita para tu casa.",
    "plans.note.link": "Ver la comparación completa.",
    "plans.note.plans": "Los estimados usan precios provisionales hasta que MKG confirme sus tarifas. Las casas que necesitan primero una limpieza profunda se cotizan aparte, así el precio del plan es el mismo desde la primera visita regular.",
    "plans.noscript": "Activa JavaScript para ver planes y precios, o",
    "plans.noscriptLink": "pide una cotización",

    "singles.h2.home": "¿Necesitas una sola limpieza, no un plan?",
    "singles.lead.home": "Se cotizan por separado porque cada casa es distinta. La mayoría de los planes empiezan con una limpieza profunda, para que las visitas regulares solo tengan que mantenerla.",
    "singles.h2.plans": "Limpiezas únicas",
    "singles.lead.plans": "Se cotizan por separado, porque una primera limpieza profunda o una casa vacía por mudanza es un trabajo distinto a mantener una casa en orden.",
    "singles.cta": "Pedir cotización",

    "why.h2": "Con lo que puedes contar",
    "why.1.h": "El precio antes de la visita",
    "why.1.p": "Aquí ves un estimado y en tu cotización el precio exacto. El número en la factura es el que acordaste.",
    "why.2.h": "Cambia de opinión cuando quieras",
    "why.2.p": "Sin contratos. Salta una visita, pausa por un viaje, pasa de semanal a mensual o cancela del todo.",
    "why.3.h": "La misma lista, cada vez",
    "why.3.p": "Cada plan tiene una lista escrita de lo que se hace. Agrega una nota sobre tu casa y pasa a ser parte de la lista.",

    "faq.h2": "Lo que la gente pregunta primero",
    "faq.q1": "¿Cómo funciona el descuento recurrente?",
    "faq.a1": "Cada plan tiene un precio completo por visita según las habitaciones y baños de tu casa. {discountSentence} El descuento se mantiene mientras se mantenga la frecuencia.",
    "faq.q2": "¿Puedo saltar una semana o pausar?",
    "faq.a2": "Sí. Avísanos antes de tu visita y la saltamos. Si pausas un tiempo y vuelves, tu plan y tu descuento siguen donde quedaron.",
    "faq.q3": "¿Tengo que estar en casa?",
    "faq.a3": "No. La mayoría de los clientes nos dan una forma de entrar: una caja de llaves, un código o un vecino. Lo acordamos contigo al confirmar tu primera visita.",
    "faq.q4": "¿Traen productos y equipo?",
    "faq.a4": "Sí. Si prefieres que usemos productos específicos en tu casa, déjalos a la vista y agrega una nota a tu plan.",
    "faq.q5": "¿Cómo se define el precio?",
    "faq.a5": "Según el plan que elijas y el tamaño de tu casa. Las habitaciones y los baños son lo que más pesa. Si la casa necesita primero una limpieza profunda, la cotizamos aparte para que el precio del plan sea predecible.",
    "faq.q6": "¿Dónde trabajan?",
    "faq.a6": "Escribe tu código postal en el formulario de cotización y te confirmamos si estás en nuestra zona antes que nada. También puedes llamar o escribir al {phone}.",

    "band.h2.home": "¿Listo para una semana más limpia?",
    "band.p.home": "Dos minutos para pedir una cotización. Sin cuenta, sin compromiso.",
    "band.cta.home": "Pedir mi cotización",
    "band.or": "O llama o escribe al {phone}",
    "band.h2.plans": "Recibe un precio exacto para tu casa",
    "band.p.plans": "Tu plan y tu frecuencia pasan al formulario de cotización.",
    "band.cta.plans": "Pedir cotización del plan {planName}",

    "footer.serving": "Atendemos {serviceArea}",
    "footer.call": "Llamar",
    "footer.text": "Escríbenos",
    "footer.nav": "Pie de página",

    "plansPage.h1": "Elige qué se limpia. Elige cada cuánto.",
    "plansPage.lead": "El precio se ajusta sobre la marcha. Define el tamaño de tu casa y la frecuencia una vez; todos los números de esta página se actualizan.",
    "compare.h2": "Qué cubre cada plan",
    "compare.lead": "La misma lista en cada visita. Los puntos en “rotación” se hacen en visitas alternas para que cada limpieza dure lo mismo.",
    "compare.legend": "Agrega una nota sobre tu casa en el formulario y pasa a ser parte de tu lista.",
    "compare.aria": "Qué incluye cada plan",
    "compare.col": "Qué se limpia",
    "compare.yes": "Incluido",
    "compare.no": "No incluido",
    "compare.rot": "Rotación",
    "notes.h2": "Cómo se arma el estimado",
    "notes.1.h": "Tamaño de la casa",
    "notes.1.p": "Cada plan parte de un precio base y suma un monto por habitación y por baño. El plan Esencial no incluye habitaciones, así que solo los baños cambian su precio.",
    "notes.2.h": "Descuento por frecuencia",
    "notes.2.p": "{discountSentence} Aplica sobre el precio completo por visita y se mantiene mientras se mantenga la frecuencia.",
    "notes.3.h": "Qué puede cambiar el precio final",
    "notes.3.p": "Espacios inusualmente grandes, mucha suciedad acumulada que requiera primero una limpieza profunda, o extras que pidas. Si algo mueve el número, te lo decimos en la respuesta a tu cotización, nunca en la factura.",

    "discount.first": "{label}: {pct} de descuento en cada visita.",
    "discount.rest": "{label}: {pct}.",

    "q.progress": "Progreso",
    "q.step.1": "Casa",
    "q.step.2": "Detalles",
    "q.step.3": "Plan",
    "q.step.4": "Contacto",
    "q.step.5": "Revisar",
    "q.fu.legend": "¿Cuándo fue tu última limpieza profunda?",
    "q.fu.unit": "una visita",
    "q.fu.optPrice": "Estimado",
    "q.fu.optSub": "se muestra abajo",
    "q.fu.was": "Precio único del plan Esencial para tu casa: {oneTime}. Ahorras {saving} porque la casa se limpió hace poco.",
    "q.fu.full": "Precio único del plan Esencial para tu casa: {oneTime}. Pasado un mes termina el descuento de seguimiento y quizá convenga una nueva limpieza profunda.",
    "q.fu.note": "Según una casa de {bedrooms} recámaras y {bathrooms} baños. El precio exacto se confirma en nuestra respuesta.",
    "review.fuTiming": "Última limpieza profunda",
    "review.fuEstimateV": "{price} por una visita ({pct} menos que el precio único de {oneTime})",
    "review.fuEstimateFull": "{price} por una visita",
    "q.tabs.label": "Tipo de limpieza",
    "q.s1.h": "¿Dónde está la casa?",
    "q.s1.p": "Primero revisamos tu zona para que no llenes nada en vano.",
    "q.zip": "Código postal",
    "q.zipPh": "ej. 28202",
    "q.outOfArea": "Todavía no cubrimos {zip}. Igual puedes enviar tus datos y te avisamos cuando lleguemos.",
    "q.continue": "Continuar",
    "q.back": "Atrás",
    "q.s2.h": "Cuéntanos de ella",
    "q.homeType": "Tipo de vivienda",
    "q.homeType.House": "Casa",
    "q.homeType.Apartment or condo": "Apartamento o condominio",
    "q.homeType.Townhome": "Casa adosada",
    "q.bedrooms": "Habitaciones",
    "q.bathrooms": "Baños",
    "q.halfBath": "Cuenta un medio baño como uno.",
    "q.pets": "Mascotas en casa",
    "q.pets.None": "Ninguna",
    "q.pets.Dog": "Perro",
    "q.pets.Cat": "Gato",
    "q.pets.More than one": "Más de una",
    "q.notes": "¿Algo que debamos saber?",
    "q.optional": "Opcional",
    "q.notesPh": "Productos que prefieres, cuartos que no tocar, un piso delicado, un perro nervioso.",
    "q.s3.h": "Elige tu plan y frecuencia",
    "q.s3.p": "Los precios son estimados para una casa de {bedrooms} habitaciones y {bathrooms} baños. El precio exacto viene con tu cotización.",
    "q.plan": "Plan",
    "q.howOften": "Cada cuánto",
    "q.single.desc": "Una sola visita. Sin frecuencia.",
    "q.custom": "A medida",
    "q.customSub": "cotizado para ti",
    "q.fits": "Para la mayoría de las casas.",
    "q.singleNote": "Las limpiezas únicas se cotizan después de conocer la casa. Respondemos con un precio, no con un rango.",
    "q.est.full": "Precio completo por una sola visita. Una frecuencia lo baja.",
    "q.s4.h": "¿Cómo te contactamos?",
    "q.name": "Tu nombre",
    "q.email": "Correo electrónico",
    "q.phone": "Teléfono",
    "q.method": "Mejor forma de contactarte",
    "q.method.Text": "Texto",
    "q.method.Email": "Correo",
    "q.method.Call": "Llamada",
    "q.days": "Días que te sirven",
    "q.pickAny": "Elige los que quieras",
    "q.day.Mon": "Lun",
    "q.day.Tue": "Mar",
    "q.day.Wed": "Mié",
    "q.day.Thu": "Jue",
    "q.day.Fri": "Vie",
    "q.day.Sat": "Sáb",
    "q.time": "Hora del día",
    "q.time.Morning": "Mañana",
    "q.time.Afternoon": "Tarde",
    "q.time.Either": "Cualquiera",
    "q.s5.h": "Revisa y envía",
    "q.s5.p": "Cambia lo que quieras antes de enviarlo.",
    "q.change": "Cambiar",
    "q.send": "Enviar mi solicitud",
    "q.sending": "Enviando…",
    "q.done.h": "Solicitud enviada",
    "q.done.p": "Te respondemos {responseTime} con un precio exacto para tu casa.",
    "q.demo": "Este formulario aún no está conectado a un correo. Configura formEndpoint en plans.js para empezar a recibir solicitudes.",
    "q.home": "Volver al inicio",
    "q.talk": "¿Prefieres hablarlo? Llama o escribe al {phone}, o envía un correo a {email}.",

    "err.zip": "Escribe un código postal de 5 dígitos.",
    "err.name": "Escribe tu nombre.",
    "err.email": "Escribe un correo al que podamos responder.",
    "err.phone.Text": "Agrega un número de teléfono para poder enviarte un texto.",
    "err.phone.Call": "Agrega un número de teléfono para poder llamarte.",
    "err.submit": "No se pudo enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo{alt}.",
    "err.submitAlt": ", o escríbenos a {email}",

    "review.home": "Casa",
    "review.size": "Tamaño",
    "review.service": "Servicio",
    "review.plan": "Plan",
    "review.estimate": "Estimado",
    "review.contact": "Contacto",
    "review.timing": "Horario",
    "review.notes": "Notas",
    "review.in": "{type} en {zip}",
    "review.outside": "(fuera de nuestra zona actual)",
    "review.pets.None": "sin mascotas",
    "review.pets.Dog": "un perro",
    "review.pets.Cat": "un gato",
    "review.pets.More than one": "más de una mascota",
    "review.quoted": "cotizado después de conocer la casa",
    "review.estimateV": "{perVisit} {unit} ({pct} de descuento sobre el precio completo de {oneTime})",
    "review.prefers.Text": "Prefiere texto.",
    "review.prefers.Email": "Prefiere correo.",
    "review.prefers.Call": "Prefiere llamada.",
    "review.anyDay": "Cualquier día",
    "review.time.Morning": "por la mañana",
    "review.time.Afternoon": "por la tarde",
    "review.time.Either": "mañana o tarde",
  };

  // ---------- runtime ----------
  var LANGS = ["en", "es"];
  var KEY = "mkg.lang";
  var lang = detect();

  function detect() {
    var q = new URLSearchParams(location.search).get("lang");
    if (LANGS.indexOf(q) !== -1) return q;
    try { var s = localStorage.getItem(KEY); if (LANGS.indexOf(s) !== -1) return s; } catch (e) { /* ignore */ }
    var nav = (navigator.language || "").toLowerCase();
    return nav.indexOf("es") === 0 ? "es" : "en";
  }

  function t(key, vars) {
    var s = D[lang][key];
    if (s === undefined) s = D.en[key];
    if (s === undefined) { if (window.console) console.warn("i18n: missing key " + key); return key; }
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
    return s;
  }
  // Bilingual values in plans.js: a string, or { en: "...", es: "..." }
  function L(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    return v[lang] !== undefined ? v[lang] : (v.en !== undefined ? v.en : "");
  }
  function plural(keyBase, n) { return t(keyBase + (n === 1 ? ".one" : ".other")); }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // Placeholders that become live elements inside translated markup.
  var LIVE = {
    bedrooms: '<span data-text="bedrooms"></span>',
    bathrooms: '<span data-text="bathrooms"></span>',
    planName: '<span data-text="planName"></span>',
    frequencyLabel: '<span data-text="frequencyLabel"></span>',
    discountSentence: '<span data-text="discountSentence"></span>',
    perVisit: '<span data-price="current"></span>',
    unit: '<span data-price="current" data-price-part="label"></span>',
    oneTimeStruck: '<s data-price="current" data-price-part="oneTime"></s>',
    saving: '<span data-price="current" data-price-part="saving"></span>',
    discount: '<span data-price="current" data-price-part="discount"></span>',
    phone: '<a data-business="phone"></a>',
    sms: '<a data-business="sms"></a>',
    email: '<a data-business="email"></a>',
    responseTime: '<span data-business="responseTime"></span>',
    serviceArea: '<span data-business="serviceArea"></span>',
    zip: '<strong data-out-zip></strong>',
  };

  function fill(el, s) {
    if (s.indexOf("{") === -1) { el.textContent = s; return; }
    el.innerHTML = esc(s).replace(/\{(\w+)\}/g, function (m, k) { return LIVE[k] || m; });
  }

  function apply() {
    document.documentElement.lang = lang;
    var all = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < all.length; i++) {
      var key = all[i].getAttribute("data-i18n");
      // A key missing from both dictionaries keeps the text already in the page instead of showing the key.
      if (D[lang][key] === undefined && D.en[key] === undefined) continue;
      fill(all[i], t(key));
    }
    var attrs = document.querySelectorAll("[data-i18n-attr]");
    for (var j = 0; j < attrs.length; j++) {
      attrs[j].getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (p.length === 2) attrs[j].setAttribute(p[0].trim(), t(p[1].trim()));
      });
    }
    var sw = document.querySelectorAll("[data-lang-switch]");
    for (var k = 0; k < sw.length; k++) sw[k].setAttribute("aria-pressed", sw[k].getAttribute("data-lang-switch") === lang ? "true" : "false");
  }

  function set(next) {
    if (LANGS.indexOf(next) === -1 || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }
    try {
      var url = new URL(location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url.toString());
    } catch (e) { /* ignore */ }
    apply();
    if (window.MKG && window.MKG.app && window.MKG.app.relocalize) window.MKG.app.relocalize();
    document.dispatchEvent(new CustomEvent("mkg:langchange", { detail: { lang: lang } }));
  }

  function bind() {
    var sw = document.querySelectorAll("[data-lang-switch]");
    for (var i = 0; i < sw.length; i++) {
      (function (b) { b.addEventListener("click", function () { set(b.getAttribute("data-lang-switch")); }); })(sw[i]);
    }
  }

  window.MKG = window.MKG || {};
  window.MKG.i18n = {
    get lang() { return lang; },
    t: t, L: L, plural: plural, apply: apply, set: set, dictionaries: D,
  };

  // Remember a language chosen through the URL so the next page keeps it.
  try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }

  function init() { apply(); bind(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
