// World units are pixels of the 480x272 virtual screen (30x17 tiles of 16 px).
export const TILE = 16;
export const COLS = 30;
export const ROWS = 17;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;
export const DT = 1 / 60;

// Player physics (pixels / seconds).
export const PLAYER_W = 10;
export const PLAYER_H = 12;
export const RUN_SPEED = 120;
export const GROUND_ACCEL = 1300;
export const GROUND_FRICTION = 1700;
export const AIR_ACCEL = 1000;
export const GRAVITY = 1450;
export const MAX_FALL = 480;
export const JUMP_SPEED = 385;
export const JUMP_CUT = 150;
export const SPRING_SPEED = 560;
export const COYOTE_TIME = 0.08;
export const JUMP_BUFFER = 0.1;

// Tile codes in the static grid.
export const T = {
  EMPTY: 0,
  SOLID: 1,
  SPIKE_UP: 2,
  SPIKE_DOWN: 3,
  SPIKE_LEFT: 4,
  SPIKE_RIGHT: 5,
  INVISIBLE: 6, // solid only when hit from below; then becomes SOLID
  FAKE: 7, // looks solid, isn't
  SPRING: 8,
  SAW: 9,
};

export const SPIKE_DIRS = { up: T.SPIKE_UP, down: T.SPIKE_DOWN, left: T.SPIKE_LEFT, right: T.SPIKE_RIGHT };
