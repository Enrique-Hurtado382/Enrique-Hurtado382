# Cielo Roto — Varita del Cielo (addon para Minecraft Bedrock)

Addon inspirado en el video "Minecraft was rewritten from scratch in Rust, so I broke the sky":
un puño gigante rompe el cielo como si fuera vidrio, un ojo enorme te mira por el agujero,
después baja un brazo que golpea el suelo, levanta un pedazo de terreno y el cielo se vuelve a sellar.
Todo se activa con la **Varita del Cielo**, que tiene su propia animación de carga.

## Instalación

1. Descargá `dist/CieloRoto.mcaddon` y abrilo (doble clic o "Abrir con Minecraft").
2. Creá un mundo (o editá uno) y activá los dos packs: **Cielo Roto [BP]** y **Cielo Roto [RP]**.
3. El addon usa la Script API estable (`@minecraft/server 2.0.0`), no necesita experimentos.
   Requiere Minecraft Bedrock 1.21.90 o superior.

## Cómo se usa

- Crafteo en mesa de trabajo:

  ```
  [    ] [amatista] [    ]
  [vidrio] [palo ] [vidrio]
  [    ] [ palo  ] [    ]
  ```
  o `/give @s sky:varita_del_cielo`.
- Mirá hacia donde querés que se rompa el cielo y **usá la varita** (clic derecho / tocar pantalla).
- La varita se carga durante 3 segundos (los anillos giran cada vez más rápido, los cristales se
  juntan y el jugador levanta el brazo al cielo), lanza un rayo y a los pocos segundos... mirá arriba.
- La secuencia dura unos 36 segundos y la varita tarda 45 segundos en recargarse.

## Qué pasa (línea de tiempo)

| Segundo | Evento |
| ------- | ------ |
| 1.0 | El cielo se agrieta con un crujido. |
| 2.4 | Un puño gigante atraviesa el cielo. Llueven fragmentos de vidrio que giran y se clavan en el suelo. |
| 5.6 | Un ojo enorme se asoma por el agujero, parpadea, mira a los costados y después **te sigue con la mirada**. |
| 23.4 | Una mano abierta baja desde el cielo hasta el suelo. |
| 26.0 | Golpe: nube de polvo, onda expansiva, temblor de cámara, cráter y grietas que se abren en el terreno. |
| 27.6 | La mano agarra un pedazo de tierra y se lo lleva. |
| 31.8 | Una luz brilla en el agujero y las grietas del cielo se curan. |

## Configuración

En `packs/CieloRoto_BP/scripts/main.js` (bloque `CONFIG`) podés cambiar:

- `destroyTerrain`: si el golpe deja cráter y grietas reales (solo rompe bloques naturales: tierra,
  piedra, arena, plantas, troncos... no toca construcciones).
- `craterRadius`, `crackCount`, `crackLength`: tamaño del daño.
- `forwardDistance`: a cuántos bloques delante del jugador se abre el cielo.
- `cooldownTicks`: recarga de la varita.
- `gazeSign`: poner `-1` si el ojo mira hacia el lado contrario del jugador.

## Cómo está hecho

Todo el contenido del addon se genera con `python3 tools/build.py` (necesita `numpy`, `Pillow` y `ffmpeg`):

- `tools/gen/geometry.py`: modelos. El ojo es una esfera facetada (49 caras) con párpados que giran
  alrededor del centro, la mano tiene 5 dedos articulados con sección octogonal y el antebrazo se
  estira hasta 80 bloques. El vidrio es un plano de 160×160 bloques sobre el jugador.
- `tools/gen/textures.py`: texturas procedurales (piel con venas, arrugas y uñas; esclerótica con
  venas e iris de fibras; telaraña de grietas; fragmentos; polvo; varita).
- `tools/gen/animations.py`: la secuencia completa con keyframes, la mirada por Molang
  (`sky:gaze_x/z` sincronizados desde el script) y las animaciones de la varita y del jugador.
- `tools/gen/particles.py` y `tools/gen/sounds.py`: 18 partículas y 12 sonidos sintetizados.
- `tools/src/main.js`: el script (eventos, cámara, sonidos, fragmentos, cráter y grietas).

## Créditos

Idea original del efecto: video de TikTok de @browngloss. Este addon lo recrea para Bedrock vanilla
usando entidades, partículas, Molang y la Script API.
