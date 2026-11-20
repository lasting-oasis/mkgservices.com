// Records a customer's reschedule in the request's staff-only history.
//
// Pure logic, no Firebase imports, so the deployed function (index.js), the
// tests and the browser check all run this same code.
//
// A move is recognised by movedByClientAt changing. The rules force that
// field to the server's time on every customer move (firestore.rules,
// customer moves), so each move has its own timestamp and its own event id:
// move-<seconds>-<nanoseconds>. create() refuses an id that already exists,
// so a retried or replayed trigger can't write a second entry.

function isTs(v) {
  return !!v && typeof v === "object" && typeof v.seconds === "number" && typeof v.nanoseconds === "number";
}
function sameTs(a, b) {
  return isTs(a) && isTs(b) && a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
}
function eventId(ts) {
  return "move-" + ts.seconds + "-" + String(ts.nanoseconds).padStart(9, "0");
}
function slotOf(d) {
  var date = typeof d.date === "string" ? d.date : "", slot = typeof d.slot === "string" ? d.slot : "";
  return date ? date + (slot ? " " + slot : "") : "";
}

// The event for one update, or null when the update isn't a customer move.
function buildMoveEvent(before, after, serverTimestamp) {
  var b = before || {}, a = after || {};
  if (!isTs(a.movedByClientAt)) return null;            // never moved by the customer
  if (sameTs(a.movedByClientAt, b.movedByClientAt)) return null; // a staff edit or another field
  var from = slotOf(b), to = slotOf(a);
  return {
    id: eventId(a.movedByClientAt),
    data: {
      kind: "move",
      by: "customer",
      at: a.movedByClientAt,                              // when the customer moved it
      recordedAt: serverTimestamp(),                      // when this entry was written
      from: from,                                         // from the trusted before-snapshot
      to: to,
      prevStatus: typeof b.status === "string" ? b.status : "",
      prevMovedAt: isTs(b.movedByClientAt) ? b.movedByClientAt : null, // the customer's previous move, if any
      text: (from || "-") + " -> " + (to || "-"),
    },
  };
}

function alreadyExists(e) {
  return !!e && (e.code === 6 || e.code === "already-exists" || e.code === "ALREADY_EXISTS" || /already exists/i.test(String(e.message || "")));
}

// db: something with doc(path).create(data) (Admin SDK Firestore, or a test fake).
// Resolves to { status: "written" | "duplicate" | "skipped", id? }. Other errors
// are thrown, so the platform retries the trigger.
function recordMove(db, requestId, before, after, serverTimestamp) {
  var ev = buildMoveEvent(before, after, serverTimestamp);
  if (!ev) return Promise.resolve({ status: "skipped" });
  return db.doc("internal/" + requestId + "/events/" + ev.id).create(ev.data).then(
    function () { return { status: "written", id: ev.id }; },
    function (e) { if (alreadyExists(e)) return { status: "duplicate", id: ev.id }; throw e; });
}

module.exports = { buildMoveEvent: buildMoveEvent, recordMove: recordMove, eventId: eventId, sameTs: sameTs };
