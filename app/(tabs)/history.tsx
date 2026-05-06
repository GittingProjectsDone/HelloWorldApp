import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { usePickleballState } from '@/hooks/usePickleballState';

export default function HistoryScreen() {
  const { state, loading } = usePickleballState();

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" /></View>
  );

  return (
    <View style={styles.container}>
      {state.history.length === 0
        ? <Text style={styles.empty}>No matches recorded yet.</Text>
        : <FlatList
            data={state.history}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.courtLabel}>{item.court}</Text>
                  <Text style={styles.time}>{item.time}</Text>
                </View>
                <Text style={styles.players}>{item.players.join(', ')}</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 0.5, borderColor: '#ddd' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 4 },
  courtLabel: { fontSize: 14, fontWeight: '500' },
  time: { fontSize: 12, color: '#999' },
  players: { fontSize: 13, color: '#555' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
});
