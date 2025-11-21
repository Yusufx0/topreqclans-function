const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Filter = require("bad-words");

admin.initializeApp();
const db = admin.firestore();
const filter = new Filter();

exports.moderateChat = functions.firestore
  .document("chat/{messageId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const text = data.text || "";

    if (!text) return null;

    if (filter.isProfane(text)) {
      console.log("Küfür tespit edildi:", text);

      await snap.ref.delete();

      await db.collection("mod-logs").add({
        uid: data.uid,
        text: text,
        action: "deleted_profanity",
        time: admin.firestore.FieldValue.serverTimestamp()
      });

      return null;
    }

    return null;
  });
