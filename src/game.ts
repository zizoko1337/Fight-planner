export const GRID_RADIUS = 15;
export const STONE_THROW_RANGE = 8;
export const TRAMPOLINE_JUMP_RANGE = 3;
export const SKELETON_ARCHER_RANGE = 5;
export const PLAN_LENGTH = 5;
export const PLAYER_DAMAGE = 100;
export const ENEMY_DAMAGE = 100;
export const MAX_LEVEL = 20;
export const ORC_MOVE_RANGE = 2;
export const ORC_ATTACK_RANGE = 1;
export const ORC_HP = 200;
export const TRAP_DAMAGE = 200;
export const MAGE_DAMAGE = 200;
export const GNOME_KING_HP = 300;
export const GNOME_KING_STONES_REQUIRED = 7;
export const GNOME_KING_MOVE_RANGE = 3;

export type ActionType =
  | 'move'
  | 'sword'
  | 'doubleSword'
  | 'wait'
  | 'pickup'
  | 'throw'
  | 'jump'
  | 'pogoJump'
  | 'trap';
export type EnemyKind = 'goblin' | 'skeletonArcher' | 'gnome' | 'gnomeKing' | 'orc' | 'mage';

export type EventType =
  | 'move'
  | 'jump'
  | 'sword'
  | 'doubleSword'
  | 'wait'
  | 'pickup'
  | 'throw'
  | 'pogoJump'
  | 'trap'
  | 'enemyMove'
  | 'enemyAttack'
  | 'enemyShoot'
  | 'enemyFireball'
  | 'enemyPickup'
  | 'enemyThrow'
  | 'trapTrigger';

export interface Coord {
  q: number;
  r: number;
}

export interface PlannedAction {
  id: string;
  type: ActionType;
  target?: Coord;
  targets?: Coord[];
  cardId?: string;
  devOverride?: boolean;
}

export interface PlayerState {
  pos: Coord;
  hp: number;
  stones: number;
  pogos: number;
  traps: number;
}

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  pos: Coord;
  hp: number;
  stones: number;
  isFleeing?: boolean;
}

export interface GameState {
  level: number;
  player: PlayerState;
  enemies: EnemyState[];
  stones: Coord[];
  trampolines: Coord[];
  pogos: Coord[];
  trapPickups: Coord[];
  placedTraps: Coord[];
}

export interface SimEvent {
  type: EventType;
  source?: Coord;
  target?: Coord;
  targets?: Coord[];
  enemyId?: string;
  hitEnemyId?: string;
  hitPlayer?: boolean;
  path?: Coord[];
}

export const directions: Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

interface Point {
  x: number;
  y: number;
}

const SQRT_3 = Math.sqrt(3);
const GEOMETRY_EPSILON = 1e-7;

interface LevelConfig {
  goblins: number;
  gnomes: number;
  skeletonArchers: number;
  orcs: number;
  mages: number;
  gnomeKings?: number;
}

export const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1: { goblins: 2, gnomes: 0, skeletonArchers: 0, orcs: 0, mages: 0 },
  2: { goblins: 4, gnomes: 0, skeletonArchers: 0, orcs: 0, mages: 0 },
  3: { goblins: 2, gnomes: 1, skeletonArchers: 0, orcs: 0, mages: 0 },
  4: { goblins: 3, gnomes: 2, skeletonArchers: 0, orcs: 0, mages: 0 },
  5: { goblins: 0, gnomes: 0, skeletonArchers: 1, orcs: 0, mages: 0 },
  6: { goblins: 2, gnomes: 0, skeletonArchers: 1, orcs: 0, mages: 0 },
  7: { goblins: 2, gnomes: 1, skeletonArchers: 1, orcs: 0, mages: 0 },
  8: { goblins: 3, gnomes: 2, skeletonArchers: 1, orcs: 0, mages: 0 },
  9: { goblins: 4, gnomes: 2, skeletonArchers: 2, orcs: 0, mages: 0 },
  10: { goblins: 0, gnomes: 0, skeletonArchers: 0, orcs: 1, mages: 0 },
  11: { goblins: 1, gnomes: 0, skeletonArchers: 0, orcs: 1, mages: 0 },
  12: { goblins: 0, gnomes: 1, skeletonArchers: 0, orcs: 1, mages: 0 },
  13: { goblins: 0, gnomes: 0, skeletonArchers: 1, orcs: 1, mages: 0 },
  14: { goblins: 0, gnomes: 0, skeletonArchers: 0, orcs: 2, mages: 0 },
  15: { goblins: 0, gnomes: 0, skeletonArchers: 0, orcs: 0, mages: 1 },
  16: { goblins: 2, gnomes: 0, skeletonArchers: 0, orcs: 0, mages: 1 },
  17: { goblins: 2, gnomes: 2, skeletonArchers: 0, orcs: 0, mages: 1 },
  18: { goblins: 1, gnomes: 1, skeletonArchers: 1, orcs: 0, mages: 1 },
  19: { goblins: 0, gnomes: 0, skeletonArchers: 0, orcs: 1, mages: 2 },
  20: { goblins: 0, gnomes: 0, skeletonArchers: 0, orcs: 0, mages: 0, gnomeKings: 1 },
};

export function coordKey(coord: Coord): string {
  return `${coord.q},${coord.r}`;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function isInBounds(coord: Coord): boolean {
  return hexDistance(coord, { q: 0, r: 0 }) <= GRID_RADIUS;
}

export function hexDistance(a: Coord, b: Coord): number {
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;

  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(as - bs)) / 2;
}

export function neighbors(coord: Coord): Coord[] {
  return directions
    .map((direction) => ({ q: coord.q + direction.q, r: coord.r + direction.r }))
    .filter(isInBounds);
}

export function getAllCells(): Coord[] {
  const cells: Coord[] = [];

  for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r += 1) {
    for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q += 1) {
      const cell = { q, r };

      if (isInBounds(cell)) {
        cells.push(cell);
      }
    }
  }

  return cells;
}

export function cloneGameState(state: GameState): GameState {
  return {
    level: state.level ?? 1,
    player: {
      pos: { ...state.player.pos },
      hp: state.player.hp,
      stones: state.player.stones,
      pogos: state.player.pogos ?? 0,
      traps: state.player.traps ?? 0,
    },
    enemies: state.enemies.map((enemy) => ({
      id: enemy.id,
      kind: enemy.kind ?? 'goblin',
      pos: { ...enemy.pos },
      hp: enemy.hp,
      stones: enemy.stones ?? 0,
      isFleeing: enemy.isFleeing,
    })),
    stones: state.stones.map((stone) => ({ ...stone })),
    trampolines: (state.trampolines ?? []).map((trampoline) => ({ ...trampoline })),
    pogos: (state.pogos ?? []).map((pogo) => ({ ...pogo })),
    trapPickups: (state.trapPickups ?? []).map((trapPickup) => ({ ...trapPickup })),
    placedTraps: (state.placedTraps ?? []).map((placedTrap) => ({ ...placedTrap })),
  };
}

