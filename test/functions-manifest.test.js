/*
  CI check for functions/functions.yaml (see functions-manifest.js).

  1. Regenerates the manifest from the recorder code through the pinned
     firebase-tools and compares it with the committed file. Only the
     omission of an EMPTY `extensions` field is allowed.
  2. Shows the comparison flags what it must: a real extension, a committed
     extensions field, and changes to the recorder's configuration.
  3. Runs the pinned deploy tool's own discovery (Node runtime delegate,
     discoverBuild) on functions/ and checks it finds exactly the recorder,
     with the expected Firestore trigger, and no extensions, so deploy's
     prepare step skips the Firebase Extensions check. It also shows the
     SDK-reported manifest alone would have triggered that check (run #37).
*/
const assert = require("assert");
const fs = require("fs");
const M = require("./functions-manifest");

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n").join("\n       ")); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const rejects = (fn, re) => assert.throws(fn, re);

// Mirrors deploy/functions/prepare.js in firebase-tools 13.35.1.
const wouldRunExtensionsCheck = (builds) => Object.values(builds).some((b) => b.extensions);

(async () => {
  console.log("functions manifest (firebase-tools " + M.PINNED_TOOLS + ")");
  let generated;
  await t("generated from the recorder code with the pinned firebase-tools", async () => {
    generated = await M.generateManifest();
    assert.deepStrictEqual(Object.keys(generated.endpoints), ["recordCustomerMove"]);
    assert.deepStrictEqual(generated.extensions, {}, "the SDK still reports an empty extensions list");
  });
  if (!generated) { console.log(pass + " passed, " + (fail || 1) + " failed"); process.exit(1); }
  const committed = M.readCommitted();

  await t("committed functions.yaml matches the generated manifest (empty extensions omitted)", () => {
    M.compareManifests(generated, committed);
    assert.ok(!("extensions" in committed));
  });

  console.log("the comparison flags");
  await t("a real Firebase Extension declared in the code", () => {
    const g = clone(generated);
    g.extensions = { resize: { params: {}, ref: "firebase/storage-resize-images@0.2.0" } };
    rejects(() => M.compareManifests(g, committed), /declares Firebase Extensions/);
  });
  await t("an extensions field in the committed file, even an empty one", () => {
    const c = clone(committed); c.extensions = {};
    rejects(() => M.compareManifests(generated, c), /must not contain an extensions field/);
  });
  const changes = {
    "retry turned off": (g) => { g.endpoints.recordCustomerMove.eventTrigger.retry = false; },
    "a different region": (g) => { g.endpoints.recordCustomerMove.region = ["us-east1"]; },
    "a different document path": (g) => { g.endpoints.recordCustomerMove.eventTrigger.eventFilterPathPatterns.document = "bookings/{id}"; },
    "a different trigger type": (g) => { g.endpoints.recordCustomerMove.eventTrigger.eventType = "google.cloud.firestore.document.v1.written"; },
    "a different database": (g) => { g.endpoints.recordCustomerMove.eventTrigger.eventFilters.database = "other"; },
    "a changed instance limit": (g) => { g.endpoints.recordCustomerMove.maxInstances = 10; },
    "a new memory setting": (g) => { g.endpoints.recordCustomerMove.availableMemoryMb = 512; },
    "a second function": (g) => { g.endpoints.another = clone(g.endpoints.recordCustomerMove); g.endpoints.another.entryPoint = "another"; },
    "a required API": (g) => { g.requiredAPIs = [{ api: "pubsub.googleapis.com", reason: "x" }]; },
  };
  for (const [name, change] of Object.entries(changes)) {
    await t("recorder configuration change: " + name, () => {
      const g = clone(generated); change(g);
      rejects(() => M.compareManifests(g, committed), /out of date with the code/);
    });
  }
  await t("a hand edit to the committed file", () => {
    const c = clone(committed); c.endpoints.recordCustomerMove.eventTrigger.retry = false;
    rejects(() => M.compareManifests(generated, c), /out of date with the code/);
  });

  console.log("pinned deploy tool discovery");
  const { yamlToBuild } = M.tools("deploy/functions/runtimes/discovery");
  await t("discoverBuild reads functions.yaml: exactly one recorder, Firestore trigger, no extensions", async () => {
    assert.ok(fs.existsSync(M.MANIFEST_PATH));
    const build = await M.delegate().discoverBuild({}, {});
    // It took the functions.yaml path: same build as parsing the committed file directly.
    assert.deepStrictEqual(build, yamlToBuild(committed, M.PROJECT, "us-central1", M.RUNTIME));
    assert.deepStrictEqual(Object.keys(build.endpoints), ["recordCustomerMove"]);
    const ep = build.endpoints.recordCustomerMove;
    assert.strictEqual(ep.platform, "gcfv2");
    assert.deepStrictEqual(ep.region, ["us-central1"]);
    assert.strictEqual(ep.entryPoint, "recordCustomerMove");
    assert.strictEqual(ep.maxInstances, 2);
    assert.deepStrictEqual(ep.eventTrigger, {
      eventType: "google.cloud.firestore.document.v1.updated",
      eventFilters: { database: "(default)", namespace: "(default)" },
      eventFilterPathPatterns: { document: "requests/{id}" },
      retry: true,
    });
    assert.strictEqual(build.extensions, undefined);
    assert.strictEqual(wouldRunExtensionsCheck({ default: build }), false, "prepare would skip the Extensions check");
    console.log("       discovered: " + JSON.stringify({ endpoints: Object.keys(build.endpoints), platform: ep.platform, region: ep.region, eventTrigger: ep.eventTrigger, extensions: build.extensions }));
  });
  await t("without functions.yaml the SDK manifest would trigger the Extensions check (run #37)", () => {
    const sdkBuild = yamlToBuild(generated, M.PROJECT, "us-central1", M.RUNTIME);
    assert.deepStrictEqual(sdkBuild.extensions, {});
    assert.strictEqual(wouldRunExtensionsCheck({ default: sdkBuild }), true);
  });

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
