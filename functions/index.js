const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Filter = require('bad-words'); // Küfür algılama kütüphanesi

admin.initializeApp();

const db = admin.database();
const filter = new Filter();

// Kullanıcı istatistiklerinin tutulduğu yer
const USER_STATS_REF = 'userStats'; 
// Küfürlü mesajları yakalamak için Cloud Function
exports.moderateChat = functions.database.ref('/chat/{messageId}')
    .onCreate(async (snapshot, context) => {
        const message = snapshot.val();
        const text = message.text;
        const uid = context.auth.uid; // Mesajı gönderen kullanıcının UID'si

        // 1. KÜFÜR TESPİTİ
        if (filter.isProfane(text)) {
            console.log(`[MODERATION] Küfür tespit edildi: ${text} - UID: ${uid}`);

            const statsRef = db.ref(`${USER_STATS_REF}/${uid}`);
            const statsSnapshot = await statsRef.once('value');
            const stats = statsSnapshot.val() || { strikes: 0, muteUntil: 0 };
            
            let newStrikes = stats.strikes + 1;
            let muteDurationMinutes = 0;
            let muteWarning = "";

            // 2. CEZA HESAPLAMA VE MESAJI SİLME

            // Mesajı derhal sil (Küfürlü olduğu için)
            await snapshot.ref.remove();

            if (newStrikes === 1) {
                // İlk küfür: Sadece uyarı + silme
                muteWarning = "İlk uyarı: Küfürlü mesajınız silindi.";
                muteDurationMinutes = 0; 
            } else if (newStrikes === 2) {
                // İkinci küfür: 10 dakika mute + uyarı + silme
                muteWarning = "İkinci uyarı: 10 dakika boyunca susturuldunuz.";
                muteDurationMinutes = 10;
            } else if (newStrikes >= 3) {
                // Üçüncü ve sonrası: 24 saat mute + uyarı + silme
                muteWarning = "Son uyarı: 24 saat boyunca susturuldunuz. Kuralları ihlal etmeye devam ederseniz banlanacaksınız.";
                newStrikes = 3; // 3. uyarıdan sonra sayacı artırmanın anlamı yok
                muteDurationMinutes = 24 * 60; // 24 saat
            }
            
            const muteUntil = Date.now() + (muteDurationMinutes * 60 * 1000);

            // 3. KULLANICI İSTATİSTİKLERİNİ GÜNCELLEME
            await statsRef.update({
                strikes: newStrikes,
                muteUntil: muteUntil,
                lastMuteMessage: muteWarning
            });

            // Kullanıcıya özel bir bildirim mesajı gönderebiliriz (örneğin bir "uyarı" mesajı ile)
            await db.ref(`warnings/${uid}`).push({
                message: muteWarning,
                time: Date.now()
            });

            console.log(`[MODERATION] UID: ${uid} - Yeni ceza: ${muteWarning}`);
            return null;

        } else {
            // Mesaj temiz, devam et
            return null;
        }
    });
