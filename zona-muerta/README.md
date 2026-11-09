# Zona Muerta

Juego de supervivencia zombi en 3D para Android (uso personal). Controlas a la **Sargento Valeria "Vale" Ríos**, la última soldado de su patrulla, en un pueblo abandonado lleno de zombis. Busca recursos, fabrica lo que necesites y aguanta día tras día.

## Qué tiene

- **Protagonista original semi-realista**:
  - Uniforme militar ajustado (camiseta, pantalón de camuflaje, cinturón, guantes, botas).
  - Funda de pistola en el muslo.
  - Movimiento natural del pelo y del cuerpo al correr, girar y saltar.
- **Personalización** (menú *Personaje*): 4 uniformes, 2 peinados, 4 colores de pelo y 4 colores de ojos.
- **Mundo abierto pequeño**:
  - Pueblo con calles, casas, tienda, clínica, comisaría, almacén, taller y gasolinera.
  - Coches abandonados y un puesto militar donde empiezas.
- **Ciclo de día y noche** (10 minutos reales = 1 día). De noche hay más zombis y son más rápidos; Vale enciende su linterna.
- **Zombis**:
  - Hombres y mujeres, caminantes y "corredores" (más rápidos).
  - Te ven, oyen tus disparos, rodean obstáculos para perseguirte y atacan cuerpo a cuerpo.
- **Combate**: pistola con asistencia de puntería (tiros a la cabeza), recarga, cuchillo y voltereta para esquivar.
- **Supervivencia**:
  - Salud, hambre y energía.
  - Registra cajas, coches, contenedores, casas, la tienda, la clínica y el puesto militar. Los sitios se vuelven a llenar con el tiempo.
- **Fabricación**: vendas, botiquines, munición y mejoras del cuchillo.
- **Guardado automático** y ajustes de calidad gráfica, sensibilidad y volumen.

## Controles

| Móvil | Teclado y ratón |
| --- | --- |
| Pulgar izquierdo: moverse (joystick que aparece donde tocas) | W A S D |
| Arrastrar en la derecha: mirar | Doble clic para capturar el ratón |
| 🔫 Disparar | Clic izquierdo o J |
| 🔪 Cuchillo | F |
| ⤼ Voltereta | Espacio |
| ⟳ Recargar | R |
| » Correr (activar o desactivar) | Mayúsculas (mantener) |
| BUSCAR (aparece cerca de algo que registrar) | E |
| 🎒 Mochila (usar objetos y fabricar) | Tab o I |
| ❚❚ Pausa | Esc |

Si el móvil va lento, pon la calidad en **Baja** (Pausa → Ajustes).

## Probar y compilar

Necesitas [Node.js](https://nodejs.org/) 22 o superior.

```bash
cd zona-muerta
npm install
npm run dev            # jugar en el navegador: http://localhost:5174
npm run android        # compila y copia el juego al proyecto Android
npx cap open android   # abre Android Studio para instalarlo en tu móvil
```

O, desde la terminal, con el SDK de Android instalado: `cd android && ./gradlew assembleDebug` genera `app/build/outputs/apk/debug/app-debug.apk`.

## Recursos y licencias

- Personajes y animaciones: **Quaternius**, *Universal Base Characters* y *Universal Animation Library* (CC0, dominio público), de [quaternius.com](https://quaternius.com).
- Texturas de suelo y paredes: **Poly Haven** (CC0), de [polyhaven.com](https://polyhaven.com).
- Motor 3D: [three.js](https://threejs.org) (MIT). App Android: [Capacitor](https://capacitorjs.com) (MIT).
- Ropa, materiales de zombi, mundo, sonidos y efectos: generados por código en este proyecto.

Para regenerar los modelos optimizados desde los paquetes originales de Quaternius:

```bash
npm run assets -- "<carpeta Universal Base Characters[Standard]>" "<carpeta Universal Animation Library[Standard]>"
```

## Estructura

```
zona-muerta/
├── src/
│   ├── main.js       # pantallas, bucle de juego, combate, búsqueda, guardado
│   ├── heroine.js    # protagonista: ropa, pelo, equipo, movimiento natural, animaciones
│   ├── shaders.js    # uniforme pintado, movimiento del cuerpo y pelo, aspecto zombi
│   ├── zombies.js    # zombis: aspecto, animación e inteligencia
│   ├── world.js      # pueblo, colisiones, cielo y ciclo día/noche
│   ├── controls.js   # controles táctiles, teclado y cámara en tercera persona
│   ├── survival.js   # objetos, botín, fabricación y guardado
│   ├── audio.js      # sonidos generados por código
│   └── fx.js         # fogonazo, trazas, sangre y polvo
├── public/           # HTML, CSS, modelos (.glb) y texturas
├── scripts/          # compilación y conversión de modelos
└── android/          # proyecto Android (Capacitor)
```