export function hasStoneAt(stones: Coord[], coord: Coord): boolean {
  return stones.some((stone) => sameCoord(stone, coord));
}

export function hasTrampolineAt(trampolines: Coord[] = [], coord: Coord): boolean {
  return trampolines.some((trampoline) => sameCoord(trampoline, coord));
}

export function hasPogoAt(pogos: Coord[] = [], coord: Coord): boolean {
  return pogos.some((pogo) => sameCoord(pogo, coord));
}

export function hasTrapPickupAt(trapPickups: Coord[] = [], coord: Coord): boolean {
  return trapPickups.some((trapPickup) => sameCoord(trapPickup, coord));
}

export function hasPlacedTrapAt(placedTraps: Coord[] = [], coord: Coord): boolean {
  return placedTraps.some((placedTrap) => sameCoord(placedTrap, coord));
}

export function hasEnemyAt(enemies: EnemyState[], coord: Coord): boolean {
  return enemies.some((enemy) => enemy.hp > 0 && sameCoord(enemy.pos, coord));
}

export function getActionLabel(action: PlannedAction): string {
  switch (action.type) {
    case 'move':
      return 'Ruch';
    case 'sword':
      return 'Miecz';
    case 'doubleSword':
      return 'Dwa miecze';
    case 'wait':
      return 'Czekaj';
    case 'pickup':
      return 'Podnieś';
    case 'throw':
      return 'Kamień';
    case 'jump':
      return 'Skok';
    case 'pogoJump':
      return 'Pogo';
    case 'trap':
      return 'Trap';
  }
}

export function getAvailableActionTypes(state: GameState): ActionType[] {
  const actions: ActionType[] = ['move', 'sword', 'doubleSword', 'wait'];

  if (
    hasStoneAt(state.stones, state.player.pos) ||
    hasPogoAt(state.pogos, state.player.pos) ||
    hasTrapPickupAt(state.trapPickups, state.player.pos)
  ) {
    actions.push('pickup');
  }

  if (hasTrampolineAt(state.trampolines, state.player.pos)) {
    actions.push('jump');
  }

  if (state.player.stones > 0) {
    actions.push('throw');
  }

  if ((state.player.pogos ?? 0) > 0) {
    actions.push('pogoJump');
  }

  if ((state.player.traps ?? 0) > 0) {
    actions.push('trap');
  }

  return actions;
}

function canPlaceTrapAt(state: GameState, target: Coord): boolean {
  return (
    !hasEnemyAt(state.enemies, target) &&
    !hasStoneAt(state.stones, target) &&
    !hasTrampolineAt(state.trampolines, target) &&
    !hasPogoAt(state.pogos, target) &&
    !hasTrapPickupAt(state.trapPickups, target) &&
    !hasPlacedTrapAt(state.placedTraps, target)
  );
}

interface TargetValidationOptions {
  ignoreEnemyCollision?: boolean;
}

function shouldIgnoreEnemyCollision(actionType: ActionType, options: TargetValidationOptions): boolean {
  return (
    options.ignoreEnemyCollision === true &&
    (actionType === 'move' || actionType === 'jump' || actionType === 'pogoJump')
  );
}

function isLegalTargetInternal(
  state: GameState,
  actionType: ActionType,
  target: Coord,
  options: TargetValidationOptions = {},
): boolean {
  if (!isInBounds(target)) {
    return false;
  }

  const blocksMovement = !shouldIgnoreEnemyCollision(actionType, options) && hasEnemyAt(state.enemies, target);

  if (actionType === 'move') {
    return hexDistance(state.player.pos, target) === 1 && !blocksMovement;
  }

  if (actionType === 'jump') {
    return (
      hasTrampolineAt(state.trampolines, state.player.pos) &&
      hexDistance(state.player.pos, target) === TRAMPOLINE_JUMP_RANGE &&
      !blocksMovement
    );
  }

  if (actionType === 'pogoJump') {
    return (
      (state.player.pogos ?? 0) > 0 &&
      hexDistance(state.player.pos, target) === TRAMPOLINE_JUMP_RANGE &&
      !blocksMovement
    );
  }

  if (actionType === 'sword' || actionType === 'doubleSword') {
    return hexDistance(state.player.pos, target) === 1;
  }

  if (actionType === 'throw') {
    return !sameCoord(state.player.pos, target) && hexDistance(state.player.pos, target) <= STONE_THROW_RANGE;
  }

  if (actionType === 'trap') {
    return (
      (state.player.traps ?? 0) > 0 &&
      hexDistance(state.player.pos, target) === 1 &&
      canPlaceTrapAt(state, target)
    );
  }

  if (actionType === 'wait') {
    return sameCoord(state.player.pos, target);
  }

  return false;
}

export function isLegalTarget(state: GameState, actionType: ActionType, target: Coord): boolean {
  return isLegalTargetInternal(state, actionType, target);
}

export function isLegalPlanningTarget(state: GameState, actionType: ActionType, target: Coord): boolean {
  return isLegalTargetInternal(state, actionType, target, { ignoreEnemyCollision: true });
}

function isLegalDevTargetInternal(
  state: GameState,
  actionType: ActionType,
  target: Coord,
  options: TargetValidationOptions = {},
): boolean {
  if (!isInBounds(target)) {
    return false;
  }

  const blocksMovement = !shouldIgnoreEnemyCollision(actionType, options) && hasEnemyAt(state.enemies, target);

  if (actionType === 'move') {
    return hexDistance(state.player.pos, target) === 1 && !blocksMovement;
  }

  if (actionType === 'jump' || actionType === 'pogoJump') {
    return hexDistance(state.player.pos, target) === TRAMPOLINE_JUMP_RANGE && !blocksMovement;
  }

  if (actionType === 'sword' || actionType === 'doubleSword') {
    return hexDistance(state.player.pos, target) === 1;
  }

  if (actionType === 'throw') {
    return !sameCoord(state.player.pos, target) && hexDistance(state.player.pos, target) <= STONE_THROW_RANGE;
  }

  if (actionType === 'trap') {
    return hexDistance(state.player.pos, target) === 1 && canPlaceTrapAt(state, target);
  }

  if (actionType === 'wait') {
    return sameCoord(state.player.pos, target);
  }

  return false;
}

export function isLegalDevTarget(state: GameState, actionType: ActionType, target: Coord): boolean {
  return isLegalDevTargetInternal(state, actionType, target);
}

export function isLegalDevPlanningTarget(
  state: GameState,
  actionType: ActionType,
  target: Coord,
): boolean {
  return isLegalDevTargetInternal(state, actionType, target, { ignoreEnemyCollision: true });
}

