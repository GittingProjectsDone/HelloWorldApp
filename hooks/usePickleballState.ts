import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, runTransaction } from 'firebase/firestore';
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
  accepted: string[];
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
  accepted: [],
  promptDismissed: [],
};

const STATE_DOC = doc(db, 'app', 'state');

// Pure helper — all logic operates on explicit state, no closure over outer state
const getOnCourtNames = (s: AppState): Set<string> =>
  new Set(s.courts.flatMap(c => c.players.filter(Boolean).map(p => p!.name)));

const getAvailableQueue = (s: AppState): string[] => {
  const on = getOnCourtNames(s);
  return s.queue.filter(p => !on.has(p));
};

// Returns the single next player who should see the banner
// (first in queue who hasn't accepted or skipped yet)
const getActivePlayer = (s: AppState): string | null => {
  const avail = getAvailableQueue(s);
  const nonResponded = avail.filter(
    p => !(s.skipped ?? []).includes(p) && !(s.accepted ?? []).includes(p)
  );
  return nonResponded[0] ?? null;
};

// Returns accepted + remaining non-skipped players to check if 4 can be filled
const getActiveGroup = (s: AppState): string[] => {
  const avail = getAvailableQueue(s);
  const nonSkipped = avail.filter(p => !(s.skipped ?? []).includes(p));
  return nonSkipped.slice(0, 4);
};

