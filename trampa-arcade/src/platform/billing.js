// Google Play Billing: the one-time "Quitar anuncios" purchase.
// On the web (browser testing) the purchase is simulated.
import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { CONFIG } from '../config.js';

const PURCHASED = '1'; // Google Play Purchase.PurchaseState.PURCHASED
const PENDING = '2';

export class Billing {
  constructor() {
    this.native = Capacitor.isNativePlatform();
    this.available = !this.native;
    this.price = '';
  }

  async init() {
    if (!this.native) return false;
    try {
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      this.available = isBillingSupported;
      if (!isBillingSupported) return false;
      try {
        const { products } = await NativePurchases.getProducts({
          productIdentifiers: [CONFIG.removeAdsProductId],
          productType: PURCHASE_TYPE.INAPP,
        });
        this.price = products[0]?.priceString ?? '';
      } catch {
        // Product not created in Play Console yet.
      }
      return await this.ownsRemoveAds();
    } catch (err) {
      console.warn('[billing] init', err);
      return false;
    }
  }

  async ownsRemoveAds() {
    if (!this.native) return false;
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return purchases.some(
      (p) => p.productIdentifier === CONFIG.removeAdsProductId && (p.purchaseState === undefined || p.purchaseState === PURCHASED),
    );
  }

  /** Returns 'ok', 'pending', 'cancelled' or 'error'. */
  async buyRemoveAds() {
    if (!this.native) return 'ok';
    try {
      const tx = await NativePurchases.purchaseProduct({
        productIdentifier: CONFIG.removeAdsProductId,
        productType: PURCHASE_TYPE.INAPP,
      });
      if (tx?.purchaseState === PENDING) return 'pending';
      return 'ok';
    } catch (err) {
      const message = String(err?.message ?? err).toLowerCase();
      return message.includes('cancel') ? 'cancelled' : 'error';
    }
  }

  async restore() {
    if (!this.native) return false;
    try {
      await NativePurchases.restorePurchases();
    } catch {
      // Fall through to reading the purchases we can see.
    }
    return this.ownsRemoveAds();
  }
}
