// functions/index.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firebase Admin SDK'yı başlatın (Zaten dağıtımınızda başlatılmış olmalı)
admin.initializeApp();
const db = admin.database();

// Basit Türkçe/İngilizce REGEX Küfür Listesi (İhtiyaca göre genişletilmelidir)
// NOT: Gerçek çok dilli sistemler için Google Cloud Natural Language API gereklidir.
const TOXIC_WORDS = new RegExp([
    'küfür', 
    'hakaret', 
    'lanet',
    'aptal',
    'salak',
    'suck', 
    'shit',
    'fuck',
    'bitch'
].join('|'), 'gi'); // 'gi' bayrakları: Global (tüm eşleşmeleri bul) ve Case-Insensitive (büyük/küçük harf duyarsız)

const MAX_MESSAGES = 100;

/**
 * İstemciden gelen mesajı alır, küfür kontrolü yapar ve veritabanına kaydeder.
 * Bu fonksiyon, istemci tarafından httpsCallable ile çağrılacaktır.
 */
exports.processMessage = functions.https.onCall(async (data, context) => {
    // 1. Kimlik Doğrulama Kontrolü
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Giriş yapılmalı. Mesaj gönderilemedi.');
    }

    const uid = context.auth.uid;
    const { name, photo, text } = data;

    if (!text || text.trim() === '') {
        throw new functions.https.HttpsError('invalid-argument', 'Mesaj içeriği boş olamaz.');
    }
    
    // 2. Küfür Algılama ve Sansürleme
    let processedText = text.trim();
    let isCensored = false;

    // REGEX Testi
    if (TOXIC_WORDS.test(processedText)) {
        isCensored = true;
        
        // Basit sansürleme mantığı: Kelimenin yerine yıldız koy.
        processedText = processedText.replace(TOXIC_WORDS, (match) => {
            return '*'.repeat(match.length);
        });
        functions.logger.log(`[CENSURED] Küfür tespit edildi: ${text} -> ${processedText}`);
    } 
    
    // 3. Veritabanına Kayıt
    await db.ref("chat").push({
        name: name,
        photo: photo,
        text: processedText,
        time: admin.database.ServerValue.TIMESTAMP, // Sunucu zamanını kullan
        isCensored: isCensored
    });
    
    // 4. Sohbet Sınırı Uygulama (En eski mesajları sil)
    // Sınırın aşılıp aşılmadığını kontrol etmek için sadece 101. mesajı çekeriz.
    const snapshot = await db.ref("chat").orderByKey().limitToFirst(MAX_MESSAGES + 1).once('value');
    const items = snapshot.val() || {};
    const keys = Object.keys(items);
    
    if (keys.length > MAX_MESSAGES) {
        // İlk (en eski) anahtarı siliyoruz
        const oldestKey = keys[0];
        await db.ref("chat/" + oldestKey).remove();
        functions.logger.log(`[LIMIT] En eski mesaj silindi: ${oldestKey}`);
    }

    return { 
        status: "success", 
        censored: isCensored, 
        message: processedText 
    };
});
