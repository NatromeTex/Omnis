/**
 * App Context
 * Global state management for authentication and app settings
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useReducer,
} from "react";
import {
    login as apiLogin,
    logout as apiLogout,
    signup as apiSignup,
    getKeyBlob,
    getMe,
} from "../services/api";
import {
    decryptIdentityPrivateKey,
    encryptIdentityPrivateKey,
    generateIdentityKeyPair,
} from "../services/crypto";
import { clearAllData, initDatabase } from "../services/database";
import {
    clearAuthToken,
    clearCurrentUser,
    clearIdentityKeys,
    getApiBaseUrl,
    getAuthToken,
    getCurrentUser,
    getDeviceId,
    getIdentityKeys,
    getThemeColor,
    isOnboardingComplete,
    setApiBaseUrl as saveApiBaseUrl,
    setThemeColor as saveThemeColor,
    setAuthToken,
    setCurrentUser,
    setIdentityKeys,
    setOnboardingComplete,
} from "../services/storage";
import type { AppSettings, AuthState } from "../types";

// State types
interface AppState {
  auth: AuthState;
  settings: AppSettings;
  isLoading: boolean;
  isOnboardingComplete: boolean;
  identityPrivateKey: string | null; // Decrypted private key (in memory only)
  identityPublicKey: string | null;
}

type AppAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_AUTH"; payload: Partial<AuthState> }
  | { type: "SET_SETTINGS"; payload: Partial<AppSettings> }
  | { type: "SET_ONBOARDING_COMPLETE"; payload: boolean }
  | {
      type: "SET_IDENTITY_KEYS";
      payload: { privateKey: string | null; publicKey: string | null };
    }
  | { type: "LOGOUT" };

// Initial state
const initialState: AppState = {
  auth: {
    isAuthenticated: false,
    token: null,
    deviceId: null,
    userId: null,
    username: null,
  },
  settings: {
    apiBaseUrl: "http://localhost:8000",
    themeColor: "#96ACB7",
  },
  isLoading: true,
  isOnboardingComplete: false,
  identityPrivateKey: null,
  identityPublicKey: null,
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_AUTH":
      return { ...state, auth: { ...state.auth, ...action.payload } };
    case "SET_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case "SET_ONBOARDING_COMPLETE":
      return { ...state, isOnboardingComplete: action.payload };
    case "SET_IDENTITY_KEYS":
      return {
        ...state,
        identityPrivateKey: action.payload.privateKey,
        identityPublicKey: action.payload.publicKey,
      };
    case "LOGOUT":
      return {
        ...state,
        auth: {
          isAuthenticated: false,
          token: null,
          deviceId: state.auth.deviceId, // Keep device ID
          userId: null,
          username: null,
        },
        identityPrivateKey: null,
        identityPublicKey: null,
      };
    default:
      return state;
  }
}

// Context
interface AppContextValue extends AppState {
  signup: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setApiBaseUrl: (url: string) => Promise<void>;
  setThemeColor: (color: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// Provider
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize database
        await initDatabase();

        // Get device ID
        const deviceId = await getDeviceId();
        dispatch({ type: "SET_AUTH", payload: { deviceId } });

        // Check onboarding
        const onboardingComplete = await isOnboardingComplete();
        dispatch({
          type: "SET_ONBOARDING_COMPLETE",
          payload: onboardingComplete,
        });

        // Load settings
        const apiBaseUrl = await getApiBaseUrl();
        const themeColor = await getThemeColor();
        dispatch({
          type: "SET_SETTINGS",
          payload: {
            apiBaseUrl,
            themeColor: themeColor || "#96ACB7",
          },
        });

        // Check for existing auth
        const token = await getAuthToken();
        const user = await getCurrentUser();

        if (token && user) {
          try {
            // Verify token is still valid
            const me = await getMe();
            dispatch({
              type: "SET_AUTH",
              payload: {
                isAuthenticated: true,
                token,
                userId: me.id,
                username: me.username,
              },
            });

            // Restore identity keys from secure storage
            const storedKeys = await getIdentityKeys();
            if (storedKeys) {
              dispatch({
                type: "SET_IDENTITY_KEYS",
                payload: {
                  privateKey: storedKeys.privateKey,
                  publicKey: storedKeys.publicKey,
                },
              });
            }
          } catch {
            // Token is invalid, clear auth AND local data for security
            await clearAuthToken();
            await clearCurrentUser();
            await clearIdentityKeys();
            await clearAllData(); // Clear database when session is invalid
          }
        }
      } catch (error) {
        console.error("Failed to initialize app:", error);
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    };

    init();
  }, []);

  // Signup
  const signup = useCallback(async (username: string, password: string) => {
    // Generate identity key pair
    const keyPair = await generateIdentityKeyPair();

    // Encrypt private key with password
    const encrypted = await encryptIdentityPrivateKey(
      keyPair.privateKey,
      password,
    );

    // Call signup API
    await apiSignup({
      username,
      password,
      identity_pub: keyPair.publicKey,
      encrypted_identity_priv: encrypted.encrypted,
      kdf_salt: encrypted.salt,
      aead_nonce: encrypted.nonce,
    });
  }, []);

  // Login
  const login = useCallback(async (username: string, password: string) => {
    // Call login API
    const response = await apiLogin({ username, password });

    // Save token
    await setAuthToken(response.token);

    // Get user info
    const me = await getMe();
    await setCurrentUser(me.id, me.username);

    // Get and decrypt key blob
    const keyBlob = await getKeyBlob();
    const privateKey = await decryptIdentityPrivateKey(
      keyBlob.encrypted_identity_priv,
      keyBlob.kdf_salt,
      keyBlob.aead_nonce,
      password,
    );

    // Update state
    dispatch({
      type: "SET_AUTH",
      payload: {
        isAuthenticated: true,
        token: response.token,
        userId: me.id,
        username: me.username,
      },
    });

    dispatch({
      type: "SET_IDENTITY_KEYS",
      payload: {
        privateKey,
        publicKey: keyBlob.identity_pub,
      },
    });

    // Persist identity keys to secure storage for session restoration
    await setIdentityKeys(privateKey, keyBlob.identity_pub);
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore errors during logout
    }

    // Clear all sensitive data
    await clearAuthToken();
    await clearCurrentUser();
    await clearIdentityKeys();
    await clearAllData(); // Clear local database for security

    dispatch({ type: "LOGOUT" });
  }, []);

  // Set API base URL
  const setApiBaseUrl = useCallback(async (url: string) => {
    await saveApiBaseUrl(url);
    dispatch({ type: "SET_SETTINGS", payload: { apiBaseUrl: url } });
  }, []);

  // Set theme color
  const setThemeColor = useCallback(async (color: string) => {
    await saveThemeColor(color);
    dispatch({ type: "SET_SETTINGS", payload: { themeColor: color } });
  }, []);

  // Complete onboarding
  const completeOnboarding = useCallback(async () => {
    await setOnboardingComplete(true);
    dispatch({ type: "SET_ONBOARDING_COMPLETE", payload: true });
  }, []);

  const value: AppContextValue = {
    ...state,
    signup,
    login,
    logout,
    setApiBaseUrl,
    setThemeColor,
    completeOnboarding,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