function triggerPlayerTrapAt(state: GameState, coord: Coord): boolean {
  if (!hasPlacedTrapAt(state.placedTraps, coord)) {
    return false;
  }

  state.placedTraps = state.placedTraps.filter((placedTrap) => !sameCoord(placedTrap, coord));
  state.player.hp = Math.max(0, state.player.hp - TRAP_DAMAGE);
  return true;
}

function triggerEnemyTrapAt(state: GameState, enemy: EnemyState, coord: Coord): SimEvent | null {
  if (!hasPlacedTrapAt(state.placedTraps, coord)) {
    return null;
  }

  state.placedTraps = state.placedTraps.filter((placedTrap) => !sameCoord(placedTrap, coord));
  enemy.hp -= TRAP_DAMAGE;

  return {
    type: 'trapTrigger',
    target: { ...coord },
    enemyId: enemy.id,
    hitEnemyId: enemy.id,
  };
}

export function applyPlayerAction(
  state: GameState,
  action: PlannedAction,
  options: TargetValidationOptions = {},
): { state: GameState; event: SimEvent } {
  const next = cloneGameState(state);
  const devOverride = action.devOverride === true;

  if (
    action.type === 'move' &&
    action.target &&
    isLegalTargetInternal(next, 'move', action.target, options)
  ) {
    const source = { ...next.player.pos };
    next.player.pos = { ...action.target };
    const hitTrap = triggerPlayerTrapAt(next, action.target);
    return {
      state: next,
      event: { type: 'move', source, target: { ...action.target }, hitPlayer: hitTrap },
    };
  }

  if (
    action.type === 'jump' &&
    action.target &&
    (isLegalTargetInternal(next, 'jump', action.target, options) ||
      (devOverride && isLegalDevTargetInternal(next, 'jump', action.target, options)))
  ) {
    const source = { ...next.player.pos };
    next.player.pos = { ...action.target };
    const hitTrap = triggerPlayerTrapAt(next, action.target);
    return {
      state: next,
      event: { type: 'jump', source, target: { ...action.target }, hitPlayer: hitTrap },
    };
  }

  if (
    action.type === 'pogoJump' &&
    action.target &&
    (isLegalTargetInternal(next, 'pogoJump', action.target, options) ||
      (devOverride && isLegalDevTargetInternal(next, 'pogoJump', action.target, options)))
  ) {
    const source = { ...next.player.pos };
    next.player.pogos = Math.max(0, next.player.pogos - 1);
    next.player.pos = { ...action.target };
    const hitTrap = triggerPlayerTrapAt(next, action.target);
    return {
      state: next,
      event: { type: 'pogoJump', source, target: { ...action.target }, hitPlayer: hitTrap },
    };
  }

  if (action.type === 'sword' && action.target && isLegalTarget(next, 'sword', action.target)) {
    next.enemies = next.enemies
      .map((enemy) =>
        sameCoord(enemy.pos, action.target!)
          ? { ...enemy, hp: enemy.hp - PLAYER_DAMAGE }
          : enemy,
      )
      .filter((enemy) => enemy.hp > 0);

    return {
      state: next,
      event: { type: 'sword', source: { ...next.player.pos }, target: { ...action.target } },
    };
  }

  if (
    action.type === 'doubleSword' &&
    action.targets?.length === 2 &&
    action.targets.every((target) => isLegalTarget(next, 'doubleSword', target)) &&
    !sameCoord(action.targets[0], action.targets[1])
  ) {
    const targets = action.targets.map((target) => ({ ...target }));
    next.enemies = next.enemies
      .map((enemy) =>
        targets.some((target) => sameCoord(enemy.pos, target))
          ? { ...enemy, hp: enemy.hp - PLAYER_DAMAGE }
          : enemy,
      )
      .filter((enemy) => enemy.hp > 0);

    return {
      state: next,
      event: {
        type: 'doubleSword',
        source: { ...next.player.pos },
        target: targets[0],
        targets,
      },
    };
  }

  if (
    action.type === 'throw' &&
    action.target &&
    ((next.player.stones > 0 && isLegalTarget(next, 'throw', action.target)) ||
      (devOverride && isLegalDevTarget(next, 'throw', action.target)))
  ) {
    next.player.stones = Math.max(0, next.player.stones - 1);
    next.enemies = next.enemies
      .map((enemy) =>
        sameCoord(enemy.pos, action.target!)
          ? { ...enemy, hp: enemy.hp - PLAYER_DAMAGE }
          : enemy,
      )
      .filter((enemy) => enemy.hp > 0);

    return {
      state: next,
      event: { type: 'throw', source: { ...next.player.pos }, target: { ...action.target } },
    };
  }

  if (
    action.type === 'trap' &&
    action.target &&
    (((next.player.traps ?? 0) > 0 && isLegalTarget(next, 'trap', action.target)) ||
      (devOverride && isLegalDevTarget(next, 'trap', action.target)))
  ) {
    if (!devOverride) {
      next.player.traps = Math.max(0, (next.player.traps ?? 0) - 1);
    }

    next.placedTraps.push({ ...action.target });

    return {
      state: next,
      event: { type: 'trap', source: { ...next.player.pos }, target: { ...action.target } },
    };
  }

  if (action.type === 'pickup' && hasStoneAt(next.stones, next.player.pos)) {
    const pickupPos = { ...next.player.pos };
    next.stones = next.stones.filter((stone) => !sameCoord(stone, pickupPos));
    next.player.stones += 1;

    return {
      state: next,
      event: { type: 'pickup', target: pickupPos },
    };
  }

  if (action.type === 'pickup' && hasPogoAt(next.pogos, next.player.pos)) {
    const pickupPos = { ...next.player.pos };
    next.pogos = next.pogos.filter((pogo) => !sameCoord(pogo, pickupPos));
    next.player.pogos += 1;

    return {
      state: next,
      event: { type: 'pickup', target: pickupPos },
    };
  }

  if (action.type === 'pickup' && hasTrapPickupAt(next.trapPickups, next.player.pos)) {
    const pickupPos = { ...next.player.pos };
    next.trapPickups = next.trapPickups.filter((trapPickup) => !sameCoord(trapPickup, pickupPos));
    next.player.traps = (next.player.traps ?? 0) + 1;

    return {
      state: next,
      event: { type: 'pickup', target: pickupPos },
    };
  }

  if (action.type === 'pickup' && devOverride) {
    return {
      state: next,
      event: { type: 'pickup', target: { ...next.player.pos } },
    };
  }

  if (action.type === 'wait' && action.target && isLegalTarget(next, 'wait', action.target)) {
    return {
      state: next,
      event: { type: 'wait', target: { ...next.player.pos } },
    };
  }

  return {
    state: next,
    event: { type: action.type === 'wait' ? 'wait' : 'wait', target: { ...next.player.pos } },
  };
}