export function usePickleballState(myName: string | null) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const bannerActiveRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(STATE_DOC, async (snap) => {
      if (snap.exists()) {
        const data = { ...DEFAULT_STATE, ...snap.data() as AppState };
        setState(data);

        // If 4 players have accepted and there's an open court, fill it.
        // Guard: only the first accepted player's device runs the write,
        // preventing every phone from firing simultaneously.
        const group = getActiveGroup(data);
        const confirmed = (data.accepted ?? []).filter(p => group.includes(p));
        const hasOpen = data.courts.some(c => c.players.every(p => !p));
        const iAmFirst = myName != null && confirmed[0] === myName;

        if (confirmed.length >= 4 && hasOpen && iAmFirst) {
          await runTransaction(db, async (transaction) => {
            const freshSnap = await transaction.get(STATE_DOC);
            if (!freshSnap.exists()) return;
            const fresh = { ...DEFAULT_STATE, ...freshSnap.data() as AppState };
            const filled = tryFillWithAccepted(fresh);
            if (filled !== fresh) transaction.set(STATE_DOC, filled);
          });
        }

        // If skipped players exist but there aren't enough non-skipped players
        // left to fill a court, reset skipped so they re-enter the prompt pool.
        // Guard to first available queue player to avoid multiple writes.
        const avail = getAvailableQueue(data);
        const nonSkipped = avail.filter(p => !(data.skipped ?? []).includes(p));
        const hasStuckSkips = (data.skipped ?? []).length > 0 && nonSkipped.length < 4;
        if (hasStuckSkips && myName != null && avail[0] === myName) {
          await setDoc(STATE_DOC, { ...data, skipped: [], accepted: [] });
        }

        // If there are no longer enough non-skipped players to fill a court,
        // reset skipped so those players can be prompted again next time.
        const nonSkippedAvail = getAvailableQueue(data).filter(
          p => !(data.skipped ?? []).includes(p)
        );
        const needsSkipReset = (data.skipped ?? []).length > 0 && nonSkippedAvail.length < 4;
        if (needsSkipReset && myName === getAvailableQueue(data)[0]) {
          await setDoc(STATE_DOC, { ...data, skipped: [], accepted: [] });
        }
      } else {
        setDoc(STATE_DOC, DEFAULT_STATE);
      }
      setLoading(false);
    });
    return unsub;
  }, [myName]);

  const update = async (newState: AppState) => {
    await setDoc(STATE_DOC, newState);
  };

  const pairKey = (a: string, b: string) => [a, b].sort().join('|');

  const getTeammateCount = (a: string, b: string, s: AppState): number =>
    s.teammateHistory[pairKey(a, b)] || 0;

  const getBestTeamAssignment = (
    candidates: string[],
    s: AppState
  ): { team1: string[]; team2: string[] } => {
    if (candidates.length < 4) return { team1: [], team2: [] };
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const [a, b, c, d] = shuffled;
    const options = [
      { team1: [a, b], team2: [c, d] },
      { team1: [a, c], team2: [b, d] },
      { team1: [a, d], team2: [b, c] },
    ];
    options.sort((x, y) =>
      (getTeammateCount(x.team1[0], x.team1[1], s) + getTeammateCount(x.team2[0], x.team2[1], s)) -
      (getTeammateCount(y.team1[0], y.team1[1], s) + getTeammateCount(y.team2[0], y.team2[1], s))
    );
    return options[0];
  };

  // Try to fill a court — always operates on explicit s, never on outer state
  const tryFillWithAccepted = (s: AppState): AppState => {
    const group = getActiveGroup(s);
    const confirmed = (s.accepted ?? []).filter(p => group.includes(p));
    if (confirmed.length < 4) return s;

    const openCourt = s.courts.find(c => c.players.every(p => !p));
    if (!openCourt) return s;

    const top4 = confirmed.slice(0, 4);
    const { team1, team2 } = getBestTeamAssignment(top4, s);

    const newPlayers: CourtPlayer[] = [
      { name: team1[0], team: 1 },
      { name: team1[1], team: 1 },
      { name: team2[0], team: 2 },
      { name: team2[1], team: 2 },
    ];

    let newTeammateHistory = { ...s.teammateHistory };
    newTeammateHistory[pairKey(team1[0], team1[1])] = (newTeammateHistory[pairKey(team1[0], team1[1])] || 0) + 1;
    newTeammateHistory[pairKey(team2[0], team2[1])] = (newTeammateHistory[pairKey(team2[0], team2[1])] || 0) + 1;

    const newHistory: HistoryEntry = {
      court: `Court ${openCourt.id}`,
      team1,
      team2,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    return {
      ...s,
      courts: s.courts.map(c =>
        c.id === openCourt.id ? { ...c, players: newPlayers } : c
      ),
      queue: s.queue.filter(p => !top4.includes(p)),
      skipped: (s.skipped ?? []).filter(p => !top4.includes(p)),
      accepted: (s.accepted ?? []).filter(p => !top4.includes(p)),
      promptDismissed: (s.promptDismissed ?? []).filter(p => !top4.includes(p)),
      teammateHistory: newTeammateHistory,
      history: [newHistory, ...s.history.slice(0, 49)],
    };
  };

  // Derived values from current state
  const activeGroup = getActiveGroup(state);
  const activePlayer = getActivePlayer(state);
  const hasOpenCourt = state.courts.some(c => c.players.every(p => !p));

  // Only the single next player in line sees the banner
  const promptConditionsMet = (() => {
    if (!myName) return false;
    if (!hasOpenCourt) return false;
    if (activeGroup.length < 4) return false;
    if (myName !== activePlayer) return false;
    return true;
  })();

  if (promptConditionsMet && !bannerActiveRef.current) {
    bannerActiveRef.current = true;
  } else if (!promptConditionsMet) {
    bannerActiveRef.current = false;
  }
  const shouldPrompt = bannerActiveRef.current;

  const acceptedCount = (state.accepted ?? []).filter(p =>
    activeGroup.includes(p)
  ).length;

  const joinQueue = async (name: string) => {
    if (state.queue.includes(name)) return false;
    if (getOnCourtNames(state).has(name)) return false;
    await update({ ...state, queue: [...state.queue, name] });
    return true;
  };

  const leaveQueue = async (name: string) => {
    if (!state.queue.includes(name)) return;
    await update({
      ...state,
      queue: state.queue.filter(p => p !== name),
      skipped: (state.skipped ?? []).filter(p => p !== name),
      accepted: (state.accepted ?? []).filter(p => p !== name),
    });
  };

  const acceptTurn = async (name: string) => {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(STATE_DOC);
      const s: AppState = snap.exists()
        ? { ...DEFAULT_STATE, ...(snap.data() as AppState) }
        : DEFAULT_STATE;
      if ((s.accepted ?? []).includes(name)) return;
      const withAccepted: AppState = {
        ...s,
        accepted: [...(s.accepted ?? []), name],
      };
      transaction.set(STATE_DOC, tryFillWithAccepted(withAccepted));
    });
  };

  const skipTurn = async (name: string) => {
    if ((state.skipped ?? []).includes(name)) return;
    await update({
      ...state,
      skipped: [...(state.skipped ?? []), name],
      accepted: (state.accepted ?? []).filter(p => p !== name),
    });
  };

  const removeFromCourt = async (courtId: number, playerName: string) => {
    const court = state.courts.find(c => c.id === courtId)!;
    if (!court.players.some(p => p?.name === playerName)) return;

    const newCourts = state.courts.map(c =>
      c.id !== courtId ? c : {
        ...c,
        players: c.players.map(p => p?.name === playerName ? null : p),
      }
    );

    const newQueue = state.queue.includes(playerName)
      ? state.queue
      : [...state.queue, playerName];

    // A court just opened up — reset accepted/skipped so the prompt
    // round starts fresh for whoever is now at the front of the queue.
    await update({
      ...state,
      courts: newCourts,
      queue: newQueue,
      accepted: [],
      skipped: [],
      promptDismissed: [],
    });
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

  const isOnCourt = (name: string) => getOnCourtNames(state).has(name);
  const isInQueue = (name: string) => state.queue.includes(name);
  const availableQueue = () => getAvailableQueue(state);

  return {
    state, loading, shouldPrompt, acceptedCount, activeGroup, activePlayer,
    availableQueue, joinQueue, leaveQueue, skipTurn, acceptTurn,
    removeFromCourt, overrideAssign, toggleOverride,
    isOnCourt, isInQueue, getBestTeamAssignment,
  };
}
