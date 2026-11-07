// AdMob: consent form (EU/UK), menu banner, interstitials between levels and
// rewarded ads to skip a level. On the web (testing in a browser) ads are simulated.
import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { CONFIG } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Ads {
  constructor() {
    this.native = Capacitor.isNativePlatform();
    this.ready = false;
    this.removed = false;
    this.interstitialLoaded = false;
    this.rewardedLoaded = false;
    this.lastInterstitial = Date.now();
    this.bannerCreated = false;
    this.bannerVisible = false;
    this.onBannerHeight = () => {};
    this.onDismiss = null;
  }

  get testing() {
    return CONFIG.admob.useTestAds;
  }

  async init() {
    if (!this.native) return;
    try {
      await AdMob.initialize({ initializeForTesting: this.testing });
      let consent = await AdMob.requestConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
        consent = await AdMob.showConsentForm();
      }
      if (!consent.canRequestAds) return;

      const dismissed = () => {
        this.onDismiss?.();
        this.onDismiss = null;
      };
      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, dismissed);
      AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, dismissed);
      AdMob.addListener(RewardAdPluginEvents.Dismissed, dismissed);
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, dismissed);
      AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => this.onBannerHeight(this.bannerVisible ? size.height : 0));

      this.ready = true;
      this.prepareInterstitial();
      this.prepareRewarded();
    } catch (err) {
      console.warn('[ads] init', err);
    }
  }

  async prepareInterstitial() {
    if (!this.ready || this.removed) return;
    try {
      await AdMob.prepareInterstitial({ adId: CONFIG.admob.interstitialId, isTesting: this.testing });
      this.interstitialLoaded = true;
    } catch {
      this.interstitialLoaded = false;
      setTimeout(() => this.prepareInterstitial(), 60_000);
    }
  }

  async prepareRewarded() {
    if (!this.ready) return;
    try {
      await AdMob.prepareRewardVideoAd({ adId: CONFIG.admob.rewardedId, isTesting: this.testing });
      this.rewardedLoaded = true;
    } catch {
      this.rewardedLoaded = false;
      setTimeout(() => this.prepareRewarded(), 60_000);
    }
  }

  waitForDismiss(timeoutMs) {
    return Promise.race([new Promise((resolve) => (this.onDismiss = resolve)), sleep(timeoutMs)]);
  }

  /** Shows an interstitial if enough levels and time have passed. Resolves when it closes. */
  async maybeInterstitial(levelsSinceAd) {
    if (!this.ready || this.removed || !this.interstitialLoaded) return false;
    if (levelsSinceAd < CONFIG.admob.interstitialEveryLevels) return false;
    if (Date.now() - this.lastInterstitial < CONFIG.admob.interstitialMinSeconds * 1000) return false;
    try {
      const closed = this.waitForDismiss(90_000);
      await AdMob.showInterstitial();
      await closed;
      this.lastInterstitial = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      this.interstitialLoaded = false;
      this.prepareInterstitial();
    }
  }

  get canReward() {
    return !this.native || this.ready;
  }

  /** Shows a rewarded ad. Resolves true only if the player earned the reward. */
  async showRewarded() {
    if (!this.native) {
      await sleep(600); // simulated on the web
      return true;
    }
    if (!this.ready) return false;
    for (let i = 0; i < 12 && !this.rewardedLoaded; i++) await sleep(500);
    if (!this.rewardedLoaded) return false;
    let rewarded = false;
    const listener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true));
    try {
      const closed = this.waitForDismiss(120_000);
      const item = await AdMob.showRewardVideoAd();
      if (item && item.amount > 0) rewarded = true;
      await closed;
    } catch {
      // Not shown.
    } finally {
      listener.remove();
      this.rewardedLoaded = false;
      this.prepareRewarded();
    }
    return rewarded;
  }

  async showBanner() {
    if (!this.ready || this.removed || !CONFIG.admob.menuBanner || this.bannerVisible) return;
    this.bannerVisible = true;
    try {
      if (this.bannerCreated) await AdMob.resumeBanner();
      else {
        await AdMob.showBanner({
          adId: CONFIG.admob.bannerId,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: this.testing,
        });
        this.bannerCreated = true;
      }
    } catch {
      this.bannerVisible = false;
    }
  }

  async hideBanner() {
    if (!this.bannerVisible) return;
    this.bannerVisible = false;
    this.onBannerHeight(0);
    try {
      await AdMob.hideBanner();
    } catch {
      // Ignore: the banner may not have loaded.
    }
  }

  /** Called after buying "Quitar anuncios". */
  async removeAll() {
    this.removed = true;
    this.bannerVisible = false;
    this.onBannerHeight(0);
    if (this.bannerCreated) {
      try {
        await AdMob.removeBanner();
      } catch {
        // Already gone.
      }
    }
  }

  async showPrivacyOptions() {
    if (!this.native) return false;
    try {
      await AdMob.showPrivacyOptionsForm();
      return true;
    } catch {
      return false;
    }
  }
}