export function applyEnemyTurn(
  state: GameState,
  playerTurnStart: Coord = state.player.pos,
): { state: GameState; events: SimEvent[] } {
  const next = cloneGameState(state);
  const events: SimEvent[] = [];
  const enemies = next.enemies.map((enemy) => ({ ...enemy, pos: { ...enemy.pos } }));
  const occupied = new Set(enemies.map((enemy) => coordKey(enemy.pos)));

  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.kind !== 'mage') {
      continue;
    }

    occupied.delete(coordKey(enemy.pos));

    const mageEvent = resolveMageTurn(next, enemies, enemy, playerTurnStart, occupied);

    if (mageEvent) {
      events.push(mageEvent);

      if (mageEvent.type === 'enemyMove') {
        const trapEvent = triggerEnemyTrapAt(next, enemy, enemy.pos);

        if (trapEvent) {
          events.push(trapEvent);
        }
      }
    }

    if (enemy.hp > 0) {
      occupied.add(coordKey(enemy.pos));
    }
  }

  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.kind === 'mage') {
      continue;
    }

    occupied.delete(coordKey(enemy.pos));

    if (enemy.kind === 'skeletonArcher') {
      const shootEvent = resolveSkeletonShot(next, enemies, enemy, playerTurnStart);

      if (shootEvent) {
        events.push(shootEvent);
        occupied.add(coordKey(enemy.pos));
        continue;
      }
    } else if (enemy.kind === 'gnomeKing') {
      const gnomeKingEvent = resolveGnomeKingTurn(next, enemies, enemy, playerTurnStart, occupied);

      if (gnomeKingEvent) {
        events.push(gnomeKingEvent);

        if (gnomeKingEvent.type === 'enemyMove') {
          const trapEvent = triggerEnemyTrapAt(next, enemy, enemy.pos);

          if (trapEvent) {
            events.push(trapEvent);
          }
        }
      }

      if (enemy.hp > 0) {
        occupied.add(coordKey(enemy.pos));
      }
      continue;
    } else if (enemy.kind === 'gnome') {
      const gnomeEvent = resolveGnomeTurn(next, enemies, enemy, playerTurnStart, occupied);

      if (gnomeEvent) {
        events.push(gnomeEvent);

        if (gnomeEvent.type === 'enemyMove') {
          const trapEvent = triggerEnemyTrapAt(next, enemy, enemy.pos);

          if (trapEvent) {
            events.push(trapEvent);
          }
        }
      }

      if (enemy.hp > 0) {
        occupied.add(coordKey(enemy.pos));
      }
      continue;
    } else if (enemy.kind === 'orc') {
      const orcEvents = resolveOrcTurn(next, enemy, occupied);

      if (orcEvents.length > 0) {
        events.push(...orcEvents);
      }

      if (enemy.hp > 0) {
        occupied.add(coordKey(enemy.pos));
      }
      continue;
    } else if (hexDistance(enemy.pos, next.player.pos) === 1) {
      next.player.hp = Math.max(0, next.player.hp - ENEMY_DAMAGE);
      events.push({
        type: 'enemyAttack',
        source: { ...enemy.pos },
        target: { ...next.player.pos },
        enemyId: enemy.id,
      });
      occupied.add(coordKey(enemy.pos));
      continue;
    }

    const moveTarget = chooseEnemyStep(enemy.pos, next.player.pos, occupied, next.trampolines, false);

    if (moveTarget) {
      events.push({
        type: 'enemyMove',
        source: { ...enemy.pos },
        target: { ...moveTarget },
        enemyId: enemy.id,
      });
      enemy.pos = { ...moveTarget };

      const trapEvent = triggerEnemyTrapAt(next, enemy, enemy.pos);

      if (trapEvent) {
        events.push(trapEvent);
      }
    }

    if (enemy.hp > 0) {
      occupied.add(coordKey(enemy.pos));
    }
  }

  next.enemies = enemies.filter((enemy) => enemy.hp > 0);

  return { state: next, events };
}

export function getPlanPreview(
  state: GameState,
  plan: PlannedAction[],
): { state: GameState; playerPath: Coord[] } {
  let working = cloneGameState(state);
  const playerPath: Coord[] = [{ ...working.player.pos }];

  for (const action of plan) {
    const playerResult = applyPlayerAction(working, action, { ignoreEnemyCollision: true });
    working = playerResult.state;
    playerPath.push({ ...working.player.pos });

    if (working.player.hp <= 0) {
      break;
    }
  }

  return { state: working, playerPath };
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }

  return Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level)));
}

function takeSpawnCells(
  cells: Coord[],
  blocked: Set<string>,
  count: number,
  predicate: (cell: Coord) => boolean,
): Coord[] {
  const spawns = shuffle(
    cells.filter((cell) => !blocked.has(coordKey(cell)) && predicate(cell)),
  ).slice(0, count);

  for (const spawn of spawns) {
    blocked.add(coordKey(spawn));
  }

  return spawns;
}

function takeAdjacentBoundarySpawns(
  cells: Coord[],
  blocked: Set<string>,
  count: number,
  center: Coord,
): Coord[] {
  if (count < 2) {
    return takeSpawnCells(
      cells,
      blocked,
      count,
      (cell) => hexDistance(cell, center) === GRID_RADIUS,
    );
  }

  const boundaryCells = shuffle(
    cells.filter((cell) => !blocked.has(coordKey(cell)) && hexDistance(cell, center) === GRID_RADIUS),
  );

  for (const first of boundaryCells) {
    const second = shuffle(
      boundaryCells.filter((cell) => !sameCoord(cell, first) && hexDistance(first, cell) === 1),
    )[0];

    if (!second) {
      continue;
    }

    const spawns = [first, second];

    for (const spawn of spawns) {
      blocked.add(coordKey(spawn));
    }

    if (count > spawns.length) {
      spawns.push(
        ...takeSpawnCells(
          cells,
          blocked,
          count - spawns.length,
          (cell) => hexDistance(cell, center) === GRID_RADIUS,
        ),
      );
    }

    return spawns;
  }

  return takeSpawnCells(
    cells,
    blocked,
    count,
    (cell) => hexDistance(cell, center) === GRID_RADIUS,
  );
}

