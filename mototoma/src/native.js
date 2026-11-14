// Puente con Android (plugin MotoNative) con alternativas para el navegador.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const MotoNative = registerPlugin('MotoNative');
export const esNativo = Capacitor.isNativePlatform();

let vozActiva = true;
export function activarVoz(on) {
  vozActiva = on;
  if (!on) callar();
}

export async function hablar(texto, { interrumpir = true } = {}) {
  if (!vozActiva || !texto) return;
  if (esNativo) {
    try {
      await MotoNative.speak({ text: texto, rate: 1.05, flush: interrumpir });
      return;
    } catch {
      /* sigue con la voz del navegador */
    }
  }
  try {
    if (!('speechSynthesis' in window)) return;
    if (interrumpir) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    /* sin voz */
  }
}

export async function callar() {
  if (esNativo) {
    try {
      await MotoNative.stopSpeaking();
    } catch {
      /* nada */
    }
  }
  try {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  } catch {
    /* nada */
  }
}

let vibracionActiva = true;
export function activarVibracion(on) {
  vibracionActiva = on;
}

export async function vibrar(tipo = 'corto') {
  if (!vibracionActiva) return;
  try {
    if (esNativo) {
      if (tipo === 'exito') await Haptics.notification({ type: NotificationType.Success });
      else if (tipo === 'aviso') await Haptics.notification({ type: NotificationType.Warning });
      else await Haptics.impact({ style: tipo === 'fuerte' ? ImpactStyle.Heavy : ImpactStyle.Light });
    } else if (navigator.vibrate) {
      navigator.vibrate(tipo === 'exito' ? [40, 60, 40] : tipo === 'aviso' ? [120] : [25]);
    }
  } catch {
    /* sin vibración */
  }
}

/** modo: 'vertical' | 'horizontal' | 'bloquear' | 'libre' */
export async function orientacion(modo) {
  if (esNativo) {
    try {
      await MotoNative.setOrientation({ mode: modo });
      return;
    } catch {
      /* nada */
    }
  }
  try {
    if (modo === 'libre') screen.orientation?.unlock?.();
    else if (modo === 'vertical') await screen.orientation?.lock?.('portrait');
    else if (modo === 'horizontal') await screen.orientation?.lock?.('landscape');
  } catch {
    /* el navegador solo bloquea en pantalla completa */
  }
}

export async function pantallaEncendida(on) {
  if (esNativo) {
    try {
      await MotoNative.keepAwake({ on });
    } catch {
      /* nada */
    }
    return;
  }
  try {
    if (on && 'wakeLock' in navigator) window.__wake = await navigator.wakeLock.request('screen');
    else if (!on && window.__wake) {
      await window.__wake.release();
      window.__wake = null;
    }
  } catch {
    /* nada */
  }
}

async function aBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

const TROZO = 768 * 1024;

/**
 * Guarda el vídeo en la galería (Android: Películas/MotoToma).
 * En el navegador lo descarga. Devuelve { ubicacion }.
 */
export async function guardarVideo(blob, nombre, mime, alProgreso = () => {}) {
  if (esNativo) {
    const { id } = await MotoNative.saveBegin({ name: nombre, mime });
    try {
      for (let pos = 0; pos < blob.size; pos += TROZO) {
        const data = await aBase64(blob.slice(pos, pos + TROZO));
        await MotoNative.saveAppend({ id, data });
        alProgreso(Math.min(1, (pos + TROZO) / blob.size));
      }
      const r = await MotoNative.saveFinish({ id });
      return { ubicacion: r.location || 'Galería → Películas → MotoToma' };
    } catch (e) {
      try {
        await MotoNative.saveAbort({ id });
      } catch {
        /* nada */
      }
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  alProgreso(1);
  return { ubicacion: 'Descargas' };
}

/** Abre la galería del móvil en la carpeta de MotoToma (si se puede). */
export async function abrirGaleria() {
  if (!esNativo) return false;
  try {
    await MotoNative.openGallery();
    return true;
  } catch {
    return false;
  }
}
