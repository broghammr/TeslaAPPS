Allgemeine Anweisungen:
* Dateien in ./assets niemals löschen
* Commit oder Push nur auf explizite Anfrage durchführen

Projekt 01: Tesla Browser Hub:

* Eigene Website die über den Browser im Tesla Model 3 Highland aufgerufen werden kann

Anforderungen:

UI Design:
* gute Ablesbarkeit während der Fahrt: hell, großer Kontrast und große Schriftarten, nur grautöne mit genau einer Akzentfarbe (Blau #0070f3)
* Themen werden in Form von Kacheln dargestellt
* Keine Titelleiste/ Kopfzeile oder ähnliches, nur Überschrift und dann die Kacheln für die Themen
* Kacheln haben ein Icon, eine Überschrift und eine Unterüberschrift, sowie eine Statuszeile
* Die Icons der Kacheln sind Piktogramme

Inhalt:
* Main Hub (index.html): Übersicht der Themen im "Kachel-Design"
* Themen: Hello World (hw), Light (lt), Monitor (mn), Chibi (cb)

Themenseite "Hello World" (hw)
* Inhalt: Unsere Roadtrips werden angezeigt
* Pro Roadtrip eine Kachel mit je einem vollflächigen Bild
* Ort und Zeitraum des Roadtrips in der Fußzeile
* Die Fußzeile wird halbtransparent über das vollflächigen Bild innerhalb der Kachel gelegt
* Für jeden Roadtrip gibt es im Ordner ./assets ein Bild mit dem Präfix "hw", danach folgt das Datum im Format YYYYMM, danach folgt die Veranstaltung und der Ort
* Beispiel 01: Der Text der Fußzeile für die Datei hw_202605_FSD_Amsterdam.jpg soll dann so erscheinen: "Mai 2026 - FSD, Amsterdam"
* Beispiel 02: Der Text der Fußzeile für die Datei hw_202603_Herr+Schröder_Saarbrücken.jpg soll dann so erscheinen: "März 2026 - Herr Schröder, Saarbrücken"

Themenseite "Light" (lt)
* Inhalt: Steuerung der Beleuchtung im Auto
* Gleiches Kachellayout wie "Main Hub"
* Eine Kachel für den Sternenhimmel, On/Off Schalter; Ansteuerung siehe Projekt 02 Raspi
* Für die Rücksitzbank und den Beifahrer je eine Kachel "Farbauswahl": On/Off + Farbkreis + Helligkeitsregler; in der Statuszeile gewählte Farbe als RGB-Werte + gewählte Helligkeit in %; Ansteuerung siehe Projekt 02 Raspi
* Zusätzlich zum Mainhub als letzte Kachel auch die Themenkachel "Chibi" (cb) anfügen

Themenkachel "Monitor" (mn)
* Nur eine Kachel mit Inhalt, keine Unterseite
* Inhalt: Temparatur des Raspi
* Temparatur wir beim Laden der Seite aktualisiert und bei einem Touch auf die Kachel, kein automatischer Refresh

Themenkachel "Chibi" (cb)
* Kachellayout zeigt vollflächig assets/chibi.jpg, keine Unterseite
* Wenn Kachel gedrück wird soll die Startanimation (siehe Projekt Raspi) gestartet werden

Deployment:
* Deployment über GitHub Pages
* Repo: https://github.com/broghammr/TeslaAPPS (öffentlich)
* Ziel-URL: https://broghammr.github.io/TeslaAPPS/
* Workflow: `.github/workflows/pages.yml` (Push auf `main`)
* Einmalig nötig: Repo → Settings → Pages → Source = **GitHub Actions**

Projekt 02: Raspberry Pi 4 Model B, 1GB RAM:

* Steuerung der Beleuchtung im Tesla Model 3 Highland mit einem Raspberry Pi 4

Quellen:
* Raspberry GPIOs: https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio

Geräte
* Relais an GPIO 17 (active_high=False): grüner Sternenhimmel (On/Off Lampe)
* WS2812 WLED Streifen mit 76 LEDs an GPIO 12 (PWM0): Rücksitzbank (Farblampe)
* WS2812 WLED Streifen mit 16 LEDs an GPIO 13 (PWM1): Beifahrer (Farblampe)
* Taster an GPIO 27 (pull_up=True): Taster soll nicht als HomeKit Gerät implementiert werden

Deployment
* Skripte für den Raspberry Pi in Unterordner Raspi speichern

Raspberry Pi "Jacky"
* Steuerung der Geräte
* ngrok Tunnel: Public URL auf lokale URL umleiten (https://placate-impale-nautical.ngrok-free.dev/ -> http://localhost:8080/)
* ngrok config add-authtoken <NGROK_AUTHTOKEN aus lokaler Umgebung / ngrok Dashboard>
* ngrok http 8080 --url https://placate-impale-nautical.ngrok-free.dev
* Steuerung über ein Python Skript (Daemon):
  - Implementierung einer HomeKit Bridge mit den Geräten "Sternenhimmel" als On/Off-Lampe, WLED Streifen "Rücksitzbank" als Farblampe und WLED Streifen "Beifahrer" als Farblampe
  - Implementierung eines Web API Endpoint ebenfalls zur Steuerung der Geräte
  - Den Status der Geräte synchron halten, wenn per Web API gesteuert wurde
* Dynamische Lichtszenen
  - Startanimationen, welche die Tesla Startanimation aus dem Sommerupdate 2026 unterstützt, Dauer 30s. Nur die WLED Streifen dazu verwenden, nicht den Sternenhimmel. Ausführung beim Start des Python Skripts (Daemon) und wenn der Taster an GPIO 27 gedrückt wurde — auch ohne Netz. HomeKit startet erst, sobald eine LAN-IP da ist.