export function createInitialGameState(level = 1): GameState {
  const normalizedLevel = clampLevel(level);
  const levelConfig = LEVEL_CONFIGS[normalizedLevel] ?? LEVEL_CONFIGS[1];
  const mobilitySpawnCount = normalizedLevel >= 10 ? 6 : 2;
  const cells = getAllCells();
  const playerStart = { q: 0, r: 0 };
  const blocked = new Set([coordKey(playerStart)]);
  const goblinSpawns = takeSpawnCells(
    cells,
    blocked,
    levelConfig.goblins,
    (cell) => hexDistance(cell, playerStart) === 8,
  );
  const skeletonSpawns = takeSpawnCells(
    cells,
    blocked,
    levelConfig.skeletonArchers,
    (cell) => hexDistance(cell, playerStart) >= 8 && hexDistance(cell, playerStart) <= 10,
  );
  const gnomeSpawns = takeSpawnCells(
    cells,
    blocked,
    levelConfig.gnomes,
    (cell) => hexDistance(cell, playerStart) >= 6 && hexDistance(cell, playerStart) <= 9,
  );
  const orcSpawns =
    normalizedLevel === 14
      ? takeAdjacentBoundarySpawns(cells, blocked, levelConfig.orcs, playerStart)
      : takeSpawnCells(
          cells,
          blocked,
          levelConfig.orcs,
          (cell) => hexDistance(cell, playerStart) === GRID_RADIUS,
        );
  const mageSpawns = takeSpawnCells(
    cells,
    blocked,
    levelConfig.mages,
    (cell) => hexDistance(cell, playerStart) >= 8 && hexDistance(cell, playerStart) <= 10,
  );
  const gnomeKingSpawns = takeSpawnCells(
    cells,
    blocked,
    levelConfig.gnomeKings ?? 0,
    (cell) => hexDistance(cell, playerStart) >= 8 && hexDistance(cell, playerStart) <= 10,
  );
  const trampolines = shuffle(
    cells.filter(
      (cell) => !blocked.has(coordKey(cell)) && hexDistance(cell, playerStart) > 2,
    ),
  ).slice(0, mobilitySpawnCount);
  for (const trampoline of trampolines) {
    blocked.add(coordKey(trampoline));
  }
  const pogos = shuffle(
    cells.filter(
      (cell) => !blocked.has(coordKey(cell)) && hexDistance(cell, playerStart) > 2,
    ),
  ).slice(0, mobilitySpawnCount);
  for (const pogo of pogos) {
    blocked.add(coordKey(pogo));
  }
  const trapPickups =
    normalizedLevel === 14
      ? takeSpawnCells(
          cells,
          blocked,
          1,
          (cell) => hexDistance(cell, playerStart) === 1,
        )
      : normalizedLevel >= 15
        ? takeSpawnCells(
            cells,
            blocked,
            2,
            (cell) => hexDistance(cell, playerStart) > 2,
          )
        : [];
  const stones = shuffle(
    cells.filter(
      (cell) => !blocked.has(coordKey(cell)) && hexDistance(cell, playerStart) > 2,
    ),
  ).slice(0, normalizedLevel === 20 ? 72 : 36);

  return {
    level: normalizedLevel,
    player: {
      pos: playerStart,
      hp: 100,
      stones: 0,
      pogos: normalizedLevel === 14 ? 1 : 0,
      traps: 0,
    },
    enemies: [
      ...goblinSpawns.map((pos, index) => ({
        id: `goblin-${index + 1}`,
        kind: 'goblin' as const,
        pos,
        hp: 100,
        stones: 0,
      })),
      ...skeletonSpawns.map((pos, index) => ({
        id: `skeleton-${index + 1}`,
        kind: 'skeletonArcher' as const,
        pos,
        hp: 100,
        stones: 0,
      })),
      ...gnomeSpawns.map((pos, index) => ({
        id: `gnome-${index + 1}`,
        kind: 'gnome' as const,
        pos,
        hp: 100,
        stones: 0,
      })),
      ...orcSpawns.map((pos, index) => ({
        id: `orc-${index + 1}`,
        kind: 'orc' as const,
        pos,
        hp: ORC_HP,
        stones: 0,
      })),
      ...mageSpawns.map((pos, index) => ({
        id: `mage-${index + 1}`,
        kind: 'mage' as const,
        pos,
        hp: 100,
        stones: 0,
      })),
      ...gnomeKingSpawns.map((pos, index) => ({
        id: `gnome-king-${index + 1}`,
        kind: 'gnomeKing' as const,
        pos,
        hp: GNOME_KING_HP,
        stones: 0,
      })),
    ],
    stones,
    trampolines,
    pogos,
    trapPickups,
    placedTraps: [],
  };
}

function resolveSkeletonShot(
  state: GameState,
  enemies: EnemyState[],
  shooter: EnemyState,
  playerTurnStart: Coord,
): SimEvent | null {
  if (hexDistance(shooter.pos, playerTurnStart) > SKELETON_ARCHER_RANGE) {
    return null;
  }

  const path = getArrowPath(shooter.pos, playerTurnStart);

  if (path.length === 0) {
    return null;
  }

  const traversed: Coord[] = [];

  for (const coord of path) {
    traversed.push({ ...coord });

    if (sameCoord(state.player.pos, coord)) {
      state.player.hp = Math.max(0, state.player.hp - ENEMY_DAMAGE);
      return {
        type: 'enemyShoot',
        source: { ...shooter.pos },
        target: { ...coord },
        enemyId: shooter.id,
        hitPlayer: true,
        path: traversed,
      };
    }

    const hitEnemy = enemies.find(
      (enemy) => enemy.id !== shooter.id && enemy.hp > 0 && sameCoord(enemy.pos, coord),
    );

    if (hitEnemy) {
      hitEnemy.hp -= ENEMY_DAMAGE;
      return {
        type: 'enemyShoot',
        source: { ...shooter.pos },
        target: { ...coord },
        enemyId: shooter.id,
        hitEnemyId: hitEnemy.id,
        path: traversed,
      };
    }
  }

  return {
    type: 'enemyShoot',
    source: { ...shooter.pos },
    target: { ...path[path.length - 1] },
    enemyId: shooter.id,
    path: traversed,
  };
}

function resolveGnomeTurn(
  state: GameState,
  enemies: EnemyState[],
  gnome: EnemyState,
  playerTurnStart: Coord,
  occupied: Set<string>,
): SimEvent | null {
  if ((gnome.stones ?? 0) > 0) {
    if (hexDistance(gnome.pos, playerTurnStart) <= STONE_THROW_RANGE) {
      gnome.stones = Math.max(0, gnome.stones - 1);

      const target = { ...playerTurnStart };
      const hitEnemy = enemies.find(
        (enemy) => enemy.id !== gnome.id && enemy.hp > 0 && sameCoord(enemy.pos, target),
      );

      if (sameCoord(state.player.pos, target)) {
        state.player.hp = Math.max(0, state.player.hp - ENEMY_DAMAGE);
      } else if (hitEnemy) {
        hitEnemy.hp -= ENEMY_DAMAGE;
      }

      return {
        type: 'enemyThrow',
        source: { ...gnome.pos },
        target,
        enemyId: gnome.id,
        hitEnemyId: hitEnemy?.id,
        hitPlayer: sameCoord(state.player.pos, target),
      };
    }

    return moveEnemyToward(gnome, state.player.pos, occupied, state.trampolines, false);
  }

  if (hasStoneAt(state.stones, gnome.pos)) {
    const pickupPos = { ...gnome.pos };
    state.stones = state.stones.filter((stone) => !sameCoord(stone, pickupPos));
    gnome.stones += 1;

    return {
      type: 'enemyPickup',
      source: pickupPos,
      target: pickupPos,
      enemyId: gnome.id,
    };
  }

  const nearestStone = getNearestCoord(gnome.pos, state.stones);

  if (nearestStone) {
    return moveEnemyToward(gnome, nearestStone, occupied, state.trampolines, true);
  }

  return moveEnemyToward(gnome, state.player.pos, occupied, state.trampolines, false);
}

