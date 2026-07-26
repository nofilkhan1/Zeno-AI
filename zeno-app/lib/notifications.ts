import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { supabase } from './supabase';
import type * as Notifications from 'expo-notifications';

type NotificationSubscription = { remove: () => void };

// Remote push APIs are not available in Expo Go from SDK 53 onward. Keep the
// package out of the boot path there so notification setup can never crash the
// app before the root layout mounts.
const isExpoGo = Constants.appOwnership === 'expo';
let expoGoNoticeLogged = false;
let notificationsPromise: Promise<typeof Notifications | null> | null = null;

function logExpoGoPushUnavailable() {
  if (!expoGoNoticeLogged) {
    expoGoNoticeLogged = true;
    console.info('[Notifications] Push notifications unavailable in Expo Go — requires a development build.');
  }
}

async function getNotifications(): Promise<typeof Notifications | null> {
  if (isExpoGo) {
    logExpoGoPushUnavailable();
    return null;
  }

  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications')
      .then((module) => {
        module.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        return module;
      })
      .catch((error) => {
        console.warn('[Notifications] Push notifications unavailable; continuing without them.', error);
        return null;
      });
  }
  return notificationsPromise;
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo) {
    logExpoGoPushUnavailable();
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D97757',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const tokenOpts: Record<string, string> = {};
    const projectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
    if (projectId) tokenOpts.projectId = projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(tokenOpts);
    return tokenData.data;
  } catch (error) {
    console.warn('[Notifications] Push registration failed; continuing without push notifications.', error);
    return null;
  }
}

export async function storePushToken(token: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const platform = Platform.OS as 'ios' | 'android' | 'web';

  const { data: existing } = await supabase
    .from('push_tokens')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('token', token)
    .maybeSingle();

  if (existing) return true;

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: session.user.id, token, platform },
      { onConflict: 'user_id, token', ignoreDuplicates: false }
    );

  return !error;
}

export async function getNotificationPreferences(): Promise<{
  daily_verse_enabled: boolean;
  daily_dua_enabled: boolean;
  preferred_time: string;
} | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('daily_verse_enabled, daily_dua_enabled, preferred_time')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function setNotificationPreferences(prefs: {
  daily_verse_enabled?: boolean;
  daily_dua_enabled?: boolean;
  preferred_time?: string;
}): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const updateData: Record<string, unknown> = { user_id: session.user.id };
  if (prefs.daily_verse_enabled !== undefined) updateData.daily_verse_enabled = prefs.daily_verse_enabled;
  if (prefs.daily_dua_enabled !== undefined) updateData.daily_dua_enabled = prefs.daily_dua_enabled;
  if (prefs.preferred_time !== undefined) updateData.preferred_time = prefs.preferred_time;

  const { data: existing } = await supabase
    .from('notification_preferences')
    .select('id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('notification_preferences')
      .update(updateData)
      .eq('user_id', session.user.id);
    return !error;
  }

  const { error } = await supabase
    .from('notification_preferences')
    .insert(updateData);
  return !error;
}

export async function removePushToken(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', session.user.id);

  return !error;
}

export async function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
): Promise<NotificationSubscription> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return { remove: () => {} };
    return Notifications.addNotificationResponseReceivedListener(handler);
  } catch (error) {
    console.warn('[Notifications] Response listener unavailable; continuing without it.', error);
    return { remove: () => {} };
  }
}
