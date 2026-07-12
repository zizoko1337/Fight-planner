import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import './App.css';
import {
  ActionType,
  Coord,
  EnemyState,
  GNOME_KING_MOVE_RANGE,
  GNOME_KING_STONES_REQUIRED,
  GameState,
  MAX_LEVEL,
  ORC_ATTACK_RANGE,
  ORC_MOVE_RANGE,
  PLAN_LENGTH,
  PlannedAction,
  SKELETON_ARCHER_RANGE,
  SimEvent,
  STONE_THROW_RANGE,
  TRAP_DAMAGE,
  TRAMPOLINE_JUMP_RANGE,
  applyEnemyTurn,
  applyPlayerAction,
  cloneGameState,
  coordKey,
  createInitialGameState,
  getActionLabel,
  getAllCells,
  getAvailableActionTypes,
  getDirectionalFireballPath,
  getPlanPreview,
  getReachableMoveTargets,
  hasEnemyAt,
  hasTrampolineAt,
  hexDistance,
  isLegalDevPlanningTarget,
  isLegalPlanningTarget,
  neighbors,
  sameCoord,
} from './game';
import { RetroSound } from './sound';

const HEX_SIZE = 13;
const SQRT_3 = Math.sqrt(3);
const PLAYER_ACTION_MS = 500;
const TOKEN_ANIMATION_MS = PLAYER_ACTION_MS;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 4.5;
const MAX_HAND_SIZE = 10;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_BASELINE_Y = 15;
const ENEMY_SPRITE_SIZE = 31;
const ENEMY_SPRITE_BASELINE_Y = 7;
const MAGE_SPRITE_SIZE = ENEMY_SPRITE_SIZE * 1.2;
const CAVALRY_SPRITE_SIZE = ENEMY_SPRITE_SIZE * 2;
const CAVALRY_SPRITE_OFFSET = { x: -3, y: 15 };
const SWORD_CARD_IDS = ['sword-1', 'sword-2'];
const UNLOCKED_LEVEL_STORAGE_KEY = 'fight-planner-unlocked-level';
// DEV: set to false or remove the panel block to hide the all-cards test controls.
const DEV_ALL_CARDS_ENABLED = true;

type Mode = 'planning' | 'simulating';
type PlayerAnimation =
  | 'idle'
  | 'step'
  | 'sword'
  | 'doubleSword'
  | 'throw'
  | 'pickup'
  | 'damage'
  | 'jump'
  | 'pogo';
type EnemyAnimation = 'idle' | 'walk' | 'jump' | 'attack' | 'pickup' | 'throw';
type GridFeatureType = 'stone' | 'trampoline' | 'pogo' | 'trapPickup' | 'placedTrap';

const playerSprites: Record<PlayerAnimation, string> = {
  idle: '/sprites/playeridle.gif',
  step: '/sprites/step.gif',
  sword: '/sprites/swordswing.gif',
  doubleSword: '/sprites/doublesword.gif',
  throw: '/sprites/stonethrow.gif',
  pickup: '/sprites/pickup.gif',
  damage: '/sprites/takedamage.gif',
  jump: '/sprites/jump.gif',
  pogo: '/sprites/pogojump.gif',
};

const enemySprites: Partial<Record<EnemyState['kind'], Partial<Record<EnemyAnimation, string>>>> = {
  goblin: {
    idle: '/sprites/goblinidle.gif',
    walk: '/sprites/goblinwalk.gif',
    jump: '/sprites/goblinjump.gif',
    attack: '/sprites/goblinattack.gif',
  },
  gnome: {
    idle: '/sprites/gnomeidle.gif',
    walk: '/sprites/gnomewalk.gif',
    jump: '/sprites/gnomejump.gif',
    pickup: '/sprites/gnomepickup.gif',
    throw: '/sprites/gnomestonethrow.gif',
  },
  skeletonArcher: {
    idle: '/sprites/skeletonidle.gif',
    walk: '/sprites/skeletonwalk.gif',
    jump: '/sprites/skeletonjump.gif',
    attack: '/sprites/skeletonattack.gif',
  },
  orc: {
    idle: '/sprites/calvidle.gif',
    walk: '/sprites/calvwalk.gif',
    attack: '/sprites/calvattack.gif',
  },
  mage: {
    idle: '/sprites/wizzidle.gif',
    walk: '/sprites/wizzwalk.gif',
    attack: '/sprites/wizzattack.gif',
  },
};

const gridFeatureArt: Record<GridFeatureType, string | null> = {
  stone: null,
  trampoline: null,
  pogo: null,
  trapPickup: null,
  placedTrap: null,
};

const gridFeatureLabels: Record<GridFeatureType, string> = {
  stone: 'stone',
  trampoline: 'trampoline',
  pogo: 'pogo',
  trapPickup: 'trap kit',
  placedTrap: 'armed trap',
};

interface Point {
  x: number;
  y: number;
}

interface ProjectileMotion {
  point: Point;
  ground: Point;
  scale: number;
  shadowScale: number;
  shadowOpacity: number;
}

interface EnemyHintCell {
  attackKind?: 'melee' | 'ranged' | 'stone' | 'fire';
  coord: Coord;
  canMove: boolean;
}