function resolveGnomeKingTurn(
  state: GameState,
  enemies: EnemyState[],
  gnomeKing: EnemyState,
  playerTurnStart: Coord,
  occupied: Set<string>,
): SimEvent | null {
  if (gnomeKing.isFleeing) {
    return moveEnemyAway(gnomeKing, state.player.pos, occupied, GNOME_KING_MOVE_RANGE);
  }

  const carriedStones = gnomeKing.stones ?? 0;
  const stonesDepleted = state.stones.length === 0;
  const shouldThrow =
    carriedStones >= GNOME_KING_STONES_REQUIRED || (stonesDepleted && carriedStones > 0);

  if (shouldThrow) {
    const allTargets = [playerTurnStart, ...neighbors(playerTurnStart)];
    const targets =
      carriedStones >= GNOME_KING_STONES_REQUIRED
        ? allTargets
        : shuffle(allTargets).slice(0, Math.min(carriedStones, allTargets.length));
    const hitPlayer = targets.some((target) => sameCoord(state.player.pos, target));

    if (hitPlayer) {
      state.player.hp = Math.max(0, state.player.hp - ENEMY_DAMAGE);
    }

    for (const enemy of enemies) {
      if (
        enemy.id !== gnomeKing.id &&
        enemy.hp > 0 &&
        targets.some((target) => sameCoord(enemy.pos, target))
      ) {
        enemy.hp -= ENEMY_DAMAGE;
      }
    }

    gnomeKing.stones = 0;
    gnomeKing.isFleeing = stonesDepleted;

    return {
      type: 'enemyThrow',
      source: { ...gnomeKing.pos },
      target: { ...playerTurnStart },
      targets: targets.map((target) => ({ ...target })),
      enemyId: gnomeKing.id,
      hitPlayer,
    };
  }

  if (stonesDepleted) {
    gnomeKing.isFleeing = true;
    return moveEnemyAway(gnomeKing, state.player.pos, occupied, GNOME_KING_MOVE_RANGE);
  }

  if (hasStoneAt(state.stones, gnomeKing.pos)) {
    const pickupPos = { ...gnomeKing.pos };
    state.stones = state.stones.filter((stone) => !sameCoord(stone, pickupPos));
    gnomeKing.stones += 1;

    return {
      type: 'enemyPickup',
      source: pickupPos,
      target: pickupPos,
      enemyId: gnomeKing.id,
    };
  }

  const nearestStone = getNearestCoord(gnomeKing.pos, state.stones);
  const moveTarget = chooseEnemyJumpInRange(
    gnomeKing.pos,
    nearestStone ?? state.player.pos,
    occupied,
    GNOME_KING_MOVE_RANGE,
    Boolean(nearestStone),
  );

  if (!moveTarget) {
    return null;
  }

  const source = { ...gnomeKing.pos };
  gnomeKing.pos = { ...moveTarget };

  return {
    type: 'enemyMove',
    source,
    target: { ...moveTarget },
    enemyId: gnomeKing.id,
  };
}

function resolveMageTurn(
  state: GameState,
  enemies: EnemyState[],
  mage: EnemyState,
  playerTurnStart: Coord,
  occupied: Set<string>,
): SimEvent | null {
  const fireballPath = getDirectionalFireballPath(mage.pos, playerTurnStart);

  if (fireballPath.length > 0) {
    const traversed: Coord[] = [];

    for (const coord of fireballPath) {
      traversed.push({ ...coord });

      if (sameCoord(state.player.pos, coord)) {
        state.player.hp = Math.max(0, state.player.hp - MAGE_DAMAGE);

        return {
          type: 'enemyFireball',
          source: { ...mage.pos },
          target: { ...coord },
          enemyId: mage.id,
          hitPlayer: true,
          path: traversed,
        };
      }

      const hitEnemy = enemies.find(
        (enemy) => enemy.id !== mage.id && enemy.hp > 0 && sameCoord(enemy.pos, coord),
      );

      if (hitEnemy) {
        hitEnemy.hp -= MAGE_DAMAGE;

        return {
          type: 'enemyFireball',
          source: { ...mage.pos },
          target: { ...coord },
          enemyId: mage.id,
          hitEnemyId: hitEnemy.id,
          path: traversed,
        };
      }
    }

    return {
      type: 'enemyFireball',
      source: { ...mage.pos },
      target: { ...fireballPath[fireballPath.length - 1] },
      enemyId: mage.id,
      path: traversed,
    };
  }

  const moveTarget = chooseMagePositioningStep(mage.pos, state.player.pos, occupied);

  if (!moveTarget) {
    return null;
  }

  const source = { ...mage.pos };
  mage.pos = { ...moveTarget };

  return {
    type: 'enemyMove',
    source,
    target: { ...moveTarget },
    enemyId: mage.id,
  };
}

function resolveOrcTurn(
  state: GameState,
  orc: EnemyState,
  occupied: Set<string>,
): SimEvent[] {
  const playerDistance = hexDistance(orc.pos, state.player.pos);

  if (playerDistance >= 1 && playerDistance <= ORC_ATTACK_RANGE) {
    state.player.hp = Math.max(0, state.player.hp - ENEMY_DAMAGE);

    return [
      {
        type: 'enemyAttack',
        source: { ...orc.pos },
        target: { ...state.player.pos },
        enemyId: orc.id,
      },
    ];
  }

  const movePath = chooseEnemyMovePathInRange(
    orc.pos,
    state.player.pos,
    occupied,
    ORC_MOVE_RANGE,
    false,
  );

  if (movePath.length === 0) {
    return [];
  }

  const events: SimEvent[] = [];
  let source = { ...orc.pos };

  for (const step of movePath) {
    events.push({
      type: 'enemyMove',
      source,
      target: { ...step },
      enemyId: orc.id,
    });
    orc.pos = { ...step };

    const trapEvent = triggerEnemyTrapAt(state, orc, step);

    if (trapEvent) {
      events.push(trapEvent);
    }

    if (orc.hp <= 0) {
      break;
    }

    source = { ...step };
  }

  return events;
}

