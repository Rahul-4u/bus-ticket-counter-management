import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { getOrCreateUserProfile, type ProfileSyncOptions } from '../services/firestoreService';
import { ensureDatabaseSeeded } from '../services/seedService';
import type { UserProfile, UserRole } from '../types/domain';

export type SyncedProfile = UserProfile & { adminPendingApproval?: boolean };

export interface EmailSignUpInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  requestedRole: UserRole;
  companyUnitName?: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  seeding: boolean;
  signInWithGoogle: (options?: ProfileSyncOptions) => Promise<SyncedProfile | null>;
  signUpWithEmail: (input: EmailSignUpInput) => Promise<SyncedProfile | null>;
  signInWithEmail: (email: string, password: string) => Promise<SyncedProfile | null>;
  resetPasswordEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const manualAuthInFlightRef = useRef(false);

  const syncProfile = async (
    user: User | null,
    options?: ProfileSyncOptions,
    rethrowOnError = false
  ): Promise<SyncedProfile | null> => {
    if (!user) {
      setProfile(null);
      return null;
    }
    try {
      const userProfile = await getOrCreateUserProfile(
        user.uid,
        user.email || '',
        user.displayName || '',
        {
          ...options,
          emailVerified: user.emailVerified,
        }
      );
      setProfile(userProfile);

      if (userProfile.role === 'admin' && user.emailVerified) {
        setSeeding(true);
        try {
          await ensureDatabaseSeeded(user.uid, user.email || '');
        } finally {
          setSeeding(false);
        }
      }
      return userProfile;
    } catch (err) {
      console.error('Failed to sync profile:', err);
      if (rethrowOnError) {
        throw err;
      }
      return null;
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        if (!manualAuthInFlightRef.current) {
          await syncProfile(user);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async (options?: ProfileSyncOptions) => {
    manualAuthInFlightRef.current = true;
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setFirebaseUser(cred.user);
      return await syncProfile(cred.user, options, true);
    } finally {
      manualAuthInFlightRef.current = false;
    }
  };

  const signUpWithEmail = async (input: EmailSignUpInput) => {
    manualAuthInFlightRef.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        input.email.trim(),
        input.password
      );
      if (input.displayName.trim()) {
        await updateProfile(cred.user, { displayName: input.displayName.trim() });
      }
      sendEmailVerification(cred.user).catch(() => {});
      setFirebaseUser(cred.user);
      return await syncProfile(
        cred.user,
        {
          requestedRole: input.requestedRole,
          phone: input.phone,
          companyUnitName: input.companyUnitName,
        },
        true
      );
    } finally {
      manualAuthInFlightRef.current = false;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    manualAuthInFlightRef.current = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      setFirebaseUser(cred.user);
      return await syncProfile(cred.user, undefined, true);
    } finally {
      manualAuthInFlightRef.current = false;
    }
  };

  const resetPasswordEmail = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const logout = async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await syncProfile(auth.currentUser);
    }
  };

  const getIdToken = async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        seeding,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        resetPasswordEmail,
        logout,
        refreshProfile,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
