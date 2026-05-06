import { useEffect, useState } from 'react';
import {
  doc, onSnapshot, setDoc, getDoc, updateDoc
} from 'firebase/firestore';
import { db } from '@/firebase';

export type Court = {
  id: number;
  players: (string | null)[];
};

export type HistoryEntry = {
  court: string;
  players: string[];
  time: string;
};

export type AppState = {
  courts: Court[];
  queue: string[];
  history: HistoryEntry[];
  matchups: Record<string, number>;
};

const DEFAULT_STATE: AppState = {
  courts: Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    players: [null, null, null, null],
  })),
  queue: [],
  history: [],
  matchups: {},
};

const STATE_DOC = doc(db, 'app', 'state');

export function usePickleballState() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(STATE_DOC, (snap) => {
      if (snap.exists()) {
        setState(snap.data() as AppState);
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

  const getMatchupCount = (a: string, b: string) =>
    state.matchups[pairKey(a, b)] || 0;

  const scorePlayer = (player: string, existing: string[]) =>
    existing.filter(Boolean).reduce(
      (sum, ep) => sum + getMatchupCount(player, ep), 0
    );

  const availablePlayers = () => {
    const onCourt = new Set(
      state.courts.flatMap(c => c.players.filter(Boolean))
    );
    return state.queue.filter(p => !onCourt.has(p));
  };

  const addToQueue = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const alreadyQueued = state.queue.includes(trimmed);
    const onCourt = state.courts.some(c => c.players.includes(trimmed));
    if (alreadyQueued || onCourt) return false;
    await update({ ...state, queue: [...state.queue, trimmed] });
    return true;
  };

  const removeFromQueue = async (name: string) => {
    await update({ ...state, queue: state.queue.filter(p => p !== name) });
  };

  const assignPlayer = async (
    courtId: number, slotIdx: number, playerName: string
  ) => {
    const newCourts = state.courts.map(c => {
      if (c.id !== courtId) return c;
      const newPlayers = [...c.players];
      newPlayers[slotIdx] = playerName;
      return { ...c, players: newPlayers };
    });
    const newQueue = state.queue.filter(p => p !== playerName);
    let newMatchups = { ...state.matchups };
    let newHistory = [...state.history];

    const court = newCourts.find(c => c.id === courtId)!;
    if (court.players.every(Boolean)) {
      const players = court.players as string[];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const k = pairKey(players[i], players[j]);
          newMatchups[k] = (newMatchups[k] || 0) + 1;
        }
      }
      newHistory = [{
        court: `Court ${courtId}`,
        players,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit'
        }),
      }, ...newHistory.slice(0, 49)];
    }

    await update({
      ...state,
      courts: newCourts,
      queue: newQueue,
      matchups: newMatchups,
      history: newHistory,
    });
  };

  const removeFromCourt = async (courtId: number, slotIdx: number) => {
    const court = state.courts.find(c => c.id === courtId)!;
    const name = court.players[slotIdx];
    if (!name) return;
    const newCourts = state.courts.map(c => {
      if (c.id !== courtId) return c;
      const newPlayers = [...c.players];
      newPlayers[slotIdx] = null;
      return { ...c, players: newPlayers };
    });
    const newQueue = state.queue.includes(name)
      ? state.queue
      : [name, ...state.queue];
    await update({ ...state, courts: newCourts, queue: newQueue });
  };

  const suggestNext = (court: Court) => {
    const avail = availablePlayers();
    const existing = court.players.filter(Boolean) as string[];
    if (!avail.length) return null;
    return avail.slice().sort(
      (a, b) => scorePlayer(a, existing) - scorePlayer(b, existing)
    )[0];
  };

  return {
    state, loading, availablePlayers,
    addToQueue, removeFromQueue,
    assignPlayer, removeFromCourt,
    suggestNext, scorePlayer, getMatchupCount,
  };
}