function moveEnemyToward(
  enemy: EnemyState,
  target: Coord,
  occupied: Set<string>,
  trampolines: Coord[],
  allowTarget: boolean,
): SimEvent | null {
  const moveTarget = chooseEnemyStep(enemy.pos, target, occupied, trampolines, allowTarget);

  if (!moveTarget) {
    return null;
  }

  const source = { ...enemy.pos };
  enemy.pos = { ...moveTarget };

  return {
    type: 'enemyMove',
    source,
    target: { ...moveTarget },
    enemyId: enemy.id,
  };
}

function moveEnemyAway(
  enemy: EnemyState,
  threat: Coord,
  occupied: Set<string>,
  range: number,
): SimEvent | null {
  const moveTarget = chooseEnemyJumpAwayInRange(enemy.pos, threat, occupied, range);

  if (!moveTarget) {
    return null;
  }

  const source = { ...enemy.pos };
  enemy.pos = { ...moveTarget };

  return {
    type: 'enemyMove',
    source,
    target: { ...moveTarget },
    enemyId: enemy.id,
  };
}

function getNearestCoord(start: Coord, coords: Coord[]): Coord | null {
  return [...coords].sort((a, b) => hexDistance(start, a) - hexDistance(start, b))[0] ?? null;
}

export function getHexDirection(source: Coord, target: Coord): Coord | null {
  if (sameCoord(source, target)) {
    return null;
  }

  const dq = target.q - source.q;
  const dr = target.r - source.r;

  for (const direction of directions) {
    if (direction.q === 0) {
      if (dq === 0 && direction.r !== 0 && dr % direction.r === 0 && dr / direction.r > 0) {
        return direction;
      }

      continue;
    }

    if (direction.r === 0) {
      if (dr === 0 && dq % direction.q === 0 && dq / direction.q > 0) {
        return direction;
      }

      continue;
    }

    if (dq % direction.q === 0 && dr % direction.r === 0) {
      const qSteps = dq / direction.q;
      const rSteps = dr / direction.r;

      if (qSteps > 0 && qSteps === rSteps) {
        return direction;
      }
    }
  }

  return null;
}

export function getDirectionalFireballPath(source: Coord, target: Coord): Coord[] {
  const direction = getHexDirection(source, target);

  if (!direction) {
    return [];
  }

  const path: Coord[] = [];
  let current = { q: source.q + direction.q, r: source.r + direction.r };

  while (isInBounds(current)) {
    path.push({ ...current });
    current = { q: current.q + direction.q, r: current.r + direction.r };
  }

  return path;
}

export function getArrowPath(source: Coord, target: Coord): Coord[] {
  if (sameCoord(source, target)) {
    return [];
  }

  const from = axialToPoint(source);
  const to = axialToPoint(target);

  return getAllCells()
    .filter((cell) => !sameCoord(cell, source))
    .map((cell) => ({
      coord: cell,
      entry: getSegmentHexInteriorEntry(from, to, cell),
    }))
    .filter((item): item is { coord: Coord; entry: number } => item.entry !== null)
    .sort((a, b) => a.entry - b.entry)
    .map((item) => item.coord);
}

function chooseEnemyStep(
  start: Coord,
  target: Coord,
  occupied: Set<string>,
  trampolines: Coord[],
  allowTarget = false,
): Coord | null {
  const currentDistance = hexDistance(start, target);
  const stepOptions = neighbors(start)
    .filter((candidate) => allowTarget || !sameCoord(candidate, target))
    .filter((candidate) => !occupied.has(coordKey(candidate)))
    .map((candidate, index) => ({
      coord: candidate,
      index,
      distance: hexDistance(candidate, target),
    }))
    .filter((candidate) => candidate.distance < currentDistance);

  const jumpOptions = hasTrampolineAt(trampolines, start)
    ? getJumpTargets(start)
        .filter((candidate) => allowTarget || !sameCoord(candidate, target))
        .filter((candidate) => !occupied.has(coordKey(candidate)))
        .map((candidate, index) => ({
          coord: candidate,
          index: index + 100,
          distance: hexDistance(candidate, target),
        }))
        .filter((candidate) => candidate.distance < currentDistance)
    : [];

  const options = [...jumpOptions, ...stepOptions].sort(
    (a, b) => a.distance - b.distance || a.index - b.index,
  );

  return options[0]?.coord ?? null;
}

function chooseMagePositioningStep(
  start: Coord,
  target: Coord,
  occupied: Set<string>,
): Coord | null {
  const currentScore = getMageLineupScore(start, target);
  const currentDistance = hexDistance(start, target);
  const options = neighbors(start)
    .filter((candidate) => !sameCoord(candidate, target))
    .filter((candidate) => !occupied.has(coordKey(candidate)))
    .map((candidate, index) => ({
      coord: candidate,
      index,
      score: getMageLineupScore(candidate, target),
      distance: hexDistance(candidate, target),
    }))
    .filter(
      (candidate) =>
        candidate.score < currentScore ||
        (candidate.score === currentScore && candidate.distance > currentDistance),
    )
    .sort((a, b) => a.score - b.score || b.distance - a.distance || a.index - b.index);

  return options[0]?.coord ?? null;
}

