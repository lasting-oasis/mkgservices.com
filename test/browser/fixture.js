// Task 3B-1 fictional records (example.test, 555 numbers). Clock: Mon Dec 7 2026, 10:00 am Charlotte.
(function () {
  function base(id, name, extra) { return Object.assign({ id: id, name: name, email: id.toLowerCase() + "@example.test", emailLower: id.toLowerCase() + "@example.test", phone: "(704) 555-01" + (10 + name.length), zip: "28273", segment: "residential", plan: "Family", frequency: "Every 2 weeks", bedrooms: 3, bathrooms: 2, homeType: "House", pets: "None", days: ["Thu"], date: "", slot: "", status: "new", language: "en", contactMethod: "Text", estimatePerVisit: 195, notes: "" }, extra); }
  var ET = function (s) { return s + "-05:00"; };
  window.FIXTURE = {
    me: { uid: "ana-uid", email: "dispatch.ana@example.test", role: "owner" },
    team: [ { uid: "ana-uid", email: "dispatch.ana@example.test", role: "owner" }, { uid: "carla-uid", email: "dispatch.carla@example.test", role: "admin" }, { uid: "beto-uid", email: "crew.beto@example.test", role: "admin" } ],
    requests: [
      base("FRI0QUOTE1", "Paula Friday", { createdAt: ET("2026-12-04T15:30:00") }),
      base("MON0QUOTE2", "Owen Monday", { createdAt: ET("2026-12-07T09:00:00") }),
      base("PROMISE003", "Rosa Promesa", { createdAt: ET("2026-12-07T08:30:00"), language: "es" }),
      base("RESCHED004", "Ray Close", { status: "new", date: "2026-12-07", slot: "1130", movedFrom: "2026-12-08 0800", movedByClientAt: ET("2026-12-07T09:45:00"), createdAt: ET("2026-11-20T10:00:00") }),
      base("FOLLOW0005", "Fiona Later", { status: "confirmed", date: "2026-12-10", slot: "0800", createdAt: ET("2026-11-25T10:00:00"), segment: "residential" }),
      base("RACE000006", "Rhea Race", { createdAt: ET("2026-12-07T09:30:00") }),
      base("DONE000007", "Dana Done", { status: "done", createdAt: ET("2026-11-02T10:00:00") }),
      // Stale-card scenarios: each has a booking Thu Dec 10 8:00; the customer moves it to Wed Dec 9 11:30.
      base("CARDDONE01", "Cara Done", { status: "confirmed", date: "2026-12-10", slot: "0800", createdAt: ET("2026-11-24T10:00:00") }),
      base("CARDCONF02", "Cole Confirm", { status: "new", date: "2026-12-10", slot: "0800", createdAt: ET("2026-12-07T08:10:00") }),
      base("CARDDECL03", "Dina Decline", { status: "confirmed", date: "2026-12-10", slot: "0800", createdAt: ET("2026-11-24T11:00:00") }),
      base("CARDDATE04", "Dale Date", { status: "confirmed", date: "2026-12-10", slot: "0800", createdAt: ET("2026-11-24T12:00:00") }),
      base("CARDDELE06", "Del Delete", { status: "confirmed", date: "2026-12-10", slot: "0800", createdAt: ET("2026-11-24T14:00:00") }),
      base("CARDREPL05", "Rita Reply", { status: "confirmed", date: "2026-12-10", slot: "0800", createdAt: ET("2026-11-24T13:00:00") }),
      // An existing request from before repliedAt existed: answered by note, still "new", no queue fields.
      base("LEGACY0008", "Lena Legacy", { status: "new", replyNote: "Thanks! $180 per visit, does Thursday work?", createdAt: ET("2026-11-12T10:00:00") }),
    ],
    internal: {
      PROMISE003: { adminNotes: "", assignedTo: "dispatch.carla@example.test", queue: { state: "open", nextAction: "Llamar con precio", dueMs: Date.parse(ET("2026-12-07T09:45:00")), setMs: Date.parse(ET("2026-12-07T08:40:00")) } },
      FOLLOW0005: { adminNotes: "", assignedTo: "dispatch.ana@example.test", queue: { state: "waiting", nextAction: "Confirm gate code", dueMs: Date.parse(ET("2026-12-08T10:00:00")), setMs: Date.parse(ET("2026-12-05T11:00:00")) } },
      RACE000006: { adminNotes: "", assignedTo: "crew.beto@example.test" },
      DONE000007: { adminNotes: "", assignedTo: "crew.beto@example.test", queue: { state: "waiting", nextAction: "Ask for review", dueMs: Date.parse(ET("2026-12-08T10:00:00")), setMs: Date.parse(ET("2026-12-03T10:00:00")) } },
    },
    events: {
      PROMISE003: [ { id: "e1", kind: "reply", text: "Te llamo antes de las 9:45 con el precio.", by: "carla-uid", atMs: Date.parse(ET("2026-12-07T08:40:00")) } ],
    },
  };
})();
