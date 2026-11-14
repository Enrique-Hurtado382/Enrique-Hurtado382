// Dibujos vectoriales: iconos de encuadre y portadas del catálogo.

const MOTO_LADO = `
  <circle cx="52" cy="88" r="22"/><circle cx="52" cy="88" r="8"/>
  <circle cx="150" cy="88" r="22"/><circle cx="150" cy="88" r="8"/>
  <path d="M18 56 L34 50 L66 54 L74 50 Q90 38 112 40 L128 38 L140 26 L150 30 L168 48 L172 56 L160 60 L148 62 L138 76 L110 80 L94 74 L76 70 L60 64 L40 62 Z"/>
  <path d="M146 58 L150 88"/><path d="M80 70 L52 88"/>
  <path d="M62 74 L92 80 L90 85 L60 79 Z"/>`;

const ICONOS = {
  moto: { vb: '0 0 200 120', d: MOTO_LADO },
  'moto-frente': {
    vb: '0 0 100 120',
    d: `<rect x="42" y="70" width="16" height="46" rx="7"/>
        <path d="M30 30 Q50 10 70 30 L74 62 Q50 72 26 62 Z"/>
        <path d="M38 30 Q50 18 62 30"/>
        <path d="M32 46 L44 50 M68 46 L56 50"/>
        <path d="M27 34 L14 30 M73 34 L86 30"/>
        <path d="M44 66 L44 76 M56 66 L56 76"/>`,
  },
  rueda: {
    vb: '0 0 100 100',
    d: `<circle cx="50" cy="50" r="42"/><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="7"/>
        <path d="M50 43 L50 20 M56 47 L78 40 M54 56 L68 74 M46 56 L32 74 M44 47 L22 40"/>`,
  },
  casco: {
    vb: '0 0 100 100',
    d: `<path d="M16 64 Q12 20 52 16 Q88 16 88 56 L88 72 Q60 82 20 76 Z"/>
        <path d="M40 40 Q62 32 86 44 L86 60 Q64 52 42 58 Z"/>`,
  },
  piloto: {
    vb: '0 0 100 110',
    d: `<circle cx="50" cy="18" r="12"/>
        <path d="M50 31 L50 70 M50 42 L30 60 M50 42 L70 60 M50 70 L36 104 M50 70 L64 104"/>`,
  },
  faro: {
    vb: '0 0 100 100',
    d: `<path d="M8 52 Q50 16 92 50 Q52 74 8 52 Z"/><path d="M22 52 Q50 32 80 48"/>
        <path d="M60 64 L66 76 M74 60 L84 70"/>`,
  },
  detalle: {
    vb: '0 0 100 100',
    d: `<circle cx="44" cy="44" r="26"/><path d="M63 63 L88 88"/><path d="M34 44 L54 44 M44 34 L44 54"/>`,
  },
  tablero: {
    vb: '0 0 100 100',
    d: `<rect x="12" y="24" width="76" height="48" rx="10"/><path d="M28 62 A22 22 0 0 1 72 62"/><path d="M50 62 L64 44"/>`,
  },
  pies: {
    vb: '0 0 100 100',
    d: `<path d="M26 14 L26 66 Q26 86 46 86 L48 86 L48 14"/><path d="M56 14 L56 66 Q56 86 76 86 L78 86 L78 14"/>`,
  },
};

/** Icono de línea (usa currentColor). */
export function icono(nombre, clase = '') {
  const i = ICONOS[nombre] || ICONOS.detalle;
  return `<svg class="${clase}" viewBox="${i.vb}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${i.d}</svg>`;
}

