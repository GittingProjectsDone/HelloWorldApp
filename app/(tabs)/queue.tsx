import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Alert, Platform
} from 'react-native';
import { usePickleballState } from '@/hooks/usePickleballState';
import { usePlayerName } from '@/hooks/use-player-name';

export default function QueueScreen() {
  const { myName } = usePlayerName();
  const { state, loading, joinQueue, leaveQueue, availableQueue, isOnCourt, isInQueue }
    = usePickleballState(myName);

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" /></View>
  );

  const queue = availableQueue();
  const alreadyIn = isInQueue(myName!) || isOnCourt(myName!);

  const handleLeave = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Remove yourself from the queue?')) {
        leaveQueue(myName!);
      }
    } else {
      Alert.alert(
        'Leave queue?',
        'Remove yourself from the queue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => leaveQueue(myName!) },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      {!alreadyIn && (
        <TouchableOpacity
          style={styles.joinBtn}
          onPress={() => joinQueue(myName!)}>
          <Text style={styles.joinBtnText}>+ Join queue</Text>
        </TouchableOpacity>
      )}

      {isOnCourt(myName!) && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            You are currently on a court. When you leave, you will
            automatically return to the end of the queue.
          </Text>
        </View>
      )}

      {isInQueue(myName!) && (
        <View style={styles.inQueueRow}>
          <View style={styles.infoBannerFlex}>
            <Text style={styles.infoText}>
              You are in the queue at position{' '}
              {queue.indexOf(myName!) + 1}.
            </Text>
          </View>
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>Leave</Text>
          </TouchableOpacity>
        </View>
      )}

      {queue.length === 0
        ? <Text style={styles.empty}>Queue is empty.</Text>
        : <FlatList
            data={queue}
            keyExtractor={p => p}
            renderItem={({ item, index }) => (
              <View style={[styles.row, item === myName && styles.rowMe]}>
                <Text style={styles.pos}>{index + 1}</Text>
                <Text style={styles.playerName}>{item}</Text>
                {state.skipped.includes(item) && (
                  <Text style={styles.skippedTag}>passed</Text>
                )}
                {(state.accepted ?? []).includes(item) && (
                  <Text style={styles.acceptedTag}>in ✓</Text>
                )}
                {item === myName && (
                  <Text style={styles.youTag}>you</Text>
                )}
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
  joinBtn: { backgroundColor: '#4f46e5', padding: 14, borderRadius: 10,
    alignItems: 'center', marginBottom: 16 },
  joinBtnText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  inQueueRow: { flexDirection: 'row', alignItems: 'center',
    marginBottom: 12, gap: 10 },
  infoBanner: { backgroundColor: '#E6F1FB', borderRadius: 8, padding: 12,
    marginBottom: 12, borderWidth: 0.5, borderColor: '#85B7EB' },
  infoBannerFlex: { flex: 1, backgroundColor: '#E6F1FB', borderRadius: 8,
    padding: 12, borderWidth: 0.5, borderColor: '#85B7EB' },
  infoText: { fontSize: 13, color: '#0C447C' },
  leaveBtn: { backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#E8A0A0',
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  leaveBtnText: { color: '#A32D2D', fontSize: 13, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 0.5, borderColor: '#ddd' },
  rowMe: { backgroundColor: '#E6F1FB', borderColor: '#85B7EB' },
  pos: { fontSize: 13, color: '#999', minWidth: 24 },
  playerName: { flex: 1, fontSize: 15 },
  skippedTag: { fontSize: 11, color: '#854F0B', backgroundColor: '#FAEEDA',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  acceptedTag: { fontSize: 11, color: '#085041', backgroundColor: '#E1F5EE',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginLeft: 4 },
  youTag: { fontSize: 11, color: '#0C447C', backgroundColor: '#E6F1FB',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginLeft: 6 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
});