function chooseEnemyJumpInRange(
  start: Coord,
  target: Coord,
  occupied: Set<string>,
  range: number,
  allowTarget = false,
): Coord | null {
  const options = getCellsAtRange(start, range)
    .filter((candidate) => allowTarget || !sameCoord(candidate, target))
    .filter((candidate) => !occupied.has(coordKey(candidate)))
    .map((candidate, index) => ({
      coord: candidate,
      index,
      distance: hexDistance(candidate, target),
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index);

  return options[0]?.coord ?? null;
}

function chooseEnemyJumpAwayInRange(
  start: Coord,
  threat: Coord,
  occupied: Set<string>,
  range: number,
): Coord | null {
  const currentDistance = hexDistance(start, threat);
  const options = getCellsAtRange(start, range)
    .filter((candidate) => !sameCoord(candidate, threat))
    .filter((candidate) => !occupied.has(coordKey(candidate)))
    .map((candidate, index) => ({
      coord: candidate,
      index,
      distance: hexDistance(candidate, threat),
    }))
    .filter((candidate) => candidate.distance > currentDistance)
    .sort((a, b) => b.distance - a.distance || a.index - b.index);

  return options[0]?.coord ?? null;
}

function getCellsAtRange(start: Coord, range: number): Coord[] {
  const cells: Coord[] = [];

  for (let dq = -range; dq <= range; dq += 1) {
    for (let dr = -range; dr <= range; dr += 1) {
      const candidate = { q: start.q + dq, r: start.r + dr };
      const distance = hexDistance(start, candidate);

      if (isInBounds(candidate) && distance >= 1 && distance <= range) {
        cells.push(candidate);
      }
    }
  }

  return cells;
}

function getMageLineupScore(source: Coord, target: Coord): number {
  if (getHexDirection(source, target)) {
    return 0;
  }

  const deltaQ = Math.abs(target.q - source.q);
  const deltaR = Math.abs(target.r - source.r);
  const deltaS = Math.abs(-target.q - target.r + source.q + source.r);

  return Math.min(deltaQ, deltaR, deltaS);
}

function chooseEnemyMovePathInRange(
  start: Coord,
  target: Coord,
  occupied: Set<string>,
  range: number,
  allowTarget = false,
): Coord[] {
  const currentDistance = hexDistance(start, target);
  const seen = new Set([coordKey(start)]);
  const queue: Array<{ coord: Coord; path: Coord[] }> = [{ coord: start, path: [] }];
  const options: Array<{ path: Coord[]; index: number; distance: number }> = [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    if (current.path.length >= range) {
      continue;
    }

    for (const candidate of neighbors(current.coord)) {
      const key = coordKey(candidate);

      if (seen.has(key) || occupied.has(key) || (!allowTarget && sameCoord(candidate, target))) {
        continue;
      }

      const path = [...current.path, candidate];
      const distance = hexDistance(candidate, target);
      seen.add(key);

      if (distance < currentDistance) {
        options.push({ path, index: options.length, distance });
      }

      queue.push({ coord: candidate, path });
    }
  }

  return [...(options.sort((a, b) => a.distance - b.distance || a.index - b.index)[0]?.path ?? [])];
}

function chooseEnemyMoveInRange(
  start: Coord,
  target: Coord,
  occupied: Set<string>,
  range: number,
  allowTarget = false,
): Coord | null {
  const currentDistance = hexDistance(start, target);
  const reachable = getReachableMoveTargets(start, target, occupied, range, allowTarget);
  const options = reachable
    .map((candidate, index) => ({
      coord: candidate,
      index,
      distance: hexDistance(candidate, target),
    }))
    .filter((candidate) => candidate.distance < currentDistance)
    .sort((a, b) => a.distance - b.distance || a.index - b.index);

  return options[0]?.coord ?? null;
}

export function getReachableMoveTargets(
  start: Coord,
  target: Coord,
  occupied: Set<string>,
  range: number,
  allowTarget = false,
): Coord[] {
  const results: Coord[] = [];
  const seen = new Set([coordKey(start)]);
  const queue: Array<{ coord: Coord; distance: number }> = [{ coord: start, distance: 0 }];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    if (current.distance >= range) {
      continue;
    }

    for (const candidate of neighbors(current.coord)) {
      const key = coordKey(candidate);

      if (seen.has(key) || occupied.has(key) || (!allowTarget && sameCoord(candidate, target))) {
        continue;
      }

      seen.add(key);
      results.push(candidate);
      queue.push({ coord: candidate, distance: current.distance + 1 });
    }
  }

  return results;
}

function getJumpTargets(start: Coord): Coord[] {
  const targets: Coord[] = [];

  for (let dq = -TRAMPOLINE_JUMP_RANGE; dq <= TRAMPOLINE_JUMP_RANGE; dq += 1) {
    for (let dr = -TRAMPOLINE_JUMP_RANGE; dr <= TRAMPOLINE_JUMP_RANGE; dr += 1) {
      const candidate = { q: start.q + dq, r: start.r + dr };

      if (isInBounds(candidate) && hexDistance(start, candidate) === TRAMPOLINE_JUMP_RANGE) {
        targets.push(candidate);
      }
    }
  }

  return targets;
}

function axialToPoint(coord: Coord): Point {
  return {
    x: SQRT_3 * (coord.q + coord.r / 2),
    y: 1.5 * coord.r,
  };
}

function getHexPolygon(coord: Coord): Point[] {
  const center = axialToPoint(coord);

  return Array.from({ length: 6 }).map((_, index) => {
    const angle = (Math.PI / 180) * (60 * index + 30);
    return {
      x: center.x + Math.cos(angle),
      y: center.y + Math.sin(angle),
    };
  });
}

function getSegmentHexInteriorEntry(from: Point, to: Point, coord: Coord): number | null {
  const polygon = getHexPolygon(coord);
  const intersections = [0, 1];

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    intersections.push(...getSegmentIntersectionParameters(from, to, a, b));
  }

  const sorted = uniqueSortedParameters(intersections);

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];

    if (end - start <= GEOMETRY_EPSILON) {
      continue;
    }

    const midpoint = (start + end) / 2;
    const point = {
      x: from.x + (to.x - from.x) * midpoint,
      y: from.y + (to.y - from.y) * midpoint,
    };

    if (isPointStrictlyInsidePolygon(point, polygon)) {
      return Math.max(0, start);
    }
  }

  return null;
}

function getSegmentIntersectionParameters(
  shotStart: Point,
  shotEnd: Point,
  edgeStart: Point,
  edgeEnd: Point,
): number[] {
  const ray = subtract(shotEnd, shotStart);
  const edge = subtract(edgeEnd, edgeStart);
  const offset = subtract(edgeStart, shotStart);
  const denominator = cross(ray, edge);

  if (Math.abs(denominator) <= GEOMETRY_EPSILON) {
    if (Math.abs(cross(offset, ray)) > GEOMETRY_EPSILON) {
      return [];
    }

    const lengthSquared = dot(ray, ray);

    if (lengthSquared <= GEOMETRY_EPSILON) {
      return [];
    }

    const t0 = dot(subtract(edgeStart, shotStart), ray) / lengthSquared;
    const t1 = dot(subtract(edgeEnd, shotStart), ray) / lengthSquared;
    const min = Math.max(0, Math.min(t0, t1));
    const max = Math.min(1, Math.max(t0, t1));

    return max >= min - GEOMETRY_EPSILON ? [min, max] : [];
  }

  const t = cross(offset, edge) / denominator;
  const u = cross(offset, ray) / denominator;

  if (
    t < -GEOMETRY_EPSILON ||
    t > 1 + GEOMETRY_EPSILON ||
    u < -GEOMETRY_EPSILON ||
    u > 1 + GEOMETRY_EPSILON
  ) {
    return [];
  }

  return [clampNumber(t, 0, 1)];
}

function uniqueSortedParameters(values: number[]): number[] {
  const sorted = values
    .map((value) => clampNumber(value, 0, 1))
    .sort((a, b) => a - b);
  const unique: number[] = [];

  for (const value of sorted) {
    if (unique.length === 0 || Math.abs(value - unique[unique.length - 1]) > GEOMETRY_EPSILON) {
      unique.push(value);
    }
  }

  return unique;
}

function isPointStrictlyInsidePolygon(point: Point, polygon: Point[]): boolean {
  let hasPositive = false;
  let hasNegative = false;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const value = cross(subtract(b, a), subtract(point, a));

    if (Math.abs(value) <= GEOMETRY_EPSILON) {
      return false;
    }

    hasPositive ||= value > 0;
    hasNegative ||= value < 0;

    if (hasPositive && hasNegative) {
      return false;
    }
  }

  return true;
}

function subtract(a: Point, b: Point): Point {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}
