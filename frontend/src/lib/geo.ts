/**
 * Geräte-Position via Browser-Geolocation-API mit Silent-Failure-Pattern.
 *
 * Wird beim Foto-Upload als Fallback genutzt: mobile Safari strippt das
 * EXIF (inkl. GPS) aus per `<input type="file" capture>` aufgenommenen
 * Fotos, deshalb sendet das Frontend zusaetzlich die Geraete-Position
 * als Form-Felder mit. Das Backend bevorzugt EXIF-GPS und nutzt die
 * Browser-Position nur als Fallback, wenn das Foto keine GPS-Tags hat.
 *
 * Bei Permission-Denied / Timeout / fehlender Hardware liefert die
 * Funktion ``null`` (kein Throw) — der Upload geht dann ohne GPS-Fallback
 * weiter, der User merkt nichts.
 */

export interface DeviceLocation {
  lat: number;
  lon: number;
}

export async function tryGetDeviceLocation(timeoutMs = 5000): Promise<DeviceLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }
  return new Promise<DeviceLocation | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 60_000, enableHighAccuracy: false },
    );
  });
}
