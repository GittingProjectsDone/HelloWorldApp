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
  // Players who have tapped "Play" and are waiting for 3 others to confirm
  accepted: string[];
  // Players who have already been shown and dismissed the banner this round
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

export function usePickleballState(myName: string | null) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const bannerActiveRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(STATE_DOC, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as AppState;
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

  // The active group is the first 4 non-skipped players in the queue.
  // All of them should see the banner simultaneously.
  const getActiveGroup = (s: AppState = state): string[] => {
    const avail = availableQueue(s);
    const nonSkipped = avail.filter(p => !(s.skipped ?? []).includes(p));
    return nonSkipped.slice(0, 4);
  };

  const activeGroup = getActiveGroup();
  const hasOpenCourt = state.courts.some(c => c.players.every(p => !p));

  // This player should see the banner if:
  // - there's an open court
  // - there are 4+ non-skipped players available
  // - they are in the active group
  // - they haven't dismissed it this round
  const promptConditionsMet = (() => {
    if (!myName) return false;
    if (!hasOpenCourt) return false;
    if (activeGroup.length < 4) return false;
    if (!activeGroup.includes(myName)) return false;
    if ((state.promptDismissed ?? []).includes(myName)) return false;
    return true;
  })();

  if (promptConditionsMet && !bannerActiveRef.current) {
    bannerActiveRef.current = true;
  } else if (!promptConditionsMet) {
    bannerActiveRef.current = false;
  }
  const shouldPrompt = bannerActiveRef.current;

  // How many of the active group have accepted so far
  const acceptedCount = (state.accepted ?? []).filter(p =>
    activeGroup.includes(p)
  ).length;

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

  // Try to fill a court with the accepted players if all 4 have confirmed
  const tryFillWithAccepted = (s: AppState): AppState => {
    const group = getActiveGroup(s);
    const confirmedInGroup = (s.accepted ?? []).filter(p => group.includes(p));

    // Not enough confirmed yet
    if (confirmedInGroup.length < 4) return s;

    const openCourt = s.courts.find(c => c.players.every(p => !p));
    if (!openCourt) return s;

    const top4 = confirmedInGroup.slice(0, 4);
    const { team1, team2 } = getBestTeamAssignment(top4, s);

    const newPlayers: CourtPlayer[] = [
      { name: team1[0], team: 1 },
      { name: team1[1], team: 1 },
      { name: team2[0], team: 2 },
      { name: team2[1], team: 2 },
    ];

    let newTeammateHistory = { ...s.teammateHistory };
    const k1 = pairKey(team1[0], team1[1]);
    const k2 = pairKey(team2[0], team2[1]);
    newTeammateHistory[k1] = (newTeammateHistory[k1] || 0) + 1;
    newTeammateHistory[k2] = (newTeammateHistory[k2] || 0) + 1;

    const newHistory: HistoryEntry = {
      court: `Court ${openCourt.id}`,
      team1,
      team2,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit',
      }),
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

  const joinQueue = async (name: string) => {
    if (state.queue.includes(name)) return false;
    if (onCourtNames().has(name)) return false;
    const newState: AppState = {
      ...state,
      queue: [...state.queue, name],
    };
    await update(newState);
    return true;
  };

  // "Play" — add to accepted list, fill court if all 4 are in
  const acceptTurn = async (name: string) => {
    if ((state.accepted ?? []).includes(name)) return;
    const withAccepted: AppState = {
      ...state,
      accepted: [...(state.accepted ?? []), name],
      promptDismissed: [...(state.promptDismissed ?? []), name],
    };
    const newState = tryFillWithAccepted(withAccepted);
    await update(newState);
  };

  // "Let next go" — remove from active group, shift next player in
  const skipTurn = async (name: string) => {
    if ((state.skipped ?? []).includes(name)) return;
    const newState: AppState = {
      ...state,
      skipped: [...(state.skipped ?? []), name],
      accepted: (state.accepted ?? []).filter(p => p !== name),
      promptDismissed: [...(state.promptDismissed ?? []), name],
    };
    await update(newState);
  };

  const removeFromCourt = async (courtId: number, playerName: string) => {
    const court = state.courts.find(c => c.id === courtId)!;
    if (!court.players.some(p => p?.name === playerName)) return;

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

    await update({ ...state, courts: newCourts, queue: newQueue });
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
    state, loading, shouldPrompt, acceptedCount, activeGroup,
    availableQueue, joinQueue, skipTurn, acceptTurn,
    removeFromCourt, overrideAssign, toggleOverride,
    isOnCourt, isInQueue, getBestTeamAssignment,
  };
}
