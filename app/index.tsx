import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetEmailFocused, setResetEmailFocused] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('login.errorTitle'), t('login.fillAllFields'));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (err: any) {
      Alert.alert(t('login.errorTitle'), err?.message || 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) {
      Alert.alert(t('login.errorTitle'), t('login.enterEmail'));
      return;
    }
    setResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim());
      if (error) throw error;
      Alert.alert(t('login.resetSuccess'));
      setForgotModalVisible(false);
      setResetEmail('');
    } catch (err: any) {
      Alert.alert(t('login.errorTitle'), err?.message || 'Bir hata oluştu');
    } finally {
      setResetSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('login.title')}</Text>

        <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
          <View style={styles.iconBox}>
            <Ionicons name="mail-outline" size={16} color={emailFocused ? '#3b82f6' : '#64748b'} />
          </View>
          <TextInput
            style={styles.input}
            placeholder={t('login.emailPlaceholder')}
            placeholderTextColor="#94a3b8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
          />
        </View>

        <View style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}>
          <View style={styles.iconBox}>
            <Ionicons name="lock-closed-outline" size={16} color={passwordFocused ? '#3b82f6' : '#64748b'} />
          </View>
          <TextInput
            style={styles.input}
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor="#94a3b8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
        </View>

        <TouchableOpacity style={styles.forgotBtn} onPress={() => setForgotModalVisible(true)}>
          <Text style={styles.forgotBtnText}>{t('login.forgotPassword')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? '...' : t('login.submit')}</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={forgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setForgotModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('login.forgotPasswordTitle')}</Text>
            <Text style={styles.modalHint}>{t('login.forgotPasswordHint')}</Text>
            <View style={[styles.modalInputWrap, resetEmailFocused && styles.inputWrapFocused]}>
              <View style={styles.modalIconBox}>
                <Ionicons name="mail-outline" size={16} color={resetEmailFocused ? '#3b82f6' : '#64748b'} />
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder={t('login.emailPlaceholder')}
                placeholderTextColor="#94a3b8"
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                onFocus={() => setResetEmailFocused(true)}
                onBlur={() => setResetEmailFocused(false)}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setForgotModalVisible(false)}>
                <Text style={styles.modalCancelText}>{t('login.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSendBtn, resetSending && styles.buttonDisabled]}
                onPress={handleForgotPassword}
                disabled={resetSending}
              >
                <Text style={styles.modalSendText}>{resetSending ? '...' : t('login.sendResetLink')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 20,
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxWidth: 450,
    alignSelf: 'center',
    padding: 30,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 28,
    textAlign: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 44,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  inputWrapFocused: {
    borderColor: '#3b82f6',
  },
  iconBox: {
    width: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  input: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 0,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    color: '#f1f5f9',
    fontSize: 16,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotBtnText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalHint: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 44,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  modalIconBox: {
    width: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  modalInput: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 0,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    color: '#f1f5f9',
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#334155',
  },
  modalCancelText: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
  },
  modalSendText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
