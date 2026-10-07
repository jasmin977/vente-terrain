import { Preferences } from "@capacitor/preferences";

const IP_KEY = "printer_ip";

export async function getPrinterIp(): Promise<string | null> {
  const { value } = await Preferences.get({ key: IP_KEY });
  return value ?? null;
}

export async function setPrinterIp(ip: string): Promise<void> {
  await Preferences.set({ key: IP_KEY, value: ip });
}
