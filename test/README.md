# Tests

`rules.test.js` checks `firestore.rules` against the Firestore emulator: what a
visitor, a signed-in client, and a team member may write, mirroring the writes
`backend.js` makes. `headroom.test.js` checks that the heaviest write still
fits under Firestore's limit of 1,000 evaluated expressions per request, with
room to spare for future rule edits.

```
cd test
npm install        # firebase-tools, the emulator client, and the test helper
npm test           # starts the emulator (needs Java 11+), runs rules.test.js
npx firebase emulators:exec --only firestore --project demo-mkg-rules --config ../firebase.json "node headroom.test.js"
```

Run them whenever `firestore.rules` or the hold-writing code in `backend.js`
changes. The deploy workflow does not run them yet.
