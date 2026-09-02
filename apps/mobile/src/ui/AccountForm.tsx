import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { AuthError, INK_RGB, PAPER } from '@field/core';
import { useSession } from '../account/session';

/**
 * The whole of asking for an account: an email, a password, one button.
 *
 * One form for both signing in and signing up, because the difference is one
 * word: an email either has an account behind it or it does not, and there is
 * no reason to make anyone declare which before they have typed anything.
 * Sign-in is tried first and sign-up is the fallback, so the common case is
 * one field, one field, done.
 *
 * It lives on its own so the sheet reached from the ⌘ menu and the screen shown
 * on a first launch are the same form and not two that drift apart.
 */

export function AccountForm({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const ready = Boolean(email.trim() && password) && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await session.signIn(email.trim(), password);
      setPassword('');
      onDone();
    } catch (first) {
      // No account yet is the ordinary case here, not a failure.
      const code = first instanceof AuthError ? first.code : '';
      if (code !== 'EMAIL_PASSWORD_MISMATCH' && code !== 'USER_NOT_FOUND') {
        setError(first instanceof Error ? first.message : 'Something went wrong.');
        setBusy(false);
        return;
      }
      try {
        await session.signUp(email.trim(), password);
        setPassword('');
        onDone();
      } catch (second) {
        setError(second instanceof Error ? second.message : 'Something went wrong.');
      }
    }
    setBusy(false);
  };

  return (
    <>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={`rgba(${INK_RGB}, 0.3)`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
        style={styles.field}
      />
      <TextInput
        ref={passwordRef}
        value={password}
        onChangeText={setPassword}
        placeholder="A password, eight characters or more"
        placeholderTextColor={`rgba(${INK_RGB}, 0.3)`}
        secureTextEntry
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        style={styles.field}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={submit}
        disabled={!ready}
        accessibilityRole="button"
        style={({ pressed }) => [styles.go, !ready && styles.goOff, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.goText}>{busy ? 'One moment' : cta}</Text>
      </Pressable>
    </>
  );
}

export const accountStyles = StyleSheet.create({
  field: {
    fontFamily: 'field-depth-3',
    fontSize: 16,
    color: `rgba(${INK_RGB}, 0.9)`,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `rgba(${INK_RGB}, 0.14)`,
  },
  error: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    color: 'rgb(243, 97, 44)',
    paddingTop: 12,
  },
  go: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: `rgba(${INK_RGB}, 0.9)`,
  },
  goOff: { backgroundColor: `rgba(${INK_RGB}, 0.25)` },
  goText: {
    fontFamily: 'field-depth-3',
    fontSize: 15,
    color: PAPER,
  },
});

const styles = accountStyles;
