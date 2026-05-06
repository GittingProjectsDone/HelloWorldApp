import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const [message, setMessage] = useState('');

  return (
    <ThemedView style={styles.container}>
      {message ? (
        <ThemedView style={styles.messageBubble}>
          <ThemedText style={styles.messageText}>{message}</ThemedText>
        </ThemedView>
      ) : null}

      <TouchableOpacity style={styles.button} onPress={() => setMessage('Hello World! 👋')}>
        <ThemedText style={styles.buttonText}>Press Me</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  messageBubble: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  messageText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#166534',
  },
  button: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
