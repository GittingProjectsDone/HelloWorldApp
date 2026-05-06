import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, FlatList, ActivityIndicator, Alert
} from 'react-native';
import { usePickleballState } from '@/hooks/usePickleballState';

export default function QueueScreen() {
  const { state, loading, availablePlayers,
    addToQueue, removeFromQueue } = usePickleballState();
  const [name, setName] = useState('');

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" /></View>
  );

  const avail = availablePlayers();

  const handleAdd = async () => {
    if (!name.trim()) return;
    const ok = await addToQueue(name.trim());
    if (ok === false) Alert.alert('Already added',
      `${name.trim()} is already in the queue or on a court.`);
    else setName('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Player name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {avail.length === 0
        ? <Text style={styles.empty}>Queue is empty.</Text>
        : <FlatList
            data={avail}
            keyExtractor={p => p}
            renderItem={({ item, index }) => (
              <View style={styles.row}>
                <Text style={styles.pos}>{index + 1}</Text>
                <Text style={styles.playerName}>{item}</Text>
                <TouchableOpacity onPress={() =>
                  Alert.alert('Remove?', `Remove ${item} from queue?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive',
                      onPress: () => removeFromQueue(item) }
                  ])
                }>
                  <Text style={styles.removeBtn}>×</Text>
                </TouchableOpacity>
              </View>
            )}
          />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: { flex: 1, backgroundColor: '#fff', borderWidth: 0.5,
    borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15 },
  addBtn: { backgroundColor: '#4f46e5', paddingHorizontal: 16,
    borderRadius: 8, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '500', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 0.5, borderColor: '#ddd' },
  pos: { fontSize: 13, color: '#999', minWidth: 24 },
  playerName: { flex: 1, fontSize: 15 },
  removeBtn: { fontSize: 22, color: '#bbb', paddingLeft: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
});
