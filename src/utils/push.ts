import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { env } from "../config/env";

const expo = new Expo(env.expoAccessToken ? { accessToken: env.expoAccessToken } : undefined);

/** Fire-and-forget push send. Silently no-ops for missing/invalid tokens so callers never need to guard. */
export async function sendPushNotification(
  expoPushToken: string | undefined | null,
  message: Omit<ExpoPushMessage, "to">
): Promise<void> {
  if (!expoPushToken || !Expo.isExpoPushToken(expoPushToken)) return;

  try {
    await expo.sendPushNotificationsAsync([{ to: expoPushToken, ...message }]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[push] failed to send notification", err);
  }
}
