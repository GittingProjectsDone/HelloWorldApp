import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function usePlayerName() {
  const [myName, setMyName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('playerName').then(name => {
      setMyName(name);
      setLoaded(true);
    });
  }, []);

  const saveName = async (name: string) => {
    await AsyncStorage.setItem('playerName', name);
    setMyName(name);
  };

  return { myName, loaded, saveName };
}
