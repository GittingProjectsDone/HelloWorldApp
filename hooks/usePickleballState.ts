import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/firebase';

export type CourtPlayer = { name: string; team: 1 | 2 };

export type Court = {
  id: number;
  players: (CourtPlayer | null)[];
};

export type HistoryEntry = {
  court: string;
  team1: string[];
  team2: string[];
  time: string;
};

export type AppState = {
  courts: Court[];
  queue: string[];
  skipped: string[];
  history: HistoryEntry[];
  teammateHistory: Record<string, number>;
  overrideMode: boolean;
  // Tracks who has been shown the prompt and dismissed it.
  // Cleared when the court fills (a new game starts).
  promptDismissed: string[];
};

const DEFAULT_STATE: AppState = {
  courts: Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    players: [null, null, null, null],
  })),
  queue: [],
  skipped: [],
  history: [],
  teammateHistory: {},
  overrideMode: false,
  promptDismissed: [],
};

const STATE_DOC = doc(db, 'app', 'state');

export function usePickleballState(myName: string | null) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  // Tracks whether the banner is actively visible this session.
  // Prevents re-showing just because a Firestore write (e.g. override toggle) fires the snapshot.
  const bannerActiveRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(STATE_DOC, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as AppState;
        // Handle old documents that don't have promptDismissed yet
        setState({ ...DEFAULT_STATE, ...data });
      } else {
        setDoc(STATE_DOC, DEFAULT_STATE);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const update = async (newState: AppState) => {
    await setDoc(STATE_DOC, newState);
  };

  const pairKey = (a: string, b: string) => [a, b].sort().join('|');

  const getTeammateCount = (a: string, b: string, s: AppState = state) =>
    s.teammateHistory[pairKey(a, b)] || 0;

  const onCourtNames = (s: AppState = state) =>
    new Set(s.courts.flatMap(c => c.players.filter(Boolean).map(p => p!.name)));

  const availableQueue = (s: AppState = state) => {
    const on = onCourtNames(s);
    return s.queue.filter(p => !on.has(p));
  };

  // Compute whether conditions are met for this player to be prompted
  const promptConditionsMet = (() => {
    if (!myName) return false;
    const avail = availableQueue(state);
    const nonSkipped = avail.filter(p => !state.skipped.includes(p));
    const openCourts = state.courts.filter(c => c.players.every(p => !p));
    if (openCourts.length === 0) return false;
    if (nonSkipped.length < 4) return false;
    if (nonSkipped[0] !== myName) return false;
    if ((state.promptDismissed ?? []).includes(myName)) return false;
    return true;
  })();

  // When conditions are first met, latch the ref on so the banner shows.
  // Once shown, subsequent Firestore snapshots (e.g. override toggle) won't re-trigger it.
  // When conditions are no longer met (player skipped, placed on court, etc), reset so
  // the banner can appear again fresh next time conditions are met.
  if (promptConditionsMet && !bannerActiveRef.current) {
    bannerActiveRef.current = true;
  } else if (!promptConditionsMet) {
    bannerActiveRef.current = false;
  }
  const shouldPrompt = bannerActiveRef.current;

  const getBestTeamAssignment = (
    candidates: string[],
    s: AppState = state
  ): { team1: string[]; team2: string[] } => {
    if (candidates.length < 4) return { team1: [], team2: [] };

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const [a, b, c, d] = shuffled;

    const options = [
      { team1: [a, b], team2: [c, d] },
      { team1: [a, c], team2: [b, d] },
      { team1: [a, d], team2: [b, c] },
    ];

    const scored = options.map(opt => ({
      ...opt,
      score:
        getTeammateCount(opt.team1[0], opt.team1[1], s) +
        getTeammateCount(opt.team2[0], opt.team2[1], s),
    }));

    scored.sort((a, b) => a.score - b.score);
    return scored[0];
  };

  const fillOpenCourts = (s: AppState): AppState => {
    let current = { ...s };
    for (const court of current.courts) {
      const openSlots = court.players.filter(p => !p).length;
      if (openSlots !== 4) continue;

      const avail = availableQueue(current);
      const nonSkipped = avail.filter(p => !current.skipped.includes(p));

      if (nonSkipped.length >= 4) {
        const top4 = nonSkipped.slice(0, 4);
        const { team1, team2 } = getBestTeamAssignment(top4, current);
        const newPlayers: CourtPlayer[] = [
          { name: team1[0], team: 1 },
          { name: team1[1], team: 1 },
          { name: team2[0], team: 2 },
          { name: team2[1], team: 2 },
        ];
        let newTeammateHistory = { ...current.teammateHistory };
        const k1 = pairKey(team1[0], team1[1]);
        const k2 = pairKey(team2[0], team2[1]);
        newTeammateHistory[k1] = (newTeammateHistory[k1] || 0) + 1;
        newTeammateHistory[k2] = (newTeammateHistory[k2] || 0) + 1;

        const newHistory: HistoryEntry = {
          court: `Court ${court.id}`,
          team1,
          team2,
          time: new Date().toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit',
          }),
        };

        current = {
          ...current,
          courts: current.courts.map(c =>
            c.id === court.id ? { ...c, players: newPlayers } : c
          ),
          queue: current.queue.filter(p => !top4.includes(p)),
          skipped: current.skipped.filter(p => !top4.includes(p)),
          teammateHistory: newTeammateHistory,
          history: [newHistory, ...current.history.slice(0, 49)],
          // Clear dismissed list when a court fills — fresh game, fresh prompts
          promptDismissed: (current.promptDismissed ?? []).filter(p => !top4.includes(p)),
        };
      }
    }
    return current;
  };

  const joinQueue = async (name: string) => {
    if (state.queue.includes(name)) return false;
    if (onCourtNames().has(name)) return false;
    const newState = fillOpenCourts({
      ...state,
      queue: [...state.queue, name],
    });
    await update(newState);
    return true;
  };

  // "Let next go" — mark dismissed in Firestore so banner stays gone across re-renders
  const skipTurn = async (name: string) => {
    if (state.skipped.includes(name)) return;
    const withDismissed = {
      ...state,
      skipped: [...state.skipped, name],
      promptDismissed: [...(state.promptDismissed ?? []), name],
    };
    const newState = fillOpenCourts(withDismissed);
    await update(newState);
  };

  // "Play" — mark dismissed then fill courts (player will be picked up by fillOpenCourts)
  const acceptTurn = async (name: string) => {
    const withDismissed = {
      ...state,
      skipped: state.skipped.filter(p => p !== name),
      promptDismissed: [...(state.promptDismissed ?? []), name],
    };
    const newState = fillOpenCourts(withDismissed);
    await update(newState);
  };

  const removeFromCourt = async (courtId: number, playerName: string) => {
    const court = state.courts.find(c => c.id === courtId)!;
    const isOnCourt = court.players.some(p => p?.name === playerName);
    if (!isOnCourt) return;

    const newCourts = state.courts.map(c => {
      if (c.id !== courtId) return c;
      return {
        ...c,
        players: c.players.map(p => p?.name === playerName ? null : p),
      };
    });

    const newQueue = state.queue.includes(playerName)
      ? state.queue
      : [...state.queue, playerName];

    const newState = fillOpenCourts({
      ...state,
      courts: newCourts,
      queue: newQueue,
    });
    await update(newState);
  };

  const overrideAssign = async (
    courtId: number,
    slotIdx: number,
    playerName: string | null
  ) => {
    const newCourts = state.courts.map(c => {
      if (c.id !== courtId) return c;
      const newPlayers = [...c.players];
      newPlayers[slotIdx] = playerName
        ? { name: playerName, team: slotIdx < 2 ? 1 : 2 }
        : null;
      return { ...c, players: newPlayers };
    });
    await update({ ...state, courts: newCourts });
  };

  const toggleOverride = async () => {
    await update({ ...state, overrideMode: !state.overrideMode });
  };

  const isOnCourt = (name: string) => onCourtNames().has(name);
  const isInQueue = (name: string) => state.queue.includes(name);

  return {
    state, loading, shouldPrompt,
    availableQueue, joinQueue, skipTurn, acceptTurn,
    removeFromCourt, overrideAssign, toggleOverride,
    isOnCourt, isInQueue, getBestTeamAssignment,
  };
}
