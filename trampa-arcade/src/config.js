// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURACIÓN DE MONETIZACIÓN — cámbiala antes de publicar (ver README).
// ─────────────────────────────────────────────────────────────────────────────
export const CONFIG = {
  admob: {
    // Mientras sea true se usan los anuncios de PRUEBA de Google (no generan
    // dinero, pero no ponen en riesgo tu cuenta). Pon false solo cuando hayas
    // pegado abajo tus propios IDs de AdMob.
    useTestAds: true,
    bannerId: 'ca-app-pub-3940256099942544/9214589741',
    interstitialId: 'ca-app-pub-3940256099942544/1033173712',
    rewardedId: 'ca-app-pub-3940256099942544/5224354917',
    // Banner en los menús (nunca durante la partida).
    menuBanner: true,
    // Anuncio de pantalla completa como mucho cada N niveles y cada X segundos.
    interstitialEveryLevels: 3,
    interstitialMinSeconds: 120,
  },
  // ID del producto "Quitar anuncios" creado en Google Play Console
  // (Monetizar → Productos → Productos integrados en la aplicación).
  removeAdsProductId: 'quitar_anuncios',
  // URL pública de tu política de privacidad (obligatoria en Google Play).
  privacyPolicyUrl: 'https://enrique-hurtado382.github.io/Enrique-Hurtado382/trampa-arcade/legal/privacidad.html',
  // Muertes en un nivel a partir de las cuales se ofrece saltarlo.
  offerSkipAfterDeaths: 8,
};