/** Portada de cada edit (320 x 200). */
export function portada(edit) {
  const { fondo, acento, motivo } = edit.arte;
  const id = edit.id.replace(/[^a-z0-9]/gi, '');
  let extra = '';
  let motoTransform = 'translate(60 70) scale(1)';
  let motoStroke = acento;
  let motoFill = '#06080c';

  if (motivo === 'noche') {
    extra = `
      <defs><linearGradient id="haz${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <radialGradient id="rojo${id}"><stop offset="0" stop-color="${acento}" stop-opacity=".9"/><stop offset="1" stop-color="${acento}" stop-opacity="0"/></radialGradient></defs>
      <rect x="250" y="20" width="4" height="120" fill="#3a4152"/><circle cx="252" cy="22" r="22" fill="#ffd9a0" opacity=".25"/><circle cx="252" cy="22" r="6" fill="#ffe6c0"/>
      <polygon points="228,118 330,90 330,170" fill="url(#haz${id})"/>
      <circle cx="80" cy="128" r="26" fill="url(#rojo${id})"/>`;
    motoStroke = '#d9dee8';
  } else if (motivo === 'sol') {
    extra = `
      <defs><radialGradient id="sol${id}"><stop offset="0" stop-color="#fff6d8"/><stop offset=".35" stop-color="${acento}" stop-opacity=".9"/><stop offset="1" stop-color="${acento}" stop-opacity="0"/></radialGradient></defs>
      <circle cx="230" cy="96" r="90" fill="url(#sol${id})"/>
      <rect x="0" y="160" width="320" height="40" fill="#1b0b04" opacity=".7"/>`;
    motoFill = '#140804';
    motoStroke = '#ffb35c';
  } else if (motivo === 'flash') {
    extra = `
      <g stroke="#fff" stroke-width="2" opacity=".85">
        <path d="M20 30 L60 30"/><path d="M260 40 L310 40"/><path d="M240 170 L300 170"/><path d="M10 160 L40 160"/>
      </g>
      <rect x="0" y="0" width="320" height="200" fill="#fff" opacity=".06"/>
      <path d="M150 0 L170 0 L140 200 L120 200 Z" fill="#fff" opacity=".07"/>`;
    motoStroke = '#ffffff';
  } else if (motivo === 'chasquido') {
    extra = `
      <g stroke="${acento}" stroke-width="4" stroke-linecap="round">
        <path d="M262 40 L282 22"/><path d="M270 56 L298 52"/><path d="M252 30 L254 8"/>
      </g>
      <circle cx="252" cy="58" r="14" fill="none" stroke="#fff" stroke-width="3"/>`;
    motoStroke = acento;
  } else if (motivo === 'giro') {
    extra = `
      <g fill="none" stroke="${acento}" stroke-width="5" stroke-linecap="round">
        <path d="M70 40 A100 70 0 0 1 270 60"/>
        <path d="M250 170 A100 70 0 0 1 50 150"/>
      </g>
      <path d="M268 44 L276 66 L254 64 Z" fill="${acento}"/>
      <path d="M52 166 L44 144 L66 146 Z" fill="${acento}"/>`;
    motoTransform = 'rotate(-12 160 120) translate(60 70)';
    motoStroke = '#e8eef4';
  } else if (motivo === 'encendido') {
    extra = `
      <defs><radialGradient id="luz${id}"><stop offset="0" stop-color="${acento}" stop-opacity=".95"/><stop offset="1" stop-color="${acento}" stop-opacity="0"/></radialGradient></defs>
      <circle cx="232" cy="122" r="60" fill="url(#luz${id})"/>
      <g fill="none" stroke="${acento}" stroke-width="3" opacity=".8"><path d="M40 60 A30 30 0 0 1 100 60"/><path d="M70 60 L88 40"/></g>`;
    motoStroke = '#f4e9ff';
  } else if (motivo === 'casco') {
    extra = `<g transform="translate(200 18) scale(1.05)" fill="#0b2232" stroke="${acento}" stroke-width="4"><path d="M16 64 Q12 20 52 16 Q88 16 88 56 L88 72 Q60 82 20 76 Z"/><path d="M40 40 Q62 32 86 44 L86 60 Q64 52 42 58 Z" fill="${acento}" opacity=".6"/></g>`;
    motoTransform = 'translate(20 92) scale(.8)';
    motoStroke = acento;
  } else if (motivo === 'pasada') {
    extra = `<g stroke="${acento}" stroke-width="3" stroke-linecap="round" opacity=".85">
      <path d="M10 92 L70 92"/><path d="M0 116 L60 116"/><path d="M20 140 L80 140"/><path d="M6 164 L50 164"/></g>`;
    motoTransform = 'translate(90 70) skewX(-8)';
    motoStroke = '#ffffff';
  }

  return `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${fondo[0]}"/><stop offset="1" stop-color="${fondo[1]}"/></linearGradient></defs>
    <rect width="320" height="200" fill="url(#bg${id})"/>
    ${extra}
    <g transform="${motoTransform}" fill="${motoFill}" stroke="${motoStroke}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${MOTO_LADO}</g>
  </svg>`;
}

/** Icono de la app (para generar los PNG de Android). */
export function iconoApp() {
  return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11141b"/><stop offset="1" stop-color="#2a1208"/></linearGradient></defs>
    <rect width="512" height="512" rx="112" fill="url(#g)"/>
    <circle cx="256" cy="256" r="168" fill="none" stroke="#ff5a1f" stroke-width="22"/>
    <circle cx="256" cy="256" r="120" fill="none" stroke="#ff5a1f" stroke-width="6" opacity=".5"/>
    <g transform="translate(116 186) scale(1.4)" fill="#0b0d12" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${MOTO_LADO}</g>
    <circle cx="398" cy="114" r="34" fill="#ff2d2d"/>
  </svg>`;
}
