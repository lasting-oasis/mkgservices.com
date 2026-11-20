// Cloud Functions for mkgservices.com.
//
// recordCustomerMove: when a customer moves their visit on the account page,
// write one entry in that request's staff-only history
// (internal/{id}/events/move-<seconds>-<nanos>). The logic is in recorder.js.
//
// REGION must be compatible with the Firestore database's location; confirm the
// database location in the Firebase console before the first deploy (us-central1
// matches the default nam5 multi-region).
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { recordMove } = require("./recorder");

const REGION = "us-central1";

initializeApp();

exports.recordCustomerMove = onDocumentUpdated(
  { document: "requests/{id}", region: REGION, retry: true, maxInstances: 2 },
  async (event) => {
    if (!event.data) return;
    const r = await recordMove(getFirestore(), event.params.id, event.data.before.data(), event.data.after.data(),
      () => FieldValue.serverTimestamp());
    if (r.status !== "skipped") logger.info("customer move", { request: event.params.id, status: r.status, event: r.id });
  });
