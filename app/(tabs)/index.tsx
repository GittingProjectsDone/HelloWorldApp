import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, Alert, ActivityIndicator, Platform
} from 'react-native';
import { usePickleballState } from '@/hooks/usePickleballState';
import { usePlayerName } from '@/hooks/use-player-name';

export default function CourtsScreen() {
  const { myName } = usePlayerName();
  const {
    state, loading, shouldPrompt, acceptedCount, activeGroup,
    removeFromCourt, overrideAssign, toggleOverride,
    skipTurn, acceptTurn, availableQueue,
  } = usePickleballState(myName);

  const [overrideModal, setOverrideModal] = useState<
    { courtId: number; slotIdx: number } | null
  >(null);

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" /></View>
  );

  const queueForOverride = availableQueue();

  // Find the first fully empty court to show in the banner
  const openCourt = state.courts.find(c => c.players.every(p => !p));

  return (
    <View style={styles.container}>

      {shouldPrompt && openCourt && (
        <View style={styles.promptBanner}>
          <Text style={styles.promptText}>
            Court {openCourt.id} is open — are you playing?
          </Text>
          <Text style={styles.promptSub}>
            {acceptedCount} of 4 confirmed
          </Text>
          <View style={styles.promptBtns}>
            <TouchableOpacity
              style={styles.promptAccept}
              onPress={() => acceptTurn(myName!)}>
              <Text style={styles.promptAcceptText}>I'm in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.promptSkip}
              onPress={() => skipTurn(myName!)}>
              <Text style={styles.promptSkipText}>Skip me</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.overrideBtn,
          state.overrideMode && styles.overrideBtnActive]}
        onPress={toggleOverride}>
        <Text style={[styles.overrideBtnText,
          state.overrideMode && styles.overrideBtnTextActive]}>
          {state.overrideMode ? 'Override ON — tap to disable' : 'Manual override'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={state.courts}
        keyExtractor={c => String(c.id)}
        renderItem={({ item: court }) => {
          const filled = court.players.filter(Boolean).length;
          const team1 = court.players.slice(0, 2);
          const team2 = court.players.slice(2, 4);

          return (
            <View style={styles.courtCard}>
              <View style={styles.courtHeader}>
                <Text style={styles.courtName}>Court {court.id}</Text>
                <View style={[styles.badge,
                  filled === 4 ? styles.badgeGreen : styles.badgeBlue]}>
                  <Text style={[styles.badgeText,
                    filled === 4 ? styles.badgeTextGreen : styles.badgeTextBlue]}>
                    {filled === 4 ? 'Playing' : `${filled}/4`}
                  </Text>
                </View>
              </View>

              {[{ label: 'Team 1', players: team1, offset: 0 },
                { label: 'Team 2', players: team2, offset: 2 }].map(
                ({ label, players, offset }) => (
                  <View key={label} style={styles.teamSection}>
                    <Text style={styles.teamLabel}>{label}</Text>
                    <View style={styles.slots}>
                      {players.map((p, i) => {
                        const slotIdx = offset + i;
                        const isMe = p?.name === myName;
                        return (
                          <TouchableOpacity
                            key={slotIdx}
                            style={[styles.slot,
                              p ? styles.slotFilled : styles.slotEmpty,
                              isMe && styles.slotMe]}
                            onPress={() => {
                              if (state.overrideMode) {
                                setOverrideModal({ courtId: court.id, slotIdx });
                              } else if (isMe) {
                                if (Platform.OS === 'web') {
                                  if (window.confirm('Remove yourself from this court?')) {
                                    removeFromCourt(court.id, myName!);
                                  }
                                } else {
                                  Alert.alert(
                                    'Leave court?',
                                    'Remove yourself from this court?',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { text: 'Leave', style: 'destructive',
                                        onPress: () => removeFromCourt(court.id, myName!) },
                                    ]
                                  );
                                }
                              }
                            }}
                          >
                            <Text style={[styles.slotText,
                              !p && styles.slotEmptyText]}>
                              {p ? p.name : '—'}
                            </Text>
                            {isMe && !state.overrideMode && (
                              <Text style={styles.slotYou}>you</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )
              )}
            </View>
          );
        }}
      />

      <Modal visible={!!overrideModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              Override — Court {overrideModal?.courtId} Slot {(overrideModal?.slotIdx ?? 0) + 1}
            </Text>
            <TouchableOpacity
              style={styles.modalRow}
              onPress={() => {
                const slot = overrideModal!;
                const court = state.courts.find(c => c.id === slot.courtId)!;
                const current = court.players[slot.slotIdx];
                if (current) overrideAssign(slot.courtId, slot.slotIdx, null);
                setOverrideModal(null);
              }}>
              <Text style={[styles.modalName, { color: '#A32D2D' }]}>
                Clear this slot
              </Text>
            </TouchableOpacity>
            {queueForOverride.map(name => (
              <TouchableOpacity
                key={name}
                style={styles.modalRow}
                onPress={() => {
                  overrideAssign(overrideModal!.courtId, overrideModal!.slotIdx, name);
                  setOverrideModal(null);
                }}>
                <Text style={styles.modalName}>{name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setOverrideModal(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  promptBanner: { backgroundColor: '#E1F5EE', borderRadius: 10,
    padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#5DCAA5' },
  promptText: { fontSize: 14, fontWeight: '500', color: '#085041',
    marginBottom: 4 },
  promptSub: { fontSize: 12, color: '#3a8a72', marginBottom: 10 },
  promptBtns: { flexDirection: 'row', gap: 10 },
  promptAccept: { flex: 1, backgroundColor: '#1D9E75', padding: 10,
    borderRadius: 8, alignItems: 'center' },
  promptAcceptText: { color: '#fff', fontWeight: '500' },
  promptSkip: { flex: 1, borderWidth: 0.5, borderColor: '#5DCAA5',
    padding: 10, borderRadius: 8, alignItems: 'center' },
  promptSkipText: { color: '#085041', fontWeight: '500' },
  overrideBtn: { borderWidth: 0.5, borderColor: '#ddd', borderRadius: 8,
    padding: 10, alignItems: 'center', marginBottom: 12,
    backgroundColor: '#fff' },
  overrideBtnActive: { backgroundColor: '#FAEEDA', borderColor: '#EF9F27' },
  overrideBtnText: { fontSize: 13, color: '#666' },
  overrideBtnTextActive: { color: '#633806', fontWeight: '500' },
  courtCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 0.5, borderColor: '#ddd' },
  courtHeader: { flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10 },
  courtName: { fontSize: 16, fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeGreen: { backgroundColor: '#E1F5EE' },
  badgeBlue: { backgroundColor: '#E6F1FB' },
  badgeText: { fontSize: 12 },
  badgeTextGreen: { color: '#085041' },
  badgeTextBlue: { color: '#0C447C' },
  teamSection: { marginBottom: 8 },
  teamLabel: { fontSize: 11, color: '#999', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5 },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6 },
  slotFilled: { backgroundColor: '#f0f0f0', borderWidth: 0.5,
    borderColor: '#ddd' },
  slotEmpty: { borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' },
  slotMe: { backgroundColor: '#E6F1FB', borderColor: '#85B7EB',
    borderStyle: 'solid' },
  slotText: { fontSize: 14, fontWeight: '500', color: '#111' },
  slotEmptyText: { color: '#bbb' },
  slotYou: { fontSize: 11, color: '#378ADD' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#fff', borderRadius: 14, padding: 16,
    width: '85%', maxHeight: '70%' },
  modalTitle: { fontSize: 15, fontWeight: '500', marginBottom: 12 },
  modalRow: { padding: 12, borderBottomWidth: 0.5, borderColor: '#eee' },
  modalName: { fontSize: 14 },
  cancelBtn: { marginTop: 12, padding: 12, alignItems: 'center',
    borderWidth: 0.5, borderColor: '#ddd', borderRadius: 8 },
  cancelText: { color: '#666', fontSize: 14 },
});