interface Camera {
  center: Point;
  zoom: number;
}

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface BoardBounds extends ViewBox {
  maxX: number;
  maxY: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

interface VisualEffect {
  id: string;
  type: 'swordFlash' | 'impact' | 'enemyAttack' | 'arrowTrail' | 'fireball' | 'pickup' | 'wait';
  coord: Coord;
  source?: Coord;
}

interface ProjectileEffect {
  id: string;
  from: Coord;
  to: Coord;
  targets?: Coord[];
}

interface ArcMoveEffect {
  id: string;
  from: Coord;
  to: Coord;
  variant: 'player' | 'enemy';
  enemyId?: string;
  enemyKind?: EnemyState['kind'];
  sprite?: string;
}

type PlannedActionTraceType = Extract<ActionType, 'sword' | 'doubleSword' | 'throw' | 'trap'>;

interface PlannedActionMarker {
  id: string;
  coord: Coord;
  type: PlannedActionTraceType;
  step: number;
}

interface ActionCard {
  id: string;
  type: ActionType;
  label: string;
  needsTarget: boolean;
  image: string;
  badge?: 'refresh' | 'field' | 'consume';
  devOverride?: boolean;
}

function readUnlockedLevel(): number {
  let parsedLevel = 1;

  try {
    const storedLevel = window.localStorage.getItem(UNLOCKED_LEVEL_STORAGE_KEY);
    parsedLevel = storedLevel ? Number(storedLevel) : 1;
  } catch {
    parsedLevel = 1;
  }

  if (!Number.isFinite(parsedLevel)) {
    return 1;
  }

  return clamp(Math.trunc(parsedLevel), 1, MAX_LEVEL);
}

function writeUnlockedLevel(level: number) {
  try {
    window.localStorage.setItem(
      UNLOCKED_LEVEL_STORAGE_KEY,
      String(clamp(Math.trunc(level), 1, MAX_LEVEL)),
    );
  } catch {
    // Unlocks are a convenience; gameplay should continue without persistent storage.
  }
}

function getActionTargets(action: PlannedAction): Coord[] {
  if (action.targets?.length) {
    return action.targets;
  }

  return action.target ? [action.target] : [];
}

function getEnemySprite(
  enemyKind: EnemyState['kind'] | undefined,
  animation: EnemyAnimation = 'idle',
): string | undefined {
  const sprites = enemyKind ? enemySprites[enemyKind] : undefined;
  return sprites?.[animation] ?? sprites?.idle;
}

function getEnemySpriteLayout(enemyKind: EnemyState['kind'] | undefined) {
  if (enemyKind === 'orc') {
    return {
      size: CAVALRY_SPRITE_SIZE,
      x: -CAVALRY_SPRITE_SIZE / 2 + CAVALRY_SPRITE_OFFSET.x,
      y: ENEMY_SPRITE_BASELINE_Y - CAVALRY_SPRITE_SIZE + CAVALRY_SPRITE_OFFSET.y,
    };
  }

  if (enemyKind === 'mage') {
    return {
      size: MAGE_SPRITE_SIZE,
      x: -MAGE_SPRITE_SIZE / 2,
      y: ENEMY_SPRITE_BASELINE_Y - MAGE_SPRITE_SIZE,
    };
  }

  return {
    size: ENEMY_SPRITE_SIZE,
    x: -ENEMY_SPRITE_SIZE / 2,
    y: ENEMY_SPRITE_BASELINE_Y - ENEMY_SPRITE_SIZE,
  };
}

export function App() {
  const cells = useMemo(() => getAllCells(), []);
  const boardBounds = useMemo(() => getBoardBounds(cells), [cells]);
  const [game, setGame] = useState<GameState>(() => createInitialGameState());
  const [displayState, setDisplayState] = useState<GameState | null>(null);
  const [plan, setPlan] = useState<PlannedAction[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedActionDevOverride, setSelectedActionDevOverride] = useState(false);
  const [pendingDoubleSwordTarget, setPendingDoubleSwordTarget] = useState<Coord | null>(null);
  const [hoveredEnemyId, setHoveredEnemyId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('planning');
  const [camera, setCamera] = useState<Camera>(() => getInitialCamera(boardBounds));
  const [isDraggingBoard, setIsDraggingBoard] = useState(false);
  const [exitingCards, setExitingCards] = useState<ActionCard[]>([]);
  const [availableSwordCardIds, setAvailableSwordCardIds] = useState<string[]>(() =>
    dealSwordCardsForCycle(game),
  );
  const [playerAnimation, setPlayerAnimation] = useState<PlayerAnimation>('idle');
  const [enemyAnimations, setEnemyAnimations] = useState<Record<string, EnemyAnimation>>({});
  const [effects, setEffects] = useState<VisualEffect[]>([]);
  const [projectile, setProjectile] = useState<ProjectileEffect | null>(null);
  const [arcMove, setArcMove] = useState<ArcMoveEffect | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [status, setStatus] = useState('Zaplanuj 5 akcji');
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(() => readUnlockedLevel());
  const [isLevelSelectOpen, setIsLevelSelectOpen] = useState(false);
  const boardRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const previousHandRef = useRef<ActionCard[] | null>(null);
  const suppressCellClickRef = useRef(false);
  const effectCounter = useRef(0);
  const soundRef = useRef<RetroSound | null>(null);

  const preview = useMemo(() => getPlanPreview(game, plan), [game, plan]);
  const availableActions = useMemo(
    () => getAvailableActionTypes(preview.state),
    [preview.state],
  );
  const actionHand = useMemo(
    () => buildActionHand(preview.state, plan, availableSwordCardIds),
    [preview.state, plan, availableSwordCardIds],
  );
  const devActionCards = useMemo(
    () => (DEV_ALL_CARDS_ENABLED ? buildDevActionCards() : []),
    [],
  );
  const selectableCards = useMemo(
    () => [...actionHand, ...devActionCards],
    [actionHand, devActionCards],
  );
  const renderedCards = useMemo(
    () => [...actionHand, ...exitingCards],
    [actionHand, exitingCards],
  );
  const visibleState = displayState ?? game;
  const hudState = mode === 'planning' ? preview.state : visibleState;
  const stoneKeys = useMemo(
    () => new Set(visibleState.stones.map(coordKey)),
    [visibleState.stones],
  );
  const trampolineKeys = useMemo(
    () => new Set((visibleState.trampolines ?? []).map(coordKey)),
    [visibleState.trampolines],
  );
  const pogoKeys = useMemo(
    () => new Set((visibleState.pogos ?? []).map(coordKey)),
    [visibleState.pogos],
  );
  const trapPickupKeys = useMemo(
    () => new Set((visibleState.trapPickups ?? []).map(coordKey)),
    [visibleState.trapPickups],
  );
  const placedTrapKeys = useMemo(
    () => new Set((visibleState.placedTraps ?? []).map(coordKey)),
    [visibleState.placedTraps],
  );
  const plannedPathPoints = preview.playerPath.map(hexToPoint);
  const plannedActionMarkers = useMemo<PlannedActionMarker[]>(
    () =>
      plan.flatMap((action, index) => {
        if (!isTraceAction(action.type)) {
          return [];
        }

        const markerType = action.type;

        return getActionTargets(action).map((coord, targetIndex) => ({
          id: `${action.id}-${index}-${targetIndex}`,
          coord,
          type: markerType,
          step: index + 1,
        }));
      }),
    [plan],
  );
  const canShowEnemyHover = mode === 'planning' && selectedAction === null;
  const enemyHintCells = useMemo(() => {
    if (!canShowEnemyHover) {
      return [];
    }

    const hoveredEnemy = visibleState.enemies.find((enemy) => enemy.id === hoveredEnemyId);

    if (!hoveredEnemy) {
      return [];
    }

    return getEnemyHintCells(hoveredEnemy, visibleState, cells);
  }, [canShowEnemyHover, cells, hoveredEnemyId, visibleState]);
  const canPlan = mode === 'planning' && game.player.hp > 0;
  const isDefeat = game.player.hp <= 0;
  const cameraViewBox = useMemo(
    () => getCameraViewBox(camera, boardBounds),
    [boardBounds, camera],
  );

  useEffect(() => {
    if (!canShowEnemyHover) {
      setHoveredEnemyId(null);
    }
  }, [canShowEnemyHover]);

  useEffect(() => {
    const previousHand = previousHandRef.current;

    if (!previousHand) {
      previousHandRef.current = actionHand;
      return;
    }

    const currentIds = new Set(actionHand.map((card) => card.id));
    const removedCards = previousHand.filter((card) => !currentIds.has(card.id));

    if (removedCards.length > 0) {
      setExitingCards((current) => {
        const existingIds = new Set(current.map((card) => card.id));
        return [...current, ...removedCards.filter((card) => !existingIds.has(card.id))];
      });

      window.setTimeout(() => {
        setExitingCards((current) =>
          current.filter((card) => !removedCards.some((removed) => removed.id === card.id)),
        );
      }, 360);

      previousHandRef.current = actionHand;
      return;
    }

    previousHandRef.current = actionHand;
  }, [actionHand]);

  useEffect(() => {
    if (selectedCardId && !selectableCards.some((card) => card.id === selectedCardId)) {
      setSelectedAction(null);
      setSelectedCardId(null);
      setSelectedActionDevOverride(false);
      setPendingDoubleSwordTarget(null);
    }
  }, [selectableCards, selectedCardId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === ' ' || event.code === 'Space') {
        if (mode === 'planning' && plan.length === PLAN_LENGTH && game.player.hp > 0) {
          event.preventDefault();
          void runSimulation();
        }

        return;
      }

      const cardIndex = getShortcutCardIndex(event.key);

      if (cardIndex === null) {
        return;
      }

      const card = actionHand[cardIndex];

      if (!card) {
        return;
      }

      event.preventDefault();
      handleCardClick(card);
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionHand, selectedCardId, canPlan, plan.length, availableActions, mode, game.player.hp]);

  function addEffect(effect: Omit<VisualEffect, 'id'>, duration = 520) {
    effectCounter.current += 1;
    const id = `effect-${effectCounter.current}`;
    setEffects((current) => [...current, { ...effect, id }]);
    window.setTimeout(() => {
      setEffects((current) => current.filter((item) => item.id !== id));
    }, duration);
  }

  function getSound() {
    soundRef.current ??= new RetroSound();
    return soundRef.current;
  }

  function playPlayerAnimation(animation: PlayerAnimation, duration = PLAYER_ACTION_MS) {
    setPlayerAnimation(animation);
    window.setTimeout(() => {
      setPlayerAnimation('idle');
    }, duration);
  }

  function playEnemyAnimation(enemyId: string, animation: EnemyAnimation, duration = PLAYER_ACTION_MS) {
    setEnemyAnimations((current) => ({ ...current, [enemyId]: animation }));
    window.setTimeout(() => {
      setEnemyAnimations((current) => {
        if (current[enemyId] !== animation) {
          return current;
        }

        const next = { ...current };
        delete next[enemyId];
        return next;
      });
    }, duration);
  }

  function addPlannedAction(
    type: ActionType,
    target?: Coord,
    cardId?: string | null,
    devOverride = false,
    targets?: Coord[],
  ) {
    if (
      !canPlan ||
      plan.length >= PLAN_LENGTH ||
      (!devOverride && !availableActions.includes(type))
    ) {
      return;
    }

    if (target) {
      const isValidTarget = devOverride
        ? isLegalDevPlanningTarget(preview.state, type, target)
        : isLegalPlanningTarget(preview.state, type, target);

      if (!isValidTarget) {
        return;
      }
    }

    if (targets) {
      const isValidTargets = targets.every((targetCoord) =>
        devOverride
          ? isLegalDevPlanningTarget(preview.state, type, targetCoord)
          : isLegalPlanningTarget(preview.state, type, targetCoord),
      );

      if (!isValidTargets) {
        return;
      }
    }

    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setPlan((current) => [
      ...current,
      {
        id,
        type,
        target,
        targets: targets?.map((targetCoord) => ({ ...targetCoord })),
        cardId: cardId ?? undefined,
        devOverride: devOverride || undefined,
      },
    ]);
    setSelectedAction(null);
    setSelectedCardId(null);
    setSelectedActionDevOverride(false);
    setPendingDoubleSwordTarget(null);
    setStatus('Planowanie');
    getSound().playCard();
  }

  function handleCardClick(card: ActionCard) {
    const { devOverride = false, id, type, needsTarget } = card;

    if (
      !canPlan ||
      plan.length >= PLAN_LENGTH ||
      (!devOverride && !availableActions.includes(type))
    ) {
      return;
    }

    if (needsTarget) {
      getSound().playCard();
      const isAlreadySelected = selectedCardId === id;
      setSelectedAction(isAlreadySelected ? null : type);
      setSelectedCardId(isAlreadySelected ? null : id);
      setSelectedActionDevOverride(isAlreadySelected ? false : devOverride);
      setPendingDoubleSwordTarget(null);
      return;
    }

    addPlannedAction(type, undefined, id, devOverride);
  }

  function handleCellClick(coord: Coord) {
    if (suppressCellClickRef.current) {
      return;
    }

    if (!selectedAction || !canPlan) {
      return;
    }

    if (selectedAction === 'doubleSword') {
      const isValidTarget = selectedActionDevOverride
        ? isLegalDevPlanningTarget(preview.state, selectedAction, coord)
        : isLegalPlanningTarget(preview.state, selectedAction, coord);

      if (!isValidTarget) {
        return;
      }

      if (!pendingDoubleSwordTarget) {
        setPendingDoubleSwordTarget({ ...coord });
        getSound().playCard();
        setStatus('Wybierz drugi cel');
        return;
      }

      if (sameCoord(pendingDoubleSwordTarget, coord)) {
        return;
      }

      addPlannedAction(
        selectedAction,
        pendingDoubleSwordTarget,
        selectedCardId,
        selectedActionDevOverride,
        [pendingDoubleSwordTarget, coord],
      );
      return;
    }

    addPlannedAction(selectedAction, coord, selectedCardId, selectedActionDevOverride);
  }

  function loadLevel(level: number, statusText = 'Zaplanuj 5 akcji') {
    const nextGame = createInitialGameState(level);
    setGame(nextGame);
    setAvailableSwordCardIds(dealSwordCardsForCycle(nextGame));
    setDisplayState(null);
    setPlan([]);
    setSelectedAction(null);
    setSelectedCardId(null);
    setSelectedActionDevOverride(false);
    setPendingDoubleSwordTarget(null);
    setHoveredEnemyId(null);
    setMode('planning');
    setPlayerAnimation('idle');
    setEnemyAnimations({});
    setProjectile(null);
    setArcMove(null);
    setEffects([]);
    setActiveStep(null);
    setIsLevelSelectOpen(false);
    setStatus(statusText);
  }

  function unlockLevel(level: number) {
    const normalizedLevel = clamp(Math.trunc(level), 1, MAX_LEVEL);

    setMaxUnlockedLevel((current) => {
      const next = Math.max(current, normalizedLevel);
      writeUnlockedLevel(next);
      return next;
    });
  }

  function resetScenario(level = game.level) {
    getSound().playCard();
    loadLevel(level);
  }

  function chooseUnlockedLevel(level: number) {
    getSound().playCard();
    loadLevel(level);
  }

  function resetCamera() {
    getSound().playCard();
    setCamera(getInitialCamera(boardBounds));
  }

  function handleBoardPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }

    if (selectedAction !== null) {
      suppressCellClickRef.current = false;
      return;
    }

    boardRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    setIsDraggingBoard(true);
  }

  function handleBoardPointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const rect = boardRef.current?.getBoundingClientRect();

    if (!drag || drag.pointerId !== event.pointerId || !rect) {
      return;
    }

    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    const totalDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);

    if (totalDistance > 5) {
      drag.moved = true;
      suppressCellClickRef.current = true;
    }

    if (dx !== 0 || dy !== 0) {
      setCamera((current) => {
        const currentViewBox = getCameraViewBox(current, boardBounds);

        return clampCamera(
          {
            ...current,
            center: {
              x: current.center.x - dx * (currentViewBox.width / rect.width),
              y: current.center.y - dy * (currentViewBox.height / rect.height),
            },
          },
          boardBounds,
        );
      });
    }

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  }

  function endBoardDrag(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;

    if (drag?.pointerId === event.pointerId) {
      boardRef.current?.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      setIsDraggingBoard(false);

      if (drag.moved) {
        window.setTimeout(() => {
          suppressCellClickRef.current = false;
        }, 0);
      }
    }
  }

  function handleBoardWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();

    const rect = boardRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const ratioX = (event.clientX - rect.left) / rect.width;
    const ratioY = (event.clientY - rect.top) / rect.height;
    const zoomMultiplier = Math.exp(-event.deltaY * 0.0015);

    setCamera((current) => {
      const currentViewBox = getCameraViewBox(current, boardBounds);
      const worldPoint = {
        x: currentViewBox.minX + currentViewBox.width * ratioX,
        y: currentViewBox.minY + currentViewBox.height * ratioY,
      };
      const zoom = clamp(current.zoom * zoomMultiplier, MIN_ZOOM, MAX_ZOOM);
      const nextWidth = boardBounds.width / zoom;
      const nextHeight = boardBounds.height / zoom;
      const nextMinX = worldPoint.x - nextWidth * ratioX;
      const nextMinY = worldPoint.y - nextHeight * ratioY;

      return clampCamera(
        {
          zoom,
          center: {
            x: nextMinX + nextWidth / 2,
            y: nextMinY + nextHeight / 2,
          },
        },
        boardBounds,
      );
    });
  }

  async function runSimulation() {
    if (mode !== 'planning' || plan.length !== PLAN_LENGTH || game.player.hp <= 0) {
      return;
    }

    const planToRun = [...plan];
    const sound = getSound();
    let working = cloneGameState(game);
    sound.playSimulationStart();
    setMode('simulating');
    setSelectedAction(null);
    setSelectedCardId(null);
    setSelectedActionDevOverride(false);
    setPendingDoubleSwordTarget(null);
    setHoveredEnemyId(null);
    setDisplayState(working);
    setStatus('Symulacja');
    await sleep(120);

    for (let index = 0; index < planToRun.length; index += 1) {
      const action = planToRun[index];
      setActiveStep(index);
      setStatus(`Krok ${index + 1}/${PLAN_LENGTH}`);

      const playerTurnStart = { ...working.player.pos };
      const playerResult = applyPlayerAction(working, action);
      await animatePlayerAction(
        working,
        playerResult.state,
        playerResult.event,
        addEffect,
        setProjectile,
        setArcMove,
        setDisplayState,
        sound,
        playPlayerAnimation,
      );
      working = playerResult.state;

      if (working.player.hp <= 0) {
        break;
      }

      const enemyResult = applyEnemyTurn(working, playerTurnStart);
      const delayedEnemyAnimation = await animateEnemyEvents(
        enemyResult.events,
        working,
        addEffect,
        setProjectile,
        setArcMove,
        setDisplayState,
        sound,
        playPlayerAnimation,
        playEnemyAnimation,
      );
      setDisplayState(enemyResult.state);
      await sleep(delayedEnemyAnimation ? 120 : enemyResult.events.length > 0 ? 500 : 220);
      working = enemyResult.state;

      if (working.player.hp <= 0) {
        break;
      }
    }

    setDisplayState(null);
    setPlan([]);
    setProjectile(null);
    setArcMove(null);
    setActiveStep(null);
    setMode('planning');
    setPlayerAnimation('idle');
    setEnemyAnimations({});

    if (working.player.hp <= 0) {
      setGame(working);
      setAvailableSwordCardIds(dealSwordCardsForCycle(working));
      setStatus('Przegrana');
      return;
    }

    if (working.enemies.length === 0 && working.level < MAX_LEVEL) {
      unlockLevel(working.level + 1);
      loadLevel(working.level + 1, `Poziom ${working.level + 1}`);
      return;
    }

    if (working.enemies.length === 0) {
      unlockLevel(working.level);
    }

    setGame(working);
    setAvailableSwordCardIds(dealSwordCardsForCycle(working));

    setStatus(working.enemies.length === 0 ? 'Wszystkie poziomy wyczyszczone' : 'Plan wykonany');
  }

  return (
    <main className="game-shell">
      <section className="board-area">
        <div className="hud">
          <div className="hud-group">
            <span className="hud-label">Poziom</span>
            <strong>{hudState.level}</strong>
          </div>
          <div className="hud-group">
            <span className="hud-label">HP</span>
            <strong>{hudState.player.hp}</strong>
          </div>
          <div className="hud-group">
            <span className="hud-label">Kamienie</span>
            <strong>{hudState.player.stones}</strong>
          </div>
          <div className="hud-group">
            <span className="hud-label">Pogo</span>
            <strong>{hudState.player.pogos ?? 0}</strong>
          </div>
          <div className="hud-group">
            <span className="hud-label">Trapy</span>
            <strong>{hudState.player.traps ?? 0}</strong>
          </div>
          <div className="hud-group">
            <span className="hud-label">Wrogowie</span>
            <strong>{hudState.enemies.length}</strong>
          </div>
          <div className="hud-status">{status}</div>
          <button className="hud-button" type="button" onClick={resetCamera}>
            Widok
          </button>
          <button className="hud-button" type="button" onClick={() => resetScenario()}>
            Nowa mapa
          </button>
          <button className="hud-button" type="button" onClick={() => setIsLevelSelectOpen(true)}>
            Wybierz level
          </button>
        </div>

        <aside className="plan-rail" aria-label="Planowane akcje">
          {Array.from({ length: PLAN_LENGTH }).map((_, index) => {
            const action = plan[index];
            return (
              <div
                className={[
                  'plan-slot',
                  action ? 'is-filled' : '',
                  activeStep === index ? 'is-active' : '',
                ].join(' ')}
                key={index}
              >
                <span>{index + 1}</span>
                <strong>{action ? getActionLabel(action) : '-'}</strong>
              </div>
            );
          })}
        </aside>

        {DEV_ALL_CARDS_ENABLED ? (
          <aside className="dev-all-cards" aria-label="All cards">
            <div className="dev-all-cards-title">All cards</div>
            <div className="dev-level-picker">
              <span>Level</span>
              <div className="dev-level-grid">
                {Array.from({ length: MAX_LEVEL }).map((_, index) => {
                  const level = index + 1;

                  return (
                    <button
                      className={[
                        'dev-level-button',
                        game.level === level ? 'is-selected' : '',
                      ].join(' ')}
                      disabled={mode === 'simulating'}
                      key={level}
                      type="button"
                      onClick={() => resetScenario(level)}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="dev-card-grid">
              {devActionCards.map((card) => (
                <button
                  className={[
                    'dev-action-card',
                    selectedCardId === card.id ? 'is-selected' : '',
                  ].join(' ')}
                  disabled={!canPlan || plan.length >= PLAN_LENGTH}
                  key={card.id}
                  title={card.label}
                  type="button"
                  onClick={() => handleCardClick(card)}
                >
                  <img className="card-art" src={card.image} alt="" draggable={false} />
                  {card.badge ? <CardBadge type={card.badge} /> : null}
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        <svg
          ref={boardRef}
          className={`hex-board ${isDraggingBoard ? 'is-dragging' : ''}`}
          viewBox={`${cameraViewBox.minX} ${cameraViewBox.minY} ${cameraViewBox.width} ${cameraViewBox.height}`}
          role="img"
          aria-label="Plansza gry"
          onPointerDown={handleBoardPointerDown}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={endBoardDrag}
          onPointerCancel={endBoardDrag}
          onWheel={handleBoardWheel}
        >
          <g className="grid-layer">
            {cells.map((cell) => {
              const key = coordKey(cell);
              const isTarget =
                selectedAction !== null &&
                (selectedActionDevOverride
                  ? isLegalDevPlanningTarget(preview.state, selectedAction, cell)
                  : isLegalPlanningTarget(preview.state, selectedAction, cell)) &&
                !(
                  selectedAction === 'doubleSword' &&
                  pendingDoubleSwordTarget !== null &&
                  sameCoord(pendingDoubleSwordTarget, cell)
                );
              const isPlanned = preview.playerPath.some((pathCoord) => sameCoord(pathCoord, cell));
              const isPendingDoubleSword =
                pendingDoubleSwordTarget !== null && sameCoord(pendingDoubleSwordTarget, cell);
              const center = hexToPoint(cell);

              return (
                <polygon
                  key={key}
                  className={[
                    'hex-cell',
                    isTarget ? 'is-targetable' : '',
                    isPlanned ? 'is-planned' : '',
                    isPendingDoubleSword ? 'is-pending-double-sword' : '',
                    stoneKeys.has(key) ? 'has-stone' : '',
                    trampolineKeys.has(key) ? 'has-trampoline' : '',
                    pogoKeys.has(key) ? 'has-pogo' : '',
                    trapPickupKeys.has(key) ? 'has-trap-pickup' : '',
                    placedTrapKeys.has(key) ? 'has-placed-trap' : '',
                  ].join(' ')}
                  points={getHexPoints(center)}
                  onClick={() => handleCellClick(cell)}
                />
              );
            })}
          </g>

          {plannedPathPoints.length > 1 ? (
            <polyline
              className="planned-path-line"
              points={plannedPathPoints.map((point) => `${point.x},${point.y}`).join(' ')}
            />
          ) : null}

          <g className="feature-layer">
            {(visibleState.trampolines ?? []).map((trampoline) => (
              <GridFeature
                coord={trampoline}
                key={`trampoline-${coordKey(trampoline)}`}
                type="trampoline"
              />
            ))}
            {visibleState.stones.map((stone) => (
              <GridFeature coord={stone} key={`stone-${coordKey(stone)}`} type="stone" />
            ))}
            {(visibleState.pogos ?? []).map((pogo) => (
              <GridFeature coord={pogo} key={`pogo-${coordKey(pogo)}`} type="pogo" />
            ))}
            {(visibleState.trapPickups ?? []).map((trapPickup) => (
              <GridFeature
                coord={trapPickup}
                key={`trap-pickup-${coordKey(trapPickup)}`}
                type="trapPickup"
              />
            ))}
            {(visibleState.placedTraps ?? []).map((placedTrap) => (
              <GridFeature
                coord={placedTrap}
                key={`placed-trap-${coordKey(placedTrap)}`}
                type="placedTrap"
              />
            ))}
          </g>

          {enemyHintCells.length > 0 ? (
            <g className="enemy-hint-layer">
              {enemyHintCells.map((hint) => (
                <EnemyHint key={coordKey(hint.coord)} hint={hint} />
              ))}
            </g>
          ) : null}

          {mode === 'planning' && plan.length > 0 && !sameCoord(preview.state.player.pos, game.player.pos) ? (
            <g className="preview-layer">
              <GhostToken coord={preview.state.player.pos} variant="player" />
            </g>
          ) : null}

          {mode === 'planning' && plannedActionMarkers.length > 0 ? (
            <g className="planned-action-layer">
              {plannedActionMarkers.map((marker) => (
                <PlannedActionMarkerToken key={marker.id} marker={marker} />
              ))}
            </g>
          ) : null}

          <g className="unit-layer">
            {visibleState.enemies.map((enemy) => {
              if (arcMove?.variant === 'enemy' && arcMove.enemyId === enemy.id) {
                return null;
              }

              const isHovered = canShowEnemyHover && enemy.id === hoveredEnemyId;
              const enemyKind = enemy.kind ?? 'goblin';
              const enemyName = getEnemyName(enemy);

              return (
                <AnimatedToken
                  coord={enemy.pos}
                  enemyKind={enemyKind}
                  hoverEnabled={canShowEnemyHover}
                  hp={enemy.hp}
                  isHovered={isHovered}
                  key={enemy.id}
                  label={enemyName}
                  sprite={getEnemySprite(enemyKind, enemyAnimations[enemy.id] ?? 'idle')}
                  stones={enemy.stones}
                  variant="enemy"
                  onPointerEnter={() => {
                    if (canShowEnemyHover) {
                      setHoveredEnemyId(enemy.id);
                    }
                  }}
                  onPointerLeave={() => setHoveredEnemyId((current) => (current === enemy.id ? null : current))}
                />
              );
            })}
            {arcMove?.variant === 'player' ? null : (
              <AnimatedToken
                coord={visibleState.player.pos}
                variant="player"
                label="Gracz"
                sprite={playerSprites[playerAnimation]}
              />
            )}
          </g>

          {arcMove ? <ArcMoveToken move={arcMove} /> : null}

          <g className="effects-layer">
            {effects.map((effect) => (
              <Effect key={effect.id} effect={effect} />
            ))}
            {projectile ? <Projectile key={projectile.id} projectile={projectile} /> : null}
          </g>
        </svg>
      </section>

      <section className="planner-bar">
        <div className="card-row">
          {renderedCards.map((card, index) => {
            const isAvailable = availableActions.includes(card.type);
            const isExiting = exitingCards.some((exitingCard) => exitingCard.id === card.id);
            const activeIndex = actionHand.findIndex((handCard) => handCard.id === card.id);
            const shortcutLabel = getShortcutLabel(activeIndex);
            const style = getCardStyle(index, renderedCards.length);
            return (
              <button
                className={[
                  'action-card',
                  `action-card-${card.type}`,
                  selectedCardId === card.id ? 'is-selected' : '',
                  isExiting ? 'is-exiting' : '',
                ].join(' ')}
                disabled={isExiting || !canPlan || !isAvailable || plan.length >= PLAN_LENGTH}
                key={isExiting ? `exit-${card.id}` : card.id}
                aria-label={card.label}
                style={style}
                title={card.label}
                type="button"
                onClick={() => handleCardClick(card)}
              >
                <img className="card-art" src={card.image} alt="" draggable={false} />
                {card.badge ? <CardBadge type={card.badge} /> : null}
                {shortcutLabel ? <span className="card-shortcut">{shortcutLabel}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="planner-actions">
          <button
            className="run-button"
            type="button"
            onClick={runSimulation}
            disabled={mode !== 'planning' || plan.length !== PLAN_LENGTH || game.player.hp <= 0}
          >
            Symuluj
          </button>
        </div>
      </section>

      {isDefeat && !isLevelSelectOpen ? (
        <div className="defeat-modal-backdrop" role="presentation">
          <div
            aria-labelledby="defeat-modal-title"
            aria-modal="true"
            className="defeat-modal"
            role="dialog"
          >
            <h2 id="defeat-modal-title">You died!</h2>
            <button type="button" onClick={() => resetScenario()}>
              Restart level
            </button>
            <button type="button" onClick={() => setIsLevelSelectOpen(true)}>
              Choose level
            </button>
          </div>
        </div>
      ) : null}

      {isLevelSelectOpen ? (
        <div className="defeat-modal-backdrop" role="presentation">
          <div
            aria-labelledby="level-select-title"
            aria-modal="true"
            className="defeat-modal level-select-modal"
            role="dialog"
          >
            <h2 id="level-select-title">Choose level</h2>
            <div className="level-select-grid">
              {Array.from({ length: maxUnlockedLevel }).map((_, index) => {
                const level = index + 1;

                return (
                  <button
                    className={game.level === level ? 'is-current' : ''}
                    key={level}
                    type="button"
                    onClick={() => chooseUnlockedLevel(level)}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setIsLevelSelectOpen(false)}>
              Back
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function CardBadge({ type }: { type: NonNullable<ActionCard['badge']> }) {
  return (
    <span className={`card-badge card-badge-${type}`} aria-hidden="true">
      {type === 'refresh' ? (
        <svg viewBox="0 0 24 24">
          <path d="M7 8a7 7 0 0 1 11.2-2.1" />
          <path d="M18.4 2.8v4.6h-4.6" />
          <path d="M17 16a7 7 0 0 1-11.2 2.1" />
          <path d="M5.6 21.2v-4.6h4.6" />
        </svg>
      ) : null}
      {type === 'field' ? (
        <svg viewBox="0 0 24 24">
          <path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4L12 2.8Z" />
          <path d="M8.4 9.5h7.2" />
          <path d="M8.4 14.5h7.2" />
        </svg>
      ) : null}
      {type === 'consume' ? (
        <svg viewBox="0 0 24 24">
          <path d="M8 4h8" />
          <path d="M9 4v3.2" />
          <path d="M15 4v3.2" />
          <path d="M6.8 7.2h10.4l-.7 12H7.5l-.7-12Z" />
          <path d="m10 11 4 4" />
          <path d="m14 11-4 4" />
        </svg>
      ) : null}
    </span>
  );
}

function GridFeature({ coord, type }: { coord: Coord; type: GridFeatureType }) {
  const center = hexToPoint(coord);
  const art = gridFeatureArt[type];
  const labelParts = gridFeatureLabels[type].split(' ');
  const [imageFailed, setImageFailed] = useState(false);
  const shouldShowArt = Boolean(art) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [art]);

  return (
    <g
      className={`grid-feature grid-feature-${type}`}
      transform={`translate(${center.x} ${center.y})`}
    >
      {shouldShowArt ? (
        <image
          className="grid-feature-art"
          href={art ?? undefined}
          onError={() => setImageFailed(true)}
          preserveAspectRatio="xMidYMid meet"
          x="-10"
          y="-10"
          width="20"
          height="20"
        />
      ) : (
        <text className="grid-feature-label" dominantBaseline="middle" textAnchor="middle" x="0" y="0">
          {labelParts.map((part, index) => (
            <tspan
              key={`${type}-${part}`}
              x="0"
              dy={index === 0 ? `${(1 - labelParts.length) * 2}px` : '4px'}
            >
              {part}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

function isTraceAction(type: ActionType): type is PlannedActionTraceType {
  return type === 'sword' || type === 'doubleSword' || type === 'throw' || type === 'trap';
}

function PlannedActionMarkerToken({ marker }: { marker: PlannedActionMarker }) {
  const center = hexToPoint(marker.coord);

  return (
    <g
      className={`planned-action-marker planned-action-${marker.type}`}
      transform={`translate(${center.x} ${center.y})`}
    >
      <circle className="planned-action-ring" cx="0" cy="0" r="9.6" />
      <g className="planned-action-icon" transform="scale(1.05)">
        {marker.type === 'sword' || marker.type === 'doubleSword' ? <SwordIcon /> : null}
        {marker.type === 'throw' ? <StoneIcon /> : null}
        {marker.type === 'trap' ? <TrapIcon /> : null}
      </g>
      <g className="planned-action-step" transform="translate(7.2 -7.2)">
        <circle cx="0" cy="0" r="4.2" />
        <text dominantBaseline="middle" textAnchor="middle" x="0" y="0.25">
          {marker.step}
        </text>
      </g>
    </g>
  );
}

const cardImages: Record<ActionType, string> = {
  move: '/cards/step.jpg',
  sword: '/cards/swordswing.jpg',
  doubleSword: '/cards/doubleswordswing.jpg',
  wait: '/cards/wait.jpg',
  pickup: '/cards/pickup.jpg',
  throw: '/cards/stonethrow.jpg',
  jump: '/cards/trampolinejump.jpg',
  pogoJump: '/cards/pogojump.jpg',
  trap: '/cards/trap.jpg',
};

function buildActionHand(
  state: GameState,
  plan: PlannedAction[],
  availableSwordCardIds: string[],
): ActionCard[] {
  const availableActions = getAvailableActionTypes(state);
  const usedSwordCardIds = new Set(
    plan.flatMap((action) => {
      if (action.type === 'doubleSword') {
        return SWORD_CARD_IDS;
      }

      return action.type === 'sword' && action.cardId ? [action.cardId] : [];
    }),
  );
  const unusedSwordCardIds = availableSwordCardIds.filter((id) => !usedSwordCardIds.has(id));
  const cards: ActionCard[] = [
    { id: 'move', type: 'move', label: 'Ruch', needsTarget: true, image: cardImages.move },
    { id: 'wait', type: 'wait', label: 'Czekaj', needsTarget: true, image: cardImages.wait },
  ];

  for (const id of availableSwordCardIds) {
    if (cards.length >= MAX_HAND_SIZE || usedSwordCardIds.has(id)) {
      continue;
    }

    cards.push({
      id,
      type: 'sword',
      label: `Miecz ${id.endsWith('1') ? 1 : 2}`,
      needsTarget: true,
      image: cardImages.sword,
      badge: 'refresh',
    });
  }

  if (
    cards.length < MAX_HAND_SIZE &&
    unusedSwordCardIds.length === SWORD_CARD_IDS.length &&
    availableActions.includes('doubleSword')
  ) {
    cards.push({
      id: 'double-sword',
      type: 'doubleSword',
      label: 'Double Sword Swing',
      needsTarget: true,
      image: cardImages.doubleSword,
      badge: 'refresh',
    });
  }

  for (let index = 0; index < state.player.stones; index += 1) {
    if (cards.length >= MAX_HAND_SIZE) {
      break;
    }

    cards.push({
      id: `throw-${index + 1}`,
      type: 'throw',
      label: index === 0 ? 'Rzut kamieniem' : `Kamień ${index + 1}`,
      needsTarget: true,
      image: cardImages.throw,
      badge: 'consume',
    });
  }

  for (let index = 0; index < (state.player.pogos ?? 0); index += 1) {
    if (cards.length >= MAX_HAND_SIZE) {
      break;
    }

    cards.push({
      id: `pogo-${index + 1}`,
      type: 'pogoJump',
      label: index === 0 ? 'Pogo Jump' : `Pogo ${index + 1}`,
      needsTarget: true,
      image: cardImages.pogoJump,
      badge: 'consume',
    });
  }

  for (let index = 0; index < (state.player.traps ?? 0); index += 1) {
    if (cards.length >= MAX_HAND_SIZE) {
      break;
    }

    cards.push({
      id: `trap-${index + 1}`,
      type: 'trap',
      label: index === 0 ? 'Trap' : `Trap ${index + 1}`,
      needsTarget: true,
      image: cardImages.trap,
      badge: 'consume',
    });
  }

  if (availableActions.includes('pickup') && cards.length < MAX_HAND_SIZE) {
    cards.push({
      id: 'pickup',
      type: 'pickup',
      label: 'Podnieś',
      needsTarget: false,
      image: cardImages.pickup,
      badge: 'field',
    });
  }

  if (availableActions.includes('jump') && cards.length < MAX_HAND_SIZE) {
    cards.push({
      id: 'jump',
      type: 'jump',
      label: 'Trampoline Jump',
      needsTarget: true,
      image: cardImages.jump,
      badge: 'field',
    });
  }

  return cards;
}

function buildDevActionCards(): ActionCard[] {
  return [
    { id: 'dev-move', type: 'move', label: 'Ruch', needsTarget: true, image: cardImages.move, devOverride: true },
    { id: 'dev-wait', type: 'wait', label: 'Czekaj', needsTarget: true, image: cardImages.wait, devOverride: true },
    { id: 'dev-sword', type: 'sword', label: 'Miecz', needsTarget: true, image: cardImages.sword, devOverride: true },
    {
      id: 'dev-double-sword',
      type: 'doubleSword',
      label: 'Double Sword Swing',
      needsTarget: true,
      image: cardImages.doubleSword,
      badge: 'refresh',
      devOverride: true,
    },
    {
      id: 'dev-throw',
      type: 'throw',
      label: 'Rzut kamieniem',
      needsTarget: true,
      image: cardImages.throw,
      badge: 'consume',
      devOverride: true,
    },
    {
      id: 'dev-pickup',
      type: 'pickup',
      label: 'Podnieś',
      needsTarget: false,
      image: cardImages.pickup,
      badge: 'field',
      devOverride: true,
    },
    {
      id: 'dev-jump',
      type: 'jump',
      label: 'Trampoline Jump',
      needsTarget: true,
      image: cardImages.jump,
      badge: 'field',
      devOverride: true,
    },
    {
      id: 'dev-pogo',
      type: 'pogoJump',
      label: 'Pogo Jump',
      needsTarget: true,
      image: cardImages.pogoJump,
      badge: 'consume',
      devOverride: true,
    },
    {
      id: 'dev-trap',
      type: 'trap',
      label: 'Trap',
      needsTarget: true,
      image: cardImages.trap,
      badge: 'consume',
      devOverride: true,
    },
  ];
}

function dealSwordCardsForCycle(state: GameState): string[] {
  const itemCards = state.player.stones + (state.player.pogos ?? 0) + (state.player.traps ?? 0);
  const spaceAfterPersistentCards = MAX_HAND_SIZE - 2 - Math.min(itemCards, MAX_HAND_SIZE - 2);
  return SWORD_CARD_IDS.slice(0, Math.max(0, spaceAfterPersistentCards));
}

function getShortcutCardIndex(key: string): number | null {
  if (key === '0') {
    return 9;
  }

  const number = Number(key);

  if (!Number.isInteger(number) || number < 1 || number > 9) {
    return null;
  }

  return number - 1;
}

function getShortcutLabel(index: number): number | null {
  if (index < 0 || index >= MAX_HAND_SIZE) {
    return null;
  }

  return index === 9 ? 0 : index + 1;
}

function getCardStyle(index: number, count: number): CSSProperties {
  const center = (count - 1) / 2;
  const offset = index - center;
  const rotation = offset * 7;
  const hoverRotation = offset * 3.2;
  const lift = Math.abs(offset) * 8;
  const spread = offset * 7;

  return {
    '--card-rotation': `${rotation}deg`,
    '--card-hover-rotation': `${hoverRotation}deg`,
    '--card-lift': `${lift}px`,
    '--card-spread': `${spread}px`,
    '--card-delay': `${Math.max(0, index) * 38}ms`,
  } as CSSProperties;
}

function getEnemyName(enemy: EnemyState): string {
  const kind = enemy.kind ?? 'goblin';

  if (kind === 'skeletonArcher') {
    return 'Skeleton Archer';
  }

  if (kind === 'gnome') {
    return 'Gnome';
  }

  if (kind === 'gnomeKing') {
    return 'Gnome King';
  }

  if (kind === 'orc') {
    return 'Cavalry';
  }

  if (kind === 'mage') {
    return 'Mage';
  }

  return 'Goblin';
}

function getEnemyHintCells(enemy: EnemyState, state: GameState, cells: Coord[]): EnemyHintCell[] {
  const otherEnemies = state.enemies.filter((item) => item.id !== enemy.id);
  const occupied = new Set(otherEnemies.map((item) => coordKey(item.pos)));
  const kind = enemy.kind ?? 'goblin';
  const gnomeHasStone = kind === 'gnome' && (enemy.stones ?? 0) > 0;
  const gnomeKingCharged =
    kind === 'gnomeKing' && (enemy.stones ?? 0) >= GNOME_KING_STONES_REQUIRED;
  const attackTargets =
    kind === 'mage'
      ? cells.filter(
          (cell) =>
            !sameCoord(cell, enemy.pos) &&
            getDirectionalFireballPath(enemy.pos, cell).length > 0,
        )
      : kind === 'skeletonArcher' || gnomeHasStone
      ? cells.filter(
          (cell) =>
            !sameCoord(cell, enemy.pos) &&
            hexDistance(enemy.pos, cell) <=
              (kind === 'skeletonArcher' ? SKELETON_ARCHER_RANGE : STONE_THROW_RANGE),
        )
      : gnomeKingCharged
        ? [state.player.pos, ...neighbors(state.player.pos)]
      : kind === 'orc'
        ? cells.filter(
            (cell) =>
              !sameCoord(cell, enemy.pos) &&
              hexDistance(enemy.pos, cell) >= 1 &&
              hexDistance(enemy.pos, cell) <= ORC_ATTACK_RANGE,
          )
      : kind === 'gnome'
        ? []
        : neighbors(enemy.pos);
  const attackKind =
    kind === 'mage'
      ? 'fire'
      : kind === 'skeletonArcher'
      ? 'ranged'
      : gnomeHasStone || gnomeKingCharged
        ? 'stone'
        : kind === 'gnome' || kind === 'gnomeKing'
          ? undefined
          : 'melee';
  const moveTargets =
    kind === 'orc'
      ? getReachableMoveTargets(enemy.pos, state.player.pos, occupied, ORC_MOVE_RANGE, false)
      : kind === 'gnomeKing'
        ? cells.filter(
            (cell) =>
              !sameCoord(cell, enemy.pos) &&
              hexDistance(enemy.pos, cell) <= GNOME_KING_MOVE_RANGE &&
              !sameCoord(cell, state.player.pos) &&
              !hasEnemyAt(otherEnemies, cell),
          )
      : kind === 'mage'
        ? neighbors(enemy.pos).filter(
            (cell) => !sameCoord(cell, state.player.pos) && !hasEnemyAt(otherEnemies, cell),
          )
      : [
          ...neighbors(enemy.pos),
          ...(hasTrampolineAt(state.trampolines, enemy.pos)
            ? cells.filter((cell) => hexDistance(enemy.pos, cell) === TRAMPOLINE_JUMP_RANGE)
            : []),
        ].filter((cell) => !sameCoord(cell, state.player.pos) && !hasEnemyAt(otherEnemies, cell));
  const hints = new Map<string, EnemyHintCell>();

  for (const coord of attackTargets) {
    hints.set(coordKey(coord), { coord, attackKind, canMove: false });
  }

  for (const coord of moveTargets) {
    const key = coordKey(coord);
    const existing = hints.get(key);

    hints.set(key, {
      coord,
      attackKind: existing?.attackKind,
      canMove: true,
    });
  }

  return [...hints.values()];
}

function EnemyHint({ hint }: { hint: EnemyHintCell }) {
  const center = hexToPoint(hint.coord);
  const hasBoth = hint.canMove && Boolean(hint.attackKind);

  return (
    <g
      className={[
        'enemy-hint',
        hint.canMove ? 'can-move' : '',
        hint.attackKind ? 'can-attack' : '',
      ].join(' ')}
      transform={`translate(${center.x} ${center.y})`}
    >
      {hint.canMove ? (
        <g className="enemy-hint-icon enemy-hint-move" transform={`translate(${hasBoth ? -5.2 : 0} 0)`}>
          <circle cx="0" cy="0" r="5.4" />
          <BootIcon />
        </g>
      ) : null}
      {hint.attackKind ? (
        <g
          className={[
            'enemy-hint-icon',
            hint.attackKind === 'ranged'
              ? 'enemy-hint-ranged'
              : hint.attackKind === 'stone'
                ? 'enemy-hint-stone'
                : hint.attackKind === 'fire'
                  ? 'enemy-hint-fire'
                : 'enemy-hint-attack',
          ].join(' ')}
          transform={`translate(${hasBoth ? 5.2 : 0} 0)`}
        >
          <circle cx="0" cy="0" r="5.4" />
          {hint.attackKind === 'ranged' ? (
            <ArrowIcon />
          ) : hint.attackKind === 'stone' ? (
            <StoneIcon />
          ) : hint.attackKind === 'fire' ? (
            <FireIcon />
          ) : (
            <SwordIcon />
          )}
        </g>
      ) : null}
    </g>
  );
}

function BootIcon() {
  return (
    <path
      d="M-3.9-4.2h3.5v5.1h4.2c1.2 0 2.1.9 2.1 2v1.3h-9.8l-.8-2.8 1.2-.5-.4-5.1Z"
    />
  );
}

function SwordIcon() {
  return (
    <>
      <path d="M-4.2 4.5 4.9-4.6" />
      <path d="M3-6.1 6.5-6.5 6-3" />
      <path d="M-5.7 1.7-1.8 5.6" />
    </>
  );
}

function ArrowIcon() {
  return (
    <>
      <path d="M-5.2 2.8 4.6-3.1" />
      <path d="M1.2-4.5 5.5-3.6 4.1.6" />
      <path d="M-5.2 2.8-2 3.6" />
    </>
  );
}

function StoneIcon() {
  return (
    <>
      <circle cx="-1" cy="0.2" r="3.5" />
      <path d="M-3.2-.2-1.4-2.1 1.6-1.8 3.1.4 1.4 2.6-1.8 2.4Z" />
    </>
  );
}

function FireIcon() {
  return (
    <>
      <path d="M0 5.2c-2.6-1-4-2.7-4-4.8 0-2.3 1.8-3.4 2.6-5.3.8 1.6 2.7 2.3 2.1 4.5 1-.6 1.5-1.5 1.5-2.7C4.1-1.6 5 0 5 1.5c0 2-1.6 3.2-5 3.7Z" />
      <path d="M0 3.5c-1.1-.6-1.7-1.4-1.7-2.4 0-.9.6-1.5 1.1-2.4.7.8 1.5 1.5 1.5 2.7 0 .8-.3 1.5-.9 2.1Z" />
    </>
  );
}

function TrapIcon() {
  return (
    <>
      <path d="M-5.6 2.9h11.2" />
      <path d="M-4.7 2.8C-3.8-2.8-1.4-4.2 0-4.2s3.8 1.4 4.7 7" />
      <path d="M-3.7 2.5-2.7-.8l1.3 3.3" />
      <path d="M-.8 2.5 0-1.2.8 2.5" />
      <path d="M1.4 2.5 2.7-.8l1 3.3" />
    </>
  );
}

function AnimatedToken({
  coord,
  enemyKind,
  hoverEnabled = true,
  hp,
  isHovered = false,
  variant,
  label,
  onPointerEnter,
  onPointerLeave,
  sprite,
  stones,
}: {
  coord: Coord;
  enemyKind?: EnemyState['kind'];
  hoverEnabled?: boolean;
  hp?: number;
  isHovered?: boolean;
  variant: 'player' | 'enemy';
  label: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  sprite?: string;
  stones?: number;
}) {
  const target = hexToPoint(coord);
  const point = useAnimatedPoint(target, TOKEN_ANIMATION_MS);
  const isOrc = variant === 'enemy' && enemyKind === 'orc';
  const isGnomeKing = variant === 'enemy' && enemyKind === 'gnomeKing';
  const enemySpriteLayout = getEnemySpriteLayout(enemyKind);
  const gnomeKingCharge = isGnomeKing
    ? `${Math.min(stones ?? 0, GNOME_KING_STONES_REQUIRED)}/${GNOME_KING_STONES_REQUIRED}`
    : null;
  const hitboxRadius = isGnomeKing ? 18 : isOrc ? 17 : 14;
  const shadowRadius = isGnomeKing ? 11.2 : isOrc ? 10.4 : 8;
  const bodyRadius = isGnomeKing ? 10.5 : isOrc ? 9.8 : 7.5;
  const highlightRadius = isGnomeKing ? 2.8 : isOrc ? 2.6 : 2.1;
  const highlightOffset =
    isGnomeKing || isOrc ? { x: -3.1, y: -3.5 } : { x: -2.4, y: -2.8 };

  return (
    <g
      className={[
        'unit-token',
        variant,
        variant === 'enemy' ? `enemy-${enemyKind ?? 'goblin'}` : '',
        isHovered ? 'is-hovered' : '',
        variant === 'enemy' && !hoverEnabled ? 'is-hover-disabled' : '',
      ].join(' ')}
      transform={`translate(${point.x} ${point.y})`}
      aria-label={label}
      onPointerEnter={hoverEnabled ? onPointerEnter : undefined}
      onPointerLeave={hoverEnabled ? onPointerLeave : undefined}
    >
      {variant === 'player' ? (
        <>
          <image
            className="player-sprite"
            href={sprite ?? playerSprites.idle}
            x={-PLAYER_SPRITE_SIZE / 2}
            y={PLAYER_SPRITE_BASELINE_Y - PLAYER_SPRITE_SIZE}
            width={PLAYER_SPRITE_SIZE}
            height={PLAYER_SPRITE_SIZE}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      ) : (
        <>
          {sprite ? (
            <>
              {hoverEnabled ? <circle className="unit-hitbox" cx="0" cy="0" r={hitboxRadius} /> : null}
              <image
                className="enemy-sprite"
                href={sprite}
                x={enemySpriteLayout.x}
                y={enemySpriteLayout.y}
                width={enemySpriteLayout.size}
                height={enemySpriteLayout.size}
                preserveAspectRatio="xMidYMid meet"
              />
            </>
          ) : (
            <>
              {hoverEnabled ? <circle className="unit-hitbox" cx="0" cy="0" r={hitboxRadius} /> : null}
              <circle className="unit-shadow" cx="0" cy="3.5" r={shadowRadius} />
              <circle className="unit-body" cx="0" cy="0" r={bodyRadius} />
              <circle
                className="unit-highlight"
                cx={highlightOffset.x}
                cy={highlightOffset.y}
                r={highlightRadius}
              />
            </>
          )}
          {gnomeKingCharge ? (
            <g className="enemy-charge-label">
              <rect x="-12.5" y="9.2" width="25" height="10" rx="3" />
              <text x="0" y="16" textAnchor="middle">
                {gnomeKingCharge}
              </text>
            </g>
          ) : null}
          {isHovered ? (
            <g className="enemy-hp-label">
              <rect x="-25" y="-32" width="50" height="20" rx="4" />
              <text className="enemy-name-text" x="0" y="-23.5" textAnchor="middle">
                {label}
              </text>
              <text x="0" y="-16" textAnchor="middle">
                {hp ?? 0} HP
              </text>
            </g>
          ) : null}
        </>
      )}
    </g>
  );
}

function GhostToken({ coord, variant }: { coord: Coord; variant: 'player' | 'enemy' }) {
  const point = hexToPoint(coord);
  return (
    <g className={`ghost-token ${variant}`} transform={`translate(${point.x} ${point.y})`}>
      <circle cx="0" cy="0" r="9" />
    </g>
  );
}

function ArcMoveToken({ move }: { move: ArcMoveEffect }) {
  const from = hexToPoint(move.from);
  const to = hexToPoint(move.to);
  const motion = useProjectileMotion(from, to, PLAYER_ACTION_MS);
  const enemyClass = move.variant === 'enemy' ? `enemy-${move.enemyKind ?? 'goblin'}` : '';
  const enemySpriteLayout = getEnemySpriteLayout(move.enemyKind);

  return (
    <g className={`arc-move-token ${move.variant} ${enemyClass}`}>
      <ellipse
        className="arc-move-shadow"
        cx={motion.ground.x}
        cy={motion.ground.y + 6}
        rx={7.8 * motion.shadowScale}
        ry={3.2 * motion.shadowScale}
        opacity={motion.shadowOpacity}
      />
      <g transform={`translate(${motion.point.x} ${motion.point.y}) scale(${0.92 + (motion.scale - 0.86) * 0.5})`}>
        {move.variant === 'player' ? (
          <image
            className="player-sprite"
            href={move.sprite ?? playerSprites.jump}
            x={-PLAYER_SPRITE_SIZE / 2}
            y={PLAYER_SPRITE_BASELINE_Y - PLAYER_SPRITE_SIZE}
            width={PLAYER_SPRITE_SIZE}
            height={PLAYER_SPRITE_SIZE}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : move.sprite ? (
          <image
            className="enemy-sprite"
            href={move.sprite}
            x={enemySpriteLayout.x}
            y={enemySpriteLayout.y}
            width={enemySpriteLayout.size}
            height={enemySpriteLayout.size}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <>
            <circle className="unit-shadow" cx="0" cy="3.5" r="8" />
            <circle className="unit-body" cx="0" cy="0" r="8.2" />
            <circle className="unit-highlight" cx="-2.6" cy="-3" r="2.2" />
          </>
        )}
      </g>
    </g>
  );
}

function Effect({ effect }: { effect: VisualEffect }) {
  const target = hexToPoint(effect.coord);

  if (effect.type === 'enemyAttack') {
    return (
      <g className="sword-flash-effect damage-flash-effect">
        <polygon points={getHexPoints(target)} />
      </g>
    );
  }

  if (effect.type === 'arrowTrail' && effect.source) {
    const source = hexToPoint(effect.source);
    return (
      <g className="arrow-trajectory-effect">
        <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
      </g>
    );
  }

  if (effect.type === 'fireball' && effect.source) {
    const source = hexToPoint(effect.source);
    return (
      <g className="attack-effect fireball">
        <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
        <circle cx={target.x} cy={target.y} r="11" />
      </g>
    );
  }

  if (effect.type === 'swordFlash') {
    return (
      <g className="sword-flash-effect">
        <polygon points={getHexPoints(target)} />
      </g>
    );
  }

  return (
    <g className={`pulse-effect ${effect.type}`} transform={`translate(${target.x} ${target.y})`}>
      <circle cx="0" cy="0" r="8" />
    </g>
  );
}

function Projectile({ projectile }: { projectile: ProjectileEffect }) {
  const targets = projectile.targets?.length ? projectile.targets : [projectile.to];

  return (
    <g className="projectile-token">
      {targets.map((target, index) => (
        <ProjectileStone
          from={projectile.from}
          key={`${projectile.id}-${coordKey(target)}-${index}`}
          target={target}
        />
      ))}
    </g>
  );
}

function ProjectileStone({ from: fromCoord, target }: { from: Coord; target: Coord }) {
  const from = hexToPoint(fromCoord);
  const to = hexToPoint(target);
  const motion = useProjectileMotion(from, to, PLAYER_ACTION_MS);

  return (
    <>
      <ellipse
        className="projectile-shadow"
        cx={motion.ground.x}
        cy={motion.ground.y + 6}
        rx={4.8 * motion.shadowScale}
        ry={2.1 * motion.shadowScale}
        opacity={motion.shadowOpacity}
      />
      <g
        className="projectile-stone"
        transform={`translate(${motion.point.x} ${motion.point.y}) scale(${motion.scale})`}
      >
        <circle cx="0" cy="0" r="4.3" />
        <circle className="projectile-highlight" cx="-1.4" cy="-1.6" r="1.1" />
      </g>
    </>
  );
}

function useProjectileMotion(from: Point, to: Point, duration: number): ProjectileMotion {
  const [motion, setMotion] = useState<ProjectileMotion>(() =>
    getProjectileMotion(from, to, 0),
  );

  useEffect(() => {
    let frame = 0;
    const startTime = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      const nextMotion = getProjectileMotion(from, to, progress);
      setMotion(nextMotion);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    }

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [from.x, from.y, to.x, to.y, duration]);

  return motion;
}

function getProjectileMotion(from: Point, to: Point, progress: number): ProjectileMotion {
  const easedTravel = 1 - Math.pow(1 - progress, 2);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const arcHeight = clamp(distance * 0.28, 16, 42);
  const lift = Math.sin(progress * Math.PI);
  const ground = {
    x: from.x + (to.x - from.x) * easedTravel,
    y: from.y + (to.y - from.y) * easedTravel,
  };

  return {
    ground,
    point: {
      x: ground.x,
      y: ground.y - arcHeight * lift,
    },
    scale: 0.86 + lift * 0.44,
    shadowScale: 1 - lift * 0.34,
    shadowOpacity: 0.34 - lift * 0.18,
  };
}

function useAnimatedPoint(target: Point, duration: number, initial?: Point): Point {
  const [point, setPoint] = useState<Point>(() => initial ?? target);
  const pointRef = useRef(point);

  useEffect(() => {
    let frame = 0;
    const start = pointRef.current;
    const delta = {
      x: target.x - start.x,
      y: target.y - start.y,
    };
    const startTime = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextPoint = {
        x: start.x + delta.x * eased,
        y: start.y + delta.y * eased,
      };

      pointRef.current = nextPoint;
      setPoint(nextPoint);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    }

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [target.x, target.y, duration]);

  return point;
}

async function animateEnemyEvents(
  events: SimEvent[],
  before: GameState,
  addEffect: (effect: Omit<VisualEffect, 'id'>) => void,
  setProjectile: (projectile: ProjectileEffect | null) => void,
  setArcMove: (move: ArcMoveEffect | null) => void,
  setDisplayState: (state: GameState) => void,
  sound: RetroSound,
  playPlayerAnimation: (animation: PlayerAnimation, duration?: number) => void,
  playEnemyAnimation: (enemyId: string, animation: EnemyAnimation, duration?: number) => void,
): Promise<boolean> {
  let delayed = false;
  let animatedState = cloneGameState(before);

  for (const event of events) {
    if (event.type === 'enemyMove' && event.enemyId && event.target) {
      const movingEnemy = animatedState.enemies.find((enemy) => enemy.id === event.enemyId);

      if (movingEnemy) {
        const isJumpMove = event.source ? hexDistance(event.source, event.target) > 1 : false;
        playEnemyAnimation(movingEnemy.id, isJumpMove ? 'jump' : 'walk');

        if (isJumpMove && event.source) {
          setArcMove({
            id: `${Date.now()}-${Math.random()}`,
            from: event.source,
            to: event.target,
            variant: 'enemy',
            enemyId: movingEnemy.id,
            enemyKind: movingEnemy.kind,
            sprite: getEnemySprite(movingEnemy.kind, 'jump'),
          });
          delayed = true;
          await sleep(PLAYER_ACTION_MS);
        }

        movingEnemy.pos = { ...event.target };
        setDisplayState(cloneGameState(animatedState));
        if (isJumpMove) {
          setArcMove(null);
        }
        delayed = true;
        await sleep(isJumpMove ? 90 : 260);
      }
    }

    if (event.type === 'enemyAttack' && event.target) {
      sound.playEnemyAttack();
      if (event.enemyId) {
        playEnemyAnimation(event.enemyId, 'attack');
      }
      playPlayerAnimation('damage', 520);
      addEffect({ type: 'enemyAttack', coord: event.target, source: event.source });
    }

    if (event.type === 'enemyShoot' && event.target) {
      sound.playEnemyAttack();
      if (event.enemyId) {
        playEnemyAnimation(event.enemyId, 'attack');
      }

      if (event.hitPlayer) {
        playPlayerAnimation('damage', 520);
      }

      addEffect({ type: 'arrowTrail', coord: event.target, source: event.source });
      addEffect({ type: 'enemyAttack', coord: event.target, source: event.source });
    }

    if (event.type === 'enemyFireball' && event.target) {
      sound.playEnemyAttack();
      if (event.enemyId) {
        playEnemyAnimation(event.enemyId, 'attack');
      }

      if (event.hitPlayer) {
        playPlayerAnimation('damage', 560);
      }

      addEffect({ type: 'fireball', coord: event.target, source: event.source });
    }

    if (event.type === 'enemyPickup' && event.target) {
      sound.playPickup();
      if (event.enemyId) {
        playEnemyAnimation(event.enemyId, 'pickup');
      }
      addEffect({ type: 'pickup', coord: event.target });
    }

    if (event.type === 'enemyThrow' && event.source && event.target) {
      delayed = true;
      sound.playThrow();
      if (event.enemyId) {
        playEnemyAnimation(event.enemyId, 'throw');
      }
      setProjectile({
        id: `${Date.now()}-${Math.random()}`,
        from: event.source,
        to: event.target,
        targets: event.targets,
      });
      await sleep(PLAYER_ACTION_MS);
      setProjectile(null);
      sound.playImpact();

      for (const target of event.targets ?? [event.target]) {
        addEffect({ type: 'impact', coord: target });
      }

      if (event.hitPlayer) {
        playPlayerAnimation('damage', 520);
      }
    }

    if (event.type === 'trapTrigger' && event.target) {
      delayed = true;
      sound.playImpact();
      addEffect({ type: 'impact', coord: event.target });
      animatedState.placedTraps = (animatedState.placedTraps ?? []).filter(
        (placedTrap) => !sameCoord(placedTrap, event.target!),
      );

      if (event.hitEnemyId) {
        animatedState.enemies = animatedState.enemies
          .map((enemy) =>
            enemy.id === event.hitEnemyId ? { ...enemy, hp: enemy.hp - TRAP_DAMAGE } : enemy,
          )
          .filter((enemy) => enemy.hp > 0);
      }

      setDisplayState(cloneGameState(animatedState));
      await sleep(260);
    }
  }

  return delayed;
}

async function animatePlayerAction(
  before: GameState,
  after: GameState,
  event: SimEvent,
  addEffect: (effect: Omit<VisualEffect, 'id'>, duration?: number) => void,
  setProjectile: (projectile: ProjectileEffect | null) => void,
  setArcMove: (move: ArcMoveEffect | null) => void,
  setDisplayState: (state: GameState) => void,
  sound: RetroSound,
  playPlayerAnimation: (animation: PlayerAnimation, duration?: number) => void,
) {
  if (event.type === 'move') {
    sound.playMove();
    playPlayerAnimation('step');
    setDisplayState(after);
    if (event.hitPlayer && event.target) {
      sound.playImpact();
      playPlayerAnimation('damage', 420);
      addEffect({ type: 'impact', coord: event.target });
    }
    return;
  }

  if (event.type === 'jump') {
    sound.playMove();
    playPlayerAnimation('jump');
    setDisplayState(before);
    setArcMove({
      id: `${Date.now()}-${Math.random()}`,
      from: before.player.pos,
      to: event.target ?? after.player.pos,
      variant: 'player',
      sprite: playerSprites.jump,
    });
    await sleep(PLAYER_ACTION_MS);
    setDisplayState(after);
    setArcMove(null);
    if (event.hitPlayer && event.target) {
      sound.playImpact();
      playPlayerAnimation('damage', 420);
      addEffect({ type: 'impact', coord: event.target });
    }
    await sleep(PLAYER_ACTION_MS);
    return;
  }

  if (event.type === 'pogoJump') {
    sound.playMove();
    playPlayerAnimation('pogo');
    setDisplayState(before);
    setArcMove({
      id: `${Date.now()}-${Math.random()}`,
      from: before.player.pos,
      to: event.target ?? after.player.pos,
      variant: 'player',
      sprite: playerSprites.pogo,
    });
    await sleep(PLAYER_ACTION_MS);
    setDisplayState(after);
    setArcMove(null);
    if (event.hitPlayer && event.target) {
      sound.playImpact();
      playPlayerAnimation('damage', 420);
      addEffect({ type: 'impact', coord: event.target });
    }
    return;
  }

  if (event.type === 'sword' && event.target) {
    sound.playSword();
    playPlayerAnimation('sword');
    addEffect({ type: 'swordFlash', coord: event.target });
    await sleep(250);
    setDisplayState(after);
    await sleep(250);
    return;
  }

  if (event.type === 'doubleSword' && event.targets?.length) {
    sound.playSword();
    playPlayerAnimation('doubleSword');

    for (const target of event.targets) {
      addEffect({ type: 'swordFlash', coord: target });
    }

    await sleep(250);
    setDisplayState(after);
    await sleep(250);
    return;
  }

  if (event.type === 'throw' && event.target) {
    sound.playThrow();
    playPlayerAnimation('throw');
    setProjectile({
      id: `${Date.now()}-${Math.random()}`,
      from: before.player.pos,
      to: event.target,
    });
    await sleep(PLAYER_ACTION_MS);
    setProjectile(null);
    sound.playImpact();
    addEffect({ type: 'impact', coord: event.target });
    setDisplayState(after);
    return;
  }

  if (event.type === 'pickup') {
    sound.playPickup();
    playPlayerAnimation('pickup');
    setDisplayState(after);
    addEffect({ type: 'pickup', coord: after.player.pos });
    await sleep(PLAYER_ACTION_MS);
    return;
  }

  if (event.type === 'trap' && event.target) {
    sound.playPickup();
    playPlayerAnimation('pickup');
    setDisplayState(after);
    addEffect({ type: 'pickup', coord: event.target });
    await sleep(PLAYER_ACTION_MS);
    return;
  }

  sound.playWait();
  addEffect({ type: 'wait', coord: before.player.pos }, 420);
  await sleep(PLAYER_ACTION_MS);
}

function hexToPoint(coord: Coord): Point {
  return {
    x: HEX_SIZE * SQRT_3 * (coord.q + coord.r / 2),
    y: HEX_SIZE * 1.5 * coord.r,
  };
}

function getHexPoints(center: Point): string {
  return Array.from({ length: 6 })
    .map((_, index) => {
      const angle = (Math.PI / 180) * (60 * index + 30);
      return `${center.x + HEX_SIZE * Math.cos(angle)},${center.y + HEX_SIZE * Math.sin(angle)}`;
    })
    .join(' ');
}

function getInitialCamera(bounds: BoardBounds): Camera {
  return {
    center: {
      x: bounds.minX + bounds.width / 2,
      y: bounds.minY + bounds.height / 2,
    },
    zoom: 1.18,
  };
}

function getCameraViewBox(camera: Camera, bounds: BoardBounds): ViewBox {
  const width = bounds.width / camera.zoom;
  const height = bounds.height / camera.zoom;

  return {
    minX: camera.center.x - width / 2,
    minY: camera.center.y - height / 2,
    width,
    height,
  };
}

function clampCamera(camera: Camera, bounds: BoardBounds): Camera {
  const viewBox = getCameraViewBox(camera, bounds);
  const marginX = bounds.width * 0.22;
  const marginY = bounds.height * 0.22;
  const minCenterX = bounds.minX - marginX + viewBox.width / 2;
  const maxCenterX = bounds.maxX + marginX - viewBox.width / 2;
  const minCenterY = bounds.minY - marginY + viewBox.height / 2;
  const maxCenterY = bounds.maxY + marginY - viewBox.height / 2;

  return {
    zoom: clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM),
    center: {
      x:
        minCenterX <= maxCenterX
          ? clamp(camera.center.x, minCenterX, maxCenterX)
          : bounds.minX + bounds.width / 2,
      y:
        minCenterY <= maxCenterY
          ? clamp(camera.center.y, minCenterY, maxCenterY)
          : bounds.minY + bounds.height / 2,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getBoardBounds(cells: Coord[]): BoardBounds {
  const points = cells.map(hexToPoint);
  const minX = Math.min(...points.map((point) => point.x)) - HEX_SIZE * 1.5;
  const maxX = Math.max(...points.map((point) => point.x)) + HEX_SIZE * 1.5;
  const minY = Math.min(...points.map((point) => point.y)) - HEX_SIZE * 1.5;
  const maxY = Math.max(...points.map((point) => point.y)) + HEX_SIZE * 1.5;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
